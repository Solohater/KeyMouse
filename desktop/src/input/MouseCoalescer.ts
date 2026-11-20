import { InputBackend } from '../platform/InputBackend';

export class MouseCoalescer {
  private pendingDx = 0;
  private pendingDy = 0;
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private flushIntervalMs = 10; // ~100Hz

  constructor(private backend: InputBackend) {}

  addDelta(dx: number, dy: number): void {
    this.pendingDx += dx;
    this.pendingDy += dy;

    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.flushIntervalMs);
    }
  }

  private async flush(): Promise<void> {
    this.timer = null;
    const dx = this.pendingDx;
    const dy = this.pendingDy;
    this.pendingDx = 0;
    this.pendingDy = 0;

    if (dx === 0 && dy === 0) return;

    this.isProcessing = true;
    try {
      await this.backend.moveMouse(dx, dy);
    } catch (err: any) {
      console.error('Error in mouse move:', err.message);
    } finally {
      this.isProcessing = false;
    }
  }

  reset(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pendingDx = 0;
    this.pendingDy = 0;
  }
}
