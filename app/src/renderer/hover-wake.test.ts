import { describe, expect, it, vi } from 'vitest';
import { createHoverWakeController } from './hover-wake';

describe('hover wake controller', () => {
  it('wakes a tab after it remains hovered for two seconds', () => {
    vi.useFakeTimers();
    const wake = vi.fn();
    const controller = createHoverWakeController(wake, 2_000);

    controller.enter('cold-tab');
    vi.advanceTimersByTime(1_999);
    expect(wake).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(wake).toHaveBeenCalledWith('cold-tab');
    vi.useRealTimers();
  });

  it('cancels wake when pointer leaves before the delay', () => {
    vi.useFakeTimers();
    const wake = vi.fn();
    const controller = createHoverWakeController(wake, 2_000);

    controller.enter('cold-tab');
    vi.advanceTimersByTime(1_000);
    controller.leave('cold-tab');
    vi.advanceTimersByTime(2_000);
    expect(wake).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
}
);
