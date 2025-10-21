const { app, BrowserWindow, ipcMain, globalShortcut, session } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');
const { randomUUID } = require('crypto');
const { execFile } = require('child_process');
const net = require('net');
const { promisify } = require('util');

const BATTERY_BASE_PATH = '/sys/class/power_supply/battery';
const COOKIE_STORE_FILENAME = 'session-cookies.json';
const PORTS_TO_MONITOR = [8000, 9090];

let win;
const ZOOM_STEP = 0.5;
const MIN_ZOOM_LEVEL = -5;
const MAX_ZOOM_LEVEL = 5;

let cookieStorePath;
let cookiePersistTimer;
let contentServer;
let taskStorePath;
let tasksCache;
let tasksLoaded = false;
const portStates = new Map();
const execFileAsync = promisify(execFile);
let uptimeErrorLogged = false;

function probePort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    const finalize = (value) => {
      if (resolved) {
        return;
      }

      resolved = true;
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(750);
    socket.once('connect', () => finalize(true));
    socket.once('timeout', () => finalize(false));
    socket.once('error', () => finalize(false));

    try {
      socket.connect(port, '127.0.0.1');
    } catch (error) {
      finalize(false);
    }
  });
}

async function readPortStatuses(referenceTimeIso) {
  const nowIso = referenceTimeIso || new Date().toISOString();
  const statuses = [];

  for (const port of PORTS_TO_MONITOR) {
    // eslint-disable-next-line no-await-in-loop
    const isUp = await probePort(port);
    const existing = portStates.get(port);

    if (!existing || existing.up !== isUp) {
      portStates.set(port, { up: isUp, since: nowIso });
    }

    const snapshot = portStates.get(port);
    statuses.push({ port, up: isUp, since: snapshot?.since, checkedAt: nowIso });
  }

  return statuses;
}

async function runUptimeCommand(args = []) {
  try {
    const { stdout } = await execFileAsync('uptime', args, { timeout: 2000 });
    uptimeErrorLogged = false;
    return stdout.trim();
  } catch (error) {
    if (!uptimeErrorLogged) {
      console.error('Unable to execute uptime command', error);
      uptimeErrorLogged = true;
    }
    return null;
  }
}

function parseLoadAverages(rawOutput) {
  if (!rawOutput) {
    return null;
  }

  const match = rawOutput.match(/load averages?:\s*(.+)$/i);
  if (!match) {
    return null;
  }

  return match[1]
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

async function readSystemUptime() {
  const [pretty, since, raw] = await Promise.all([
    runUptimeCommand(['-p']),
    runUptimeCommand(['-s']),
    runUptimeCommand(),
  ]);

  const loadAverages = parseLoadAverages(raw);

  if (!pretty && !since && !raw) {
    return null;
  }

  return {
    pretty,
    since,
    raw,
    loadAverages,
  };
}

const CONTENT_SERVER_PORT = Number.parseInt(process.env.PORT, 10) || 5000;
const CONTENT_ROOT = path.join(__dirname, 'page');
const TASKS_STORE_FILENAME = 'beavertask-tasks.json';

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

function getTaskStorePath() {
  if (!taskStorePath) {
    taskStorePath = path.join(app.getPath('userData'), TASKS_STORE_FILENAME);
  }

  return taskStorePath;
}

function isValidDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function ensureTasksLoaded() {
  if (tasksLoaded && Array.isArray(tasksCache)) {
    return tasksCache;
  }

  try {
    const raw = await fs.promises.readFile(getTaskStorePath(), 'utf8');
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      tasksCache = parsed
        .filter((task) => task && typeof task.id === 'string')
        .map((task) => {
          const createdAt =
            typeof task.createdAt === 'string' ? task.createdAt : new Date().toISOString();
          const updatedAt =
            typeof task.updatedAt === 'string' ? task.updatedAt : createdAt;

          return {
            id: task.id,
            title: typeof task.title === 'string' ? task.title : '',
            description: typeof task.description === 'string' ? task.description : '',
            dueDate: isValidDateString(task.dueDate) ? task.dueDate : null,
            tag: typeof task.tag === 'string' ? task.tag : '',
            completed: Boolean(task.completed),
            createdAt,
            updatedAt,
          };
        });
    } else {
      tasksCache = [];
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Failed to read Beavertask tasks:', error);
    }

    tasksCache = [];
  }

  tasksLoaded = true;
  return tasksCache;
}

async function persistTasks() {
  try {
    await fs.promises.mkdir(path.dirname(getTaskStorePath()), { recursive: true });
    await fs.promises.writeFile(
      getTaskStorePath(),
      JSON.stringify(Array.isArray(tasksCache) ? tasksCache : [], null, 2),
      'utf8',
    );
  } catch (error) {
    console.error('Failed to persist Beavertask tasks:', error);
    throw createHttpError('Unable to persist tasks', 500);
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
  });
  res.end(JSON.stringify(payload));
}

function sendNoContent(res) {
  res.writeHead(204, {
    'Content-Type': 'application/json',
  });
  res.end();
}

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseTaskPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw createHttpError('Invalid payload', 400);
  }

  const title = typeof payload.title === 'string' ? payload.title.trim() : '';

  if (!title) {
    throw createHttpError('Title is required', 400);
  }

  const description =
    typeof payload.description === 'string' ? payload.description.trim() : '';
  const rawDueDate = typeof payload.dueDate === 'string' ? payload.dueDate.trim() : '';

  if (rawDueDate && !isValidDateString(rawDueDate)) {
    throw createHttpError('Invalid due date format', 400);
  }

  const tag = typeof payload.tag === 'string' ? payload.tag.trim() : '';
  const now = new Date().toISOString();

  return {
    id: randomUUID(),
    title,
    description,
    dueDate: rawDueDate || null,
    tag,
    completed: false,
    createdAt: now,
    updatedAt: now,
  };
}

function parseTaskUpdates(payload) {
  if (!payload || typeof payload !== 'object') {
    throw createHttpError('Invalid payload', 400);
  }

  const updates = {};

  if (Object.prototype.hasOwnProperty.call(payload, 'title')) {
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    if (!title) {
      throw createHttpError('Title is required', 400);
    }
    updates.title = title;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'description')) {
    if (typeof payload.description !== 'string') {
      throw createHttpError('Description must be a string', 400);
    }
    updates.description = payload.description.trim();
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'tag')) {
    if (typeof payload.tag !== 'string') {
      throw createHttpError('Tag must be a string', 400);
    }
    updates.tag = payload.tag.trim();
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'dueDate')) {
    if (
      payload.dueDate === null ||
      (typeof payload.dueDate === 'string' && payload.dueDate.trim() === '')
    ) {
      updates.dueDate = null;
    } else if (typeof payload.dueDate === 'string' && isValidDateString(payload.dueDate)) {
      updates.dueDate = payload.dueDate;
    } else {
      throw createHttpError('Invalid due date format', 400);
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'completed')) {
    if (typeof payload.completed !== 'boolean') {
      throw createHttpError('Completed must be a boolean', 400);
    }
    updates.completed = payload.completed;
  }

  if (!Object.keys(updates).length) {
    throw createHttpError('No valid fields to update', 400);
  }

  updates.updatedAt = new Date().toISOString();
  return updates;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let rawData = '';

    req.on('data', (chunk) => {
      rawData += chunk;

      if (rawData.length > 1_000_000) {
        reject(createHttpError('Payload too large', 413));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!rawData) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawData));
      } catch (error) {
        reject(createHttpError('Invalid JSON payload', 400));
      }
    });

    req.on('error', (error) => {
      reject(createHttpError(error.message || 'Failed to read payload', 400));
    });
  });
}

async function handleTasksApi(req, res, requestUrl) {
  const segments = requestUrl.pathname.split('/').filter(Boolean);

  if (segments.length < 2 || segments[0] !== 'api' || segments[1] !== 'tasks') {
    return false;
  }

  await ensureTasksLoaded();

  try {
    if (segments.length === 2) {
      if (req.method === 'GET') {
        sendJson(res, 200, { tasks: tasksCache });
        return true;
      }

      if (req.method === 'POST') {
        const payload = await readJsonBody(req);
        const task = parseTaskPayload(payload);
        tasksCache.push(task);
        await persistTasks();
        sendJson(res, 201, task);
        return true;
      }

      if (req.method === 'HEAD') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end();
        return true;
      }

      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET,POST,HEAD,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return true;
      }

      throw createHttpError('Method Not Allowed', 405);
    }

    if (segments.length === 3) {
      const taskId = segments[2];
      const index = tasksCache.findIndex((task) => task.id === taskId);

      if (index === -1) {
        throw createHttpError('Task not found', 404);
      }

      if (req.method === 'PATCH') {
        const payload = await readJsonBody(req);
        const updates = parseTaskUpdates(payload);
        tasksCache[index] = { ...tasksCache[index], ...updates };
        await persistTasks();
        sendJson(res, 200, tasksCache[index]);
        return true;
      }

      if (req.method === 'DELETE') {
        tasksCache.splice(index, 1);
        await persistTasks();
        sendNoContent(res);
        return true;
      }

      if (req.method === 'GET') {
        sendJson(res, 200, tasksCache[index]);
        return true;
      }

      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return true;
      }

      throw createHttpError('Method Not Allowed', 405);
    }

    throw createHttpError('Not Found', 404);
  } catch (error) {
    if (error.statusCode === 413) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
      return true;
    }

    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) {
      console.error('Task API error:', error);
    }

    sendJson(res, statusCode, { error: error.message || 'Internal Server Error' });
    return true;
  }
}

async function handleSystemStatusApi(req, res, requestUrl) {
  if (requestUrl.pathname !== '/api/system/status') {
    return false;
  }

  try {
    if (req.method === 'GET') {
      const generatedAt = new Date().toISOString();
      const [uptime, ports] = await Promise.all([
        readSystemUptime(),
        readPortStatuses(generatedAt),
      ]);

      sendJson(res, 200, {
        uptime,
        ports,
        generatedAt,
      });
      return true;
    }

    if (req.method === 'HEAD') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end();
      return true;
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return true;
    }

    throw createHttpError('Method Not Allowed', 405);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) {
      console.error('System status API error:', error);
    }

    sendJson(res, statusCode, { error: error.message || 'Internal Server Error' });
    return true;
  }
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

  if (firstSegment === 'icon' || firstSegment === 'contact') {
    const staticDir = firstSegment === 'icon' ? 'icon' : 'contact';
    baseDir = path.join(__dirname, staticDir);
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

    let requestUrl;
    try {
      requestUrl = new URL(req.url, `http://localhost:${CONTENT_SERVER_PORT}`);
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      return;
    }

    let handled = await handleTasksApi(req, res, requestUrl);
    if (handled) {
      return;
    }

    handled = await handleSystemStatusApi(req, res, requestUrl);
    if (handled) {
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
    const trimmed = raw.trim();

    if (trimmed.length === 0) {
      return;
    }

    let storedCookies;

    try {
      storedCookies = JSON.parse(trimmed);
    } catch (parseError) {
      console.warn('Ignoring invalid cookie store contents:', parseError);
      return;
    }

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
const menuOrigin = new URL(menuUrl).origin;

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

  // Injecter un bouton de retour uniquement pour les pages distantes (ex: BeaverNet)
  win.webContents.on('did-finish-load', () => {
    const script = `(() => {
      const MENU_URL = ${JSON.stringify(menuUrl)};
      const MENU_ORIGIN = ${JSON.stringify(menuOrigin)};
      const WRAPPER_ID = 'backToMenuWrapper';
      const BUTTON_ID = 'backToMenu';
      const existingWrapper = document.getElementById(WRAPPER_ID);
      const onLocalOrigin = window.location.origin === MENU_ORIGIN;

      const setInteractivity = (wrapper, btn) => {
        if (!wrapper || !btn || wrapper.dataset.interactive === 'true') return;

        wrapper.dataset.interactive = 'true';

        let touchHideTimeout;

        const showButton = () => {
          btn.style.opacity = '1';
          btn.style.pointerEvents = 'auto';
          btn.style.transform = 'translateY(0)';
        };

        const hideButton = () => {
          btn.style.opacity = '0';
          btn.style.pointerEvents = 'none';
          btn.style.transform = 'translateY(-6px)';
        };

        wrapper.addEventListener('mouseenter', showButton);
        wrapper.addEventListener('mouseleave', () => {
          if (!btn.matches(':focus')) hideButton();
        });
        wrapper.addEventListener('touchstart', () => {
          showButton();
          if (touchHideTimeout) clearTimeout(touchHideTimeout);
          touchHideTimeout = setTimeout(() => {
            if (!btn.matches(':focus')) hideButton();
          }, 2500);
        }, { passive: true });
        btn.addEventListener('focus', showButton);
        btn.addEventListener('blur', hideButton);

        hideButton();
      };

      if (onLocalOrigin) {
        if (existingWrapper) existingWrapper.remove();
        return;
      }

      if (!existingWrapper) {
        const wrapper = document.createElement('div');
        wrapper.id = WRAPPER_ID;

        Object.assign(wrapper.style, {
          position: 'fixed',
          top: '20px',
          left: '20px',
          zIndex: 9999,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px',
          borderRadius: '16px',
          background: 'transparent'
        });

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = BUTTON_ID;
        btn.setAttribute('aria-label', 'Return to menu');

        Object.assign(btn.style, {
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
          backdropFilter: 'blur(12px)',
          transition: 'opacity 160ms ease, transform 160ms ease',
          transform: 'translateY(-6px)'
        });

        const ns = 'http://www.w3.org/2000/svg';
        const icon = document.createElementNS(ns, 'svg');
        icon.setAttribute('aria-hidden', 'true');
        icon.setAttribute('width', '20');
        icon.setAttribute('height', '20');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('fill', 'none');
        icon.setAttribute('stroke', 'currentColor');
        icon.setAttribute('stroke-width', '2');
        icon.setAttribute('stroke-linecap', 'round');
        icon.setAttribute('stroke-linejoin', 'round');

        const line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', '19');
        line.setAttribute('y1', '12');
        line.setAttribute('x2', '5');
        line.setAttribute('y2', '12');

        const polyline = document.createElementNS(ns, 'polyline');
        polyline.setAttribute('points', '12 19 5 12 12 5');

        icon.appendChild(line);
        icon.appendChild(polyline);

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

        wrapper.appendChild(btn);
        document.body.appendChild(wrapper);

        setInteractivity(wrapper, btn);
      } else {
        const btn = existingWrapper.querySelector('#' + BUTTON_ID);
        if (btn) {
          btn.style.opacity = '0';
          btn.style.pointerEvents = 'none';
          btn.style.transform = 'translateY(-6px)';
        }
        setInteractivity(existingWrapper, btn);
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

