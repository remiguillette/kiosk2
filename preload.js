try {
console.log("✅ preload loaded")
const log = require("electron-log");

// Logger combiné terminal + fichier electron-log
const logger = {
  info: (...args) => {
    log.info("[BeaverPhone]", ...args);
    console.log("[BeaverPhone]", ...args);
  },
  warn: (...args) => {
    log.warn("[BeaverPhone]", ...args);
    console.warn("[BeaverPhone]", ...args);
  },
  error: (...args) => {
    log.error("[BeaverPhone]", ...args);
    console.error("[BeaverPhone]", ...args);
  }
};

let ws;

function connectWS() {
  logger.info("Opening WebSocket connection to Termux gateway");

  // Utilise l’API WebSocket native
  ws = new WebSocket("ws://192.168.1.60:5001");

  ws.onopen = () => {
    logger.info("Connected to local Termux WS");
  };

  ws.onclose = () => {
    logger.warn("WS closed, reconnecting in 5s…");
    setTimeout(connectWS, 5000);
  };

  ws.onerror = (err) => {
    logger.error("WS error:", err.message);
  };

  ws.onmessage = (msg) => {
    const text = msg.data;
    try {
      const data = JSON.parse(text);
      logger.info("JSON response received", data);
    } catch (err) {
      logger.warn("Raw response received", text);
    }
  };
}

function sendPayload(action, data = {}) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    const payload = { type: action, ...data };
    ws.send(JSON.stringify(payload));
    logger.info("Sent payload", payload);
  } else {
    logger.warn("WS not ready for action", action);
  }
}

// Keep-alive ping toutes les 30s
setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "ping" }));
    logger.info("Sent keep-alive ping");
  }
}, 30000);

connectWS();

// Gérer les événements du dialpad
window.addEventListener("DOMContentLoaded", () => {
  window.addEventListener("beaverphone:dialpad", (event) => {
    const { action, number } = event.detail;

    logger.info("Dialpad event received", { action, number });

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
        logger.warn("Unknown dialpad action", action);
    }
  });
});
  } catch (err) {
  console.error("❌ preload.js crashed:", err);
}
