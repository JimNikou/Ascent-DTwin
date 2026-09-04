/*
 * Ascent-DTwin — ESP32 telemetry example
 * Sends JSON telemetry to Ascent-DTwin via MQTT.
 * Topic: ascent/<twin-id>/telemetry  (default: ascent/esp32-demo/telemetry)
 * Also works via HTTP: POST http://<PC-IP>:8000/api/twins/esp32-demo/telemetry
 *
 * Board: ESP32 DevKit | Framework: Arduino
 * Libraries: WiFi (built-in), PubSubClient (by Nick O'Leary), ArduinoJson (optional)
 */
#include <WiFi.h>
#include <PubSubClient.h>

// ---- CONFIG ----
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
const char* MQTT_HOST = "192.168.1.50"; // <-- your PC IP running docker compose
const int   MQTT_PORT = 1883;
const char* TWIN_ID   = "esp32-demo";
const char* TOPIC     = "ascent/esp32-demo/telemetry";
// If you use DHT22: install "DHT sensor library" and wire to GPIO 15
// #define USE_DHT 1

WiFiClient espClient;
PubSubClient mqtt(espClient);
unsigned long lastSend = 0;

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n[Ascent-DTwin] ESP32 telemetry node");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println(String("\nWiFi OK: ") + WiFi.localIP().toString());
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
}

void reconnect() {
  while (!mqtt.connected()) {
    Serial.print("MQTT connecting...");
    String cid = String("esp32-") + TWIN_ID + "-" + String(random(0xffff), HEX);
    if (mqtt.connect(cid.c_str())) {
      Serial.println("connected");
    } else {
      Serial.print(" failed rc="); Serial.print(mqtt.state());
      Serial.println(" retry in 3s");
      delay(3000);
    }
  }
}

void loop() {
  if (!mqtt.connected()) reconnect();
  mqtt.loop();
  if (millis() - lastSend > 2000) {
    lastSend = millis();
    // Replace with real sensor reads:
    float temperature = 22.0 + (random(0, 300) / 100.0);
    float humidity    = 45.0 + (random(0, 1000) / 100.0);
    float pressure    = 1013.0 + (random(-200, 200) / 100.0);
    float co2         = 420 + random(0, 120);

    char payload[160];
    snprintf(payload, sizeof(payload),
      "{\"temperature\":%.2f,\"humidity\":%.2f,\"pressure\":%.2f,\"co2\":%.1f}",
      temperature, humidity, pressure, co2);

    mqtt.publish(TOPIC, payload);
    Serial.println(String(" -> ") + TOPIC + " " + payload);
  }
}
