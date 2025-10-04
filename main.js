const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let win;

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
        btn.textContent = '\\u2b65 Back Menu';
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

ipcMain.on('go-home', () => {
  if (win) {
    win.loadFile(menuPath);
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
