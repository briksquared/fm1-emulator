// Deliberately tiny bridge: firmware and recovery commands stay in the trusted
// Electron main process, and the renderer cannot execute arbitrary programs.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("FM1Desktop", {
  openFlasher: () => ipcRenderer.invoke("fm1:open-flasher"),
  usbCheck: () => ipcRenderer.invoke("fm1:usb-check"),
  repairFm1Usb: (opts) => ipcRenderer.invoke("fm1:usb-repair", opts || {}),
  checkUpdates: () => ipcRenderer.invoke("fm1:check-updates"),
  setPowerActive: (on) => ipcRenderer.invoke("fm1:power-active", !!on),
  // One-shot: Tape → Mic → Feed confirm arms mic permission for the next prompt only.
  allowMicOnce: () => ipcRenderer.invoke("fm1:allow-mic-once"),
});
