export interface KeyboardInput {
  key: string;
  meta: boolean;
  control: boolean;
  shift: boolean;
}

export type BrowserShortcut =
  | { type: 'new-tab' }
  | { type: 'close-active-tab' }
  | { type: 'focus-address' };

export function resolveBrowserShortcut(input: KeyboardInput): BrowserShortcut | null {
  if (!input.meta && !input.control) return null;
  switch (input.key.toLowerCase()) {
    case 't': return { type: 'new-tab' };
    case 'w': return { type: 'close-active-tab' };
    case 'l': return { type: 'focus-address' };
    default: return null;
  }
}
