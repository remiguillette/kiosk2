# Remote Control Channels

The kiosk now relies on two complementary communication layers:

1. A **WebSocket client** embedded in the renderer that keeps the BeaverPhone
   dialer connected to the Termux backend at `ws://192.168.1.60:5001`.
2. A **Node.js HTTP server** embedded in the Electron main process that
   exposes a control surface for the graphical user interface on port `5000`.

The legacy Remote UI WebSocket has been removed. Remote control and monitoring
are handled exclusively through the Node.js backend.

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

## Embedded HTTP backend (port 5000)
The Electron main process spins up an HTTP server as soon as the app is ready.
It is responsible for bridging remote requests to the renderer through IPC.

### Endpoints
| Method | Path                    | Description |
| ------ | ----------------------- | ----------- |
| GET    | `/healthz`              | Returns `{ status: "ok" }` when the server is ready. |
| GET    | `/remote-ui/status`     | Reports the latest renderer status snapshot along with the server port. |
| GET    | `/remote-ui/events`     | Lists the most recent status updates and renderer-originated payloads. |
| POST   | `/remote-ui/commands`   | Accepts a JSON body and forwards it to the renderer as a remote command. |

All responses include CORS headers so that tooling on another machine can call
these endpoints without additional proxies.

### Sending a command
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"action":"show","target":"menu"}' \
  "http://<kiosk-ip>:5000/remote-ui/commands?command=navigate"
```

The payload is delivered to the renderer via
`win.webContents.send("remote-ui:command", { command, payload })`. Any open
renderer window receives the `remote-ui:ws-message` custom event with the
forwarded data.

### Observing renderer telemetry
The preload script reports significant lifecycle milestones through IPC. The
backend stores a rolling buffer of the most recent updates that can be queried
through `/remote-ui/events`. Each entry has:

```json
{
  "direction": "renderer-status", // or "renderer", "backend"
  "payload": { ... },
  "timestamp": "2024-05-18T20:03:12.512Z"
}
```

## Renderer-side integration
The preload bridge continues to use DOM events so the UI can remain unaware of
the transport changes:

- `remote-ui:ws-status` &mdash; Fired with statuses such as
  `renderer-preload-ready`, `renderer-dom-ready`, `backend-ready`, or
  `backend-error`.
- `remote-ui:ws-message` &mdash; Fired whenever the backend forwards a command.
  The event detail contains `{ message: { command, payload } }`.
- `remote-ui:dispatch` &mdash; Dispatch this custom event from the renderer to
  send diagnostic payloads back to the backend for logging and retrieval via
  `/remote-ui/events`.

By routing all remote control logic through the HTTP server and IPC, the kiosk
retains the simplicity of the single BeaverPhone WebSocket while ensuring
remote operators can still observe and interact with the UI safely.
