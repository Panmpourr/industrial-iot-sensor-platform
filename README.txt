Industrial IoT Sensor Monitoring & Data Platform

[Docker-enabled] [Frontend-React 18] [Backend-Node.js Express]

A comprehensive Industrial IoT (IIoT) platform designed for real-time monitoring, processing, and visualization of data streams. The application supports multiple industrial communication protocols and provides a modern, responsive dashboard for managing sensors and analyzing telemetry.

Short Introduction
------------------
This project is a real-time industrial data monitoring web application developed as a diploma thesis at the International University of Greece. It allows users to collect, store, and visualize data from multiple sensor sources such as Arduino devices, PLCs (via Modbus/OPC UA), LoRaWAN (via The Things Network), and external APIs (e.g., OpenWeatherMap). The platform provides live dashboards, interactive maps, historical charts, gauge meters, CSV export, and secure user authentication. It is built with a modern, scalable architecture (React frontend, Node.js/Express backend, MySQL + Firebase databases) and supports IoT protocols like MQTT, Modbus, OPC UA, and Serial communication.

System Architecture & Tech Stack
--------------------------------
The platform follows a loosely coupled Client-Server architecture, ensuring high scalability, security, and independent maintainability of its subsystems.

### 1. Frontend Layer (React.js)
- UI Components: Designed with Material-UI (MUI 5), CSS Grid, and Flexbox, fully supporting Responsive Design and Dark Mode.
- State Management: Utilizes React Hooks (useState, useEffect, useCallback) and the Context API for global user authentication sessions.
- Data Visualization: Real-time and historical graphs using Chart.js (react-chartjs-2) and Recharts. Integration of custom interactive Gauge Charts with dynamic color changes based on user-defined thresholds.
- Geospatial Data: Dynamic rendering of physical sensor locations on interactive maps using Leaflet (React-Leaflet).

### 2. Backend Layer (Node.js & Express)
- API Server: Asynchronous RESTful API endpoints for user authentication, sensor registration, and data operations.
- Data Processing: Real-time threshold monitoring mechanisms, analytics, and automated data exporting capabilities.

### 3. Data Layer (Hybrid Architecture)
- MySQL 8.0: A relational database dedicated securely to user management and credentials (utilizing bcrypt hashing + salting).
- Firebase Realtime Database: A NoSQL cloud database for storing time-series sensor data in JSON format, achieving ultra-low latency (<100ms).

Technologies Used (Detailed)
----------------------------
Frontend:
- React.js (with Hooks, Context API)
- Material-UI (MUI) – UI components & theming
- React Router DOM – SPA navigation
- Axios – HTTP requests
- Chart.js + Recharts – Data visualization (line/bar charts, gauges)
- React-Leaflet + Leaflet – Interactive maps & sensor geolocation

Backend:
- Node.js + Express.js – RESTful API server
- MySQL (via mysql2) – User authentication & credentials
- Firebase Realtime Database – Real-time sensor data storage
- bcrypt – Password hashing
- dotenv – Environment variables

IoT & Communication Protocols:
- Serial (USB) – Arduino sensors (serialport)
- Modbus TCP/RTU – PLCs (modbus-serial)
- OPC UA – Industrial systems (node-opcua)
- MQTT – The Things Network (LoRaWAN) integration (mqtt)
- REST APIs – External weather data (OpenWeatherMap, etc.)

DevOps & Deployment:
- Docker – Multi-container setup (frontend, backend, MySQL)
- Docker Compose – Orchestration

Supported Industrial Protocols
------------------------------
The platform integrates specialized Protocol Handlers in the backend, enabling seamless connectivity with:
1. OPC UA (IEC 62541): Client-server industrial communication with node-based addressing, ideal for PLCs and SCADA systems (node-opcua).
2. Modbus TCP: Register-based communication over Ethernet for reading holding registers of industrial units (modbus-serial).
3. MQTT (The Things Network - TTN): Publish-subscribe architecture for long-range, low-power wireless sensors (LoRaWAN).
4. Serial Communication (UART): Direct data reading from microcontrollers (e.g., Arduino, ESP32) via USB serial connection (serialport).
5. REST APIs: Integration of external services (such as the OpenWeatherMap API) to correlate environmental conditions with industrial processes.

Project Structure
-----------------
industrial-iot-sensor-platform/
├── docker-compose.yml         # Orchestration of the 3 main Containers
├── sql/
│   └── init.sql               # MySQL initialization script
├── scripts/
│   └── opcua_simulator.py     # OPC-UA PLC Simulator in Python
└── Sensor-app/
    ├── backend/               # Node.js + Express API Server & Handlers
    └── frontend/              # React.js SPA Frontend Layer

Features
--------
- User registration & login (secure password hashing)
- Add/register multiple sensors (Arduino, PLC, LoRaWAN, Weather API)
- Real-time data visualization – Line charts, gauge meters, live updates
- Interactive map – Sensor positions with dynamic markers & popups
- Threshold alerts – Visual warnings when values exceed limits
- CSV export – Download sensor history for offline analysis
- Multi-protocol support – MQTT, Modbus, OPC UA, Serial, REST
- Modular architecture – Easy to add new sensor types
- Dockerized – One-command deployment

The Process (Development Workflow)
-----------------------------------
1. Requirements analysis – Defined functional/non-functional needs (real-time, multi-protocol, user auth, maps, CSV).
2. Architecture design – Client-server model with REST APIs, separation of concerns.
3. Frontend implementation – React SPA with components for login, dashboard, sensor registration, charts, and maps.
4. Backend implementation – Node.js/Express endpoints for auth, sensor management, data retrieval, and export.
5. Database setup – MySQL for users, Firebase for real-time sensor readings.
6. Sensor handlers – Developed modular handlers for Serial, Modbus, OPC UA, MQTT (TTN), and external APIs.
7. Real-time integration – Connected frontend to backend via Axios, used polling/subscriptions for live updates.
8. Dockerization – Created Dockerfiles and docker-compose.yml to run all services consistently.
9. Testing – Validated with actual Arduino, TTN, and simulated PLC/OPC UA data.
10. Documentation – Wrote thesis (PDF) and this README.

What I Learned
--------------
- Building a full-stack IoT platform from scratch using React, Node.js, and multiple databases.
- Integrating industrial protocols (Modbus, OPC UA, MQTT) into a web application.
- Handling real-time data flows and visualizing them with Chart.js and Recharts.
- Implementing secure authentication (bcrypt, session handling, CORS).
- Using Docker to containerize and orchestrate frontend, backend, and database services.
- The power of AI assistance (ChatGPT) during development – debugging, code refactoring, and documentation writing.
- Managing geolocation with Leaflet and syncing it with Firebase.

How It Can Be Improved (Future Work)
-------------------------------------
- AI/ML integration – Predictive maintenance, anomaly detection on sensor streams.
- More industrial protocols – Profinet, BACnet, CAN bus.
- Time-series database – Replace Firebase with InfluxDB or TimescaleDB for better performance on large histories.
- Role-based access control (RBAC) – Admin, operator, viewer roles.
- Enhanced dashboard – Customizable widgets, drag-and-drop layout.
- Edge computing – Run parts of the backend on Raspberry Pi or industrial gateways.
- WebSockets – For even lower latency real-time updates (instead of polling).

Security & Data Protection
--------------------------
- Password Encryption: Utilizes the bcrypt library with a dynamic salt factor for storing passwords in the database.
- CORS Policies: Strict access restriction to backend API endpoints, allowing only whitelisted origins.
- Data Isolation: Complete isolation of user data within Firebase using structured paths (/users/{userId}/sensors/{sensorId}).

Installation & Execution (Docker)
----------------------------------
The application is fully containerized using Docker and Docker Compose, allowing the entire stack (Frontend, Backend, Database) to run seamlessly without local dependencies.

### Prerequisites
- Docker Desktop installed on your system.
- Ports 8080, 5000, and 3306 must be free.

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
   - Frontend Dashboard: http://localhost:8080
   - Backend API: http://localhost:5000
   - MySQL Database: Port 3306 (User: appuser, Database: appdb)

Note: If you prefer to run without Docker, you can start MySQL, then npm install and npm start in both frontend/ and backend/ folders separately. See the thesis (Chapter 4.12) for details.

Testing with the OPC-UA Simulator
---------------------------------
For experimental testing of the OPC-UA industrial protocol, a ready-to-use Python simulator is included.
To run it locally:

pip install opcua
python scripts/opcua_simulator.py

The simulator will start a local server at opc.tcp://0.0.0.0:4840 and generate randomized (but within-limits) values for Temperature, Humidity, and Pressure, which the backend can read via subscription nodes.

Demo Video
----------
Demo video: https://github.com/username/repo/blob/main/docs/demo.mp4


Author & Supervision
--------------------
Author: Panagiotis Bourboulas (AM: 2020/134)
Supervisor: Assistant Professor Dimitrios Bechtsis
Institution: International University of Greece – Department of Production and Management Engineering
Thesis title: Development of a REACT application for data flows in industry
Year: 2025

License
-------
All rights reserved. For non-commercial, educational or research use only, provided that the source is acknowledged. See the copyright notice in the full thesis (page 2).
