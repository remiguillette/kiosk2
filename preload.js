const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  goHome: () => ipcRenderer.send('go-home'),
});

console.log("✅ preload loaded");

const WS_STATUS_EVENT_KEY = "beaverphone:ws-status";

let ws;

const emitWsStatus = (status, extra = {}) => {
  window.dispatchEvent(
    new CustomEvent(WS_STATUS_EVENT_KEY, {
      detail: { status, ...extra },
    })
  );
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

