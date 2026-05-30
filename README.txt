Industrial IoT Sensor Monitoring & Data Platform

[Docker-enabled] [Frontend-React 18] [Backend-Node.js Express]

A comprehensive Industrial IoT (IIoT) platform designed for real-time monitoring, processing, and visualization of data streams. The application supports multiple industrial communication protocols and provides a modern, responsive dashboard for managing sensors and analyzing telemetry.

## System Architecture & Tech Stack

The platform follows a loosely coupled Client-Server architecture, ensuring high scalability, security, and independent maintainability of its subsystems.

### 1. Frontend Layer (React.js)
* UI Components: Designed with Material-UI (MUI 5), CSS Grid, and Flexbox, fully supporting Responsive Design and Dark Mode.
* State Management: Utilizes React Hooks (useState, useEffect, useCallback) and the Context API for global user authentication sessions.
* Data Visualization: Real-time and historical graphs using Chart.js (react-chartjs-2) and Recharts. Integration of custom interactive Gauge Charts with dynamic color changes based on user-defined thresholds.
* Geospatial Data: Dynamic rendering of physical sensor locations on interactive maps using Leaflet (React-Leaflet).

### 2. Backend Layer (Node.js & Express)
* API Server: Asynchronous RESTful API endpoints for user authentication, sensor registration, and data operations.
* Data Processing: Real-time threshold monitoring mechanisms, analytics, and automated data exporting capabilities.

### 3. Data Layer (Hybrid Architecture)
* MySQL 8.0: A relational database dedicated securely to user management and credentials (utilizing bcrypt hashing + salting).
* Firebase Realtime Database: A NoSQL cloud database for storing time-series sensor data in JSON format, achieving ultra-low latency (<100ms).

---

## Supported Industrial Protocols

The platform integrates specialized Protocol Handlers in the backend, enabling seamless connectivity with:
1. OPC UA (IEC 62541): Client-server industrial communication with node-based addressing, ideal for PLCs and SCADA systems (node-opcua).
2. Modbus TCP: Register-based communication over Ethernet for reading holding registers of industrial units (modbus-serial).
3. MQTT (The Things Network - TTN): Publish-subscribe architecture for long-range, low-power wireless sensors (LoRaWAN).
4. Serial Communication (UART): Direct data reading from microcontrollers (e.g., Arduino, ESP32) via USB serial connection (serialport).
5. REST APIs: Integration of external services (such as the OpenWeatherMap API) to correlate environmental conditions with industrial processes.

---

## Project Structure

industrial-iot-sensor-platform/
├── docker-compose.yml         # Orchestration of the 3 main Containers
├── sql/
│   └── init.sql               # MySQL initialization script
├── scripts/
│   └── opcua_simulator.py     # OPC-UA PLC Simulator in Python
└── Sensor-app/
    ├── backend/               # Node.js + Express API Server & Handlers
    └── frontend/              # React.js SPA Frontend Layer

---

## Installation & Execution (Docker)

The application is fully containerized using Docker and Docker Compose, allowing the entire stack (Frontend, Backend, Database) to run seamlessly without local dependencies.

### Prerequisites
* Docker Desktop installed on your system.

### Steps to Run

1. Clone the Repository:
   git clone https://github.com/your-username/industrial-iot-sensor-platform.git
   cd industrial-iot-sensor-platform

2. Environment Configuration:
   Navigate to the Sensor-app/backend/ directory and create a .env file based on the provided .env.example:
   cp Sensor-app/backend/.env.example Sensor-app/backend/.env
   
   Fill in your MySQL credentials and Firebase keys in the .env file. Ensure you also create a .env in the frontend folder with REACT_APP_API_URL=http://localhost:5000.

3. Start the Containers:
   In the root directory (where docker-compose.yml is located), execute:
   docker compose up --build

4. Access the Platform:
   * Frontend Dashboard: http://localhost:8080
   * Backend API: http://localhost:5000
   * MySQL Database: Port 3306 (User: appuser, Database: appdb)

---

## Testing with the OPC-UA Simulator
For experimental testing of the OPC-UA industrial protocol, a ready-to-use Python simulator is included.
To run it locally:

pip install opcua
python scripts/opcua_simulator.py

The simulator will start a local server at opc.tcp://0.0.0.0:4840 and generate randomized (but within-limits) values for Temperature, Humidity, and Pressure, which the backend can read via subscription nodes.

---

## Security & Data Protection
* Password Encryption: Utilizes the bcrypt library with a dynamic salt factor for storing passwords in the database.
* CORS Policies: Strict access restriction to backend API endpoints, allowing only whitelisted origins.
* Data Isolation: Complete isolation of user data within Firebase using structured paths (/users/{userId}/sensors/{sensorId}).
