const { contextBridge, ipcRenderer } = require('electron');

const WS_STATUS_EVENT_KEY = "beaverphone:ws-status";
const REMOTE_WS_STATUS_EVENT_KEY = "remote-ui:ws-status";
const REMOTE_WS_MESSAGE_EVENT_KEY = "remote-ui:ws-message";

contextBridge.exposeInMainWorld("electronAPI", {
  goHome: () => ipcRenderer.send("go-home"),
  getBatteryLevel: () => ipcRenderer.invoke("getBatteryLevel"),
});

console.log("✅ preload loaded");

let beaverphoneWs;
let remoteUiWs;
let remoteReconnectTimer;

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

function connectBeaverphoneWS() {
  console.log("[BeaverPhone] Ouverture connexion WS → ws://192.168.1.60:5001");
  emitWsStatus("connecting");

  try {
    beaverphoneWs = new WebSocket("ws://192.168.1.60:5001");

    beaverphoneWs.onopen = () => {
      console.log("[BeaverPhone] ✅ Connecté au WS local Termux");
      emitWsStatus("connected");
    };

    beaverphoneWs.onclose = () => {
      console.warn("[BeaverPhone] ⚠️ WS fermé, reconnexion dans 5s…");
      emitWsStatus("disconnected");
      setTimeout(connectBeaverphoneWS, 5000);
    };

    beaverphoneWs.onerror = (err) => {
      console.error("[BeaverPhone] ❌ Erreur WS:", err.message || err);
      emitWsStatus("disconnected", { error: err.message || String(err) });
    };

    beaverphoneWs.onmessage = (msg) => {
      console.log("[BeaverPhone] 📩 Reçu:", msg.data);
    };

  } catch (err) {
    console.error("[BeaverPhone] ❌ Exception lors de la connexion:", err);
    emitWsStatus("disconnected", { error: err.message || String(err) });
  }
}

function sendPayload(action, data = {}) {
  if (beaverphoneWs && beaverphoneWs.readyState === WebSocket.OPEN) {
    const payload = { type: action, ...data };
    beaverphoneWs.send(JSON.stringify(payload));
    console.log("[BeaverPhone] 📤 Envoyé:", payload);
  } else {
    console.warn("[BeaverPhone] ⚠️ Impossible d’envoyer, WS pas prêt");
  }
}

// Ping keep-alive toutes les 30 secondes
setInterval(() => {
  if (beaverphoneWs && beaverphoneWs.readyState === WebSocket.OPEN) {
    beaverphoneWs.send(JSON.stringify({ type: "ping" }));
    console.log("[BeaverPhone] 🔄 Ping envoyé");
  }
}, 30000);

function emitRemoteUiStatus(status, extra = {}) {
  emitCustomEvent(REMOTE_WS_STATUS_EVENT_KEY, { status, ...extra });
}

function connectRemoteUiWS() {
  const url = "ws://192.168.1.60:6001";
  console.log(`[Remote UI] Ouverture connexion WS → ${url}`);
  emitRemoteUiStatus("connecting", { url });

  const scheduleReconnect = () => {
    clearTimeout(remoteReconnectTimer);
    remoteReconnectTimer = setTimeout(connectRemoteUiWS, 5000);
  };

  try {
    remoteUiWs = new WebSocket(url);

    remoteUiWs.onopen = () => {
      clearTimeout(remoteReconnectTimer);
      console.log("[Remote UI] ✅ Connecté au WS graphique");
      emitRemoteUiStatus("connected", { url });
    };

    remoteUiWs.onmessage = (event) => {
      console.log("[Remote UI] 📩 Reçu:", event.data);
      emitCustomEvent(REMOTE_WS_MESSAGE_EVENT_KEY, {
        message: event.data,
      });
    };

    remoteUiWs.onclose = (event) => {
      console.warn("[Remote UI] ⚠️ Connexion fermée", {
        code: event.code,
        reason: event.reason,
      });
      emitRemoteUiStatus("disconnected", {
        code: event.code,
        reason: event.reason,
      });
      scheduleReconnect();
    };

    remoteUiWs.onerror = (err) => {
      console.error("[Remote UI] ❌ Erreur WS:", err.message || err);
      emitRemoteUiStatus("error", { error: err.message || String(err) });
      scheduleReconnect();
    };
  } catch (error) {
    console.error("[Remote UI] ❌ Exception lors de la connexion:", error);
    emitRemoteUiStatus("error", { error: error.message || String(error) });
    scheduleReconnect();
  }
}

connectBeaverphoneWS();
connectRemoteUiWS();

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

