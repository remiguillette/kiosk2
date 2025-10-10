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

  // Injecter un bouton de retour lorsque la page n'est pas le menu
  win.webContents.on('did-finish-load', () => {
    const script = `(() => {
      const MENU_URL = ${JSON.stringify(menuUrl)};
      const existing = document.getElementById('backToMenu');
      const onMenu = window.location.href === MENU_URL;

      if (onMenu) {
        if (existing) existing.remove();
        return;
      }

      if (!existing) {
        const btn = document.createElement('button');
        btn.id = 'backToMenu';
        btn.textContent = '\\ud83c\\udfe0 Menu';
        Object.assign(btn.style, {
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 9999,
          background: '#f89422',
          color: 'white',
          fontWeight: 'bold',
          padding: '10px 16px',
          border: 'none',
          borderRadius: '12px',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        });
        btn.addEventListener('click', () => {
          if (window.electronAPI?.goHome) {
            window.electronAPI.goHome();
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
