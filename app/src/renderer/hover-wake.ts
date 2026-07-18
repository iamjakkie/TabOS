export interface HoverWakeController {
  enter(tabId: string): void;
  leave(tabId: string): void;
  clear(): void;
}

export function createHoverWakeController(
  onWake: (tabId: string) => void,
  delayMs = 2_000,
): HoverWakeController {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  return {
    enter(tabId) {
      const previous = timers.get(tabId);
      if (previous) clearTimeout(previous);
      const timer = setTimeout(() => {
        timers.delete(tabId);
        onWake(tabId);
      }, delayMs);
      timers.set(tabId, timer);
    },
    leave(tabId) {
      const timer = timers.get(tabId);
      if (timer) clearTimeout(timer);
      timers.delete(tabId);
    },
    clear() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
}
