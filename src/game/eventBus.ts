import type { GameEvent } from './types';

type Handler = (e: GameEvent) => void;

/**
 * Tiny pub/sub used by the engine to talk to the presentation layer
 * (VFX pool, audio engine, camera director, announcer) without the
 * simulation importing anything React/three related.
 */
export class EventBus {
  private handlers = new Set<Handler>();

  on(h: Handler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  emit(e: GameEvent): void {
    this.handlers.forEach((h) => h(e));
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const bus = new EventBus();
