const { app, BrowserWindow, ipcMain, globalShortcut, session } = require('electron');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const BATTERY_BASE_PATH = '/sys/class/power_supply/battery';
const COOKIE_STORE_FILENAME = 'session-cookies.json';

let win;
const ZOOM_STEP = 0.5;
const MIN_ZOOM_LEVEL = -5;
const MAX_ZOOM_LEVEL = 5;

let cookieStorePath;
let cookiePersistTimer;
let remoteUiServer;

const REMOTE_UI_PORT = 6001;

function startRemoteUiServer() {
  if (remoteUiServer) {
    return remoteUiServer;
  }

  remoteUiServer = new WebSocket.Server({ port: REMOTE_UI_PORT });

  remoteUiServer.on('listening', () => {
    console.log(`Remote UI WebSocket listening on ws://0.0.0.0:${REMOTE_UI_PORT}`);
  });

  remoteUiServer.on('connection', (socket, request) => {
    const { remoteAddress, remotePort } = request.socket;
    console.log('Remote UI client connected', {
      remoteAddress,
      remotePort,
    });

    socket.on('message', (data) => {
      const payload = data instanceof Buffer ? data.toString('utf8') : String(data);
      console.log('Remote UI message received', { payload });

      remoteUiServer.clients.forEach((client) => {
        if (client !== socket && client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      });
    });

    socket.on('close', (code, reason) => {
      console.log('Remote UI client disconnected', {
        code,
        reason: typeof reason === 'string' ? reason : reason?.toString(),
      });
    });

    socket.on('error', (error) => {
      console.error('Remote UI socket error', error);
    });
  });

  remoteUiServer.on('error', (error) => {
    console.error('Remote UI server error', error);
  });

  return remoteUiServer;
}

function getCookieStorePath() {
  if (!cookieStorePath) {
    cookieStorePath = path.join(app.getPath('userData'), COOKIE_STORE_FILENAME);
  }

  return cookieStorePath;
}

function normalizeCookieUrl(cookie) {
  const domain = cookie.domain?.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
  const host = domain && domain.length > 0 ? domain : 'localhost';
  const protocol = cookie.secure ? 'https://' : 'http://';
  const cookiePath = cookie.path && cookie.path.length > 0 ? cookie.path : '/';

  return `${protocol}${host}${cookiePath}`;
}

function serializeCookie(cookie) {
  const serialized = {
    url: normalizeCookieUrl(cookie),
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
  };

  if (typeof cookie.expirationDate === 'number') {
    serialized.expirationDate = cookie.expirationDate;
  }

  if (typeof cookie.priority === 'string') {
    serialized.priority = cookie.priority;
  }

  return serialized;
}

async function persistCookies(electronSession) {
  try {
    const cookies = await electronSession.cookies.get({});
    const serializedCookies = cookies.map(serializeCookie);

    await fs.promises.writeFile(
      getCookieStorePath(),
      JSON.stringify(serializedCookies, null, 2),
      'utf8',
    );
  } catch (error) {
    console.error('Error while persisting cookies:', error);
  }
}

function scheduleCookiePersist(electronSession) {
  if (cookiePersistTimer) {
    clearTimeout(cookiePersistTimer);
  }

  cookiePersistTimer = setTimeout(() => {
    persistCookies(electronSession).catch((error) => {
      console.error('Error during scheduled cookie persist:', error);
    });
  }, 300);
}

async function restoreCookies(electronSession) {
  try {
    const raw = await fs.promises.readFile(getCookieStorePath(), 'utf8');
    const storedCookies = JSON.parse(raw);

    for (const cookie of storedCookies) {
      const {
        url,
        name,
        value,
        domain,
        path: cookiePath,
        secure,
        httpOnly,
        sameSite,
        expirationDate,
        priority,
      } = cookie;

      if (!url || !name) {
        continue;
      }

      const details = {
        url,
        name,
        value,
      };

      if (typeof domain === 'string' && domain.length > 0) {
        details.domain = domain;
      }

      if (typeof cookiePath === 'string' && cookiePath.length > 0) {
        details.path = cookiePath;
      }

      if (typeof secure === 'boolean') {
        details.secure = secure;
      }

      if (typeof httpOnly === 'boolean') {
        details.httpOnly = httpOnly;
      }

      if (typeof sameSite === 'string' && sameSite.length > 0) {
        details.sameSite = sameSite;
      }

      if (typeof expirationDate === 'number') {
        details.expirationDate = expirationDate;
      }

      if (typeof priority === 'string' && priority.length > 0) {
        details.priority = priority;
      }

      try {
        await electronSession.cookies.set(details);
      } catch (error) {
        console.error('Failed to restore cookie:', { name, domain, path: cookiePath }, error);
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Error while restoring cookies:', error);
    }
  }
}

async function initializeSessionPersistence() {
  const currentSession = session.defaultSession;

  if (!currentSession) {
    return;
  }

  await restoreCookies(currentSession);

  currentSession.cookies.on('changed', () => {
    scheduleCookiePersist(currentSession);
  });

  // Ensure we capture the initial state as soon as possible.
  scheduleCookiePersist(currentSession);
}

const menuPath = path.join(__dirname, 'page', 'menu.html');
const menuUrl = `file://${menuPath.replace(/\\/g, '/')}`;

function createWindow() {
  win = new BrowserWindow({
    kiosk: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  // Démarrer sur le menu local
  win.loadFile(menuPath);

  // Ouvrir les liens externes dans la même fenêtre
  win.webContents.setWindowOpenHandler(({ url }) => {
    win.loadURL(url);
    return { action: 'deny' };
  });

  // Injecter un bouton de retour uniquement pour les pages distantes (ex: BeaverNet)
  win.webContents.on('did-finish-load', () => {
    const script = `(() => {
      const MENU_URL = ${JSON.stringify(menuUrl)};
      const existing = document.getElementById('backToMenu');
      const isLocal = window.location.protocol === 'file:';
      const onMenu = isLocal && window.location.href === MENU_URL;

      if (isLocal || onMenu) {
        if (existing) existing.remove();
        return;
      }

      if (!existing) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'backToMenu';
        btn.setAttribute('aria-label', 'Return to menu');

        Object.assign(btn.style, {
          position: 'fixed',
          top: '20px',
          left: '20px',
          zIndex: 9999,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: 'rgba(9, 12, 20, 0.85)',
          color: '#f2f2f7',
          fontWeight: '600',
          fontSize: '15px',
          padding: '10px 16px',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          borderRadius: '14px',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
          backdropFilter: 'blur(12px)'
        });

        const icon = document.createElement('span');
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '\\ud83c\\udfe0';
        Object.assign(icon.style, {
          fontSize: '1.1rem',
          lineHeight: '1'
        });

        const text = document.createElement('span');
        text.textContent = 'Menu';

        btn.appendChild(icon);
        btn.appendChild(text);

        btn.addEventListener('click', () => {
          if (window.electronAPI?.goHome) {
            window.electronAPI.goHome();
          } else {
            window.location.href = MENU_URL;
          }
        });
        document.body.appendChild(btn);
      }
    })();`;

    win.webContents.executeJavaScript(script).catch(() => {
      // Ignorer les erreurs d'injection (ex : pages sans autorisation)
    });
  });
}

function adjustZoom(delta) {
  if (!win) return;

  const { webContents } = win;
  const current = webContents.getZoomLevel();
  const next = Math.min(MAX_ZOOM_LEVEL, Math.max(MIN_ZOOM_LEVEL, current + delta));
  webContents.setZoomLevel(next);
}

function registerZoomShortcuts() {
  const shortcuts = [
    { accelerator: 'CommandOrControl+=', delta: ZOOM_STEP },
    { accelerator: 'CommandOrControl+Shift+=', delta: ZOOM_STEP },
    { accelerator: 'CommandOrControl+-', delta: -ZOOM_STEP },
  ];

  shortcuts.forEach(({ accelerator, delta }) => {
    globalShortcut.register(accelerator, () => adjustZoom(delta));
  });
}

ipcMain.handle('getBatteryLevel', async () => {
  try {
    const capacityRaw = fs.readFileSync(path.join(BATTERY_BASE_PATH, 'capacity'), 'utf8').trim();
    const statusRaw = fs.readFileSync(path.join(BATTERY_BASE_PATH, 'status'), 'utf8').trim();
    const capacity = Number.parseInt(capacityRaw, 10);

    if (Number.isNaN(capacity)) {
      throw new Error(`Invalid capacity value: ${capacityRaw}`);
    }

    return { capacity, status: statusRaw };
  } catch (error) {
    console.error('Error reading battery information:', error);
    return null;
  }
});

ipcMain.on('go-home', () => {
  if (win) {
    win.loadFile(menuPath);
  }
});

app.whenReady().then(async () => {
  await initializeSessionPersistence();
  startRemoteUiServer();
  createWindow();
  registerZoomShortcuts();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();

  if (remoteUiServer) {
    remoteUiServer.close();
    remoteUiServer = null;
  }
});

app.on('before-quit', () => {
  const currentSession = session.defaultSession;
  if (currentSession) {
    if (cookiePersistTimer) {
      clearTimeout(cookiePersistTimer);
      cookiePersistTimer = null;
    }
    persistCookies(currentSession);
  }
});
