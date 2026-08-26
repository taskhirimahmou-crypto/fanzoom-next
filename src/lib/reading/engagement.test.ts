import { describe, expect, it, vi } from 'vitest';
import { ReadingEngagementController, engagedTimeThreshold, estimateReadSeconds } from './engagement';

describe('engaged reading controller', () => {
  it('counts time only while visible, focused, and intersecting', () => {
    const controller = new ReadingEngagementController({ expectedReadSeconds: 120, onMilestone: vi.fn(), onEngaged: vi.fn() });
    controller.setConditions({ documentVisible: true, windowFocused: true, articleVisible: false });
    controller.tick();
    controller.setConditions({ articleVisible: true });
    controller.tick();
    controller.setConditions({ documentVisible: false });
    controller.tick(10_000);
    controller.setConditions({ documentVisible: true, windowFocused: false });
    controller.tick();
    controller.setConditions({ windowFocused: true });
    controller.tick();
    expect(controller.snapshot().activeSeconds).toBe(2);
  });

  it('emits milestones once across backwards scrolls and return', () => {
    const onMilestone = vi.fn();
    const controller = new ReadingEngagementController({ expectedReadSeconds: 120, onMilestone, onEngaged: vi.fn() });
    controller.updateProgress(52);
    controller.updateProgress(10);
    controller.updateProgress(76);
    controller.updateProgress(76);
    expect(onMilestone.mock.calls.map(([milestone]) => milestone)).toEqual([25, 50, 75]);
    expect(controller.snapshot().maxProgress).toBe(76);
  });

  it('supports short articles, emits engaged once, and stops after unmount', () => {
    const onEngaged = vi.fn();
    const controller = new ReadingEngagementController({ expectedReadSeconds: estimateReadSeconds('کوتاه'), onMilestone: vi.fn(), onEngaged });
    expect(engagedTimeThreshold(20)).toBe(8);
    controller.setConditions({ documentVisible: true, windowFocused: true, articleVisible: true });
    for (let index = 0; index < 8; index += 1) controller.tick();
    controller.tick();
    controller.dispose();
    controller.tick();
    expect(onEngaged).toHaveBeenCalledTimes(1);
    expect(controller.snapshot().activeSeconds).toBe(9);
  });

  it('can qualify through progress plus active time without counting a background tab', () => {
    const onEngaged = vi.fn();
    const controller = new ReadingEngagementController({ expectedReadSeconds: 600, onMilestone: vi.fn(), onEngaged });
    controller.setConditions({ documentVisible: false, windowFocused: true, articleVisible: true });
    controller.updateProgress(60);
    for (let index = 0; index < 10; index += 1) controller.tick();
    expect(onEngaged).not.toHaveBeenCalled();
    controller.setConditions({ documentVisible: true });
    for (let index = 0; index < 5; index += 1) controller.tick();
    expect(onEngaged).toHaveBeenCalledTimes(1);
  });
});
