import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import WeatherGraph from './WeatherGraph';
import '../App.css';
import GaugeChart from './GaugeChart';
import { Typography, Grid, Paper, Box, Button, createTheme, ThemeProvider } from '@mui/material';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
    iconUrl: require('leaflet/dist/images/marker-icon.png'),
    shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

const Dashboard = () => {
    const darkTheme = createTheme({
        palette: {
            mode: 'dark',
            primary: {
                main: '#90caf9',
            },
            secondary: {
                main: '#f48fb1',
            },
            background: {
                default: '#1a1a1a',
                paper: '#272727',
            },
            text: {
                primary: '#ffffff',
                secondary: '#b3b3b3',
            },
        },
    });

    const [profile, setProfile] = useState({ id: '' });
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [message, setMessage] = useState('');
    const [currentSection, setCurrentSection] = useState('profile');
    const [sensors, setSensors] = useState({});
    const [selectedSensors, setSelectedSensors] = useState([]);
    const [sensorDataMap, setSensorDataMap] = useState({});
    const [sensorName, setSensorName] = useState('');
    const [sensorType, setSensorType] = useState('WeatherApi');
    const [sensorDetails, setSensorDetails] = useState({
        latitude: '',
        longitude: '',
    });
    const [registerSensorMinimized, setRegisterSensorMinimized] = useState(false);
    const navigate = useNavigate();
    const [thresholdSettings, setThresholdSettings] = useState({
        min: 0,
        max: 100,
        warning: 70,
        critical: 90,
        unit: ''
    });

    const fetchProfile = useCallback(async () => {
        try {
            const userId = localStorage.getItem('userId');
            const response = await axios.get(`${process.env.REACT_APP_API_URL}/profile?id=${userId}`);
            setProfile(response.data);
        } catch (error) {
            setMessage('Failed to fetch profile');
        }
    }, []);

    const fetchSensors = useCallback(async () => {
        try {
            const userId = localStorage.getItem('userId');
            const response = await axios.get(`${process.env.REACT_APP_API_URL}/profile?id=${userId}`);
            setSensors(response.data.sensors || {});
        } catch (error) {
            console.error('Error fetching sensors:', error);
            setSensors({});
        }
    }, []);

    const fetchSensorData = useCallback(async (sensorId) => {
        try {
            const userId = localStorage.getItem('userId');
            const response = await axios.get(`${process.env.REACT_APP_API_URL}/profile?id=${userId}/${sensorId}`);

            // Update data for this specific sensor in the map
            setSensorDataMap(prevMap => ({
                ...prevMap,
                [sensorId]: response.data
            }));
        } catch (error) {
            console.error(`Error fetching sensor data for ${sensorId}:`, error);
        }
    }, []);

    const handleExportData = async (sensorId) => {
        try {
            const userId = localStorage.getItem('userId');
            const sensorName = sensors[sensorId]?.name || 'sensor';
            const filename = `${sensorName.replace(/\s+/g, '_')}_data.csv`;

            // Create a direct download link using Axios with responseType blob
            const response = await axios.get(`${process.env.REACT_APP_API_URL}/profile?id=${userId}/${sensorId}`,
                { responseType: 'blob' }
            );

            // Create a download link and trigger it
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error('Error exporting data:', error);
            alert('Failed to export data. Please try again.');
        }
    };

    useEffect(() => {
        const userId = localStorage.getItem('userId');
        if (!userId) navigate('/login');

        if (currentSection === 'profile') {
            fetchProfile();
        } else if (currentSection === 'sensors') {
            fetchSensors();
        }
    }, [currentSection, navigate, fetchProfile, fetchSensors]);

    useEffect(() => {
        // Set up intervals for each selected sensor
        const intervals = {};

        selectedSensors.forEach(sensorId => {
            const sensor = sensors[sensorId];
            // Fetch once immediately
            fetchSensorData(sensorId);

            // Set up interval for live updates
            const interval = setInterval(() => {
                fetchSensorData(sensorId);
            }, sensor.type === 'TTN' ? 2000 : 500); // Longer interval for TTN

            intervals[sensorId] = interval;
        });

        // Cleanup function
        return () => {
            Object.values(intervals).forEach(interval => clearInterval(interval));
        };
    }, [selectedSensors, fetchSensorData, sensors]);

    const handleChangePassword = async (e) => {
        e.preventDefault();
        try {
            const userId = localStorage.getItem('userId');
            const response = await axios.post(`${process.env.REACT_APP_API_URL}/change-password`, {
                id: userId,
                oldPassword,
                newPassword
            });
            setMessage(response.data.success ? 'Password changed!' : 'Invalid password');
            setOldPassword('');
            setNewPassword('');
        } catch (error) {
            setMessage('Error changing password');
        }
    };

    const handleRegisterSensor = async () => {
        try {
            const userId = localStorage.getItem('userId');

            // Validate TTN API key
            if (sensorType === 'TTN') {
                if (!sensorDetails.apiKey?.trim()) {
                    alert('Please provide a TTN API key');
                    return;
                }
                const apiKeyPattern = /^NNSXS\.[A-Z0-9]{25,}\.[A-Z0-9]{40,}$/;
                if (!apiKeyPattern.test(sensorDetails.apiKey)) {
                    alert('Invalid TTN API key format. Please copy the entire API key from the TTN console.');
                    return;
                }
            }

            // Validate API key for TTN sensors
            if (sensorType === 'TTN' && (!sensorDetails.apiKey || sensorDetails.apiKey.trim() === '')) {
                alert('Please provide a valid API key for TTN.');
                return;
            }

            // Include threshold settings in all sensor details
            let updatedDetails = {
                ...sensorDetails,
                threshold: {
                    min: thresholdSettings.min,
                    max: thresholdSettings.max,
                    warning: thresholdSettings.warning,
                    critical: thresholdSettings.critical,
                    unit: thresholdSettings.unit
                }
            };

            await axios.post(`${process.env.REACT_APP_API_URL}/register-sensor`, {
                name: sensorName,
                type: sensorType,
                details: updatedDetails,
                userId
            });

            setSensorName('');
            setSensorDetails({});
            // Reset threshold settings
            setThresholdSettings({
                min: 0,
                max: 100,
                warning: 70,
                critical: 90,
                unit: ''
            });
            fetchSensors();
        } catch (error) {
            console.error('Error registering sensor:', error);
            alert(error.response?.data?.error || 'Failed to register sensor');
        }
    };

    const handleDeleteSensor = async (sensorId) => {
        try {
            const userId = localStorage.getItem('userId');
            await axios.delete(`${process.env.REACT_APP_API_URL}/delete-sensor/${userId}/${sensorId}`);
            fetchSensors();

            // Remove the sensor from selected sensors if it was selected
            if (selectedSensors.includes(sensorId)) {
                setSelectedSensors(prev => prev.filter(id => id !== sensorId));

                // Remove sensor data from the map
                setSensorDataMap(prev => {
                    const newMap = { ...prev };
                    delete newMap[sensorId];
                    return newMap;
                });
            }
        } catch (error) {
            console.error('Error deleting sensor:', error);
        }
    };

    const handleToggleSensorView = (sensorId) => {
        setSelectedSensors(prev => {
            if (prev.includes(sensorId)) {
                // If already selected, remove it
                return prev.filter(id => id !== sensorId);
            } else {
                // If not selected, add it
                return [...prev, sensorId];
            }
        });
    };

    const handleLogout = () => {
        localStorage.removeItem('userId');
        navigate('/login');
    };

    const renderThresholdSettings = () => {
        return (
            <div className="threshold-settings">
                <h4>Threshold Settings</h4>
                <div className="form-group">
                    <label className="form-label">Min Value</label>
                    <input
                        type="number"
                        value={thresholdSettings.min}
                        onChange={(e) => setThresholdSettings(prev => ({ ...prev, min: parseFloat(e.target.value) }))}
                        className="form-control"
                    />
                </div>
                <div className="form-group">
                    <label className="form-label">Max Value</label>
                    <input
                        type="number"
                        value={thresholdSettings.max}
                        onChange={(e) => setThresholdSettings(prev => ({ ...prev, max: parseFloat(e.target.value) }))}
                        className="form-control"
                    />
                </div>
                <div className="form-group">
                    <label className="form-label">Warning Threshold</label>
                    <input
                        type="number"
                        value={thresholdSettings.warning}
                        onChange={(e) => setThresholdSettings(prev => ({ ...prev, warning: parseFloat(e.target.value) }))}
                        className="form-control"
                    />
                </div>
                <div className="form-group">
                    <label className="form-label">Critical Threshold</label>
                    <input
                        type="number"
                        value={thresholdSettings.critical}
                        onChange={(e) => setThresholdSettings(prev => ({ ...prev, critical: parseFloat(e.target.value) }))}
                        className="form-control"
                    />
                </div>
                <div className="form-group">
                    <label className="form-label">Unit (optional)</label>
                    <input
                        type="text"
                        value={thresholdSettings.unit}
                        onChange={(e) => setThresholdSettings(prev => ({ ...prev, unit: e.target.value }))}
                        className="form-control"
                        placeholder="e.g. °C, RPM, etc."
                    />
                </div>
            </div>
        );
    };

    const renderSensorConfigurations = () => {
        const locationFields = (
            <div className="coordinates-fields">
                <div className="form-group">
                    <label className="form-label">Latitude</label>
                    <input
                        type="number"
                        step="any"
                        value={sensorDetails.latitude || ''}
                        onChange={(e) => setSensorDetails(prev => ({
                            ...prev,
                            latitude: parseFloat(e.target.value)
                        }))}
                        className="form-control"
                        placeholder="Enter latitude (e.g. 37.9838)"
                        required
                    />
                </div>
                <div className="form-group">
                    <label className="form-label">Longitude</label>
                    <input
                        type="number"
                        step="any"
                        value={sensorDetails.longitude || ''}
                        onChange={(e) => setSensorDetails(prev => ({
                            ...prev,
                            longitude: parseFloat(e.target.value)
                        }))}
                        className="form-control"
                        placeholder="Enter longitude (e.g. 23.7275)"
                        required
                    />
                </div>
            </div>
        );

        switch (sensorType) {
            case 'WeatherApi':
                return (
                    <>
                        {locationFields}
                        <div className="form-group">
                            <label className="form-label">Weather API Key</label>
                            <input
                                type="text"
                                value={sensorDetails.apiKey || ''}
                                onChange={(e) => setSensorDetails(prev => ({ ...prev, apiKey: e.target.value }))}
                                className="form-control"
                                placeholder="Enter API Key"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Location</label>
                            <input
                                type="text"
                                value={sensorDetails.location || ''}
                                onChange={(e) => setSensorDetails(prev => ({ ...prev, location: e.target.value }))}
                                className="form-control"
                                placeholder="Enter Location"
                            />
                        </div>
                    </>
                );
            case 'Arduino':
                return (
                    <>
                        {locationFields}
                        <div className="form-group">
                            <label className="form-label">Serial Port</label>
                            <input
                                type="text"
                                value={sensorDetails.serialPort || ''}
                                onChange={(e) =>
                                    setSensorDetails(prev => ({
                                        ...prev,
                                        serialPort: e.target.value
                                    }))
                                }
                                className="form-control"
                                placeholder="Enter Serial Port"
                            />
                        </div>
                        {renderThresholdSettings()}
                    </>
                );
            case 'Plc-Modbus':
                return (
                    <>
                        {locationFields}
                        <div className="form-group">
                            <label className="form-label">IP Address</label>
                            <input
                                type="text"
                                value={sensorDetails.ipAddress || ''}
                                onChange={(e) => setSensorDetails(prev => ({ ...prev, ipAddress: e.target.value }))}
                                className="form-control"
                                placeholder="Enter IP Address"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Port</label>
                            <input
                                type="text"
                                value={sensorDetails.port || ''}
                                onChange={(e) => setSensorDetails(prev => ({ ...prev, port: e.target.value }))}
                                className="form-control"
                                placeholder="Enter Port"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Register Address</label>
                            <input
                                type="text"
                                value={sensorDetails.registerAddress || ''}
                                onChange={(e) => setSensorDetails(prev => ({ ...prev, registerAddress: e.target.value }))}
                                className="form-control"
                                placeholder="Enter Register Address"
                            />
                        </div>
                        {renderThresholdSettings()}
                    </>
                );
            case 'Plc-Opcua':
                return (
                    <>
                        {locationFields}
                        <div className="form-group">
                            <label className="form-label">OPC UA Endpoint URL</label>
                            <input
                                type="text"
                                value={sensorDetails.endpointUrl || ''}
                                onChange={(e) => setSensorDetails(prev => ({ ...prev, endpointUrl: e.target.value }))}
                                className="form-control"
                                placeholder="opc.tcp://127.0.0.1:4840/freeopcua/server/"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Node ID</label>
                            <input
                                type="text"
                                value={sensorDetails.nodeId || ''}
                                onChange={(e) => setSensorDetails(prev => ({ ...prev, nodeId: e.target.value }))}
                                className="form-control"
                                placeholder="ns=2;s=Temperature"
                            />
                        </div>
                        {renderThresholdSettings()}
                    </>
                );
            case 'TTN':
                return (
                    <>
                        {locationFields}
                        <div className="form-group">
                            <label className="form-label">Application ID</label>
                            <input
                                type="text"
                                value={sensorDetails.applicationId || ''}
                                onChange={(e) => setSensorDetails(prev => ({
                                    ...prev,
                                    applicationId: e.target.value
                                }))}
                                className="form-control"
                                placeholder="Enter your TTN Application ID"
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Cluster ID</label>
                            <input
                                type="text"
                                value={sensorDetails.clusterId || ''}
                                onChange={(e) => setSensorDetails(prev => ({
                                    ...prev,
                                    clusterId: e.target.value
                                }))}
                                className="form-control"
                                placeholder="Enter your TTN Cluster ID (e.g., eu1)"
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Device ID</label>
                            <input
                                type="text"
                                value={sensorDetails.deviceId || ''}
                                onChange={(e) => setSensorDetails(prev => ({
                                    ...prev,
                                    deviceId: e.target.value
                                }))}
                                className="form-control"
                                placeholder="Enter your TTN Device ID"
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">API Key</label>
                            <input
                                type="password"
                                value={sensorDetails.apiKey || ''}
                                onChange={(e) => setSensorDetails(prev => ({
                                    ...prev,
                                    apiKey: e.target.value
                                }))}
                                className="form-control"
                                placeholder="Enter your TTN API Key"
                                required
                            />
                        </div>
                    </>
                );
            default:
                return locationFields;
        }
    };

    const renderTTNSensorData = (sensor, data) => {
        if (!data || !data.raw) {
            return <Typography color="error">No data available</Typography>;
        }

        // Add debug logging
        console.log('Rendering TTN data:', data);

        return (
            <Box sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>Latest Data</Typography>
                <Grid container spacing={2}>
                    {Object.entries(data.raw).map(([key, value]) => (
                        <Grid item xs={12} sm={6} md={4} key={key}>
                            <Paper elevation={2} sx={{ p: 2 }}>
                                <Typography variant="subtitle2" color="textSecondary">
                                    {key}
                                </Typography>
                                <Typography variant="h6">
                                    {typeof value === 'number' ?
                                        Number(value).toFixed(2) :
                                        JSON.stringify(value)}
                                </Typography>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>
                <Typography variant="caption" display="block" sx={{ mt: 2 }}>
                    Last update: {new Date(data.timestamp).toLocaleString()}
                </Typography>
            </Box>
        );
    };

    const renderSensorDataPanel = (sensorId) => {
        const sensor = sensors[sensorId];
        const sensorData = sensorDataMap[sensorId] || [];
        const latestValue = sensorData.length > 0 ? sensorData[sensorData.length - 1] : null;

        if (!sensor) return null;

        const getStats = () => {
            if (sensorData.length === 0) return null;

            const values = sensorData.map(d =>
                sensor.type === 'WeatherApi' ? d.temp : d.value
            ).filter(v => v !== undefined);

            return {
                min: Math.min(...values).toFixed(2),
                max: Math.max(...values).toFixed(2),
                avg: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)
            };
        };

        const stats = getStats();

        return (
            <Paper
                elevation={3}
                sx={{
                    p: 3,
                    borderRadius: 2,
                    mb: 3,
                    bgcolor: 'background.paper',
                    '& .MuiTypography-root': {
                        color: 'text.primary'
                    },
                    '& .stat-card': {
                        background: 'linear-gradient(145deg, #323232 0%, #272727 100%)',
                    }
                }}
                key={sensorId}
            >
                <Box sx={{ mb: 3 }}>
                    <Grid container justifyContent="space-between" alignItems="center">
                        <Grid item>
                            <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                                {sensor.name}
                            </Typography>
                        </Grid>
                        <Grid item>
                            <Button
                                variant="outlined"
                                startIcon={<i className="fas fa-download" />}
                                onClick={() => handleExportData(sensorId)}
                                sx={{ borderRadius: 2 }}
                            >
                                Export Data
                            </Button>
                        </Grid>
                    </Grid>
                </Box>

                {stats && (
                    <Box sx={{ mb: 4 }}>
                        <Grid container spacing={3}>
                            {[
                                { label: 'Min', value: stats.min },
                                { label: 'Average', value: stats.avg },
                                { label: 'Max', value: stats.max }
                            ].map((stat) => (
                                <Grid item xs={12} md={4} key={stat.label}>
                                    <Paper
                                        elevation={2}
                                        sx={{
                                            p: 2,
                                            textAlign: 'center',
                                            background: 'linear-gradient(145deg, #323232 0%, #272727 100%)',
                                            borderRadius: 2,
                                            '& .MuiTypography-root': {
                                                color: 'text.primary'
                                            }
                                        }}
                                    >
                                        <Typography variant="subtitle1" color="text.secondary">
                                            {stat.label}
                                        </Typography>
                                        <Typography variant="h4" sx={{ fontWeight: 'medium', color: 'primary.main' }}>
                                            {stat.value}{sensor.details.threshold?.unit}
                                        </Typography>
                                    </Paper>
                                </Grid>
                            ))}
                        </Grid>
                    </Box>
                )}

                <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                        <Paper
                            elevation={2}
                            sx={{
                                p: 2,
                                height: '400px',
                                bgcolor: 'background.paper',
                                borderRadius: 2,
                                transition: 'transform 0.2s',
                                '&:hover': {
                                    transform: 'scale(1.01)'
                                }
                            }}
                        >
                            <Typography variant="h6" sx={{ mb: 2 }}>Historical Data</Typography>
                            <Box sx={{ height: 'calc(100% - 40px)' }}>
                                <WeatherGraph
                                    data={sensorData}
                                    type={sensor.type}
                                    threshold={sensor.details.threshold}
                                />
                            </Box>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} md={6}>
                        <Paper
                            elevation={2}
                            sx={{
                                p: 2,
                                height: '400px',
                                bgcolor: 'background.paper',
                                borderRadius: 2,
                                transition: 'transform 0.2s',
                                '&:hover': {
                                    transform: 'scale(1.01)'
                                }
                            }}
                        >
                            <Typography variant="h6" sx={{ mb: 2 }}>Current Reading</Typography>
                            <Box sx={{
                                height: 'calc(100% - 40px)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '100%',
                                position: 'relative',
                                overflow: 'hidden' // Add overflow control
                            }}>
                                {(['Plc-Opcua', 'Arduino', 'Plc-Modbus', 'TTN'].includes(sensor.type) && latestValue) && (
                                    <Box sx={{
                                        width: '100%',
                                        height: '100%',
                                        position: 'relative',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transform: 'scale(0.85)' // Scale down the gauge slightly
                                    }}>
                                        <GaugeChart
                                            value={latestValue.value}
                                            min={sensor.details.threshold?.min || 0}
                                            max={sensor.details.threshold?.max || 100}
                                            threshold={{
                                                warning: sensor.details.threshold?.warning || 70,
                                                critical: sensor.details.threshold?.critical || 90,
                                            }}
                                            title={sensor.name}
                                            unit={sensor.details.threshold?.unit || ''}
                                        />
                                    </Box>
                                )}

                                {sensor.type === 'WeatherApi' && latestValue && (
                                    <Grid container spacing={2} sx={{ height: '100%', m: 0, width: '100%' }}>
                                        <Grid item xs={6} sx={{ height: '100%', p: 1 }}>
                                            <Box sx={{
                                                height: '100%',
                                                position: 'relative',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                transform: 'scale(0.85)' // Scale down the gauge slightly
                                            }}>
                                                <GaugeChart
                                                    value={latestValue.temp}
                                                    min={sensor.details.threshold?.min || 0}
                                                    max={sensor.details.threshold?.max || 40}
                                                    threshold={{
                                                        warning: sensor.details.threshold?.warning || 25,
                                                        critical: sensor.details.threshold?.critical || 30
                                                    }}
                                                    title="Temperature"
                                                    unit={sensor.details.threshold?.unit || '°C'}
                                                />
                                            </Box>
                                        </Grid>
                                        <Grid item xs={6} sx={{ height: '100%', p: 1 }}>
                                            <Box sx={{
                                                height: '100%',
                                                position: 'relative',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                transform: 'scale(0.85)' // Scale down the gauge slightly
                                            }}>
                                                <GaugeChart
                                                    value={latestValue.humidity}
                                                    min={0}
                                                    max={100}
                                                    threshold={{ warning: 60, critical: 80 }}
                                                    title="Humidity"
                                                    unit="%"
                                                />
                                            </Box>
                                        </Grid>
                                    </Grid>
                                )}

                                {sensor.type === 'TTN' && latestValue && renderTTNSensorData(sensor, latestValue)}
                            </Box>
                        </Paper>
                    </Grid>

                    {sensor.details.latitude && sensor.details.longitude && (
                        <Grid item xs={12}>
                            <Paper
                                elevation={2}
                                sx={{
                                    p: 2,
                                    height: '400px',
                                    bgcolor: 'background.paper',
                                    borderRadius: 2,
                                    transition: 'transform 0.2s',
                                    '&:hover': {
                                        transform: 'scale(1.01)'
                                    }
                                }}
                            >
                                <Typography variant="h6" sx={{ mb: 2 }}>Location</Typography>
                                <Box sx={{ height: 'calc(100% - 40px)' }}>
                                    <MapContainer
                                        center={[sensor.details.latitude, sensor.details.longitude]}
                                        zoom={13}
                                        style={{ height: '100%', width: '100%', borderRadius: '8px' }}
                                    >
                                        <TileLayer
                                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                        />
                                        <Marker position={[sensor.details.latitude, sensor.details.longitude]}>
                                            <Popup>
                                                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                                                    {sensor.name}
                                                </Typography>
                                                <Typography variant="body2">
                                                    {latestValue ? `Latest value: ${latestValue.value || latestValue.temp}` : 'No data'}
                                                </Typography>
                                            </Popup>
                                        </Marker>
                                    </MapContainer>
                                </Box>
                            </Paper>
                        </Grid>
                    )}
                </Grid>

                <Box sx={{ mt: 2, textAlign: 'right' }}>
                    <Typography variant="caption" color="text.secondary">
                        Last updated: {latestValue ? new Date(latestValue.timestamp).toLocaleString() : 'N/A'}
                    </Typography>
                </Box>
            </Paper>
        );
    };

    return (
        <ThemeProvider theme={darkTheme}>
            <Box sx={{
                bgcolor: 'background.default',
                minHeight: '100vh',
                color: 'text.primary'
            }}>
                <div className="container">
                    <div className="app-header">
                        <div className="header-container">
                            <h2 className="app-title">Dashboard - Welcome {profile.id}</h2>
                            <div className="user-info">
                                <button onClick={handleLogout} className="btn btn-danger">
                                    Logout
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="main-content">
                        <div className="tabs">
                            <button
                                className={`tab ${currentSection === 'profile' ? 'active' : ''}`}
                                onClick={() => setCurrentSection('profile')}
                            >
                                Profile
                            </button>
                            <button
                                className={`tab ${currentSection === 'sensors' ? 'active' : ''}`}
                                onClick={() => setCurrentSection('sensors')}
                            >
                                Sensors
                            </button>
                        </div>

                        {currentSection === 'profile' && (
                            <div className="card">
                                <div className="card-header">
                                    <h3>Profile</h3>
                                </div>
                                <div className="card-body">
                                    <form onSubmit={handleChangePassword} className="form-group">
                                        <div className="form-group">
                                            <label className="form-label">Old Password</label>
                                            <input
                                                type="password"
                                                value={oldPassword}
                                                onChange={(e) => setOldPassword(e.target.value)}
                                                required
                                                className="form-control"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">New Password</label>
                                            <input
                                                type="password"
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                required
                                                className="form-control"
                                            />
                                        </div>
                                        {message && <p className="alert alert-danger">{message}</p>}
                                        <button type="submit" className="btn btn-primary">
                                            Change Password
                                        </button>
                                    </form>
                                </div>
                            </div>
                        )}

                        {currentSection === 'sensors' && (
                            <div className="sensors-container">
                                <div className="card">
                                    <div className="card-header">
                                        <div className="d-flex justify-content-between align-items-center">
                                            <h3>Register New Sensor</h3>
                                            <button
                                                onClick={() => setRegisterSensorMinimized(!registerSensorMinimized)}
                                                className="btn btn-sm btn-outline-secondary"
                                            >
                                                {registerSensorMinimized ? 'Expand' : 'Minimize'}
                                            </button>
                                        </div>
                                    </div>
                                    {!registerSensorMinimized && (
                                        <div className="card-body">
                                            <div className="form-group">
                                                <label className="form-label">Sensor Name</label>
                                                <input
                                                    type="text"
                                                    value={sensorName}
                                                    onChange={(e) => setSensorName(e.target.value)}
                                                    className="form-control"
                                                    placeholder="Enter sensor name"
                                                />
                                            </div>
                                            {/* Rest of your form fields */}
                                            <div className="form-group">
                                                <label className="form-label">Sensor Type</label>
                                                <select
                                                    value={sensorType}
                                                    onChange={(e) => {
                                                        setSensorType(e.target.value);
                                                        setSensorDetails({});
                                                    }}
                                                    className="form-control"
                                                >
                                                    <option value="WeatherApi">Weather API</option>
                                                    <option value="Arduino">Arduino</option>
                                                    <option value="Plc-Modbus">PLC Modbus</option>
                                                    <option value="Plc-Opcua">PLC OPC-UA</option>
                                                    <option value="TTN">The Things Network</option>
                                                </select>
                                            </div>
                                            {renderSensorConfigurations()}
                                            <button
                                                onClick={handleRegisterSensor}
                                                className="btn btn-primary mt-3"
                                            >
                                                Register Sensor
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="registered-sensors mt-4">
                                    <h3>Registered Sensors</h3>
                                    <div className="sensor-grid">
                                        {Object.entries(sensors).map(([sensorId, sensor]) => (
                                            <div key={sensorId} className="sensor-card">
                                                <div className="sensor-card-header">
                                                    <h4>{sensor.name}</h4>
                                                    <span className="sensor-type">{sensor.type}</span>
                                                </div>
                                                <div className="sensor-card-body">
                                                    <button
                                                        onClick={() => handleToggleSensorView(sensorId)}
                                                        className={`btn ${selectedSensors.includes(sensorId) ? 'btn-secondary' : 'btn-info'}`}
                                                    >
                                                        {selectedSensors.includes(sensorId) ? "Hide Data" : "View Data"}
                                                    </button>
                                                </div>
                                                <div className="sensor-card-footer">
                                                    <button
                                                        onClick={() => handleExportData(sensorId)}
                                                        className="btn btn-success mr-2"
                                                    >
                                                        Export CSV
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteSensor(sensorId)}
                                                        className="btn btn-danger"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Render data panels for all selected sensors */}
                                <div className="sensor-data-panels">
                                    {selectedSensors.map(sensorId => renderSensorDataPanel(sensorId))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </Box>
        </ThemeProvider>
    );
};

export default Dashboard;