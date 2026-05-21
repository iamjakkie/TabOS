// Mock Chrome extension APIs for test environment
const chromeMock = {
  storage: {
    local: {
      get: (_keys: unknown, cb: (result: Record<string, unknown>) => void) => cb({}),
      set: (_data: unknown, cb?: () => void) => cb?.(),
    },
  },
  runtime: {
    sendMessage: () => Promise.resolve(),
    onMessage: { addListener: () => {} },
    onInstalled: { addListener: () => {} },
    onStartup: { addListener: () => {} },
    getManifest: () => ({ version: '0.1.0' }),
  },
  tabs: {
    query: () => Promise.resolve([]),
    create: () => Promise.resolve({ id: 1 }),
    remove: () => Promise.resolve(),
    onCreated: { addListener: () => {} },
    onUpdated: { addListener: () => {} },
    onActivated: { addListener: () => {} },
    onRemoved: { addListener: () => {} },
  },
  windows: {
    onFocusChanged: { addListener: () => {} },
    WINDOW_ID_NONE: -1,
  },
  alarms: {
    create: () => {},
    clear: () => Promise.resolve(true),
    get: () => Promise.resolve(undefined),
    onAlarm: { addListener: () => {} },
  },
  notifications: {
    create: () => {},
  },
  sidePanel: {
    open: () => Promise.resolve(),
  },
  scripting: {
    executeScript: () => Promise.resolve([]),
  },
  contextMenus: {
    create: () => {},
    removeAll: (_cb: () => void) => _cb(),
    onClicked: { addListener: () => {} },
  },
  downloads: {
    download: () => {},
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).chrome = chromeMock;
