const WebSocket = require("ws");

let ws;

function connectWS() {
  ws = new WebSocket("ws://192.168.1.60:5001");

  ws.on("open", () => {
    console.log("[BeaverPhone] Connected to local Termux WS");
  });

  ws.on("close", () => {
    console.log("[BeaverPhone] WS closed, reconnecting in 5s…");
    setTimeout(connectWS, 5000);
  });

  ws.on("error", (err) => {
    console.error("[BeaverPhone] WS error:", err.message);
  });

  ws.on("message", (msg) => {
    const text = msg.toString();
    try {
      const data = JSON.parse(text);
      console.log("[BeaverPhone] JSON Response:", data);
    } catch (err) {
      console.log("[BeaverPhone] Raw Response:", text);
    }
  });
}

function sendPayload(action, data = {}) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    const payload = { type: action, ...data };
    ws.send(JSON.stringify(payload));
    console.log("[BeaverPhone] Sent:", payload);
  } else {
    console.warn("[BeaverPhone] WS not ready for:", action);
  }
}

setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "ping" }));
    console.log("[BeaverPhone] Sent keep-alive ping");
  }
}, 30000);

connectWS();

window.addEventListener("DOMContentLoaded", () => {
  window.addEventListener("beaverphone:dialpad", (event) => {
    const { action, number } = event.detail;

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
        console.warn("[BeaverPhone] Unknown action:", action);
    }
  });
});
