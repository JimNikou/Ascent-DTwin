# Architecture

Ascent-DTwin is a **lightweight DTaaS-inspired** stack (cf. INTO-CPS DTaaS):

```
[ ESP32 / synthetic ] --MQTT:1883--> [ Mosquitto ] --subscribe--> [ ascent-api:8000 ] --write--> [ InfluxDB:8086 ]
        | HTTP POST /api/twins/{id}/telemetry --------^                                        |
        v                                                                                     v
[ ascent-ui (served by API :8000) ] <-- REST /api/twins, /telemetry --> [ JSON library/*.json ]
[ Grafana :3000 ] <-- Flux <-- [ InfluxDB ]   (provisioned datasource + dashboard)
[ Jupyter :8888 ] <-- REST <-- [ API ]        (workspace like DTaaS user workspaces)
```

## Why not full DTaaS?
Full DTaaS needs Traefik + GitLab + runners + Mongo/Postgres + ThingsBoard. For the
cybersecurity funding demo we keep the **bare minimum that still demonstrates the lifecycle**:
Build (CRUD library) → Use (live MQTT/HTTP ingest) → Share (Grafana + Jupyter).

## Components
| Service | Image | Port | Role |
|---|---|---|---|
| api+ui | built (FastAPI) | 8000 | Twin CRUD, MQTT ingest, Influx writer, UI |
| mosquitto | eclipse-mosquitto:2.0 | 1883, 9001 | ESP32 ingestion |
| influxdb | influxdb:2.7 | 8086 | Time-series store |
| grafana | grafana:10.4.0 | 3000 | Dashboards (provisioned) |
| jupyter | jupyter/base-notebook | 8888 | Analysis workspace |

## Data model
Twin = `{id, name, description, asset_type, location, mqtt_topic, fields[], status, created_at, updated_at}` stored as `library/<id>.json`.
Telemetry = `{temperature, humidity, pressure, co2, ...extra, time}` in InfluxDB measurement `telemetry` tagged by `twin_id`, mirrored in an in-memory ring buffer (fallback when Influx is down).

## Security notes (for funding proposal)
- Change all defaults via `.env` (Influx token, Grafana password, Jupyter token).
- Mosquitto currently `allow_anonymous` for lab convenience — enable auth/TLS before production (see `mosquitto/config/mosquitto.conf`).
- API has no auth in v0.1 — front with Traefik+OAuth (as in DTaaS) or add API keys next iteration.
- ESP32 should use TLS + per-device tokens in production; current sketch is plain MQTT for lab testing.
