const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');

const WS_STATUS_EVENT_KEY = "beaverphone:ws-status";
const POWER_STATUS_EVENT_KEY = "beaver:power-status";
const BATTERY_BASE_PATH = "/sys/class/power_supply/battery";
const BATTERY_POLL_INTERVAL = 10000;

const subscribeToRendererEvent = (eventKey, callback) => {
  if (typeof callback !== "function") {
    return () => {};
  }

  const handler = (event) => callback(event.detail);
  window.addEventListener(eventKey, handler);
  return () => window.removeEventListener(eventKey, handler);
};

contextBridge.exposeInMainWorld("electronAPI", {
  goHome: () => ipcRenderer.send("go-home"),
  onPowerStatus: (callback) => subscribeToRendererEvent(POWER_STATUS_EVENT_KEY, callback),
});

console.log("✅ preload loaded");

let ws;

const emitCustomEvent = (key, detail) => {
  window.dispatchEvent(
    new CustomEvent(key, {
      detail,
    })
  );
};

const emitWsStatus = (status, extra = {}) => {
  emitCustomEvent(WS_STATUS_EVENT_KEY, { status, ...extra });
};

const emitPowerStatus = (payload) => {
  emitCustomEvent(POWER_STATUS_EVENT_KEY, payload);
};

function connectWS() {
  console.log("[BeaverPhone] Ouverture connexion WS → ws://192.168.1.60:5001");
  emitWsStatus("connecting");

  try {
    ws = new WebSocket("ws://192.168.1.60:5001");

    ws.onopen = () => {
      console.log("[BeaverPhone] ✅ Connecté au WS local Termux");
      emitWsStatus("connected");
    };

    ws.onclose = () => {
      console.warn("[BeaverPhone] ⚠️ WS fermé, reconnexion dans 5s…");
      emitWsStatus("disconnected");
      setTimeout(connectWS, 5000);
    };

    ws.onerror = (err) => {
      console.error("[BeaverPhone] ❌ Erreur WS:", err.message || err);
      emitWsStatus("disconnected", { error: err.message || String(err) });
    };

    ws.onmessage = (msg) => {
      console.log("[BeaverPhone] 📩 Reçu:", msg.data);
    };

  } catch (err) {
    console.error("[BeaverPhone] ❌ Exception lors de la connexion:", err);
    emitWsStatus("disconnected", { error: err.message || String(err) });
  }
}

function sendPayload(action, data = {}) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    const payload = { type: action, ...data };
    ws.send(JSON.stringify(payload));
    console.log("[BeaverPhone] 📤 Envoyé:", payload);
  } else {
    console.warn("[BeaverPhone] ⚠️ Impossible d’envoyer, WS pas prêt");
  }
}

// Ping keep-alive toutes les 30 secondes
setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "ping" }));
    console.log("[BeaverPhone] 🔄 Ping envoyé");
  }
}, 30000);

connectWS();

let lastBatteryError;

function readBatteryInfo() {
  try {
    const capacityRaw = fs.readFileSync(`${BATTERY_BASE_PATH}/capacity`, "utf8").trim();
    const status = fs.readFileSync(`${BATTERY_BASE_PATH}/status`, "utf8").trim();
    const capacity = Number(capacityRaw);

    if (Number.isNaN(capacity)) {
      throw new Error(`Invalid capacity value: ${capacityRaw}`);
    }

    return { capacity, status };
  } catch (error) {
    return { error: error.message };
  }
}

function publishBatteryInfo() {
  const info = readBatteryInfo();
  const timestamp = Date.now();

  if (info.error) {
    if (lastBatteryError !== info.error) {
      console.warn("[BeaverOS] ⚠️ Impossible de lire l'état de la batterie:", info.error);
      lastBatteryError = info.error;
    }

    emitPowerStatus({ error: info.error, timestamp });
    return;
  }

  if (lastBatteryError) {
    console.info("[BeaverOS] ✅ Lecture de la batterie restaurée");
  }

  lastBatteryError = null;
  emitPowerStatus({ ...info, timestamp });
}

publishBatteryInfo();
setInterval(publishBatteryInfo, BATTERY_POLL_INTERVAL);

// Capture des événements du dialpad
window.addEventListener("DOMContentLoaded", () => {
  window.addEventListener("beaverphone:dialpad", (event) => {
    const { action, number } = event.detail || {};

    console.log("[BeaverPhone] 🎛️ Événement dialpad reçu:", { action, number });

    switch (action) {
      case "dial":
        sendPayload("dial", { number });
        break;
      case "hangup":
        sendPayload("hangup");
        break;
      case "dtmf":
        sendPayload("dtmf", { digit: number });
        break;
      case "clear":
        sendPayload("clear");
        break;
      default:
        console.warn("[BeaverPhone] ❓ Action inconnue:", action);
    }
  });
});

