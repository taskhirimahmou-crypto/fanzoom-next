import { describe, expect, it, vi } from 'vitest';
import { ImpressionVisibilityController, type ImpressionTimer } from './impression';

function fakeTimer() {
  let callback: (() => void) | undefined;
  const timer: ImpressionTimer = {
    set: vi.fn((next) => { callback = next; return 1; }),
    clear: vi.fn(() => { callback = undefined; }),
  };
  return { timer, fire: () => callback?.() };
}

describe('impression visibility controller', () => {
  it('requires continuous 50% visibility and emits once', () => {
    const onImpression = vi.fn();
    const { timer, fire } = fakeTimer();
    const controller = new ImpressionVisibilityController(onImpression, timer);

    controller.update(true);
    controller.update(false);
    fire();
    expect(onImpression).not.toHaveBeenCalled();

    controller.update(true);
    fire();
    controller.update(true);
    fire();
    expect(onImpression).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending timer on unmount and permits a clean Strict Mode remount', () => {
    const onImpression = vi.fn();
    const firstTimer = fakeTimer();
    const first = new ImpressionVisibilityController(onImpression, firstTimer.timer);
    first.update(true);
    first.dispose();
    firstTimer.fire();

    const secondTimer = fakeTimer();
    const remount = new ImpressionVisibilityController(onImpression, secondTimer.timer);
    remount.update(true);
    secondTimer.fire();
    expect(onImpression).toHaveBeenCalledTimes(1);
  });
});
