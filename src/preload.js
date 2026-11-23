const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ferd', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (data) => ipcRenderer.invoke('data:save', data),
  pickImages: (multiple = true) => ipcRenderer.invoke('dialog:pickImages', { multiple }),
  deleteMedia: (rel) => ipcRenderer.invoke('media:delete', rel),
  openDataFolder: () => ipcRenderer.invoke('app:openDataFolder'),
  version: () => ipcRenderer.invoke('app:version'),
  updateStatus: () => ipcRenderer.invoke('update:status'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdate: (cb) => ipcRenderer.on('update:status', (_e, s) => cb(s)),
});
