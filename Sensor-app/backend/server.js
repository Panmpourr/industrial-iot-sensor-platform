const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');
const mysql = require('mysql2');
const axios = require('axios');
const { SerialPort } = require('serialport');
const ModbusRTU = require('modbus-serial');
const opcua = require('node-opcua');
const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const activeIntervals = new Map();
const activeSerialPorts = new Map();
const activeOpcuaClients = new Map();
const activeMqttClients = new Map();

// Δυναμική και ασφαλής φόρτωση του Firebase Key
const firebaseKeyPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH || './firebase-key.json';
let serviceAccount;

try {
    if (fs.existsSync(path.resolve(firebaseKeyPath))) {
        serviceAccount = JSON.parse(fs.readFileSync(path.resolve(firebaseKeyPath), 'utf8'));
    } else {
        throw new Error(`Firebase key file not found at path: ${firebaseKeyPath}`);
    }
} catch (error) {
    console.error('🚨 ΚΡΙΣΙΜΟ ΣΦΑΛΜΑ ΑΣΦΑΛΕΙΑΣ: Το αρχείο Firebase Service Account Key λείπει ή είναι κατεστραμμένο.');
    console.error('Παρακαλώ προσθέστε το αρχείο κλειδιού σας και ρυθμίστε τη μεταβλητή FIREBASE_SERVICE_ACCOUNT_KEY_PATH στο αρχείο .env');
    process.exit(1); // Τερματισμός της εφαρμογής με ελεγχόμενο τρόπο
}

// Initialize Firebase
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
});
const firebasedb = admin.database();

const app = express();

// CORS Configuration
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:8080',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(bodyParser.json());

// Validate Environment Variables
if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD) {
    console.error('Missing database configuration in .env file');
    process.exit(1);
}

// MySQL Connection
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

db.connect((err) => {
    if (err) {
        console.error('MySQL connection error:', err);
        process.exit(1);
    }
    console.log('MySQL connected...');
});

// ================= PROXY ENDPOINT =================
app.get('/proxy', async (req, res) => {
    try {
        const targetUrl = req.query.url;

        if (!targetUrl) {
            return res.status(400).json({ error: 'Missing URL parameter' });
        }

        let parsedUrl;
        try {
            parsedUrl = new URL(targetUrl);
        } catch (err) {
            return res.status(400).json({ error: 'Invalid URL format' });
        }

        // 1. Hardcoded allowed targets + strict endpoint/query allowlists
        let safeBaseUrl = '';
        let allowedPaths = [];
        let allowedQueryParams = [];

        if (parsedUrl.hostname === 'api.weatherapi.com' || parsedUrl.hostname === 'weatherapi.com') {
            // Lock protocol + domain to server-controlled constant
            safeBaseUrl = 'https://api.weatherapi.com';
            allowedPaths = ['/v1/current.json', '/v1/forecast.json', '/v1/history.json', '/v1/astronomy.json'];
            allowedQueryParams = ['key', 'q', 'days', 'aqi', 'alerts', 'dt', 'hour', 'lang'];
        } else if (parsedUrl.hostname === 'dlnk.one') {
            safeBaseUrl = 'https://dlnk.one';
            allowedPaths = ['/'];
            allowedQueryParams = [];
        } else {
            return res.status(403).json({ error: 'Forbidden domain' });
        }

        // 2. Select endpoint from a strict server-side allowlist (no user-controlled path)
        const endpoint = req.query.endpoint;
        if (!endpoint || !allowedPaths.includes(endpoint)) {
            return res.status(403).json({ error: 'Forbidden path' });
        }

        // 3. Rebuild URL from trusted base + validated allowlisted endpoint
        const safeUrl = new URL(endpoint, safeBaseUrl);

        // 4. Copy only explicitly allowed query params
        parsedUrl.searchParams.forEach((value, key) => {
            if (allowedQueryParams.includes(key)) {
                safeUrl.searchParams.append(key, value);
            }
        });

        // 4. Κλήση του axios με το 100% απολυμασμένο URL
        const response = await axios.get(safeUrl.toString(), {
            headers: {
                'User-Agent': req.headers['user-agent'] || '',
                'Accept': req.headers['accept'] || '*/*'
            },
            maxRedirects: 0, // Αποτρέπει τα επικίνδυνα εσωτερικά redirects
            validateStatus: (status) => status < 500
        });

        res.set({
            'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || 'http://localhost:8080',
            'Content-Type': response.headers['content-type']
        });

        res.status(response.status).send(response.data);
    } catch (error) {
        console.error('Proxy error:', error.message);
        res.status(500).json({ error: 'Proxy request failed' });
    }
});

// Sensor Handlers
const sensorHandlers = {
    WeatherApi: async (sensor) => {
        try {
            const response = await axios.get(
                `http://api.weatherapi.com/v1/current.json?key=${sensor.details.apiKey}&q=${sensor.details.location}&aqi=no`
            );

            if (response.data.error) {
                console.error('Weather API Error:', response.data.error.message);
                return;
            }

            const temp = response.data.current.temp_c;
            const humidity = response.data.current.humidity;

            const threshold = sensor.details.threshold || null;

            const weatherData = {
                temp,
                humidity,
                timestamp: Date.now()
            };

            if (threshold) {
                if (temp <= threshold.warning) {
                    weatherData.tempStatus = 'normal';
                } else if (temp <= threshold.critical) {
                    weatherData.tempStatus = 'warning';
                } else {
                    weatherData.tempStatus = 'critical';
                }

                if (humidity <= threshold.warning) {
                    weatherData.humidityStatus = 'normal';
                } else if (humidity <= threshold.critical) {
                    weatherData.humidityStatus = 'warning';
                } else {
                    weatherData.humidityStatus = 'critical';
                }
            }

            const dataRef = firebasedb.ref(`sensorData/${sensor.userId}/${sensor.key}`);
            await dataRef.push(weatherData);
        } catch (error) {
            console.error('Weather API Request Failed:', error.message);
        }
    },

    TTN: async (sensor) => {
        const { applicationId, apiKey, clusterId, deviceId } = sensor.details;

        if (!applicationId || !apiKey || !clusterId || !deviceId) {
            throw new Error('Invalid TTN configuration');
        }

        const mqttConfig = {
            host: 'eu1.cloud.thethings.network',
            port: 8883,
            protocol: 'mqtts',
            username: `${applicationId}@${clusterId}`,
            password: apiKey
        };

        try {
            const client = mqtt.connect(`mqtts://${mqttConfig.host}`, mqttConfig);

            return new Promise((resolve, reject) => {
                client.on('connect', () => {
                    console.log(`Connected to TTN MQTT for sensor ${sensor.key}`);

                    const topic = `v3/${applicationId}@${clusterId}/devices/${deviceId}/up`;
                    client.subscribe(topic, (err) => {
                        if (err) {
                            console.error('TTN subscription error:', err);
                            reject(err);
                            return;
                        }
                        console.log(`Subscribed to topic: ${topic}`);
                    });

                    client.on('message', async (topic, message) => {
                        try {
                            console.log('Received TTN message:', message.toString()); // Debug log

                            const payload = JSON.parse(message.toString());
                            console.log('Parsed payload:', payload); // Debug log

                            // Extract data from TTN v3 payload structure
                            const decodedPayload = payload?.uplink_message?.decoded_payload;
                            const receivedAt = payload?.received_at;

                            if (!decodedPayload) {
                                console.error('No decoded payload in message:', payload);
                                return;
                            }

                            // Store data in Firebase
                            const sensorData = {
                                raw: decodedPayload,
                                timestamp: new Date(receivedAt).getTime() || Date.now()
                            };

                            // Add debug logs
                            console.log('Storing data in Firebase:', {
                                path: `sensorData/${sensor.userId}/${sensor.key}`,
                                data: sensorData
                            });

                            // Store in Firebase
                            await firebasedb.ref(`sensorData/${sensor.userId}/${sensor.key}`).push(sensorData);
                            console.log('Successfully stored TTN data in Firebase');

                        } catch (error) {
                            console.error('Error processing TTN message:', error);
                        }
                    });

                    resolve(client);
                });

                client.on('error', (error) => {
                    console.error('TTN MQTT Error:', error);
                    reject(error);
                });

                // Add connection closed handler
                client.on('close', () => {
                    console.log('TTN MQTT connection closed');
                });
            });
        } catch (error) {
            console.error('TTN Handler Error:', error);
            throw error;
        }
    },

    Arduino: (sensor) => {
        const port = new SerialPort({
            path: sensor.details.serialPort,
            baudRate: 9600
        });

        activeSerialPorts.set(sensor.key, port);

        const { ReadlineParser } = require('@serialport/parser-readline');
        const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

        parser.on('data', async (line) => {
            const soilMoistureValue = parseInt(line.trim(), 10);
            if (isNaN(soilMoistureValue)) {
                console.error('Received invalid data from Arduino:', line);
                return;
            }

            const threshold = sensor.details.threshold || null;

            const sensorData = {
                value: soilMoistureValue,
                timestamp: Date.now()
            };

            if (threshold) {
                if (soilMoistureValue <= threshold.warning) {
                    sensorData.status = 'normal';
                } else if (soilMoistureValue <= threshold.critical) {
                    sensorData.status = 'warning';
                } else {
                    sensorData.status = 'critical';
                }
            }

            const dataRef = firebasedb.ref(`sensorData/${sensor.userId}/${sensor.key}`);
            await dataRef.push(sensorData);
            console.log(`Stored Arduino data:`, sensorData);
        });

        port.on('error', (err) => {
            console.error('Serial Port Error:', err.message);
        });
    },

    'Plc-Modbus': async (sensor) => {
        const client = new ModbusRTU();
        try {
            await client.connectTCP(sensor.details.ipAddress, { port: sensor.details.port });
            const result = await client.readHoldingRegisters(sensor.details.registerAddress, 1);

            const threshold = sensor.details.threshold || null;

            const sensorData = {
                value: result.data[0],
                timestamp: Date.now()
            };

            if (threshold) {
                if (result.data[0] <= threshold.warning) {
                    sensorData.status = 'normal';
                } else if (result.data[0] <= threshold.critical) {
                    sensorData.status = 'warning';
                } else {
                    sensorData.status = 'critical';
                }
            }

            const dataRef = firebasedb.ref(`sensorData/${sensor.userId}/${sensor.key}`);
            await dataRef.push(sensorData);
            client.close();
        } catch (error) {
            console.error('Modbus Error:', error);
        }
    },

    'Plc-Opcua': async (sensor) => {
        const client = opcua.OPCUAClient.create({
            endpointMustExist: false,
            connectionStrategy: {
                maxRetry: 5,
                initialDelay: 2000,
                maxDelay: 10000
            },
            keepAliveInterval: 5000
        });

        try {
            // Event handlers
            client.on("keepalive", () => console.log(`OPC-UA Keepalive for sensor ${sensor.key}`));
            client.on("close", () => console.log(`OPC-UA Connection closed for sensor ${sensor.key}`));
            client.on("backoff", (retry, delay) => {
                console.log(`OPC-UA Connection retry attempt ${retry}, delay: ${delay}ms for sensor ${sensor.key}`);
            });

            console.log("Attempting to connect to:", sensor.details.endpointUrl);
            await client.connect(sensor.details.endpointUrl);
            console.log("OPC-UA Connected successfully");

            const session = await client.createSession();
            console.log("Session created");

            const resolvedNodeId = opcua.resolveNodeId(sensor.details.nodeId);

            // Create subscription
            const subscription = opcua.ClientSubscription.create(session, {
                requestedPublishingInterval: 1000,
                maxNotificationsPerPublish: 1000
            });

            // Monitor the node with Reporting mode
            const monitoredItem = await subscription.monitor(
                { nodeId: resolvedNodeId, attributeId: opcua.AttributeIds.Value },
                {
                    samplingInterval: 1000,
                    discardOldest: true,
                    queueSize: 10,
                },
                opcua.TimestampsToReturn.Both
            );

            // Set monitoring mode to Reporting
            await monitoredItem.setMonitoringMode(opcua.MonitoringMode.Reporting);

            // Handle data changes
            monitoredItem.on("changed", async (dataValue) => {
                if (!dataValue || dataValue.statusCode.isNotGood() || dataValue.value.value === null) {
                    console.error(`Invalid data for sensor ${sensor.key}:`, dataValue?.statusCode);
                    return;
                }

                const rawValue = dataValue.value.value;
                console.log(`Valid data received for sensor ${sensor.key}:`, rawValue);

                const threshold = sensor.details.threshold || null;
                const dataObject = {
                    value: rawValue,
                    timestamp: Date.now()
                };

                if (threshold) {
                    if (rawValue <= threshold.warning) {
                        dataObject.status = 'normal';
                    } else if (rawValue <= threshold.critical) {
                        dataObject.status = 'warning';
                    } else {
                        dataObject.status = 'critical';
                    }
                }

                // Store in Firebase
                const dataRef = firebasedb.ref(`sensorData/${sensor.userId}/${sensor.key}`);
                await dataRef.push(dataObject).catch(err => console.error("Firebase error:", err));
            });

            // Handle monitoring errors
            monitoredItem.on("err", (err) => {
                console.error(`Monitoring error for sensor ${sensor.key}:`, err);
            });

            // Setup cleanup handler
            const cleanupHandler = async () => {
                console.log(`Closing OPC-UA connection for sensor ${sensor.key}...`);
                try {
                    await subscription.terminate();
                    await session.close();
                    await client.disconnect();
                } catch (err) {
                    console.error(`Error during cleanup for sensor ${sensor.key}:`, err);
                }
            };

            // Store cleanup handler for later use during sensor deletion
            client.cleanupHandler = cleanupHandler;

            return client;

        } catch (error) {
            console.error(`OPC-UA Error for sensor ${sensor.key}:`, error.message);
            if (client) {
                try {
                    await client.disconnect();
                } catch (disconnectError) {
                    console.error(`Error disconnecting client for sensor ${sensor.key}:`, disconnectError);
                }
            }
            return null;
        }
    }
};

// API Endpoints
app.post('/login', (req, res) => {
    const { id, password } = req.body;
    const sql = 'SELECT * FROM users WHERE id = ? AND password = ?';
    db.query(sql, [id, password], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: result.length > 0 });
    });
});

app.post('/register', (req, res) => {
    const { id, password } = req.body;
    const sql = 'INSERT INTO users (id, password) VALUES (?, ?)';
    db.query(sql, [id, password], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.post('/change-password', (req, res) => {
    const { id, oldPassword, newPassword } = req.body;
    const sql = 'UPDATE users SET password = ? WHERE id = ? AND password = ?';
    db.query(sql, [newPassword, id, oldPassword], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: result.affectedRows > 0 });
    });
});

app.get('/profile', (req, res) => {
    const { id } = req.query;
    console.log("Fetching profile for user ID:", id);
    const sql = 'SELECT id FROM users WHERE id = ?';
    db.query(sql, [id], (err, result) => {
        if (err) {
            console.error('Error fetching profile:', err);
            return res.status(500).send('Error fetching profile');
        }
        console.log("Profile query result:", result);
        if (result.length > 0) {
            res.send(result[0]);
        } else {
            res.status(404).send('User not found');
        }
    });
});

app.post('/register-sensor', async (req, res) => {
    const { name, type, details, userId } = req.body;

    try {
        if (type === 'TTN') {
            if (!details.applicationId || !details.apiKey) {
                throw new Error('Missing required TTN configuration: applicationId and apiKey are required');
            }
        }

        const sensorRef = firebasedb.ref(`sensors/${userId}`).push();
        await sensorRef.set({ name, type, details, userId });
        const sensorKey = sensorRef.key;

        // TTN specific handling
        if (type === 'TTN') {
            try {
                const mqttClient = await sensorHandlers.TTN({
                    userId,
                    key: sensorKey,
                    details
                });

                if (mqttClient) {
                    activeMqttClients.set(sensorKey, mqttClient);
                    console.log(`Successfully initialized TTN MQTT connection for sensor ${sensorKey}`);
                }
            } catch (error) {
                console.error('TTN initialization error:', error);
                await sensorRef.remove();
                throw new Error(`TTN setup failed: ${error.message}`);
            }
        }

        // Handle other sensor types
        switch (type) {
            case 'WeatherApi':
                const weatherInterval = setInterval(() => sensorHandlers[type]({
                    userId,
                    key: sensorKey,
                    details
                }), 5000);
                activeIntervals.set(sensorKey, weatherInterval);
                break;

            case 'Arduino':
                sensorHandlers[type]({ name, type, details, userId, key: sensorKey });
                break;

            case 'Plc-Modbus':
                const modbusInterval = setInterval(() => sensorHandlers[type]({
                    userId,
                    key: sensorKey,
                    details
                }), 500);
                activeIntervals.set(sensorKey, modbusInterval);
                break;

            case 'Plc-Opcua':
                const opcuaClient = await sensorHandlers[type]({
                    name, type, details, userId, key: sensorKey
                });
                if (opcuaClient) {
                    activeOpcuaClients.set(sensorKey, opcuaClient);
                } else {
                    console.error("OPC-UA client creation failed.");
                }
                break;

            default:
                console.warn(`Unhandled sensor type: ${type}`);
                break;
        }

        res.json({
            success: true,
            sensorId: sensorKey,
            webhookUrl: type === 'TTN' ? `http://YOUR_SERVER:5000/ttn-webhook/${userId}/${sensorKey}` : null
        });
    } catch (error) {
        console.error("Error in sensor registration:", error.message);
        res.status(500).json({
            success: false,
            error: error.message,
            details: type === 'TTN' ? 'Please verify your TTN credentials and configuration' : undefined
        });
    }
});

app.delete('/delete-sensor/:userId/:sensorId', async (req, res) => {
    const { userId, sensorId } = req.params;

    if (activeIntervals.has(sensorId)) {
        clearInterval(activeIntervals.get(sensorId));
        activeIntervals.delete(sensorId);
    }

    if (activeSerialPorts.has(sensorId)) {
        const port = activeSerialPorts.get(sensorId);
        port.close((err) => {
            if (err) console.error('Error closing port:', err.message);
        });
        activeSerialPorts.delete(sensorId);
    }

    if (activeOpcuaClients.has(sensorId)) {
        const client = activeOpcuaClients.get(sensorId);
        if (client.cleanupHandler) {
            await client.cleanupHandler();
        }
        activeOpcuaClients.delete(sensorId);
        console.log(`Disconnected OPC-UA client for sensor ${sensorId}`);
    }

    if (activeMqttClients.has(sensorId)) {
        const client = activeMqttClients.get(sensorId);
        client.end();
        activeMqttClients.delete(sensorId);
        console.log(`Disconnected MQTT client for sensor ${sensorId}`);
    }

    try {
        await firebasedb.ref(`sensors/${userId}/${sensorId}`).remove();
        await firebasedb.ref(`sensorData/${userId}/${sensorId}`).remove();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/sensors/:userId', (req, res) => {
    const { userId } = req.params;
    firebasedb.ref(`sensors/${userId}`).once('value')
        .then(snapshot => res.json({ success: true, sensors: snapshot.val() || {} }))
        .catch(error => res.status(500).json({ success: false, error: error.message }));
});

app.get('/sensor-data/:userId/:sensorId', async (req, res) => {
    try {
        const { userId, sensorId } = req.params;
        const snapshot = await firebasedb.ref(`sensorData/${userId}/${sensorId}`).once('value');
        res.json(Object.values(snapshot.val() || []));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/ttn-webhook/:userId/:sensorId', async (req, res) => {
    const { userId, sensorId } = req.params;
    try {
        const result = await sensorHandlers.TTN(
            { userId, key: sensorId },
            req.body
        );
        res.status(result ? 200 : 500).send(result ? 'OK' : 'Failed to process data');
    } catch (error) {
        console.error('TTN Webhook Error:', error);
        res.status(500).send('Failed to process webhook');
    }
});

app.get('/export-sensor-data/:userId/:sensorId', async (req, res) => {
    try {
        const { userId, sensorId } = req.params;
        const snapshot = await firebasedb.ref(`sensorData/${userId}/${sensorId}`).once('value');
        const sensorData = Object.values(snapshot.val() || []);

        if (sensorData.length === 0) {
            return res.status(404).json({ error: 'No data found for this sensor' });
        }

        const csvContent = sensorData.map(data => {
            return `${new Date(data.timestamp).toISOString()},${data.value || ''},${data.status || ''}`;
        }).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=sensor_${sensorId}_data.csv`);
        res.send(csvContent);
    } catch (error) {
        console.error('Error exporting sensor data:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/test-opcua-connection', async (req, res) => {
    const { endpointUrl } = req.body;
    const client = opcua.OPCUAClient.create({
        endpointMustExist: false,
        securityMode: opcua.MessageSecurityMode.None,
        securityPolicy: opcua.SecurityPolicy.None,
        requestedSessionTimeout: 60000
    });

    try {
        console.log("Testing connection to:", endpointUrl);
        await client.connect(endpointUrl);
        console.log("Connection test successful");

        const endpoints = await client.getEndpoints();
        await client.disconnect();

        res.json({
            success: true,
            message: "Connection successful",
            endpoints: endpoints.map(ep => ({
                endpointUrl: ep.endpointUrl,
                securityMode: ep.securityMode.toString(),
                securityPolicy: ep.securityPolicyUri
            }))
        });
    } catch (error) {
        console.error("OPC-UA Test Connection Error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
