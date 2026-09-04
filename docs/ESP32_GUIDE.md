# ESP32 test guide (2 minutes)

1. Start the stack: `docker compose up --build`
2. Open http://localhost:8000 → select twin `esp32-demo`
3. Find your PC LAN IP (e.g. `ipconfig` / `ifconfig`), put it in `examples/esp32/esp32_telemetry.ino` as `MQTT_HOST`, set WiFi SSID/PASS.
4. Flash with Arduino IDE (ESP32 DevKit, install `PubSubClient` lib), open Serial Monitor @115200.
5. Watch the UI chart + KPIs update every 2s. Also check Grafana http://localhost:3000 (admin/ascent-admin) → Ascent-DTwin dashboard.
6. No hardware? Run `python examples/python/synthetic_sender.py` — same payload over HTTP.

## MQTT contract
- Topic: `ascent/<twin-id>/telemetry`
- Payload JSON: `{"temperature":23.4,"humidity":48.1,"pressure":1013.2,"co2":445}`
- Unknown `twin-id`s are auto-registered on first message (zero-touch onboarding).

## Troubleshooting
- ESP32 can't connect → firewall blocking 1883? Docker running? PC and ESP32 on same WiFi?
- No data in Grafana → wait ~10s, check InfluxDB datasource in Grafana → Explore → `from(bucket:"ascent-twins") |> range(start:-1h)`.
