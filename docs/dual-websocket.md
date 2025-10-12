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

### Accessing the graphical Remote UI

1. **Open the kiosk web page, not the raw WebSocket.** From another device on
   the same network, point a browser to the kiosk IP (for example
   `http://192.168.1.60`). This serves the regular menu interface that the
   Electron shell displays locally, so you get the exact same controls in a
   standard web view.
2. **Let the page establish the WebSocket for you.** The renderer script inside
   the kiosk automatically connects to `ws://192.168.1.76:6001`, dispatches
   status events, and mirrors any Remote UI messages it receives. There is no
   need to open the WebSocket endpoint manually—loading the page triggers the
   handshake and keeps it alive with reconnect logic.
3. **Check the connection status.** You can listen for the
   `remote-ui:ws-status` event in the browser console to verify whether the
   socket is connected and which URL is in use. If you see `disconnected`, the
   kiosk will retry every 5 seconds until the Electron host comes back online.
4. **Send commands through the DOM.** Dispatch a `remote-ui:ws-message` custom
   event with the payload you want to transmit. The preload script forwards it
   to the open WebSocket, and every connected Remote UI client receives it.

> **Important:** Do **not** browse directly to `:6001` or `:5001` in a browser.
> These ports are dedicated to background signaling. Always use the base HTTP
> address of the kiosk so that the Electron-rendered UI handles the WebSocket
> negotiation on your behalf.

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
