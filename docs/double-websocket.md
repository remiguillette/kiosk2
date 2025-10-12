# Remote Control Channels

The kiosk now relies on two complementary communication layers:

1. A **WebSocket client** embedded in the renderer that keeps the BeaverPhone
   dialer connected to the Termux backend at `ws://192.168.1.60:5001`.
2. A **Node.js content server** embedded in the Electron main process that
   shares the kiosk pages over HTTP on port `5000`.

The legacy Remote UI WebSocket and its JSON APIs have been removed. The kiosk
now behaves like a traditional Node-powered website that can be opened directly
from a browser.

## BeaverPhone WebSocket
- **URL:** `ws://192.168.1.60:5001`
- **Purpose:** Mirrors dialpad actions (dial, hangup, DTMF, clear) to the
  telephony stack.
- **Lifecycle events:**
  - `onopen` marks the kiosk as connected by dispatching the
    `beaverphone:ws-status` event with `connected`.
  - `onclose` emits `disconnected` and retries every 5 seconds.
  - `onerror` reports a `disconnected` status that includes the error message.
  - `onmessage` logs raw payloads for debugging.
- **Keep alive:** Sends `{ "type": "ping" }` every 30 seconds whenever the
  socket is open.

## Node content server (port 5000)

The Electron main process now starts a lightweight HTTP server that serves the
static pages located in the `page/` directory. When the kiosk launches it loads
`http://127.0.0.1:5000/`, and the same URL can be opened from a laptop on the
same network. The server:

- Maps `/` to `menu.html`.
- Serves any other `.html`, `.css`, or asset file located under `page/`.
- Rejects non-GET/HEAD methods and ignores attempts to traverse outside the
  content directory.

This change means you can preview the kiosk UI in Chrome without Electron. For
example:

```bash
open http://<kiosk-ip>:5000/
```

Visiting the root path loads the same `menu.html` experience that appears inside
the Electron shell.
