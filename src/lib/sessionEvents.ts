type Listener = () => void;
const listeners = new Set<Listener>();

/** Fired when the refresh token is rejected — the app must drop back to Login. */
export const sessionEvents = {
  onExpired(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  emitExpired(): void {
    listeners.forEach((l) => l());
  },
};
