const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');

let win;
const ZOOM_STEP = 0.5;
const MIN_ZOOM_LEVEL = -5;
const MAX_ZOOM_LEVEL = 5;

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

ipcMain.on('go-home', () => {
  if (win) {
    win.loadFile(menuPath);
  }
});

app.whenReady().then(() => {
  createWindow();
  registerZoomShortcuts();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
