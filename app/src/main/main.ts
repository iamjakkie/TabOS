import path from 'node:path';
import { app, BaseWindow, ipcMain, Menu, session, WebContentsView } from 'electron';
import type { BrowserCommand, BrowserLayout } from '../shared/browser';
import type { AddEdgeInput, AddNodeInput, CreatePathInput, CreateResourceInput, LogSessionInput, RecordProgressInput, SetPlanInput, StudyExport, UpdateNodePositionInput } from '../shared/study';
import { BrowserManager } from './browser-manager';
import { SnapshotRepository } from './snapshot-repository';
import { StudyRepository } from './study-repository';
import { loadLocalEnv } from './load-env';

loadLocalEnv(app.getAppPath());

let mainWindow: BaseWindow | null = null;
let shellView: WebContentsView | null = null;
let browserManager: BrowserManager | null = null;
let repository: SnapshotRepository | null = null;
let studyRepository: StudyRepository | null = null;
let usageTimer: ReturnType<typeof setInterval> | null = null;

let browserLayout: BrowserLayout = { topInset: 52, brainHeight: 0, contentHidden: false, leftInset: 0 };

function updateLayout(): void {
  if (!mainWindow || !shellView || !browserManager) return;
  const { width, height } = mainWindow.getContentBounds();
  shellView.setBounds({ x: 0, y: 0, width, height });
  if (browserLayout.contentHidden) {
    // Study Mode (or any full-screen shell UI) owns the viewport: collapse the
    // native browser view so the DOM shell renders unobstructed.
    browserManager.setBounds({ x: 0, y: browserLayout.topInset, width: 0, height: 0 });
    return;
  }
  const left = browserLayout.leftInset ?? 0;
  browserManager.setBounds({
    x: left,
    y: browserLayout.topInset,
    width: Math.max(0, width - left),
    height: Math.max(0, height - browserLayout.topInset - browserLayout.brainHeight),
  });
}

async function createWindow(): Promise<void> {
  mainWindow = new BaseWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    title: 'TabOS',
    backgroundColor: '#070b14',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 13, y: 17 },
  });

  shellView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  shellView.setBackgroundColor('#070b14');
  mainWindow.contentView.addChildView(shellView);

  const profile = session.fromPartition('persist:tabos-browser', { cache: true });
  profile.setPermissionRequestHandler((_webContents, permission, callback) => {
    const safeByDefault = new Set(['clipboard-sanitized-write', 'fullscreen', 'pointerLock']);
    callback(safeByDefault.has(permission));
  });

  repository ??= await SnapshotRepository.open(path.join(app.getPath('userData'), 'tabos.db'));
  studyRepository ??= await StudyRepository.open(path.join(app.getPath('userData'), 'tabos-study.db'));
  browserManager = new BrowserManager(mainWindow, profile, repository);
  browserManager.setSnapshotListener((snapshot) => {
    if (!shellView?.webContents.isDestroyed()) {
      shellView?.webContents.send('browser:snapshot', snapshot);
    }
  });

  // Stream live per-tab resource usage (CPU%, renderer memory) to the sidebar.
  // Only tabs with a live renderer produce metrics; cold tabs are omitted.
  if (usageTimer) clearInterval(usageTimer);
  usageTimer = setInterval(() => {
    if (!browserManager || !shellView || shellView.webContents.isDestroyed()) return;
    const pidToTab = browserManager.getLiveProcessMap();
    if (pidToTab.size === 0) { shellView.webContents.send('browser:usage', []); return; }
    const usage = app.getAppMetrics().flatMap((metric) => {
      const tabId = pidToTab.get(metric.pid);
      if (!tabId) return [];
      const memoryMB = metric.memory ? Math.round(metric.memory.workingSetSize / 1024) : 0;
      return [{ tabId, cpu: Math.round((metric.cpu?.percentCPUUsage ?? 0) * 10) / 10, memoryMB }];
    });
    shellView.webContents.send('browser:usage', usage);
  }, 1500);

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => void browserManager?.handle({ type: 'new-tab' }) },
        {
          label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => {
            const activeTabId = browserManager?.getSnapshot().activeTabId;
            if (activeTabId) void browserManager?.handle({ type: 'close-tab', tabId: activeTabId });
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Navigate',
      submenu: [
        { label: 'Focus Address Bar', accelerator: 'CmdOrCtrl+L', click: () => shellView?.webContents.send('browser:focus-address') },
        { role: 'reload' },
        { role: 'toggleDevTools' },
      ],
    },
  ]));

  ipcMain.removeHandler('browser:get-snapshot');
  ipcMain.removeHandler('browser:command');
  ipcMain.removeHandler('browser:set-layout');
  ipcMain.handle('browser:get-snapshot', () => browserManager?.getSnapshot());
  ipcMain.handle('browser:command', (_event, command: BrowserCommand) => browserManager?.handle(command));
  ipcMain.handle('browser:set-layout', (_event, layout: BrowserLayout) => {
    browserLayout = {
      topInset: Math.max(44, Math.min(120, Math.round(layout.topInset))),
      brainHeight: Math.max(0, Math.round(layout.brainHeight)),
      contentHidden: layout.contentHidden === true,
      leftInset: Math.max(0, Math.min(600, Math.round(layout.leftInset ?? 0))),
    };
    updateLayout();
  });

  for (const channel of [
    'study:list-paths', 'study:get-detail', 'study:create-path',
    'study:add-node', 'study:add-resources-bulk', 'study:record-progress', 'study:log-session',
    'study:update-node-position', 'study:add-edge', 'study:remove-edge', 'study:set-plan',
    'study:plan-ai', 'study:tidy', 'study:archive-path', 'study:export', 'study:import',
  ]) ipcMain.removeHandler(channel);

  ipcMain.handle('study:list-paths', () => studyRepository?.listPaths() ?? []);
  ipcMain.handle('study:get-detail', (_event, pathId: string) => studyRepository?.getPathDetail(pathId) ?? null);
  ipcMain.handle('study:create-path', (_event, input: CreatePathInput) => studyRepository?.createPath(input));
  ipcMain.handle('study:add-node', (_event, input: AddNodeInput) => studyRepository?.addNode(input));
  ipcMain.handle('study:add-resources-bulk', (_event, pathId: string, resources: CreateResourceInput[]) => studyRepository?.addResourcesBulk(pathId, resources));
  ipcMain.handle('study:record-progress', (_event, input: RecordProgressInput) => studyRepository?.recordProgress(input));
  ipcMain.handle('study:log-session', (_event, input: LogSessionInput) => studyRepository?.logSession(input));
  ipcMain.handle('study:update-node-position', (_event, input: UpdateNodePositionInput) => studyRepository?.updateNodePosition(input));
  ipcMain.handle('study:add-edge', (_event, input: AddEdgeInput) => studyRepository?.addEdge(input));
  ipcMain.handle('study:remove-edge', (_event, edgeId: string) => studyRepository?.removeEdge(edgeId));
  ipcMain.handle('study:set-plan', (_event, input: SetPlanInput) => studyRepository?.setPlan(input) ?? null);
  ipcMain.handle('study:plan-ai', (_event, pathId: string) => studyRepository?.planWithAI(pathId) ?? null);
  ipcMain.handle('study:tidy', (_event, pathId: string) => studyRepository?.tidyLayout(pathId) ?? null);
  ipcMain.handle('study:archive-path', (_event, pathId: string) => studyRepository?.archivePath(pathId));
  ipcMain.handle('study:export', () => studyRepository?.exportAll());
  ipcMain.handle('study:import', (_event, data: StudyExport) => studyRepository?.importAll(data));

  const rendererPath = path.join(__dirname, '../../renderer/index.html');
  await shellView.webContents.loadFile(rendererPath);
  await browserManager.initialize();
  updateLayout();

  mainWindow.on('resize', updateLayout);
  mainWindow.on('closed', () => {
    if (usageTimer) { clearInterval(usageTimer); usageTimer = null; }
    browserManager?.destroy();
    browserManager = null;
    shellView = null;
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await createWindow();
  app.on('activate', () => {
    if (!mainWindow) void createWindow();
  });
});

app.on('before-quit', () => {
  if (usageTimer) { clearInterval(usageTimer); usageTimer = null; }
  browserManager?.destroy();
  repository?.close();
  repository = null;
  studyRepository?.close();
  studyRepository = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
