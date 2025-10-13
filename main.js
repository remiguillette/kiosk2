const { app, BrowserWindow, ipcMain, globalShortcut, session } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');

const BATTERY_BASE_PATH = '/sys/class/power_supply/battery';
const COOKIE_STORE_FILENAME = 'session-cookies.json';

let win;
const ZOOM_STEP = 0.5;
const MIN_ZOOM_LEVEL = -5;
const MAX_ZOOM_LEVEL = 5;

let cookieStorePath;
let cookiePersistTimer;
let contentServer;

const CONTENT_SERVER_PORT = Number.parseInt(process.env.PORT, 10) || 5000;
const CONTENT_ROOT = path.join(__dirname, 'page');

const MIME_TYPES = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return MIME_TYPES[extension] || 'application/octet-stream';
}

function resolveContentPath(requestUrl) {
  const url = new URL(requestUrl, `http://localhost:${CONTENT_SERVER_PORT}`);
  let relativePath = decodeURIComponent(url.pathname);

  if (!relativePath || relativePath === '/') {
    relativePath = 'menu.html';
  } else if (relativePath.endsWith('/')) {
    relativePath = `${relativePath}index.html`;
  }

  const normalizedPath = path
    .normalize(relativePath)
    .replace(/^([/\\])+/, '');

  if (/^(?:\.\.(?:[/\\]|$))/.test(normalizedPath)) {
    return null;
  }

  const [firstSegment, ...otherSegments] = normalizedPath.split(/[/\\]+/);

  let baseDir = CONTENT_ROOT;
  let safeRelativePath = normalizedPath;

  if (firstSegment === 'icon') {
    baseDir = path.join(__dirname, 'icon');
    safeRelativePath = otherSegments.join(path.sep);

    if (!safeRelativePath) {
      return null;
    }
  }

  const filePath = path.resolve(baseDir, safeRelativePath);

  if (!filePath.startsWith(baseDir)) {
    return null;
  }

  if (baseDir === CONTENT_ROOT && !path.extname(filePath)) {
    return `${filePath}.html`;
  }

  return filePath;
}

function startContentServer() {
  if (contentServer) {
    return Promise.resolve(contentServer);
  }

  contentServer = http.createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      return;
    }

    if (req.method && !['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method Not Allowed');
      return;
    }

    const filePath = resolveContentPath(req.url);

    if (!filePath) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    try {
      const data = await fs.promises.readFile(filePath);
      const headers = { 'Content-Type': getMimeType(filePath) };

      res.writeHead(200, headers);

      if (req.method === 'HEAD') {
        res.end();
      } else {
        res.end(data);
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      } else {
        console.error('Static server error:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
    }
  });

  return new Promise((resolve, reject) => {
    const handleStartupError = (error) => {
      console.error('Failed to start content server', error);
      reject(error);
    };

    contentServer.once('error', handleStartupError);

    contentServer.listen(CONTENT_SERVER_PORT, '0.0.0.0', () => {
      contentServer.removeListener('error', handleStartupError);
      contentServer.on('error', (error) => {
        console.error('Content server error:', error);
      });

      console.log(`Content server available at http://0.0.0.0:${CONTENT_SERVER_PORT}`);
      resolve(contentServer);
    });
  });
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

const menuUrl = `http://127.0.0.1:${CONTENT_SERVER_PORT}/`;
const menuLocation = new URL(menuUrl);
const menuOrigin = menuLocation.origin;

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
  win.loadURL(menuUrl);

  // Ouvrir les liens externes dans la même fenêtre
  win.webContents.setWindowOpenHandler(({ url }) => {
    win.loadURL(url);
    return { action: 'deny' };
  });

  const buildBackButtonInjection = () => `(() => {
    const MENU_URL = ${JSON.stringify(menuUrl)};
    const MENU_ORIGIN = ${JSON.stringify(menuOrigin)};
    const existing = document.getElementById('backToMenu');
    const onMenuOrigin = window.location.origin === MENU_ORIGIN;

    if (onMenuOrigin) {
      if (existing) existing.remove();
      return;
    }

    if (existing) {
      return;
    }

    const container = document.body || document.documentElement;
    if (!container) {
      return;
    }

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

    container.appendChild(btn);
  })();`;

  const injectBackButton = () => {
    const script = buildBackButtonInjection();
    win.webContents.executeJavaScript(script).catch(() => {
      // Ignorer les erreurs d'injection (ex : pages sans autorisation)
    });
  };

  win.webContents.on('did-finish-load', injectBackButton);
  win.webContents.on('did-navigate-in-page', injectBackButton);
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
    win.loadURL(menuUrl);
  }
});

app.whenReady().then(async () => {
  await initializeSessionPersistence();
  await startContentServer();
  createWindow();
  registerZoomShortcuts();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();

  if (contentServer) {
    contentServer.close();
    contentServer = null;
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

