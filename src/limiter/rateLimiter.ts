export class RateLimiter {
  private active = 0

  constructor(private readonly maxConcurrent: number) {}

  async acquire(): Promise<boolean> {
    if (this.active >= this.maxConcurrent) {
      return false
    }

    this.active += 1
    return true
  }

  release(): void {
    if (this.active > 0) {
      this.active -= 1
    }
  }
}
