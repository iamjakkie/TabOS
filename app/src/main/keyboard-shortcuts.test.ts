import { describe, expect, it } from 'vitest';
import { resolveBrowserShortcut } from './keyboard-shortcuts';

const key = (input: string, modifiers: Partial<{ meta: boolean; control: boolean; shift: boolean }> = {}) => ({
  key: input,
  meta: false,
  control: false,
  shift: false,
  ...modifiers,
});

describe('browser keyboard shortcuts', () => {
  it('creates a tab with Cmd+T or Ctrl+T', () => {
    expect(resolveBrowserShortcut(key('t', { meta: true }))).toEqual({ type: 'new-tab' });
    expect(resolveBrowserShortcut(key('T', { control: true }))).toEqual({ type: 'new-tab' });
  });

  it('closes the active tab with Cmd+W or Ctrl+W', () => {
    expect(resolveBrowserShortcut(key('w', { meta: true }))).toEqual({ type: 'close-active-tab' });
    expect(resolveBrowserShortcut(key('w', { control: true }))).toEqual({ type: 'close-active-tab' });
  });

  it('focuses the address bar with Cmd+L or Ctrl+L', () => {
    expect(resolveBrowserShortcut(key('l', { meta: true }))).toEqual({ type: 'focus-address' });
    expect(resolveBrowserShortcut(key('l', { control: true }))).toEqual({ type: 'focus-address' });
  });

  it('does not intercept unmodified keys', () => {
    expect(resolveBrowserShortcut(key('t'))).toBeNull();
  });
});
