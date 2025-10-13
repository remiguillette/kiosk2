const { app, BrowserWindow, ipcMain, globalShortcut, session } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');
const Database = require('better-sqlite3');

const BATTERY_BASE_PATH = '/sys/class/power_supply/battery';
const COOKIE_STORE_FILENAME = 'session-cookies.json';

let win;
const ZOOM_STEP = 0.5;
const MIN_ZOOM_LEVEL = -5;
const MAX_ZOOM_LEVEL = 5;

let cookieStorePath;
let cookiePersistTimer;
let contentServer;
let taskDb;
let taskStatements;

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

function initializeTaskDatabase() {
  if (taskDb) {
    return taskDb;
  }

  if (!app.isReady()) {
    throw new Error('Application must be ready before initialising the task database.');
  }

  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'beavertask.db');

  taskDb = new Database(dbPath);
  taskDb.pragma('journal_mode = WAL');
  taskDb.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      assignee TEXT,
      due_date TEXT,
      priority TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT,
      image_data TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  taskStatements = {
    list: taskDb.prepare(`
      SELECT id, title, assignee, due_date, priority, status, notes, image_data, created_at, updated_at
      FROM tasks
      ORDER BY
        CASE WHEN due_date IS NULL OR due_date = '' THEN 1 ELSE 0 END,
        due_date,
        created_at DESC
    `),
    insert: taskDb.prepare(`
      INSERT INTO tasks (title, assignee, due_date, priority, status, notes, image_data, created_at, updated_at)
      VALUES (@title, @assignee, @dueDate, @priority, @status, @notes, @imageData, @createdAt, @updatedAt)
    `),
    delete: taskDb.prepare('DELETE FROM tasks WHERE id = ?'),
    getById: taskDb.prepare(`
      SELECT id, title, assignee, due_date, priority, status, notes, image_data, created_at, updated_at
      FROM tasks
      WHERE id = ?
    `),
  };

  return taskDb;
}

function mapTaskRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    assignee: row.assignee,
    dueDate: row.due_date || null,
    priority: row.priority,
    status: row.status,
    notes: row.notes,
    imageData: row.image_data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listTasks() {
  initializeTaskDatabase();
  return taskStatements.list.all().map(mapTaskRow);
}

function getTaskById(id) {
  initializeTaskDatabase();
  return mapTaskRow(taskStatements.getById.get(id));
}

function sanitizeNullableText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeStatus(status) {
  const value = (status || '').toString().trim().toLowerCase();
  const allowed = new Set(['pending', 'in_progress', 'done']);

  if (allowed.has(value)) {
    return value;
  }

  return 'pending';
}

function addTask(task) {
  initializeTaskDatabase();

  if (!task || !task.title || String(task.title).trim().length === 0) {
    throw new Error('Le titre de la tâche est obligatoire.');
  }

  const timestamp = new Date().toISOString();
  const payload = {
    title: String(task.title).trim(),
    assignee: sanitizeNullableText(task.assignee),
    dueDate: sanitizeNullableText(task.dueDate),
    priority: sanitizeNullableText(task.priority),
    status: normalizeStatus(task.status),
    notes: sanitizeNullableText(task.notes),
    imageData: task.imageData || null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const info = taskStatements.insert.run(payload);
  return getTaskById(info.lastInsertRowid);
}

function updateTask(id, updates = {}) {
  initializeTaskDatabase();

  if (!id) {
    throw new Error('Identifiant de tâche manquant pour la mise à jour.');
  }

  const columns = {
    title: 'title',
    assignee: 'assignee',
    dueDate: 'due_date',
    priority: 'priority',
    status: 'status',
    notes: 'notes',
    imageData: 'image_data',
  };

  const setters = [];
  const params = { id, updatedAt: new Date().toISOString() };

  Object.entries(columns).forEach(([key, column]) => {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      let value = updates[key];

      if (key === 'status') {
        value = normalizeStatus(value);
      } else if (key === 'imageData') {
        value = value || null;
      } else {
        value = sanitizeNullableText(value);
      }

      params[key] = value;
      setters.push(`${column} = @${key}`);
    }
  });

  if (setters.length === 0) {
    return getTaskById(id);
  }

  setters.push('updated_at = @updatedAt');
  const statement = taskDb.prepare(`UPDATE tasks SET ${setters.join(', ')} WHERE id = @id`);
  statement.run(params);

  return getTaskById(id);
}

function deleteTask(id) {
  initializeTaskDatabase();

  if (!id) {
    return false;
  }

  const info = taskStatements.delete.run(id);
  return info.changes > 0;
}

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
      const existing = document.getElementById('backToMenu');
      const onLocalOrigin = window.location.origin === MENU_ORIGIN;

      if (onLocalOrigin) {
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

ipcMain.handle('tasks:list', async () => {
  try {
    return listTasks();
  } catch (error) {
    console.error('Erreur lors de la lecture des tâches :', error);
    throw error;
  }
});

ipcMain.handle('tasks:add', async (_event, task) => {
  try {
    return addTask(task);
  } catch (error) {
    console.error('Erreur lors de la création d\'une tâche :', error);
    throw error;
  }
});

ipcMain.handle('tasks:update', async (_event, { id, updates }) => {
  try {
    return updateTask(id, updates);
  } catch (error) {
    console.error('Erreur lors de la mise à jour d\'une tâche :', error);
    throw error;
  }
});

ipcMain.handle('tasks:delete', async (_event, id) => {
  try {
    return deleteTask(id);
  } catch (error) {
    console.error('Erreur lors de la suppression d\'une tâche :', error);
    throw error;
  }
});

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
  initializeTaskDatabase();
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

  if (taskDb) {
    taskDb.close();
    taskDb = null;
    taskStatements = undefined;
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

