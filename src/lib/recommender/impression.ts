export type ImpressionTimer = {
  set(callback: () => void, delayMs: number): unknown;
  clear(timer: unknown): void;
};

const browserTimer: ImpressionTimer = {
  set: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clear: (timer) => window.clearTimeout(timer as number),
};

export class ImpressionVisibilityController {
  private timerId: unknown;
  private fired = false;
  private disposed = false;

  constructor(
    private readonly onImpression: () => void,
    private readonly timer: ImpressionTimer = browserTimer,
    private readonly minimumVisibleMs = 1_000,
  ) {}

  update(isAtLeastHalfVisible: boolean): void {
    if (this.disposed || this.fired) return;
    if (!isAtLeastHalfVisible) {
      this.cancelTimer();
      return;
    }
    if (this.timerId !== undefined) return;
    this.timerId = this.timer.set(() => {
      this.timerId = undefined;
      if (this.disposed || this.fired) return;
      this.fired = true;
      this.onImpression();
    }, this.minimumVisibleMs);
  }

  dispose(): void {
    this.disposed = true;
    this.cancelTimer();
  }

  private cancelTimer(): void {
    if (this.timerId === undefined) return;
    this.timer.clear(this.timerId);
    this.timerId = undefined;
  }
}
