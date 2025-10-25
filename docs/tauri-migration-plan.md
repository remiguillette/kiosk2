# Tauri Migration Conversion Plan

## 1. Current Electron Architecture Summary
- **Main process (`main.js`)**
  - Starts an embedded HTTP content server on port 5000 that serves the static UI from `page/` and exposes REST endpoints for Beavertask (`/api/tasks`) and system monitoring (`/api/system/status`). The server performs strict method filtering, path normalization, and JSON parsing/persistence for task CRUD operations backed by a JSON file in the Electron `userData` directory.【F:main.js†L238-L439】【F:main.js†L520-L640】
  - Manages kiosk window lifecycle (single `BrowserWindow` in kiosk mode), injects a back-to-menu button for remote origins, registers zoom shortcuts, and persists cookies to `session-cookies.json` under `userData`. Cookie restore/persist logic serializes Electron cookies, rehydrates them at startup, and listens for changes.【F:main.js†L720-L973】
  - Provides IPC handlers (`getBatteryLevel`, `go-home`) and system integrations such as battery readings from `/sys/class/power_supply/battery`, local port probing for uptime diagnostics, and execution of the `uptime` command via `child_process.execFile` to populate system status responses.【F:main.js†L19-L219】【F:main.js†L944-L1074】
- **Preload (`preload.js`)**
  - Bridges safe APIs to the renderer (`goHome`, `getBatteryLevel`) and manages the BeaverPhone WebSocket client targeting `ws://192.168.1.60:5001`, including reconnection logic, ping keep-alives, and dispatching of dialpad events to the socket.【F:preload.js†L1-L88】
- **Database setup script (`scripts/setup-db.js`)**
  - CLI tool that ensures `better-sqlite3` is installed, creates `data/kiosk.db`, seeds user credentials, and synchronizes password hashes in `data/login-seed.json` using SHA-256 with per-user salts.【F:scripts/setup-db.js†L1-L130】【F:scripts/setup-db.js†L131-L200】

## 2. Migration Goals for Tauri
1. Replicate the kiosk experience in a Tauri shell while preserving offline-first behavior and the dual HTTP/WebSocket architecture.
2. Replace Node/Electron-specific services (embedded HTTP server, IPC, cookie persistence) with Tauri-compatible Rust commands or plugins.
3. Maintain compatibility with existing assets (`page/`, `icon/`, `contact/`) and database scripts during transition.
4. Ensure that Termux BeaverPhone WebSocket connectivity and Beavertask REST endpoints remain functional or receive Tauri-native equivalents.

## 3. Feasibility Analysis
- **Static content serving:** Tauri can host static assets via its asset bundler or a lightweight Rust HTTP server (e.g., `tauri::AppHandle::path_resolver` + `tauri::api::file`). Because the current kiosk expects `http://127.0.0.1:5000/`, plan for an internal router (e.g., `tauri-plugin-http`) or rewrite front-end to load assets directly from the built bundle. Recreating the HTTP server in Rust is feasible but requires port binding and request routing similar to the Node implementation.【F:main.js†L520-L640】
- **REST APIs:** The Beavertask API currently reads/writes JSON files and returns responses synchronously. Porting this logic to Rust commands (using `serde` for JSON and `tokio` for async) or to a lightweight embedded web framework (e.g., `axum` spawned inside Tauri) is feasible. File storage can continue under `AppDir` provided by Tauri's path API.【F:main.js†L238-L439】
- **System status & diagnostics:** Rust can replicate port probing via `tokio::net::TcpStream` with timeouts and execute `uptime` using `std::process::Command`. Battery data from `/sys/class/power_supply/battery` can be read with synchronous file IO or via the `battery` crate on Linux, making a Rust port practical.【F:main.js†L19-L219】【F:main.js†L944-L1058】
- **Cookie/session persistence:** Tauri's built-in WebView handles cookies at the browser layer; replicating Electron's manual persistence will require custom API calls or leveraging Tauri's `window.eval` to sync cookies, though offline-first behavior may already be handled by the WebView storage. Evaluate whether manual persistence is still required.
- **Preload bridge:** The WebSocket client can run in the front-end (e.g., vanilla JS, React) without Node APIs. Tauri allows enabling the `window.__TAURI__` bridge for additional commands. Migrating the existing `preload.js` logic directly into the renderer bundle is straightforward, relying on the WebView's standard WebSocket support.【F:preload.js†L1-L88】
- **Database tooling:** `better-sqlite3` will not run in a Rust backend. Consider replacing the setup script with a Rust CLI or using Tauri's `tauri::async_runtime::spawn` to call into `rusqlite` or `sqlx`. Alternatively, keep the Node script during migration to prepare the SQLite database before packaging; Tauri bundles can ship with pre-populated databases. This adds tooling complexity but is feasible.【F:scripts/setup-db.js†L1-L200】

## 4. Proposed Conversion Steps
1. **Create Tauri scaffold**: Initialize a Tauri project with the existing front-end stack (plain HTML/JS) by configuring the bundler to load `page/menu.html` as the entry point. Map asset directories (`page/`, `icon/`, `contact/`) into the Tauri `dist` folder.
2. **Re-implement content server logic**:
   - Option A: Use a Rust HTTP server inside Tauri that mirrors `/api/tasks` and `/api/system/status` while serving static files.
   - Option B: Convert the UI to file-based routing and replace HTTP fetches with Tauri `invoke` commands. For offline operation, Option B reduces attack surface but requires code changes in the front-end fetch calls.
3. **Port task storage**: Implement Rust commands for task CRUD, storing JSON in `AppDir` using `serde_json`. Provide command wrappers accessible via `window.__TAURI__.invoke` and adapt front-end fetch calls accordingly.
4. **System diagnostics**: Implement Rust commands for uptime (`Command::new("uptime")`), load averages parsing, and TCP port probing with timeouts, returning JSON objects that mirror the current API schema.
5. **Battery API**: Expose a Rust command to read `/sys/class/power_supply/battery/{capacity,status}` with error handling consistent with the current IPC handler.
6. **WebSocket bridge**: Move `preload.js` logic into the front-end bundle. Ensure reconnection timers and ping intervals remain unchanged. Provide optional Rust commands if future enhancements require native integration (e.g., secure credential storage).
7. **Back navigation control**: Reproduce the injected back-to-menu control either via front-end script executed after each navigation or by using Tauri's window APIs to intercept navigation events.
8. **Database setup strategy**: Decide between keeping the Node `setup-db.js` as an external provisioning tool or rewriting it in Rust (recommended for consistency). A Rust CLI can reuse the `rusqlite` crate to create tables and hash passwords using `ring` or `sha2` for cross-platform support.
9. **Automation & .check script**: Introduce a `.check` script (e.g., in `scripts/tauri/check.sh`) that runs linting, Rust `cargo fmt`, front-end build verification, and database migrations. Document how this integrates with CI.

## 5. Risk & Mitigation
- **WebView vs HTTP server expectations:** Front-end code expecting absolute URLs (`http://127.0.0.1:5000/...`) must be refactored to use relative paths or Tauri commands. Introduce an adapter layer that detects runtime environment.
- **Concurrency & async runtime:** Rust-based servers require careful shutdown handling to avoid blocking Tauri's event loop. Use `tauri::async_runtime::spawn` and graceful termination hooks.
- **Cross-platform dependencies:** `uptime` command and `/sys/` battery paths are Linux-specific. For broader support, add OS guards or implement platform-specific modules in Rust.
- **Database driver parity:** `better-sqlite3` features like WAL mode must be re-applied in the Rust implementation using `PRAGMA` statements to match behavior.【F:scripts/setup-db.js†L71-L130】

## 6. Recommendation on Rust Backend Conversion
Given the heavy reliance on Node APIs (HTTP server, filesystem, child processes) and the desire to migrate to Tauri, implementing these services in Rust is recommended. Rewriting the backend unlocks tighter integration with Tauri's security model, removes the Node dependency, and keeps all native functionality (port probing, uptime, battery access) under a single Rust runtime. Maintain the existing SQLite schema but port provisioning to Rust to avoid bundling Node during build time.

## 7. Next Steps
- Prototype a Tauri command for `/api/system/status` to validate async process execution and TCP probing.
- Audit front-end fetch calls to determine changes needed for Tauri invocation.
- Plan phased rollout: start with hybrid mode (Tauri shell calling existing Node server) before fully replacing the backend with Rust services.

