const mqtt = require('mqtt');
const admin = require('firebase-admin');

class TTNClient {
    constructor() {
        this.clients = new Map(); // Store MQTT clients by sensor ID
        this.reconnectTimeouts = new Map(); // Store reconnection timeouts
        this.firebasedb = admin.database();
    }

    async connect(sensor) {
        const { applicationId, apiKey, deviceId } = sensor.details;
        const clientId = `${sensor.userId}_${sensor.key}`;

        // Cleanup existing connection if any
        await this.disconnect(clientId);

        const mqttConfig = {
            host: 'eu1.cloud.thethings.network',
            port: 8883, // Using secure port
            protocol: 'mqtts',
            username: applicationId,
            password: apiKey,
            clientId: clientId,
            clean: true,
            connectTimeout: 10000,
            rejectUnauthorized: true
        };

        return new Promise((resolve, reject) => {
            try {
                const client = mqtt.connect(`mqtts://${mqttConfig.host}`, mqttConfig);

                client.on('connect', () => {
                    console.log(`TTN client connected for sensor ${sensor.key}`);

                    // Subscribe to specific device uplink messages
                    const topic = `v3/${applicationId}@ttn/devices/${deviceId}/up`;
                    client.subscribe(topic, (err) => {
                        if (err) {
                            console.error(`Subscription error for ${topic}:`, err);
                            reject(err);
                            return;
                        }
                    });

                    this.setupMessageHandler(client, sensor);
                    this.clients.set(clientId, client);
                    resolve(client);
                });

                client.on('error', (error) => {
                    console.error('TTN client error:', error);
                    this.handleReconnection(sensor);
                });

                client.on('close', () => {
                    console.log('TTN client disconnected');
                    this.handleReconnection(sensor);
                });

            } catch (error) {
                console.error('TTN connection error:', error);
                reject(error);
            }
        });
    }

    setupMessageHandler(client, sensor) {
        client.on('message', async (topic, message) => {
            try {
                const payload = JSON.parse(message.toString());
                const { uplink_message, received_at } = payload;

                if (!uplink_message?.decoded_payload) {
                    console.warn('No decoded payload in message');
                    return;
                }

                const sensorData = {
                    timestamp: new Date(received_at).getTime(),
                    values: {},
                    metadata: {
                        rssi: uplink_message.rx_metadata?.[0]?.rssi,
                        snr: uplink_message.rx_metadata?.[0]?.snr,
                        frequency: uplink_message.settings?.frequency
                    }
                };

                // Process each field in the payload
                Object.entries(uplink_message.decoded_payload).forEach(([field, value]) => {
                    sensorData.values[field] = {
                        value: value,
                        unit: sensor.details.threshold?.unit || '',
                        status: this.calculateStatus(value, sensor.details.threshold)
                    };
                });

                // Store in Firebase
                await this.firebasedb
                    .ref(`sensorData/${sensor.userId}/${sensor.key}/data`)
                    .push(sensorData);

            } catch (error) {
                console.error('Error processing TTN message:', error);
            }
        });
    }

    calculateStatus(value, threshold) {
        if (!threshold) return 'normal';
        if (value >= threshold.critical) return 'critical';
        if (value >= threshold.warning) return 'warning';
        return 'normal';
    }

    handleReconnection(sensor) {
        const clientId = `${sensor.userId}_${sensor.key}`;

        // Clear existing reconnection timeout
        if (this.reconnectTimeouts.has(clientId)) {
            clearTimeout(this.reconnectTimeouts.get(clientId));
        }

        // Set new reconnection timeout
        const timeout = setTimeout(async () => {
            try {
                await this.connect(sensor);
            } catch (error) {
                console.error('Reconnection failed:', error);
            }
        }, 5000);

        this.reconnectTimeouts.set(clientId, timeout);
    }

    async disconnect(clientId) {
        if (this.clients.has(clientId)) {
            const client = this.clients.get(clientId);
            if (client) {
                await client.endAsync();
                this.clients.delete(clientId);
            }
        }

        if (this.reconnectTimeouts.has(clientId)) {
            clearTimeout(this.reconnectTimeouts.get(clientId));
            this.reconnectTimeouts.delete(clientId);
        }
    }
}

module.exports = new TTNClient();
