const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mktDatabase', Object.freeze({
  readDataset: (key) => ipcRenderer.sendSync('database:read-dataset', key),
  writeDataset: (key, version, data) => ipcRenderer.sendSync('database:write-dataset', { key, version, data }),
  queryProducts: (options) => ipcRenderer.sendSync('database:query-products', options),
  readProductDetail: (productId) => ipcRenderer.sendSync('database:read-product-detail', productId),
  writeMisaDetails: (version, rows) => ipcRenderer.sendSync('database:write-misa-details', { version, rows }),
  queryMisaDetails: (options) => ipcRenderer.sendSync('database:query-misa-details', options),
  queryMisaRange: (options) => ipcRenderer.sendSync('database:query-misa-range', options),
  status: () => ipcRenderer.sendSync('database:status'),
}));
