import { asyncStore } from '@/lib/asyncStore';

export interface Sample { lat: number; lng: number; at: number; }

const R = 6_371_000; // earth radius (m)
export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Battery-friendly gate: publish if enough time passed OR the bus moved far enough.
export function shouldPublish(
  last: Sample | null,
  next: Sample,
  cadenceMs: number,
  minMeters: number,
): boolean {
  if (!last) return true;
  if (next.at - last.at >= cadenceMs) return true;
  if (haversineMeters(last, next) >= minMeters) return true;
  return false;
}

export interface PingBuffer<T> {
  enqueue(item: T): void;
  flush(): Promise<void>;
  size(): number;
}

// FIFO buffer that flushes via `send`; on failure it keeps unsent items for the next flush.
export function createPingBuffer<T>(send: (item: T) => Promise<void>): PingBuffer<T> {
  let queue: T[] = [];
  return {
    enqueue(item) { queue.push(item); },
    size() { return queue.length; },
    async flush() {
      const pending = [...queue];
      const remaining: T[] = [];
      for (let i = 0; i < pending.length; i += 1) {
        try {
          await send(pending[i]);
        } catch {
          remaining.push(...pending.slice(i));
          break;
        }
      }
      queue = remaining;
    },
  };
}

export interface PersistedPingBuffer<T> {
  enqueue(item: T): Promise<void>;
  flush(): Promise<void>;
  size(): number;
}

// Same FIFO semantics as createPingBuffer, but mirrored to disk on every mutation so a killed
// app doesn't drop GPS pings, and flushed in batches (sms-api's pings endpoint is batch-only).
export async function createPersistedPingBuffer<T>(
  sendBatch: (items: T[]) => Promise<void>,
  storageKey: string,
  batchSize = 20,
): Promise<PersistedPingBuffer<T>> {
  let queue: T[] = (await asyncStore.get<T[]>(storageKey)) ?? [];
  const persist = () => asyncStore.set(storageKey, queue);
  // A slow POST (no client-side timeout) can outlast the 10 s ping cadence, so a second
  // flush() can be requested while one is still running. Without this guard, both calls
  // would slice the same queue.slice(0, batchSize): duplicate sends, and the second flush's
  // `queue = queue.slice(batch.length)` drops whatever the first flush hadn't sent yet.
  // Single-flighting flush() means only one run() loop is ever in progress, and its
  // `while (queue.length)` loop picks up anything enqueued while it was running.
  let inFlight: Promise<void> | null = null;

  async function run(): Promise<void> {
    while (queue.length > 0) {
      const batch = queue.slice(0, batchSize);
      try {
        await sendBatch(batch);
      } catch {
        break;
      }
      queue = queue.slice(batch.length);
      await persist();
    }
  }

  return {
    async enqueue(item) {
      queue.push(item);
      await persist();
    },
    size() { return queue.length; },
    flush() {
      if (!inFlight) {
        inFlight = run().finally(() => { inFlight = null; });
      }
      return inFlight;
    },
  };
}
