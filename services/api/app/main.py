"""
Ascent-DTwin API
Lightweight Digital Twin library manager inspired by INTO-CPS DTaaS.
- Twin CRUD backed by JSON files (library/)
- Live telemetry via MQTT + InfluxDB + in-memory fallback
- Synthetic data generator for demo / Grafana example
"""
import json
import os
import re
import threading
import time
import random
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# ---------------------------------------------------------------- config
LIBRARY_PATH = Path(os.getenv("LIBRARY_PATH", "/data/library"))
LIBRARY_PATH.mkdir(parents=True, exist_ok=True)

MQTT_HOST = os.getenv("MQTT_HOST", "mosquitto")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))

INFLUX_URL = os.getenv("INFLUX_URL", "http://influxdb:8086")
INFLUX_TOKEN = os.getenv("INFLUX_TOKEN", "ascent-super-secret-token")
INFLUX_ORG = os.getenv("INFLUX_ORG", "ihu")
INFLUX_BUCKET = os.getenv("INFLUX_BUCKET", "ascent-twins")
SYNTHETIC_ENABLED = os.getenv("SYNTHETIC_ENABLED", "true").lower() == "true"

STATIC_DIR = Path(__file__).parent / "static"

# ---------------------------------------------------------------- models
class TwinCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    description: str = Field(default="", max_length=500)
    asset_type: str = Field(default="esp32.sensor")
    location: str = Field(default="IHU Lab")
    mqtt_topic: Optional[str] = None
    fields: List[str] = Field(default_factory=lambda: ["temperature", "humidity"])

class TwinUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    asset_type: Optional[str] = None
    location: Optional[str] = None
    mqtt_topic: Optional[str] = None
    fields: Optional[List[str]] = None

class TelemetryIn(BaseModel):
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    pressure: Optional[float] = None
    co2: Optional[float] = None
    extra: Optional[Dict[str, Any]] = None

# ---------------------------------------------------------------- store
def slugify(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9_-]+", "-", name.strip().lower()).strip("-")
    return s or f"twin-{int(time.time())}"

def twin_file(twin_id: str) -> Path:
    return LIBRARY_PATH / f"{twin_id}.json"

def load_twin(twin_id: str) -> Dict[str, Any]:
    p = twin_file(twin_id)
    if not p.exists():
        raise HTTPException(404, f"Twin '{twin_id}' not found")
    return json.loads(p.read_text())

def save_twin(data: Dict[str, Any]):
    twin_file(data["id"]).write_text(json.dumps(data, indent=2))

def list_twins() -> List[Dict[str, Any]]:
    out = []
    for p in sorted(LIBRARY_PATH.glob("*.json")):
        try:
            out.append(json.loads(p.read_text()))
        except Exception:
            continue
    return sorted(out, key=lambda t: t.get("updated_at", ""), reverse=True)

def ensure_seed():
    if list_twins():
        return
    now = datetime.now(timezone.utc).isoformat()
    seed = {
        "id": "esp32-demo",
        "name": "ESP32 Demo Room",
        "description": "Synthetic + ESP32-ready demo twin. Flash the ESP32 example to push live data.",
        "asset_type": "esp32.sensor",
        "location": "IHU Lab",
        "mqtt_topic": "ascent/esp32-demo/telemetry",
        "fields": ["temperature", "humidity", "pressure", "co2"],
        "status": "active",
        "created_at": now,
        "updated_at": now,
    }
    save_twin(seed)
    seed2 = dict(seed)
    seed2.update({
        "id": "hvac-01",
        "name": "HVAC Unit 01",
        "description": "Building HVAC digital twin template.",
        "asset_type": "hvac.unit",
        "mqtt_topic": "ascent/hvac-01/telemetry",
    })
    save_twin(seed2)

ensure_seed()

# in-memory telemetry ring buffer: twin_id -> deque
telemetry_mem: Dict[str, deque] = defaultdict(lambda: deque(maxlen=500))

def push_memory(twin_id: str, point: Dict[str, Any]):
    point = dict(point)
    point.setdefault("time", datetime.now(timezone.utc).isoformat())
    telemetry_mem[twin_id].append(point)
    return point

# ---------------------------------------------------------------- influx
_influx_write = None
_influx_query = None

def init_influx():
    global _influx_write, _influx_query
    try:
        from influxdb_client import InfluxDBClient, Point
        from influxdb_client.client.write_api import SYNCHRONOUS
        client = InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG)
        _influx_write = client.write_api(write_options=SYNCHRONOUS)
        _influx_query = client.query_api()
        globals()["_Point"] = Point
        print(f"[ascent] InfluxDB connected at {INFLUX_URL}", flush=True)
    except Exception as e:
        print(f"[ascent] InfluxDB unavailable ({e}), using in-memory store", flush=True)
        _influx_write = None

init_influx()

def write_influx(twin_id: str, point: Dict[str, Any]):
    if _influx_write is None:
        return
    try:
        Point = globals().get("_Point")
        p = Point("telemetry").tag("twin_id", twin_id)
        for k, v in point.items():
            if k == "time":
                continue
            if isinstance(v, (int, float)):
                p = p.field(k, float(v))
            elif v is not None:
                p = p.field(k, str(v))
        _influx_write.write(bucket=INFLUX_BUCKET, org=INFLUX_ORG, record=p)
    except Exception as e:
        print(f"[ascent] influx write failed: {e}", flush=True)

def query_influx(twin_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    if _influx_query is None:
        return []
    try:
        flux = (
            f'from(bucket: "{INFLUX_BUCKET}") |> range(start: -6h) '
            f'|> filter(fn: (r) => r["_measurement"] == "telemetry" and r["twin_id"] == "{twin_id}") '
            f'|> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value") '
            f'|> sort(columns: ["_time"], desc: true) |> limit(n: {limit})'
        )
        tables = _influx_query.query(flux, org=INFLUX_ORG)
        out = []
        for table in tables:
            for rec in table.records:
                d = {"time": rec["_time"].isoformat() if rec["_time"] else ""}
                for k, v in rec.values.items():
                    if not k.startswith("_") and k not in ("result", "table", "twin_id"):
                        d[k] = v
                out.append(d)
        return sorted(out, key=lambda x: x.get("time", ""))[-limit:]
    except Exception as e:
        print(f"[ascent] influx query failed: {e}", flush=True)
        return []

# ---------------------------------------------------------------- mqtt ingest
def ingest(twin_id: str, payload: Dict[str, Any]):
    try:
        twin = load_twin(twin_id)
    except HTTPException:
        # auto-register unknown ESP32 twins (zero-touch onboarding)
        now = datetime.now(timezone.utc).isoformat()
        twin = {
            "id": twin_id, "name": twin_id, "description": "Auto-registered via MQTT",
            "asset_type": "esp32.sensor", "location": "unknown",
            "mqtt_topic": f"ascent/{twin_id}/telemetry",
            "fields": sorted([k for k in payload.keys() if k != "time"]),
            "status": "active", "created_at": now, "updated_at": now,
        }
        save_twin(twin)
    point = push_memory(twin_id, payload)
    write_influx(twin_id, point)

def mqtt_loop():
    try:
        import paho.mqtt.client as mqtt
    except Exception as e:
        print(f"[ascent] mqtt lib missing: {e}", flush=True)
        return
    def on_connect(c, u, f, rc, props=None):
        print(f"[ascent] MQTT connected rc={rc}", flush=True)
        c.subscribe("ascent/+/telemetry")
    def on_message(c, u, msg):
        try:
            parts = msg.topic.split("/")
            twin_id = parts[1] if len(parts) >= 3 else "esp32-demo"
            payload = json.loads(msg.payload.decode())
            if isinstance(payload, dict):
                ingest(twin_id, payload)
        except Exception as e:
            print(f"[ascent] mqtt msg error: {e}", flush=True)
    while True:
        try:
            c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
            c.on_connect = on_connect
            c.on_message = on_message
            c.connect(MQTT_HOST, MQTT_PORT, 60)
            c.loop_forever()
        except Exception as e:
            print(f"[ascent] MQTT unavailable ({e}), retry in 5s", flush=True)
            time.sleep(5)

threading.Thread(target=mqtt_loop, daemon=True).start()

# ---------------------------------------------------------------- synthetic data (Grafana demo)
def synthetic_loop():
    random.seed()
    while True:
        try:
            if SYNTHETIC_ENABLED:
                t = time.time()
                for twin_id in ["esp32-demo"]:
                    try:
                        load_twin(twin_id)
                    except HTTPException:
                        continue
                    point = {
                        "temperature": round(22 + 3 * random.random() + 0.5 * __import__("math").sin(t / 30), 2),
                        "humidity": round(45 + 10 * random.random(), 2),
                        "pressure": round(1013 + 4 * random.random() - 2, 2),
                        "co2": round(420 + 80 * random.random(), 1),
                        "time": datetime.now(timezone.utc).isoformat(),
                    }
                    ingest(twin_id, point)
        except Exception as e:
            print(f"[ascent] synthetic error: {e}", flush=True)
        time.sleep(2)

threading.Thread(target=synthetic_loop, daemon=True).start()

# ---------------------------------------------------------------- app
app = FastAPI(title="Ascent-DTwin API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

@app.get("/api/health")
def health():
    import socket
    def check(host, port):
        try:
            s = socket.create_connection((host, port), timeout=1.5)
            s.close()
            return "up"
        except Exception:
            return "down"
    return {
        "api": "up",
        "mqtt": check(MQTT_HOST, MQTT_PORT),
        "influxdb": "up" if _influx_write else "down (memory fallback)",
        "twins": len(list_twins()),
        "time": datetime.now(timezone.utc).isoformat(),
        "dtaas_inspired_by": "INTO-CPS DTaaS (Jupyter + Grafana + MQTT + InfluxDB)",
    }

@app.get("/api/twins")
def get_twins():
    return list_twins()

@app.post("/api/twins", status_code=201)
def create_twin(body: TwinCreate):
    twin_id = slugify(body.name)
    if twin_file(twin_id).exists():
        twin_id = f"{twin_id}-{int(time.time()) % 10000}"
    now = datetime.now(timezone.utc).isoformat()
    data = {
        "id": twin_id,
        "name": body.name,
        "description": body.description,
        "asset_type": body.asset_type,
        "location": body.location,
        "mqtt_topic": body.mqtt_topic or f"ascent/{twin_id}/telemetry",
        "fields": body.fields,
        "status": "active",
        "created_at": now,
        "updated_at": now,
    }
    save_twin(data)
    return data

@app.get("/api/twins/{twin_id}")
def get_twin(twin_id: str):
    return load_twin(twin_id)

@app.put("/api/twins/{twin_id}")
def update_twin(twin_id: str, body: TwinUpdate):
    data = load_twin(twin_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            data[k] = v
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    save_twin(data)
    return data

@app.delete("/api/twins/{twin_id}")
def delete_twin(twin_id: str):
    p = twin_file(twin_id)
    if not p.exists():
        raise HTTPException(404, "not found")
    p.unlink()
    telemetry_mem.pop(twin_id, None)
    return {"deleted": twin_id}

@app.post("/api/twins/{twin_id}/telemetry", status_code=201)
def post_telemetry(twin_id: str, body: TelemetryIn):
    load_twin(twin_id)  # 404 if missing
    payload = {k: v for k, v in body.model_dump().items() if v is not None}
    if body.extra:
        payload.update(body.extra)
    if not payload:
        raise HTTPException(400, "empty telemetry payload")
    point = push_memory(twin_id, payload)
    write_influx(twin_id, point)
    return point

@app.get("/api/twins/{twin_id}/telemetry")
def get_telemetry(twin_id: str, limit: int = 100):
    load_twin(twin_id)
    influx_pts = query_influx(twin_id, limit)
    if influx_pts:
        return influx_pts[-limit:]
    mem = list(telemetry_mem.get(twin_id, []))
    return mem[-limit:]

@app.post("/api/twins/{twin_id}/simulate")
def simulate(twin_id: str, n: int = 20):
    load_twin(twin_id)
    pts = []
    for _ in range(min(n, 100)):
        pt = {
            "temperature": round(20 + 6 * random.random(), 2),
            "humidity": round(40 + 15 * random.random(), 2),
            "pressure": round(1010 + 6 * random.random(), 2),
            "co2": round(400 + 120 * random.random(), 1),
        }
        pts.append(push_memory(twin_id, pt))
        write_influx(twin_id, pt)
    return {"inserted": len(pts)}

# ---- serve UI
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

@app.get("/", include_in_schema=False)
def index():
    idx = STATIC_DIR / "index.html"
    if idx.exists():
        return FileResponse(str(idx))
    return {"name": "Ascent-DTwin", "docs": "/docs"}
