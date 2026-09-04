# Ascent-DTwin — IHU Digital Twin Library Tool

Open-source digital-twin library manager for the International Hellenic University (IHU),
inspired by the [INTO-CPS DTaaS](https://github.com/INTO-CPS-Association/DTaaS) platform.
Bare-minimum DTaaS core in one `docker compose up`: **twin library (CRUD) + live telemetry +
Jupyter workspace + Grafana dashboards**.

Built for an upcoming **cybersecurity funding project**: view / create / modify / delete
digital twins and stream live sensor data (ESP32 → MQTT → InfluxDB → UI/Grafana).

![stack](https://img.shields.io/badge/stack-FastAPI%20%E2%80%A2%20MQTT%20%E2%80%A2%20InfluxDB%20%E2%80%A2%20Grafana%20%E2%80%A2%20Jupyter-blue)
![license](https://img.shields.io/badge/license-MIT-green)

## ✨ Features (v0.1)
- 📚 **Twin library**: create / view / edit / duplicate / delete twins (JSON-backed, `library/`)
- 📡 **Live data**: MQTT `ascent/<twin-id>/telemetry` + HTTP `POST /api/twins/{id}/telemetry`, 2s live charts + KPIs
- 🤖 **Zero-touch ESP32 onboarding**: unknown twin-ids auto-register on first MQTT message
- 📊 **Grafana** pre-provisioned dashboard (InfluxDB Flux) + **JupyterLab** demo notebook
- 🧪 **Synthetic generator** built-in (feeds `esp32-demo` every 2s, so Grafana works with no hardware)
- 🩺 Health badges (API/MQTT/InfluxDB) + ESP32 snippet modal + API docs at `/docs`

## 🚀 Quickstart

```bash
# 1. prerequisites: Docker + Docker Compose
# 2. configure (optional)
cp .env.example .env   # change tokens/passwords!

# 3. run everything (api+ui, mqtt, influxdb, grafana, jupyter)
docker compose up --build

# 4. open
# UI:      http://localhost:8000
# Grafana: http://localhost:3000  (admin / ascent-admin)
# Jupyter: http://localhost:8888  (token: ascent)
# API docs: http://localhost:8000/docs
```

First boot creates `esp32-demo` + `hvac-01` twins and starts synthetic telemetry —
open the UI and Grafana immediately, no hardware needed.

## 📡 ESP32 live test
See [`docs/ESP32_GUIDE.md`](docs/ESP32_GUIDE.md) + [`examples/esp32/esp32_telemetry.ino`](examples/esp32/esp32_telemetry.ino).

```cpp
const char* MQTT_HOST = "192.168.1.50"; // your PC IP
const char* TOPIC = "ascent/esp32-demo/telemetry";
// payload: {"temperature":23.4,"humidity":48.1,"pressure":1013.2,"co2":445}
```
No board? `python examples/python/synthetic_sender.py` sends the same payload over HTTP.

## 📊 Grafana example (synthetic data)
Grafana is auto-provisioned:
- Datasource `InfluxDB-Ascent` (Flux, bucket `ascent-twins`)
- Dashboard **Ascent-DTwin — Live Telemetry** (`grafana/dashboards/ascent-twin.json`)

Flux example used:
```flux
from(bucket: "ascent-twins")
  |> range(start: -1h)
  |> filter(fn: (r) => r["_measurement"] == "telemetry" and r["twin_id"] == "esp32-demo")
```

## 📓 Jupyter example
Open `jupyter/notebooks/01-ascent-demo.ipynb` in JupyterLab — lists twins via REST,
plots live temperature, pushes synthetic telemetry. Same workflow as DTaaS user workspaces.

## 🗂️ Repo layout
```
docker-compose.yml          # api+ui, mosquitto, influxdb, grafana, jupyter
services/api/               # FastAPI: CRUD + MQTT ingest + InfluxDB + static UI
library/                    # twin JSON files (the "library")
mosquitto/config/           # MQTT broker config
grafana/                    # provisioning + dashboard JSON
jupyter/notebooks/          # demo notebook
examples/esp32/             # Arduino sketch for live test
examples/python/            # synthetic HTTP sender
docs/                       # ARCHITECTURE.md, ESP32_GUIDE.md
snapshots/                  # screenshots for proposal
```

## 📸 Snapshots
Add screenshots to `snapshots/` (see its README). Suggested:
`01-library.png`, `02-grafana.png`, `03-jupyter.png`, `04-esp32.png`.

## 🔗 Relation to DTaaS
This tool implements the **minimal viable DTaaS loop** (Build/Use/Share) using the same
third-party services DTaaS relies on: JupyterLab, Grafana, InfluxDB, MQTT (DTaaS also uses
RabbitMQ/ThingsBoard/Mongo/Postgres/Traefik/GitLab — intentionally omitted here for speed;
see `docs/ARCHITECTURE.md`). Upstream: https://github.com/INTO-CPS-Association/DTaaS.
Third-party licences apply to their images.

## 🛣️ Roadmap (cybersecurity angle)
- [ ] API auth + per-device MQTT credentials, TLS
- [ ] Anomaly detection notebook (isolation forest on telemetry)
- [ ] Twin firmware-hash + tamper-evidence log
- [ ] Grafana alerting → webhook
- [ ] Traefik + OAuth like DTaaS

## 📄 License
MIT — see [LICENSE](LICENSE).
