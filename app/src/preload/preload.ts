import { contextBridge, ipcRenderer } from 'electron';
import type { BrowserCommand, BrowserLayout, BrowserSnapshot, TabOSBridge } from '../shared/browser';
import type {
  AddEdgeInput, AddNodeInput, CreatePathInput, CreateResourceInput, LogSessionInput, RecordProgressInput,
  SetPlanInput, StudyBridge, StudyExport, StudyNodeProgress, StudyPath, StudyPathDetail,
  StudyPathEdge, StudyPathNode, StudyPathStats, StudySession, UpdateNodePositionInput,
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
  addResourcesBulk: (pathId: string, resources: CreateResourceInput[]) => ipcRenderer.invoke('study:add-resources-bulk', pathId, resources) as Promise<StudyPathNode[]>,
  recordProgress: (input: RecordProgressInput) => ipcRenderer.invoke('study:record-progress', input) as Promise<StudyNodeProgress>,
  logSession: (input: LogSessionInput) => ipcRenderer.invoke('study:log-session', input) as Promise<StudySession>,
  updateNodePosition: (input: UpdateNodePositionInput) => ipcRenderer.invoke('study:update-node-position', input) as Promise<void>,
  addEdge: (input: AddEdgeInput) => ipcRenderer.invoke('study:add-edge', input) as Promise<StudyPathEdge>,
  removeEdge: (edgeId: string) => ipcRenderer.invoke('study:remove-edge', edgeId) as Promise<void>,
  setPlan: (input: SetPlanInput) => ipcRenderer.invoke('study:set-plan', input) as Promise<StudyPathDetail | null>,
  planWithAI: (pathId: string) => ipcRenderer.invoke('study:plan-ai', pathId) as Promise<StudyPathDetail | null>,
  exportAll: () => ipcRenderer.invoke('study:export') as Promise<StudyExport>,
};

contextBridge.exposeInMainWorld('study', studyBridge);
