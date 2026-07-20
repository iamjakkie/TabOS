import path from 'node:path';
import { app, BaseWindow, ipcMain, Menu, session, WebContentsView } from 'electron';
import type { BrowserCommand, BrowserLayout } from '../shared/browser';
import type { AddNodeInput, CreatePathInput, LogSessionInput, RecordProgressInput } from '../shared/study';
import { BrowserManager } from './browser-manager';
import { SnapshotRepository } from './snapshot-repository';
import { StudyRepository } from './study-repository';

let mainWindow: BaseWindow | null = null;
let shellView: WebContentsView | null = null;
let browserManager: BrowserManager | null = null;
let repository: SnapshotRepository | null = null;
let studyRepository: StudyRepository | null = null;

let browserLayout: BrowserLayout = { topInset: 52, brainHeight: 0 };

function updateLayout(): void {
  if (!mainWindow || !shellView || !browserManager) return;
  const { width, height } = mainWindow.getContentBounds();
  shellView.setBounds({ x: 0, y: 0, width, height });
  browserManager.setBounds({
    x: 0,
    y: browserLayout.topInset,
    width,
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
    };
    updateLayout();
  });

  for (const channel of [
    'study:list-paths', 'study:get-detail', 'study:create-path',
    'study:add-node', 'study:record-progress', 'study:log-session', 'study:export',
  ]) ipcMain.removeHandler(channel);

  ipcMain.handle('study:list-paths', () => studyRepository?.listPaths() ?? []);
  ipcMain.handle('study:get-detail', (_event, pathId: string) => studyRepository?.getPathDetail(pathId) ?? null);
  ipcMain.handle('study:create-path', (_event, input: CreatePathInput) => studyRepository?.createPath(input));
  ipcMain.handle('study:add-node', (_event, input: AddNodeInput) => studyRepository?.addNode(input));
  ipcMain.handle('study:record-progress', (_event, input: RecordProgressInput) => studyRepository?.recordProgress(input));
  ipcMain.handle('study:log-session', (_event, input: LogSessionInput) => studyRepository?.logSession(input));
  ipcMain.handle('study:export', () => studyRepository?.exportAll());

  const rendererPath = path.join(__dirname, '../../renderer/index.html');
  await shellView.webContents.loadFile(rendererPath);
  await browserManager.initialize();
  updateLayout();

  mainWindow.on('resize', updateLayout);
  mainWindow.on('closed', () => {
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
  browserManager?.destroy();
  repository?.close();
  repository = null;
  studyRepository?.close();
  studyRepository = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
