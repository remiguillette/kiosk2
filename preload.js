const WebSocket = require("ws");

let ws;

function connectWS() {
  ws = new WebSocket("ws://192.168.1.60:5001");

  ws.on("open", () => {
    console.log("[BeaverPhone] Connecté au WS local Termux");
  });

  ws.on("close", () => {
    console.log("[BeaverPhone] WS fermé, reconnexion dans 5s...");
    setTimeout(connectWS, 5000);
  });

  ws.on("error", (err) => {
    console.error("[BeaverPhone] Erreur WS:", err.message);
  });

  ws.on("message", (msg) => {
    console.log("[BeaverPhone] Réponse:", msg.toString());
  });
}

connectWS();

window.addEventListener("DOMContentLoaded", () => {
  window.addEventListener("beaverphone:dialpad", (event) => {
    const dialpadEvent = event.detail;

    const payload = {
      type: "dial",
      number: dialpadEvent.number,
    };

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      console.log("[BeaverPhone] Envoyé:", payload);
    } else {
      console.warn("[BeaverPhone] WS non prêt");
    }
  });
});
