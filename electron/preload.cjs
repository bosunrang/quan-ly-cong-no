const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('congNoDatabase', Object.freeze({
  exportBusinessBackup: () => ipcRenderer.invoke('database:export-business-backup'),
  changeBusinessData: (change) => ipcRenderer.invoke('database:change-business-data', change),
  readDataset: (key) => ipcRenderer.sendSync('database:read-dataset', key),
  readDatasetAsync: (key) => ipcRenderer.invoke('database:read-dataset-async', key),
  datasetStamp: (key) => ipcRenderer.invoke('database:dataset-stamp', key),
  writeDataset: (key, version, data) => ipcRenderer.sendSync('database:write-dataset', { key, version, data }),
  writeReceiptLedger: (revision, data, salesBookImportedAt) =>
    ipcRenderer.invoke('database:write-receipt-ledger', { revision, data, salesBookImportedAt }),
  writeMisaSalesBook: (expectedImportedAt, data) =>
    ipcRenderer.invoke('database:write-misa-sales-book', { expectedImportedAt, data }),
  clearAllData: (branding) => ipcRenderer.sendSync('database:clear-all-data', branding),
  appendActivity: (entry) => ipcRenderer.sendSync('database:append-activity', entry),
  writeAccounts: (expected, accounts) => ipcRenderer.sendSync('database:write-accounts', { expected, accounts }),
  readActivities: () => ipcRenderer.sendSync('database:read-activities'),
  status: () => ipcRenderer.sendSync('database:status'),
}));
