const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('workstationSetup', {
  read: () => ipcRenderer.invoke('workstation:read'),
  save: (value) => ipcRenderer.invoke('workstation:save', value),
});
