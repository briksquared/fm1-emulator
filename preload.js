// Deliberately tiny bridge: firmware and recovery commands stay in the trusted
// Electron main process, and the renderer cannot execute arbitrary programs.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("FM1Desktop", {
  openFlasher: () => ipcRenderer.invoke("fm1:open-flasher"),
});
