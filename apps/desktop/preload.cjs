const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopShell', {
  window: {
    getSize: () => ipcRenderer.invoke('desktop:get-window-size'),
    setSize: (size) => ipcRenderer.invoke('desktop:set-window-size', size),
    getAlwaysOnTop: () => ipcRenderer.invoke('desktop:get-always-on-top'),
    setAlwaysOnTop: (value) => ipcRenderer.invoke('desktop:set-always-on-top', value),
    onMoveStateChange: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('desktop:window-move-state', listener);
      return () => ipcRenderer.removeListener('desktop:window-move-state', listener);
    },
  },
});
