# Dual WebSocket Sessions

The kiosk establishes two isolated WebSocket clients so that telephony and remote
UI features can be monitored or reconnected independently.

## Beaverphone session
- **URL:** `ws://192.168.1.60:5001`
- **Purpose:** Bridges dialer events (dial, hangup, DTMF, clear) to the Termux
  backend that powers Beaverphone.
- **Handlers:**
  - `onopen` updates the Beaverphone status event (`beaverphone:ws-status`) to
    `connected`.
  - `onmessage` logs all inbound payloads for debugging.
  - `onclose` sets the status to `disconnected` and schedules a reconnect after
    5 seconds.
  - `onerror` emits an error status without blocking the reconnection timer.
- **Keep alive:** Sends a JSON ping every 30 seconds while connected.

## Remote UI session
- **URL:** `ws://192.168.1.76:6001`
- **Purpose:** Provides a dedicated channel for remote graphical control and
  monitoring separate from Beaverphone traffic.
- **Handlers:**
  - `onopen` clears any pending reconnect timer and emits
    `remote-ui:ws-status` with `connected`.
  - `onmessage` logs inbound payloads and re-emits them via the
    `remote-ui:ws-message` DOM event for renderer listeners.
  - `onclose` emits a `disconnected` status with the close metadata and retries
    after 5 seconds.
  - `onerror` records the failure and schedules the same reconnect logic.

## Listening for status in the renderer
Both sessions dispatch DOM custom events. Attach listeners in the renderer to
stay informed:

```js
window.addEventListener("beaverphone:ws-status", ({ detail }) => {
  console.log("Beaverphone status", detail.status);
});

window.addEventListener("remote-ui:ws-status", ({ detail }) => {
  console.log("Remote UI status", detail.status, detail.url);
});

window.addEventListener("remote-ui:ws-message", ({ detail }) => {
  console.log("Remote UI payload", detail.message);
});
```
