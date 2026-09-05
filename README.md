# Ascent-DTwin

**Digital Twin Library & Intelligence Platform** — create, view, modify and delete
digital twins, stream live telemetry, and monitor each twin's health with real-time
anomaly detection.

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

- **Twin library** — create, view, edit, duplicate and delete digital twins (JSON-backed, `library/`), pre-seeded with **six demo twins** covering industrial, agricultural, IT and utility scenarios
- **Live telemetry** — ingest via MQTT (`ascent/<twin-id>/telemetry`) or HTTP (`POST /api/twins/{id}/telemetry`), stored in InfluxDB with an in-memory fallback
- **Twin health score** — 0-100 score per twin (data freshness + volume + anomaly rate) shown in the UI and exposed via the API
- **Anomaly detection** — real-time z-score flagging on every telemetry point (red markers on the live chart) plus an Isolation Forest notebook in Jupyter
- **Zero-touch onboarding** — unknown twin IDs auto-register on their first MQTT message
- **Grafana dashboards** — pre-provisioned live telemetry dashboard (InfluxDB Flux) with per-twin, per-field panels
- **JupyterLab workspace** — demo and anomaly-detection notebooks, in the style of DTaaS user workspaces
- **Synthetic data generator** — feeds every demo twin with realistic field values (per-twin intervals, occasional spikes so anomaly detection is visible) and backfills one hour of history on first run, so the UI and Grafana work without any hardware
- **Web UI** — professional platform interface (Kafka/ANSA-inspired: dark sidebar, dense tables, status pills) with four pages: Dashboard, Twin Library, Documentation and About
- **Platform dashboard** — live overview with twin/health/anomaly statistics, service health, a clickable twin status table and a real-time activity feed (twin CRUD, auto-registrations, synthetic injections, anomaly events)

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

Open <http://localhost:8000>. Six demo twins are pre-seeded and already streaming
synthetic telemetry (with one hour of history), so the library, live charts, KPIs and
health badges are populated immediately. The demo twins cover different scenarios:

| Twin | Scenario | Sensors |
|---|---|---|
| `esp32-demo` | ESP32 room sensor | temperature, humidity, pressure, co2 |
| `vibration-rig` | Industrial machine | vibration, rpm, temperature |
| `greenhouse-1` | Greenhouse climate | temperature, humidity, soil_moisture, light |
| `server-room` | Data center | temperature, humidity, power, cpu_load |
| `weather-station` | Campus rooftop | temperature, humidity, pressure, wind_speed, rainfall |
| `water-tank` | Reservoir (60 s interval) | level, flow, pressure |

The UI has four pages (top navigation):

- **Dashboard** — platform overview: twin/health/anomaly statistics, service health, quick links, a clickable twin status table and the recent activity feed
- **Twin Library** — the full-screen twin management view described below
- **Documentation** — architecture, MQTT/HTTP contract, API reference, configuration and troubleshooting
- **About** — project info, tech stack, version and links

- **New Twin** — create a digital twin (name, description, asset type, location, MQTT topic, fields)
- **Twin Library** — select a twin to view its live chart, KPIs and health badge
- **Health badge** — 0-100 score per twin (green = healthy, amber = degraded, red = critical), refreshed live
- **Anomaly markers** — red dots on the live chart flag readings that deviate from the twin's recent history (z-score > 3)
- **Edit / Duplicate / Delete** — manage twins from the library cards
- **Generate Synthetic Data** — inject a burst of synthetic points into the selected twin
- **Connect a Device** — ready-to-paste snippets for the selected twin (ESP32, Python, MQTT CLI, HTTP)
- **Status indicators** — API / MQTT / InfluxDB health in the top bar

### Grafana

Open <http://localhost:3000> and sign in with the Grafana credentials (default
`admin` / `ascent-admin`). The **Ascent-DTwin — Live Telemetry** dashboard is
pre-provisioned and reads telemetry from InfluxDB. A **Twin** dropdown lists every
twin with data, and a **Field** dropdown (default **All**) auto-generates one chart
per sensor field — see [Grafana & Jupyter in the platform](#grafana--jupyter-in-the-platform)
for details.

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
| `GET` | `/api/twins/{id}/telemetry` | Read telemetry points (each point has an `anomaly` flag) |
| `GET` | `/api/twins/{id}/health` | Twin health score (0-100) and breakdown |
| `POST` | `/api/twins/{id}/simulate` | Insert synthetic points |
| `GET` | `/api/activity` | Platform activity feed (twin CRUD, anomalies, simulations) |
| `GET` | `/api/health` | Service health status |

### Device live test (ESP32 example)

ESP32 is one example — any device that can publish JSON over MQTT or HTTP works
(Python, generic MQTT clients, curl, other microcontrollers). The web UI's
**Connect a Device** button shows ready-to-paste snippets for ESP32, Python, MQTT CLI
and HTTP.

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

## Grafana & Jupyter in the platform

Ascent-DTwin follows the DTaaS pattern of **ingest → store → visualize → analyze**.
Telemetry flows from devices (or the synthetic generator) through MQTT into the API,
which stores it in InfluxDB. Grafana and Jupyter then consume that data in two
complementary ways:

```
[ ESP32 / synthetic ] --MQTT--> [ Mosquitto ] --> [ ascent-api ] --> [ InfluxDB ]
                                                                        |
                                              +-------------------------+
                                              v                         v
                                        [ Grafana :3000 ]        [ Jupyter :8888 ]
                                        live dashboards          analysis notebooks
```

### Grafana — live monitoring

Grafana is the **visualization** layer. It reads telemetry directly from InfluxDB and
renders auto-refreshing dashboards suitable for lab screens or control rooms.

- Open <http://localhost:3000> (top-bar **Grafana** button) and sign in with the
  Grafana credentials (default `admin` / `ascent-admin`).
- The **Ascent-DTwin — Live Telemetry** dashboard is pre-provisioned on startup — no
  manual setup. It auto-generates **one panel per sensor field** of the selected twin:
  - A **Twin** dropdown at the top lists every twin that has sent data in the last
    7 days (queried from InfluxDB).
  - A **Field** dropdown lists the selected twin's actual sensor fields — whatever the
    user added or edited on the twin (e.g. `temperature`, `humidity`, or custom fields
    like `sens1`, `vibration`, `rpm`). It defaults to **All**, so every field gets its
    own chart automatically.
  - Pick a different twin and both dropdowns re-query — the panels rebuild for that
    twin's own sensors. No query editing, no dashboard duplication.
- Panels query InfluxDB through the `InfluxDB-Ascent` datasource, filtered by the
  `bucket`, `twin` and `field` template variables.
- Because the synthetic generator feeds `esp32-demo` every 2 seconds, the dashboard
  updates live — the same data shown in the web UI chart, as a full dashboard.

### JupyterLab — analysis

Jupyter is the **analysis** layer: a Python workspace (DTaaS-style) for querying the
API, plotting telemetry, running calculations or building models on twin data.

- Open <http://localhost:8888> (top-bar **Jupyter** button) and enter the Jupyter
  token (default `ascent`).
- The demo notebook `work/01-ascent-demo.ipynb` walks through the full workflow:
  1. **Connect** to the Ascent API (`http://ascent-api:8000` inside the Docker
     network, with automatic localhost fallback).
  2. **List twins** — pull the twin library from the API.
  3. **Pick a twin** — the notebook auto-selects `esp32-demo` if present, otherwise
     the first twin in the library (change `TWIN_ID` in one cell to analyze any twin).
  4. **Pull live telemetry** — fetch the last 100 points for the selected twin and plot
     temperature with matplotlib.
  5. **Push synthetic data** — post a JSON payload to the API, exactly like an ESP32
     would (same endpoint, same format).
- Run all cells to reproduce the demo end-to-end.
- **`work/02-anomaly-detection.ipynb`** goes further: it trains an **Isolation Forest**
  on the selected twin's recent telemetry, flags anomalies, plots them against the live
  data and prints the API health score — the machine-learning counterpart to the
  real-time z-score flagging in the web UI. It uses the same `TWIN_ID` selection.

### Grafana vs Jupyter

| | Grafana | Jupyter |
|---|---|---|
| Purpose | Live monitoring dashboards | Deep analysis / custom code |
| Audience | Operators, lab screens | Engineers, data scientists |
| Data source | InfluxDB (direct) | Ascent API (REST) |
| Interaction | Point & click | Python code |

Both are optional — the core tool (twin library, live chart, MQTT ingest) works
standalone. Together they form the full DTaaS-style platform:
**ingest → store → visualize → analyze**.

## Adding your own twin

Everything is multi-twin: a new twin appears in the web UI, Grafana and Jupyter
without any per-twin configuration.

1. **Create the twin** — either in the web UI (**New Twin**) or by simply sending its
   first MQTT message (zero-touch onboarding auto-registers unknown twin IDs).
2. **Send data** — flash the ESP32 sketch (topic `ascent/<twin-id>/telemetry`) or POST
   to `/api/twins/{id}/telemetry`. The API stores every point in InfluxDB and flags
   anomalies in real time.
3. **Web UI** — select the twin in the library: live chart, KPIs, health badge and
   anomaly markers work immediately.
4. **Grafana** — open the dashboard and pick the twin from the **Twin** dropdown
   (top-left). The dropdown lists every twin that has sent data in the last 7 days
   (queried from InfluxDB), so your new twin appears as soon as it has sent data and
   disappears automatically if it goes silent for a week. The **Field** dropdown shows
   the twin's actual sensors (whatever you added or edited), and one chart is
   auto-generated per field.
5. **Jupyter** — run either notebook; the `TWIN_ID` cell auto-selects the first twin
   (or `esp32-demo` if present). Change `TWIN_ID` to any twin id to analyze it.

No configuration files, no dashboard duplication, no query editing — the platform
discovers twins from the data itself.

## Twin health score

Every twin gets a **0-100 health score** that reflects how well it is streaming data.
It is computed live by the API, shown in the web UI (badge in the detail view, colored
tag on each library card) and exposed via the API.

| Component | Points | How it is measured |
|---|---|---|
| **Freshness** | 0-40 | Age of the last telemetry point: ≤10 s = 40, ≤60 s = 30, ≤5 min = 20, ≤30 min = 10, older = 0 |
| **Data volume** | 0-30 | Points received in the last 5 minutes: ≥50 = 30, ≥20 = 20, ≥5 = 10, fewer = 0 |
| **Anomaly rate** | 0-30 | Share of anomalous points in the last 100: 0% = 30, <5% = 20, <20% = 10, ≥20% = 0 |

**Status thresholds:**

| Score | Status | Color |
|---|---|---|
| 80-100 | healthy | green |
| 50-79 | degraded | amber |
| 0-49 | critical | red |

### How anomalies are detected

Each incoming telemetry point is checked against the twin's recent history. The API
keeps a rolling window of the **last 200 values per field** and computes a **z-score**
`(value − mean) / std`. A point is flagged as an anomaly when any field deviates more
than **3 standard deviations** from the mean (a twin needs at least 10 points per
field before detection kicks in). Flagged points carry an `anomaly: true` field in the
telemetry API response and appear as **red dots on the live chart**.

### How it is tracked

- The score is **computed on demand, not stored** — `GET /api/twins/{id}/health`
  returns the current score with its breakdown, and `GET /api/twins` includes it for
  every twin.
- The web UI refreshes the badge every 2 seconds alongside the live chart, so a twin
  that stops sending data visibly drops from healthy → degraded → critical within
  minutes.
- The rolling statistics live in memory and rebuild automatically from incoming data —
  no configuration, no database tables.
- The Jupyter notebook `02-anomaly-detection.ipynb` prints the same health score and
  compares the API's real-time z-score flags with an Isolation Forest model.

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
- Twin firmware-hash and tamper-evidence logging
- Grafana alerting to webhook
- Traefik reverse proxy with OAuth, as in DTaaS

*Done:* real-time anomaly detection (z-score) and the Isolation Forest notebook —
the foundation for the security-focused anomaly work above.

## License

MIT — see [LICENSE](LICENSE). Third-party licenses apply to their respective images
(Grafana, InfluxDB, Mosquitto, Jupyter, INTO-CPS DTaaS).