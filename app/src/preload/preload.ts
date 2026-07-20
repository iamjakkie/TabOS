import { contextBridge, ipcRenderer } from 'electron';
import type { BrowserCommand, BrowserLayout, BrowserSnapshot, TabOSBridge } from '../shared/browser';
import type {
  AddNodeInput, CreatePathInput, LogSessionInput, RecordProgressInput,
  StudyBridge, StudyExport, StudyNodeProgress, StudyPath, StudyPathDetail,
  StudyPathNode, StudyPathStats, StudySession,
} from '../shared/study';

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

const studyBridge: StudyBridge = {
  listPaths: () => ipcRenderer.invoke('study:list-paths') as Promise<Array<{ path: StudyPath; stats: StudyPathStats }>>,
  getPathDetail: (pathId: string) => ipcRenderer.invoke('study:get-detail', pathId) as Promise<StudyPathDetail | null>,
  createPath: (input: CreatePathInput) => ipcRenderer.invoke('study:create-path', input) as Promise<StudyPath>,
  addNode: (input: AddNodeInput) => ipcRenderer.invoke('study:add-node', input) as Promise<StudyPathNode>,
  recordProgress: (input: RecordProgressInput) => ipcRenderer.invoke('study:record-progress', input) as Promise<StudyNodeProgress>,
  logSession: (input: LogSessionInput) => ipcRenderer.invoke('study:log-session', input) as Promise<StudySession>,
  exportAll: () => ipcRenderer.invoke('study:export') as Promise<StudyExport>,
};

contextBridge.exposeInMainWorld('study', studyBridge);
