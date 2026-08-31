export const READING_PROGRESS_MILESTONES = [25, 50, 75, 90] as const;

export type ReadingEngagementSnapshot = {
  activeSeconds: number;
  maxProgress: number;
  engaged: boolean;
};

type ReadingEngagementOptions = {
  expectedReadSeconds: number;
  onMilestone: (milestone: (typeof READING_PROGRESS_MILESTONES)[number], snapshot: ReadingEngagementSnapshot) => void;
  onEngaged: (snapshot: ReadingEngagementSnapshot) => void;
};

export function engagedTimeThreshold(expectedReadSeconds: number): number {
  return Math.min(15, Math.max(8, expectedReadSeconds * 0.25));
}

export function estimateReadSeconds(text: string): number {
  const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
  return Math.min(1_200, Math.max(20, (words / 200) * 60));
}

export class ReadingEngagementController {
  private documentVisible = false;
  private windowFocused = false;
  private articleVisible = false;
  private activeMs = 0;
  private maxProgress = 0;
  private engaged = false;
  private disposed = false;
  private readonly emittedMilestones = new Set<number>();

  constructor(private readonly options: ReadingEngagementOptions) {}

  setConditions(conditions: {
    documentVisible?: boolean;
    windowFocused?: boolean;
    articleVisible?: boolean;
  }): void {
    if (this.disposed) return;
    if (conditions.documentVisible !== undefined) this.documentVisible = conditions.documentVisible;
    if (conditions.windowFocused !== undefined) this.windowFocused = conditions.windowFocused;
    if (conditions.articleVisible !== undefined) this.articleVisible = conditions.articleVisible;
  }

  tick(elapsedMs = 1_000): void {
    if (this.disposed || !this.isActivelyReading()) return;
    this.activeMs += Math.max(0, Math.min(elapsedMs, 2_000));
    this.evaluateEngaged();
  }

  updateProgress(progress: number): void {
    if (this.disposed || !Number.isFinite(progress)) return;
    this.maxProgress = Math.max(this.maxProgress, Math.min(100, Math.max(0, progress)));
    for (const milestone of READING_PROGRESS_MILESTONES) {
      if (this.maxProgress >= milestone && !this.emittedMilestones.has(milestone)) {
        this.emittedMilestones.add(milestone);
        this.options.onMilestone(milestone, this.snapshot());
      }
    }
    this.evaluateEngaged();
  }

  snapshot(): ReadingEngagementSnapshot {
    return {
      activeSeconds: Math.floor(this.activeMs / 1_000),
      maxProgress: Math.round(this.maxProgress),
      engaged: this.engaged,
    };
  }

  dispose(): void {
    this.disposed = true;
  }

  private isActivelyReading(): boolean {
    return this.documentVisible && this.windowFocused && this.articleVisible;
  }

  private evaluateEngaged(): void {
    if (this.engaged) return;
    const activeSeconds = this.activeMs / 1_000;
    const enoughTime = activeSeconds >= engagedTimeThreshold(this.options.expectedReadSeconds);
    const qualitySignal = this.maxProgress >= 50 && activeSeconds >= 5;
    if (!enoughTime && !qualitySignal) return;
    this.engaged = true;
    this.options.onEngaged(this.snapshot());
  }
}
