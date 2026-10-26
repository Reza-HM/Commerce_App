export class RegistrationRejection extends Error {
  constructor(readonly status: 429 | 503, readonly retryAfter: number) {
    super('Request rejected');
  }
}

export class RegistrationAdmission {
  private readonly peers = new Map<string, {expires: number; attempts: number}>();
  private active = 0;
  private closing = false;
  private readonly waiters = new Set<() => void>();

  constructor(private readonly now: () => number = () => performance.now()) {}

  admit(directPeer: string): void {
    if (this.closing) throw new RegistrationRejection(503, 1);
    const now = this.now();
    for (const [peer, bucket] of this.peers) if (bucket.expires <= now) this.peers.delete(peer);
    const peer = directPeer.toLowerCase().replace(/^::ffff:/, '');
    let bucket = this.peers.get(peer);
    if (!bucket) {
      if (this.peers.size >= 1024) {
        const earliest = Math.min(...[...this.peers.values()].map(value => value.expires));
        throw new RegistrationRejection(429, Math.max(1, Math.ceil((earliest - now) / 1000)));
      }
      bucket = {expires: now + 60000, attempts: 0};
      this.peers.set(peer, bucket);
    }
    if (bucket.attempts >= 5) throw new RegistrationRejection(429, Math.max(1, Math.ceil((bucket.expires - now) / 1000)));
    bucket.attempts++;
  }

  acquire(): () => void {
    if (this.closing || this.active >= 2) throw new RegistrationRejection(503, 1);
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      if (this.active === 0) { for (const resolve of this.waiters) resolve(); this.waiters.clear(); }
    };
  }

  stop(): void { this.closing = true; }
  drain(): Promise<void> {
    if (this.active === 0) return Promise.resolve();
    return new Promise(resolve => { this.waiters.add(resolve); });
  }
}
