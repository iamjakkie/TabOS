import { contextBridge, ipcRenderer } from 'electron';
import type { BrowserCommand, BrowserLayout, BrowserSnapshot, TabOSBridge } from '../shared/browser';

const bridge: TabOSBridge = {
  getSnapshot: () => ipcRenderer.invoke('browser:get-snapshot') as Promise<BrowserSnapshot>,
  command: (command: BrowserCommand) => ipcRenderer.invoke('browser:command', command) as Promise<BrowserSnapshot>,
  setLayout: (layout: BrowserLayout) => ipcRenderer.invoke('browser:set-layout', layout) as Promise<void>,
  onFocusAddress: (listener: () => void) => {
    const handler = () => listener();
    ipcRenderer.on('browser:focus-address', handler);
    return () => ipcRenderer.removeListener('browser:focus-address', handler);
  },
  subscribe: (listener: (snapshot: BrowserSnapshot) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: BrowserSnapshot) => listener(snapshot);
    ipcRenderer.on('browser:snapshot', handler);
    return () => ipcRenderer.removeListener('browser:snapshot', handler);
  },
};

contextBridge.exposeInMainWorld('tabos', bridge);
