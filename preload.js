const log = require("electron-log");
const WebSocket = require("ws");

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
  ws = new WebSocket("ws://192.168.1.60:5001");

  ws.on("open", () => {
    logger.info("Connected to local Termux WS");
  });

  ws.on("close", () => {
    logger.warn("WS closed, reconnecting in 5s…");
    setTimeout(connectWS, 5000);
  });

  ws.on("error", (err) => {
    logger.error("WS error:", err.message);
  });

  ws.on("message", (msg) => {
    const text = msg.toString();
    try {
      const data = JSON.parse(text);
      logger.info("JSON response received", data);
    } catch (err) {
      logger.warn("Raw response received", text);
    }
  });
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

setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "ping" }));
    logger.info("Sent keep-alive ping");
  }
}, 30000);

connectWS();

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
