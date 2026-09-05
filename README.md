# Ascent-DTwin

Ascent-DTwin is an open-source digital twin library manager developed at the International
Hellenic University (IHU). It provides a complete, minimal digital-twin lifecycle —
**create, view, modify and delete** digital twins and stream **live telemetry** from
physical devices (e.g. ESP32) — in a single Docker Compose stack.

The tool is inspired by the [INTO-CPS DTaaS](https://github.com/INTO-CPS-Association/DTaaS)
platform and reuses the same core services (JupyterLab, Grafana, InfluxDB, MQTT) while
omitting the heavier DTaaS infrastructure (Traefik, GitLab, MongoDB, ThingsBoard) for a
fast, self-contained deployment. It is being prepared for use in an upcoming
cybersecurity funding project.

## Features

- **Twin library** — create, view, edit, duplicate and delete digital twins (JSON-backed, `library/`)
- **Live telemetry** — ingest via MQTT (`ascent/<twin-id>/telemetry`) or HTTP (`POST /api/twins/{id}/telemetry`), stored in InfluxDB with an in-memory fallback
- **Zero-touch onboarding** — unknown twin IDs auto-register on their first MQTT message
- **Grafana dashboards** — pre-provisioned live telemetry dashboard (InfluxDB Flux)
- **JupyterLab workspace** — demo notebook for analysis, in the style of DTaaS user workspaces
- **Synthetic data generator** — feeds the `esp32-demo` twin every 2 seconds, so the UI and Grafana work without any hardware
- **Web UI** — professional light-theme interface with live charts, KPIs and service health indicators

## Prerequisites

- **Docker Desktop** (Windows / macOS) or **Docker Engine + Docker Compose plugin** (Linux)
- A machine with at least 4 GB of RAM available for the containers
- Internet access on first run (image downloads)

Verify your installation:

```bash
docker --version
docker compose version
```

## Installation

### 1. Get the repository

```bash
git clone https://github.com/JimNikou/Ascent-DTwin.git
cd Ascent-DTwin
```

### 2. Configure environment variables (optional)

Copy the example environment file and adjust the credentials if you plan to expose the
tool beyond localhost:

```bash
cp .env.example .env
```

The defaults are suitable for local testing:

| Variable | Default | Purpose |
|---|---|---|
| `INFLUX_USER` | `admin` | InfluxDB admin username |
| `INFLUX_PASSWORD` | `ascent-admin-123` | InfluxDB admin password |
| `INFLUX_ORG` | `ihu` | InfluxDB organization |
| `INFLUX_BUCKET` | `ascent-twins` | InfluxDB bucket for telemetry |
| `INFLUX_TOKEN` | `ascent-super-secret-token` | InfluxDB API token |
| `GRAFANA_USER` | `admin` | Grafana admin username |
| `GRAFANA_PASSWORD` | `ascent-admin` | Grafana admin password |
| `JUPYTER_TOKEN` | `ascent` | JupyterLab access token |

> **Security note:** change all default credentials before any non-local deployment.

### 3. Start the stack

```bash
docker compose up --build
```

The first run downloads the service images and builds the API image; subsequent starts
are fast. Run with `-d` to start in the background:

```bash
docker compose up --build -d
```

### 4. Verify the services

```bash
docker compose ps
```

All five containers should report `Up`:

```
ascent-api        (FastAPI + web UI)      port 8000
ascent-mqtt       (Mosquitto MQTT broker) port 1883 / 9001
ascent-influxdb   (InfluxDB 2.7)          port 8086
ascent-grafana    (Grafana 10.4)          port 3000
ascent-jupyter    (JupyterLab)            port 8888
```

## Usage

### Web UI

Open <http://localhost:8000>. The `esp32-demo` twin is pre-seeded and already streaming
synthetic telemetry, so the live chart and KPIs update immediately.

- **New Twin** — create a digital twin (name, description, asset type, location, MQTT topic, fields)
- **Twin Library** — select a twin to view its live chart and KPIs
- **Edit / Duplicate / Delete** — manage twins from the library cards
- **Generate Synthetic Data** — inject a burst of synthetic points into the selected twin
- **ESP32 Firmware & Topic** — view a ready-to-paste Arduino snippet for the selected twin
- **Status indicators** — API / MQTT / InfluxDB health in the top bar

### Grafana

Open <http://localhost:3000> and sign in with the Grafana credentials (default
`admin` / `ascent-admin`). The **Ascent-DTwin — Live Telemetry** dashboard is
pre-provisioned and displays temperature, humidity, CO2 and pressure for `esp32-demo`
from InfluxDB.

### JupyterLab

Open <http://localhost:8888> and enter the Jupyter token (default `ascent`). Open
`work/01-ascent-demo.ipynb` and run all cells. The notebook lists the twin library,
plots live temperature and pushes synthetic telemetry — the same workflow provided by
DTaaS user workspaces.

### API

Interactive API documentation is available at <http://localhost:8000/docs>.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/twins` | List all twins |
| `POST` | `/api/twins` | Create a twin |
| `GET` | `/api/twins/{id}` | Get a twin |
| `PUT` | `/api/twins/{id}` | Update a twin |
| `DELETE` | `/api/twins/{id}` | Delete a twin |
| `POST` | `/api/twins/{id}/telemetry` | Ingest a telemetry point |
| `GET` | `/api/twins/{id}/telemetry` | Read telemetry points |
| `POST` | `/api/twins/{id}/simulate` | Insert synthetic points |
| `GET` | `/api/health` | Service health status |

### ESP32 live test

1. Start the stack and open the web UI.
2. Find your machine's LAN IP (`ipconfig` on Windows, `ifconfig` on Linux/macOS).
3. Edit `examples/esp32/esp32_telemetry.ino`:
   - `WIFI_SSID` / `WIFI_PASS` — your WiFi credentials
   - `MQTT_HOST` — your machine's LAN IP
4. Flash the sketch with the Arduino IDE (install the **PubSubClient** library) and open
   the Serial Monitor at 115200 baud.
5. The web UI chart and KPIs update every 2 seconds as the ESP32 publishes telemetry.

**MQTT contract**

- Topic: `ascent/<twin-id>/telemetry`
- Payload: `{"temperature":23.4,"humidity":48.1,"pressure":1013.2,"co2":445}`
- Unknown twin IDs are auto-registered on first message.

No hardware available? Run the Python sender, which posts the same payload over HTTP:

```bash
python examples/python/synthetic_sender.py
```

## Repository layout

```
docker-compose.yml          # api+ui, mosquitto, influxdb, grafana, jupyter
services/api/               # FastAPI: twin CRUD + MQTT ingest + InfluxDB + web UI
library/                    # twin JSON files (the library)
mosquitto/config/           # MQTT broker configuration
grafana/                    # provisioning + dashboard JSON
jupyter/notebooks/          # demo notebook
examples/esp32/             # Arduino sketch for the live test
examples/python/            # synthetic HTTP sender
docs/                       # ARCHITECTURE.md, ESP32_GUIDE.md
snapshots/                  # screenshots for the funding proposal
```

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the component diagram and data model.

```
[ ESP32 / synthetic ] --MQTT:1883--> [ Mosquitto ] --> [ ascent-api:8000 ] --> [ InfluxDB:8086 ]
        | HTTP POST /api/twins/{id}/telemetry -----------^                          |
        v                                                                           v
[ Web UI (served by API :8000) ] <-- REST --> [ JSON library/*.json ]   [ Grafana :3000 ]
[ Jupyter :8888 ] <-- REST --> [ API ]        (DTaaS-style workspace)
```

## Roadmap (cybersecurity)

- API authentication and per-device MQTT credentials with TLS
- Anomaly detection notebook (isolation forest on telemetry)
- Twin firmware-hash and tamper-evidence logging
- Grafana alerting to webhook
- Traefik reverse proxy with OAuth, as in DTaaS

## License

MIT — see [LICENSE](LICENSE). Third-party licenses apply to their respective images
(Grafana, InfluxDB, Mosquitto, Jupyter, INTO-CPS DTaaS).