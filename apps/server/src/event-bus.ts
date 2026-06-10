export interface StreamMessage {
  type: 'event' | 'events' | 'session';
  payload: unknown;
}

export class EventBus {
  private readonly listeners = new Set<(message: StreamMessage) => void>();

  subscribe(listener: (message: StreamMessage) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(message: StreamMessage): void {
    for (const listener of this.listeners) {
      try {
        listener(message);
      } catch {
        this.listeners.delete(listener);
      }
    }
  }
}
