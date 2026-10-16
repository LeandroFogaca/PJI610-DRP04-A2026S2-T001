#include <Arduino.h>
#include <ArduinoJson.h>
#include <AsyncMqttClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <time.h>

#include "config.h"

namespace {
constexpr uint8_t voltageInputPin = 34;
constexpr uint8_t averageSamples = 16;
constexpr unsigned long wifiRetryMs = 10000;

AsyncMqttClient mqtt;
Preferences preferences;
String pendingMessages[BUFFER_CAPACITY];
size_t queueHead = 0;
size_t queueSize = 0;
uint16_t inFlightPacket = 0;
unsigned long lastSampleAt = 0;
unsigned long lastWifiAttemptAt = 0;
unsigned long nextMessageNumber = 0;
unsigned long reservedSequenceThrough = 0;
bool wifiConnected = false;
bool wifiAttempted = false;

void reserveMessageIds() {
  if (nextMessageNumber < reservedSequenceThrough) return;
  reservedSequenceThrough = nextMessageNumber + 1024;
  preferences.putULong("sequence", reservedSequenceThrough);
}

String measurementTopic() {
  return String("telemetry/v1/") + DEVICE_ID + "/measurements";
}

String acquireTimestamp() {
  const time_t now = time(nullptr);
  if (now < 1700000000) return "";
  struct tm utc {};
  gmtime_r(&now, &utc);
  char buffer[25];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &utc);
  return String(buffer);
}

float readSimulatedVoltage() {
  uint32_t total = 0;
  for (uint8_t index = 0; index < averageSamples; ++index) {
    total += analogRead(voltageInputPin);
    delay(2);
  }
  const float averagedRaw = static_cast<float>(total) / averageSamples;
  return averagedRaw * SIMULATED_MAX_VOLTAGE / 4095.0F;
}

void enqueueMeasurement() {
  const String timestamp = acquireTimestamp();
  if (timestamp.isEmpty()) {
    Serial.println("Clock is not synchronized; skipping this sample rather than inventing a timestamp.");
    return;
  }

  const float voltage = readSimulatedVoltage();
  JsonDocument document;
  document["schema_version"] = "1.0";
  reserveMessageIds();
  document["message_id"] = String(DEVICE_ID) + "-" + String(++nextMessageNumber);
  document["device_id"] = DEVICE_ID;
  document["timestamp"] = timestamp;
  JsonObject metric = document["metrics"].add<JsonObject>();
  metric["name"] = "battery.voltage";
  metric["value"] = voltage;
  metric["unit"] = "V";
  metric["quality"] = "simulated";

  String payload;
  serializeJson(document, payload);
  if (queueSize == BUFFER_CAPACITY) {
    pendingMessages[queueHead] = "";
    queueHead = (queueHead + 1) % BUFFER_CAPACITY;
    --queueSize;
    Serial.println("Offline queue is full; discarded its oldest pending sample.");
  }
  const size_t tail = (queueHead + queueSize) % BUFFER_CAPACITY;
  pendingMessages[tail] = payload;
  ++queueSize;
  Serial.printf("Sample queued: %.2f V; pending=%u\n", voltage, static_cast<unsigned>(queueSize));
}

void publishNext() {
  if (!wifiConnected || !mqtt.connected() || queueSize == 0 || inFlightPacket != 0) return;
  const String& payload = pendingMessages[queueHead];
  inFlightPacket = mqtt.publish(measurementTopic().c_str(), 1, false, payload.c_str());
  if (inFlightPacket == 0) {
    Serial.println("MQTT publish could not be queued; retaining sample for retry.");
    return;
  }
  Serial.printf("Published pending sample with packet id %u\n", inFlightPacket);
}

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED || (wifiAttempted && millis() - lastWifiAttemptAt < wifiRetryMs)) return;
  wifiAttempted = true;
  lastWifiAttemptAt = millis();
  Serial.printf("Connecting to Wi-Fi SSID %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void configureMqtt() {
  mqtt.onConnect([](bool sessionPresent) {
    Serial.printf("MQTT connected; session present=%s\n", sessionPresent ? "true" : "false");
    publishNext();
  });
  mqtt.onDisconnect([](AsyncMqttClientDisconnectReason reason) {
    inFlightPacket = 0;
    Serial.printf("MQTT disconnected (reason %d); pending samples retained in RAM.\n", static_cast<int>(reason));
  });
  mqtt.onPublish([](uint16_t packetId) {
    if (packetId != inFlightPacket || queueSize == 0) return;
    pendingMessages[queueHead] = "";
    queueHead = (queueHead + 1) % BUFFER_CAPACITY;
    --queueSize;
    inFlightPacket = 0;
    Serial.printf("Broker acknowledged sample; pending=%u\n", static_cast<unsigned>(queueSize));
    publishNext();
  });
}
}  // namespace

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  preferences.begin("battery-v1", false);
  nextMessageNumber = preferences.getULong("sequence", 0);
  reservedSequenceThrough = nextMessageNumber;
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");

  WiFi.onEvent([](WiFiEvent_t event) {
    if (event == ARDUINO_EVENT_WIFI_STA_GOT_IP) {
      wifiConnected = true;
      Serial.printf("Wi-Fi connected; IP=%s\n", WiFi.localIP().toString().c_str());
      if (MQTT_HOST[0] != '\0') mqtt.connect();
      else Serial.println("Set MQTT_HOST in device/src/config.h to a reachable development broker.");
    } else if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
      wifiConnected = false;
      inFlightPacket = 0;
      Serial.println("Wi-Fi disconnected; acquisition continues and samples are buffered.");
    }
  });

  configureMqtt();
  if (MQTT_HOST[0] != '\0') mqtt.setServer(MQTT_HOST, MQTT_PORT);
  else Serial.println("MQTT_HOST is intentionally empty; configure it before publishing.");
  connectWifi();
}

void loop() {
  const unsigned long now = millis();
  if (now - lastSampleAt >= SAMPLE_INTERVAL_MS) {
    lastSampleAt = now;
    enqueueMeasurement();
    preferences.putULong("sequence", nextMessageNumber);
    publishNext();
  }
  if (WiFi.status() != WL_CONNECTED) connectWifi();
  delay(10);
}
