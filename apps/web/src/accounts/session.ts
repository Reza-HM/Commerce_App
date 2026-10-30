import type { Action, Result } from './api';

export type SessionState =
  'checking' | 'signedIn' | 'unavailable' | 'signingOut' | 'unconfirmed';
type Request = (
  action: Action,
  credentials: undefined,
  signal: AbortSignal,
) => Promise<Result>;

/** Transient presentation only. Every protected operation still needs API authorization. */
export class AccountSession {
  private state: SessionState = 'checking';
  private listeners = new Set<() => void>();
  private generation = 0;
  private work: AbortController | null = null;
  constructor(
    private readonly request: Request,
    private readonly navigate: (path: string) => void,
  ) {}
  snapshot = (): SessionState => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: SessionState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  stop() {
    this.generation++;
    this.work?.abort();
    this.work = null;
    if (this.state === 'signingOut') this.publish('unconfirmed');
  }
  async inspect() {
    if (this.work || this.state === 'unconfirmed' || this.state === 'signingOut') return;
    const generation = ++this.generation;
    const controller = new AbortController();
    this.work = controller;
    this.publish('checking');
    const result = await this.request('current', undefined, controller.signal);
    if (generation !== this.generation) return;
    this.work = null;
    if (result.ok) this.publish('signedIn');
    else if (result.code === 'credentials')
      this.navigate('/sign-in?reason=session-required');
    else this.publish('unavailable');
  }
  async signOut() {
    if (this.state === 'signingOut') return;
    this.stop();
    const generation = this.generation;
    const controller = new AbortController();
    this.work = controller;
    this.publish('signingOut');
    const result = await this.request('signOut', undefined, controller.signal);
    if (generation !== this.generation) return;
    this.work = null;
    if (result.ok) {
      this.publish('checking');
      this.navigate('/sign-in?reason=signed-out');
    } else this.publish('unconfirmed');
  }
}
