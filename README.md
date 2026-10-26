Industrial IoT Sensor Monitoring & Data Platform

[![CI](https://github.com/Panmpourr/industrial-iot-sensor-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/Panmpourr/industrial-iot-sensor-platform/actions/workflows/ci.yml)

[Docker-enabled] [Frontend-React 18 + TypeScript] [Backend-C# ASP.NET Core]

A comprehensive Industrial IoT (IIoT) platform designed for real-time monitoring, processing, and visualization of data streams. The application supports multiple industrial communication protocols and provides a modern, responsive dashboard for managing sensors and analyzing telemetry.

Short Introduction
------------------
This project is a real-time industrial data monitoring web application developed as a diploma thesis at the International University of Greece. It allows users to collect, store, and visualize data from multiple sensor sources such as Arduino devices, PLCs (via Modbus/OPC UA), LoRaWAN (via The Things Network), and external APIs (e.g., OpenWeatherMap). The platform provides live dashboards, interactive maps, historical charts, gauge meters, CSV export, and secure user authentication. It is built with a modern, scalable architecture (React frontend, C# / ASP.NET Core backend, PostgreSQL + TimescaleDB database) and supports IoT protocols like MQTT, Modbus, OPC UA, and Serial communication.

Supported Industrial Protocols
------------------------------
The platform integrates specialized Protocol Handlers in the backend, enabling seamless connectivity with:
1. OPC UA (IEC 62541): Client-server industrial communication with node-based addressing, ideal for PLCs and SCADA systems (OPC Foundation .NET Standard stack).
2. Modbus TCP: Register-based communication over Ethernet for reading holding registers of industrial units (NModbus).
3. MQTT (The Things Network - TTN): Publish-subscribe architecture for long-range, low-power wireless sensors (LoRaWAN, MQTTnet).
4. Serial Communication (UART): Direct data reading from microcontrollers (e.g., Arduino, ESP32) via USB serial connection (System.IO.Ports).
5. REST APIs: Integration of external services (such as the OpenWeatherMap API) to correlate environmental conditions with industrial processes.


Features
--------
- User registration & login (secure password hashing)
- Add/register multiple sensors (Arduino, PLC, LoRaWAN, Weather API)
- Plant hierarchy (ISA-95 style) – Site → areas → equipment → sensors, with a live tree, a page per area / machine and an "Area" filter on the overview, sensor list and alarms
- Real-time data visualization – Line charts, gauge meters, live updates over SignalR
- Long-term history – Live / 1h / 24h / 7d / 30d / 1y trends with min–max bands from TimescaleDB continuous aggregates
- Trend comparison – Up to 8 sensors on one time axis (one chart per unit, or all as % of their range), shareable by link
- Alarm notifications – Telegram messages by area and priority, escalation to a second person when an alarm stays unacknowledged, acknowledge from the phone
- Maintenance log (CMMS-lite) – Recurring tasks per machine with due dates and overdue warnings, and a work log of repairs, inspections and completed tasks
- Reports – Daily / weekly / monthly summary per plant or area: min / average / max, availability, time outside limits and the alarm load against ISA-18.2 benchmarks, with CSV export and print / PDF
- Interactive map – Sensor positions with dynamic markers & popups
- Threshold alerts – Visual warnings when values exceed limits
- CSV export – Download sensor history for offline analysis
- Multi-protocol support – MQTT, Modbus, OPC UA, Serial, REST
- Modular architecture – Easy to add new sensor types
- Dockerized – One-command deployment

Installation & Execution (Docker)
----------------------------------
The application is fully containerized using Docker and Docker Compose, allowing the entire stack (Frontend, Backend, Database) to run seamlessly without local dependencies.

### Prerequisites
- Docker Desktop installed on your system.
- Ports 8080, 5000, and 5432 must be free.

### Steps to Run

1. Clone the Repository:
   git clone https://github.com/Panmpourr/industrial-iot-sensor-platform.git
   cd industrial-iot-sensor-platform

2. Environment Configuration:
   In the root directory, create a .env file based on the provided .env.example:
   cp .env.example .env
   
   Fill in your database credentials (DB_USER, DB_PASSWORD, DB_NAME) in the .env file, plus a password for the backend's limited database account (DB_APP_PASSWORD; it can read and write data but cannot change the schema). For local frontend development, also create a .env in the Sensor-app/frontend folder with VITE_API_URL=http://localhost:5000 (Docker passes this value automatically).

3. Start the Containers:
   In the root directory (where docker-compose.yml is located), execute:
   docker compose up --build

   The "migrate" service brings the database schema up to date first (sql/migrate.sh applies
   the files in sql/migrations/ that have not run yet), then the backend starts. Upgrading to a
   newer version needs nothing else: pull, then run the same command.

4. Access the Platform:
   - Frontend Dashboard: http://localhost:8080
   - Backend API: http://localhost:5000
   - PostgreSQL / TimescaleDB: Port 5432 (User: appuser, Database: appdb)

5. Accounts and roles:
   Sensors belong to a site (a plant). Every user is a member of one site with a role:
   - Operator: views data and acknowledges alarms
   - Engineer: also adds, edits and deletes sensors, alarm limits, areas and equipment, and reads the audit log
   - Admin: also adds users, changes roles and resets passwords
   By default anyone can sign up, which creates a new, empty site with them as its admin (handy
   for a demo). For a real plant set REGISTRATION_ENABLED=false and ADMIN_USER / ADMIN_PASSWORD in
   .env: on an empty database that first admin is created automatically, and adds everyone else.
   Every change (limits, sensors, areas and equipment, users, acknowledgements) is recorded in the audit log.

6. Plant hierarchy:
   On the Plant page an engineer describes the plant as areas (halls, lines; they can contain
   other areas) and equipment (machines) inside them, then places each sensor on a piece of
   equipment or an area (in the sensor's settings, or with "+ Sensor" on an equipment page).
   Each area and machine shows the worst status and the unacknowledged alarms of everything in
   it. An area that still contains something cannot be deleted; deleting equipment keeps its
   sensors running, just unassigned. Database foreign keys keep every link inside one site.

7. Trends and reports:
   Trends compares up to 8 sensors over 1 hour to 1 year ("Compare trends" on a plant page adds
   all sensors of that area or machine). Sensors with the same unit share a chart; "% of range"
   draws all of them in one chart, scaled to each sensor's configured min–max. The link keeps
   the selection, so a view can be bookmarked or sent to a colleague.
   Reports summarize a day, week or month for the whole plant or one area. Next to each sensor's
   min / average / max they show its availability (hours with data), the time it spent outside
   its limits, and the alarm load compared with ISA-18.2 (about 6 alarms an hour is acceptable
   for one operator, more than 10 in 10 minutes is a flood), including the most frequent alarms.
   Export them as CSV, or print / save as PDF from the browser.

8. Alarm notifications (Telegram):
   Create a bot: in Telegram open @BotFather, send /newbot and follow the steps, then put the
   token in .env as TELEGRAM_BOT_TOKEN and restart (docker compose up -d). The backend talks to
   Telegram by long polling, so it needs no public address or open port.
   Each user connects their own chat on the Account page ("Connect Telegram" opens a one-time
   link; pressing Start in Telegram completes it). On the Notifications page an engineer sets the
   rules: who receives which alarms (critical only, or warnings too), from which area, and when.
   "At once" sends an alarm as soon as it is raised; a delay makes a rule an escalation that only
   sends alarms still active and unacknowledged after that time, e.g. the operator at once and
   the supervisor after 10 minutes. Every message has an Acknowledge button; acknowledging there
   or in the dashboard updates all messages about that alarm and stops the escalation. The page
   also lists what was sent and what failed (e.g. a recipient who has not connected Telegram).

9. Maintenance:
   Engineers plan recurring tasks for an area or a machine ("Replace air filter, every month").
   Anyone on the site can press "Done" (the next due date becomes that day plus the interval) or
   log other work: a repair, an inspection or a calibration, optionally linked to the alarm that
   caused it. The Maintenance page lists what is overdue or due this week for the whole plant or
   one area; each machine's page on the Plant page shows its own tasks and history, and the plant
   tree marks machines with overdue tasks. The work log is kept even when a machine is deleted.

Note: If you prefer to run without Docker, start PostgreSQL with the TimescaleDB extension (run the files in sql/migrations/ in order, then sql/app-user.sql, or run sql/migrate.sh with the PG* connection variables set), copy .env.example to .env (set a long random JWT_SECRET), then:
   - Backend: install the .NET 10 SDK and run `dotnet run --project Sensor-app/backend-dotnet/src/IIoT.Api`
   - Frontend (Node.js 22): `npm install` and `npm run dev` in Sensor-app/frontend/ (http://localhost:3000)
   - Frontend checks: `npm test` (Vitest) and `npm run build` (TypeScript typecheck + Vite production build)
   - Tests: `dotnet test Sensor-app/backend-dotnet`

Testing with the OPC-UA Simulator
---------------------------------
For experimental testing of the OPC-UA industrial protocol, a ready-to-use Python simulator is included.
The easiest way is to start it together with the platform as an optional Docker Compose profile:

   docker compose --profile simulator up -d

Then add a "PLC OPC-UA" sensor in the dashboard with endpoint URL opc.tcp://opcua-sim:4840 and one of the nodes:
   - Temperature: ns=2;i=2
   - Humidity: ns=2;i=3
   - Pressure: ns=2;i=4

The simulator generates randomized (but within-limits) values every second, which the backend reads via an OPC UA subscription and pushes live to the dashboard. (Without Docker: pip install opcua, then python Sensor-app/scripts/opcua_simulator.py.)

Screenshots
-----------
The dashboard follows ISA-101 "high-performance HMI" principles: neutral greys for normal operation and colour reserved for abnormal states, so alarms stand out at a glance.

| Plant overview | Sensor detail |
|---|---|
| ![Plant overview with KPIs, live sensor table and active alarms](Sensor-app/docs/screenshots/overview.png) | ![Sensor detail with trend, limit lines, gauge, configuration and map](Sensor-app/docs/screenshots/sensor-detail.png) |
| **Alarms** | **Add sensor** |
| ![Active alarm list sorted by severity](Sensor-app/docs/screenshots/alarms.png) | ![Three-step dialog for adding a sensor](Sensor-app/docs/screenshots/add-sensor.png) |

**30 days of history** – average line with a min–max band: a 40-minute overheating three days earlier is still visible as a spike and a critical marker, even though each point covers 2 hours.

![30-day history with min–max band and a critical marker](Sensor-app/docs/screenshots/history.png)

System Architecture & Tech Stack
--------------------------------
The platform follows a loosely coupled Client-Server architecture, ensuring high scalability, security, and independent maintainability of its subsystems.

### 1. Frontend Layer (React + TypeScript, built with Vite)
- UI Design: Dark, high-performance HMI style (ISA-101) built with Material-UI 5: sidebar navigation, live connection indicator, plant overview with KPIs, sensor detail pages, an alarm list and a step-by-step "Add sensor" dialog. Fully responsive (desktop to phone).
- Status semantics: every sensor is Normal, Warning, Critical or "No recent data", shown with colour + shape + text so it stays readable for colour-blind operators.
- State Management: Utilizes React Hooks (useState, useEffect, useCallback) and the Context API for global user authentication sessions.
- Data Visualization: Real-time and historical graphs using Chart.js (react-chartjs-2) and Recharts. Integration of custom interactive Gauge Charts with dynamic color changes based on user-defined thresholds.
- Geospatial Data: Dynamic rendering of physical sensor locations on interactive maps using Leaflet (React-Leaflet).

### 2. Backend Layer (C# / ASP.NET Core, .NET 10)
- API Server: Asynchronous RESTful API endpoints for user authentication, sensor registration, and data operations.
- Data Processing: Real-time threshold monitoring mechanisms, analytics, and automated data exporting capabilities.

### 3. Data Layer (PostgreSQL + TimescaleDB)
- A single, fully local PostgreSQL 16 database with the TimescaleDB extension.
- Relational tables for users and sensor configurations (foreign keys, cascade deletes, JSONB for protocol-specific settings).
- A TimescaleDB hypertable (sensor_data) for time-series measurements, enabling fast time-range queries, compression and retention policies.
- Historian-style long-term storage (sql/migrations/002-history.sql):
  - Continuous aggregates `sensor_data_1m` (1-minute) and `sensor_data_1h` (1-hour, built hierarchically from the 1-minute layer) keep min / max / sum / count and the worst status per bucket. They are real-time, so the newest data appears before the background refresh.
  - Raw chunks are compressed after 7 days; raw data is kept 90 days, 1-minute buckets 1 year, hourly buckets forever.
  - `GET /sensor-history/{userId}/{sensorId}?from=&to=` picks the bucket size for the range (10 s for 1 hour … 1 day for 1 year, ~500 points at most) and reads the coarsest table that can serve it, so any range answers in milliseconds. The trend offers Live / 1h / 24h / 7d / 30d / 1y.

Technologies Used (Detailed)
----------------------------
Frontend:
- React 18 + TypeScript (strict mode) – typed API models shared across components
- Vite – dev server and production build (lazy-loaded dashboard chunk)
- Vitest + Testing Library – unit and component tests
- Material-UI (MUI) – UI components & theming
- React Router 7 – SPA navigation
- Axios – HTTP requests
- Chart.js + Recharts – Data visualization (line/bar charts, gauges)
- React-Leaflet + Leaflet – Interactive maps & sensor geolocation

Backend:
- C# / ASP.NET Core (.NET 10) – RESTful API server with controllers and dependency injection
- Background sensor manager (IHostedService) – one connector per sensor, automatically restored after a restart
- PostgreSQL + TimescaleDB – Users, sensors and time-series sensor data
- ASP.NET Core Identity PasswordHasher (PBKDF2) – Password hashing
- JWT bearer authentication – every sensor endpoint is scoped to the logged-in user
- SignalR – live push of new sensor readings to subscribed dashboards (per-sensor groups, JWT-protected)
- Npgsql + Dapper – PostgreSQL / TimescaleDB access
- OPC Foundation .NET Standard stack, NModbus, MQTTnet, System.IO.Ports – industrial protocol clients
- xUnit – Unit tests
- .env file / environment variables – configuration and secrets

IoT & Communication Protocols:
- Serial (USB) – Arduino sensors (System.IO.Ports)
- Modbus TCP – PLCs (NModbus)
- OPC UA – Industrial systems (OPC Foundation .NET Standard)
- MQTT – The Things Network (LoRaWAN) integration (MQTTnet)
- REST APIs – External weather data (WeatherAPI.com)

DevOps & Deployment:
- Docker – Multi-container setup (frontend, backend, PostgreSQL/TimescaleDB)
- Docker Compose – Orchestration
  
Project Structure
-----------------
industrial-iot-sensor-platform/

├── docker-compose.yml         # Orchestration of the 3 main Containers

├── sql/

│   ├── migrate.sh             # Applies new migrations, then sets up the backend's DB account
│   ├── app-user.sql           # Least-privilege account used by the backend
│   └── migrations/            # Numbered schema changes (schema, history, sites/roles/audit, assets)

├── scripts/

│   └── opcua_simulator.py     # OPC-UA PLC Simulator in Python

└── Sensor-app/

    ├── backend-dotnet/        # C# / ASP.NET Core API Server, protocol connectors & tests
    
    └── frontend/              # React + TypeScript SPA (Vite), served by nginx
    
The Process (Development Workflow)
-----------------------------------
1. Requirements analysis – Defined functional/non-functional needs (real-time, multi-protocol, user auth, maps, CSV).
2. Architecture design – Client-server model with REST APIs, separation of concerns.
3. Frontend implementation – React SPA with components for login, dashboard, sensor registration, charts, and maps.
4. Backend implementation – C# / ASP.NET Core endpoints for auth, sensor management, data retrieval, and export (originally Node.js/Express, later ported to .NET).
5. Database setup – PostgreSQL + TimescaleDB for users, sensors and time-series readings.
6. Sensor handlers – Developed modular handlers for Serial, Modbus, OPC UA, MQTT (TTN), and external APIs.
7. Real-time integration – History is loaded via the REST API; new readings are pushed to the dashboard with SignalR (WebSockets) as soon as they are stored.
8. Dockerization – Created Dockerfiles and docker-compose.yml to run all services consistently.
9. Testing – Validated with actual Arduino, TTN, and simulated PLC/OPC UA data.
10. Documentation – Wrote thesis (PDF) and this README.

What I Learned
--------------
- Building a full-stack IoT platform from scratch using React, C# / .NET, and a relational/time-series database.
- Integrating industrial protocols (Modbus, OPC UA, MQTT) into a web application.
- Handling real-time data flows and visualizing them with Chart.js and Recharts.
- Implementing secure authentication (PBKDF2 password hashing, JWT, CORS).
- Using Docker to containerize and orchestrate frontend, backend, and database services.
- The power of AI assistance (ChatGPT) during development – debugging, code refactoring, and documentation writing.
- Managing geolocation with Leaflet.

How It Can Be Improved (Future Work)
-------------------------------------
- AI/ML integration – Predictive maintenance, anomaly detection on sensor streams.
- More industrial protocols – Profinet, BACnet, CAN bus.
- Role-based access control (RBAC) – Admin, operator, viewer roles.
- Enhanced dashboard – Customizable widgets, drag-and-drop layout.
- Edge computing – Run parts of the backend on Raspberry Pi or industrial gateways.

Security & Data Protection
--------------------------
- Password Hashing: PBKDF2 with a random salt per password (ASP.NET Core Identity PasswordHasher); legacy plain-text passwords are upgraded automatically on first login.
- Authentication: JWT bearer tokens (12 h lifetime); users can only access their own sensors and data.
- CORS Policies: Strict access restriction to backend API endpoints, allowing only whitelisted origins.
- Data Isolation: Sensors and their measurements are linked to their owner via foreign keys; data queries are scoped by user.
  
Author & Supervision
--------------------
Author: Panagiotis Bourmpoulas (AM: 2020/134)
Supervisor: Assistant Professor Dimitrios Bechtsis
Institution: International University of Greece – Department of Production and Management Engineering
Thesis title: Development of a REACT application for data flows in industry
Year: 2025

License
-------
All rights reserved. For non-commercial, educational or research use only, provided that the source is acknowledged. See the copyright notice in the full thesis (page 2).
