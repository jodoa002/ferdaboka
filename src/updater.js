// Automatiske oppdateringer fra GitHub Releases (bare i installert Windows-versjon)
const { app, ipcMain, BrowserWindow } = require('electron');

let status = { state: 'idle' };
let autoUpdater = null;

function send(s) {
  status = { ...s, version: s.version || status.version };
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('update:status', status);
}

function setupUpdater() {
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('update:status', () => status);
  ipcMain.handle('update:check', () => check(true));
  ipcMain.handle('update:install', () => {
    if (autoUpdater && status.state === 'ready') setImmediate(() => autoUpdater.quitAndInstall(true, true));
  });

  if (!app.isPackaged || process.platform !== 'win32') { status = { state: 'disabled' }; return; }

  ({ autoUpdater } = require('electron-updater'));
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;   // lastet ned? installeres når appen lukkes
  autoUpdater.logger = null;

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => send({ state: 'downloading', version: info.version, percent: 0 }));
  autoUpdater.on('update-not-available', () => send({ state: 'none' }));
  autoUpdater.on('download-progress', (p) => send({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => send({ state: 'ready', version: info.version }));
  autoUpdater.on('error', (err) => send({ state: 'error', message: String(err && err.message || err).slice(0, 200) }));

  setTimeout(() => check(false), 4000);
  setInterval(() => check(false), 6 * 60 * 60 * 1000);
}

async function check(manual) {
  if (!autoUpdater) return { state: 'disabled' };
  if (status.state === 'downloading' || status.state === 'ready') return status;
  try { await autoUpdater.checkForUpdates(); }
  catch (err) { send({ state: 'error', message: String(err.message || err).slice(0, 200), manual }); }
  return status;
}

module.exports = { setupUpdater };
