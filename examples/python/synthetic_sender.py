"""Send synthetic telemetry to Ascent-DTwin (no hardware needed)."""
import json, random, time, urllib.request

API = "http://localhost:8000"
TWIN = "esp32-demo"

def send(point):
    req = urllib.request.Request(
        f"{API}/api/twins/{TWIN}/telemetry",
        data=json.dumps(point).encode(),
        headers={"Content-Type": "application/json"},
    )
    print(urllib.request.urlopen(req).read().decode())

if __name__ == "__main__":
    import math
    t0 = time.time()
    while True:
        t = time.time() - t0
        send({
            "temperature": round(22 + 2*math.sin(t/20) + random.random()*1.5, 2),
            "humidity": round(48 + 5*math.sin(t/35) + random.random()*3, 2),
            "pressure": round(1013 + random.random()*2 - 1, 2),
            "co2": round(430 + 40*math.sin(t/50) + random.random()*20, 1),
        })
        time.sleep(2)
