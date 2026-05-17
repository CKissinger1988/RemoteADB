const { app, BrowserWindow, dialog, Tray, Menu, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');

let backendProcess = null;
let tray = null;
let mainWindow = null;
let keepBackendAlive = false;

function startBackend(callback) {
  const backendScript = path.join(__dirname, '..', 'Remote-ADB-Back', 'src', 'backend.js');
  const backendDir = path.join(__dirname, '..', 'Remote-ADB-Back');

  backendProcess = spawn('node', [backendScript], {
    cwd: backendDir,
    stdio: 'ignore',
    env: { ...process.env, PORT: 5200 },
    detached: true
  });

  backendProcess.on('exit', () => {
    backendProcess = null;
    if (tray) createTrayMenu();
  });

  backendProcess.on('error', (err) => {
    console.error('Failed to start backend process:', err);
  });

  if (callback) callback();
}

function getSavedPreference() {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return data.keepBackendAlive;
    }
  } catch (err) {}
  return null;
}

function savePreference(value) {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  try {
    fs.writeFileSync(configPath, JSON.stringify({ keepBackendAlive: value }), 'utf8');
  } catch (err) {}
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    title: "Remote ADB Desktop",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // Allows the app to talk to the local backend during testing
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTrayMenu() {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Remote ADB', click: () => { if (mainWindow) mainWindow.show(); else createWindow(); } },
    { type: 'separator' },
    { label: 'Backend: ' + (backendProcess ? 'Active' : 'Stopped'), enabled: false },
    { label: 'Start Backend', enabled: !backendProcess, click: () => startBackend(createTrayMenu) },
    { label: 'Restart Backend', enabled: !!backendProcess, click: () => {
        backendProcess.kill();
        setTimeout(() => startBackend(createTrayMenu), 1000);
      }
    },
    { label: 'Stop Backend', enabled: !!backendProcess, click: () => backendProcess.kill() },
    { type: 'separator' },
    { label: 'Quit Application', click: () => { keepBackendAlive = false; app.quit(); } }
  ]);
  tray.setContextMenu(contextMenu);
}

function createTray() {
  let icon = null;
  const icoPath = path.join(__dirname, 'favicon.ico');
  const pngPath = path.join(__dirname, 'icon.png');

  if (fs.existsSync(icoPath)) {
    icon = icoPath;
  } else if (fs.existsSync(pngPath)) {
    icon = pngPath;
  } else {
    icon = nativeImage.createEmpty();
    console.warn('No tray icon file found; using empty icon fallback.');
  }

  try {
    tray = new Tray(icon);
    tray.setToolTip('Remote ADB Manager');
    createTrayMenu();
  } catch (err) {
    console.warn(`Failed to create tray icon: ${err.message}`);
    tray = null;
  }
}

app.whenReady().then(() => {
  createTray();
  const socket = net.createConnection(5200, '127.0.0.1');
  socket.on('connect', () => {
    socket.destroy();
    console.log('Backend is already running.');
    createWindow();
  });
  socket.on('error', () => {
    console.log('Backend not found, starting process...');
    startBackend();
    createWindow();
  });
});

app.on('window-all-closed', () => {
  // Keep the app alive in the tray even when the window is closed.
  // On macOS, it is standard for apps to stay active until Cmd+Q.
  if (process.platform === 'darwin') app.dock.hide();
});

app.on('before-quit', (event) => {
  if (backendProcess && !keepBackendAlive) {
    const savedPref = getSavedPreference();
    if (savedPref !== null) {
      keepBackendAlive = savedPref;
      if (keepBackendAlive) backendProcess.unref();
      return;
    }

    const result = dialog.showMessageBoxSync({
      type: 'question',
      buttons: ['Keep Running', 'Stop Backend'],
      defaultId: 0,
      cancelId: 1,
      title: 'Remote ADB',
      message: 'Would you like to keep the ADB backend service running in the background?',
      checkboxLabel: "Don't ask again"
    });

    const response = typeof result === 'object' ? result.response : result;
    const checkboxChecked = typeof result === 'object' ? result.checkboxChecked : false;

    if (response === 0) {
      keepBackendAlive = true;
      backendProcess.unref();
    }

    if (checkboxChecked) {
      savePreference(keepBackendAlive);
    }
  }
});

app.on('will-quit', () => {
  if (backendProcess && !keepBackendAlive) {
    backendProcess.kill();
  }
});