import { getAllTabs, getAllWorkspaces } from '../store/db';

export async function broadcastTabsUpdate(): Promise<void> {
  const entries = await getAllTabs();
  chrome.runtime.sendMessage({ type: 'TABS_UPDATED', payload: { entries } }).catch(() => {});
}

export async function broadcastWorkspacesUpdate(): Promise<void> {
  const workspaces = await getAllWorkspaces();
  chrome.runtime.sendMessage({ type: 'WORKSPACES_UPDATED', payload: { workspaces } }).catch(() => {});
}
