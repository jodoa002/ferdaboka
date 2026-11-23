// Ferdaboka – hovedprosess (Electron)
const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { setupUpdater } = require('./updater');

// Egen protokoll for å vise lagrede bilder og innebygde kart trygt i vinduet
protocol.registerSchemesAsPrivileged([
  { scheme: 'ferd', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

app.commandLine.appendSwitch('lang', 'nb-NO');

const DATA_DIR = () => app.getPath('userData');
const DATA_FILE = () => path.join(DATA_DIR(), 'ferdaboka.json');
const MEDIA_DIR = () => path.join(DATA_DIR(), 'media');
const BUILTIN_DIR = path.join(__dirname, '..', 'assets', 'maps');

const BUILTIN_MAPS = [
  {
    id: 'trondheim',
    name: 'Trondheim og omegn',
    subtitle: 'Nidaros, Bymarka og Jonsvatnet',
    builtin: true,
    image: 'builtin/trondheim.jpg',
    width: 4376,
    height: 3344,
    kmPerPx: 0.00575,
  },
];

function emptyData() { return { version: 1, maps: [], trips: [] }; }

function loadData() {
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE(), 'utf8'));
    d.maps ||= []; d.trips ||= [];
    return d;
  } catch { return emptyData(); }
}

function saveData(data) {
  fs.mkdirSync(DATA_DIR(), { recursive: true });
  const tmp = DATA_FILE() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  // behold forrige versjon som sikkerhetskopi
  if (fs.existsSync(DATA_FILE())) fs.copyFileSync(DATA_FILE(), DATA_FILE() + '.bak');
  fs.renameSync(tmp, DATA_FILE());
}

// Innebygde kart kan få overstyrt navn/målestokk av brukeren
function withBuiltins(data) {
  const overrides = data.builtinOverrides || {};
  const builtins = BUILTIN_MAPS.map(m => ({ ...m, ...(overrides[m.id] || {}) }));
  return { ...data, maps: [...builtins, ...data.maps] };
}

function copyIntoMedia(src) {
  fs.mkdirSync(MEDIA_DIR(), { recursive: true });
  const ext = path.extname(src).toLowerCase() || '.jpg';
  const name = crypto.randomUUID() + ext;
  fs.copyFileSync(src, path.join(MEDIA_DIR(), name));
  return 'media/' + name;
}

const IMAGE_FILTER = [{ name: 'Bilder', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }];

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: '#1d140b',
    title: 'Ferdaboka',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // åpne eksterne lenker i nettleseren
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  return win;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  protocol.handle('ferd', (req) => {
    const url = new URL(req.url);
    const rel = decodeURIComponent(url.hostname + url.pathname);
    let file;
    if (rel.startsWith('builtin/')) file = path.join(BUILTIN_DIR, path.basename(rel));
    else if (rel.startsWith('media/')) file = path.join(MEDIA_DIR(), path.basename(rel));
    else return new Response('Ikke funnet', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });

  ipcMain.handle('data:load', () => withBuiltins(loadData()));

  ipcMain.handle('data:save', (_e, data) => {
    // innebygde kart lagres ikke som egne kart, kun eventuelle endringer
    const builtinIds = new Set(BUILTIN_MAPS.map(m => m.id));
    const overrides = {};
    for (const m of data.maps.filter(m => builtinIds.has(m.id))) {
      const base = BUILTIN_MAPS.find(b => b.id === m.id);
      const o = {};
      for (const k of ['name', 'kmPerPx']) if (m[k] !== base[k]) o[k] = m[k];
      if (Object.keys(o).length) overrides[m.id] = o;
    }
    saveData({ version: 1, builtinOverrides: overrides, maps: data.maps.filter(m => !builtinIds.has(m.id)), trips: data.trips });
    return true;
  });

  ipcMain.handle('dialog:pickImages', async (e, { multiple }) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const res = await dialog.showOpenDialog(win, {
      title: multiple ? 'Velg bilder fra turen' : 'Velg kartbilde',
      properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: IMAGE_FILTER,
    });
    if (res.canceled) return [];
    return res.filePaths.map(copyIntoMedia);
  });

  ipcMain.handle('media:delete', (_e, rel) => {
    if (!rel || !rel.startsWith('media/')) return false;
    try { fs.unlinkSync(path.join(MEDIA_DIR(), path.basename(rel))); } catch { }
    return true;
  });

  ipcMain.handle('app:openDataFolder', () => shell.openPath(DATA_DIR()));
  setupUpdater();

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
