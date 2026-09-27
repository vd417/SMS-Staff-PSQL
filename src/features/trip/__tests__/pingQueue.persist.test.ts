jest.mock('@react-native-async-storage/async-storage', () => {
  let mem: Record<string, string> = {};
  return { __esModule: true, default: {
    getItem: jest.fn((k: string) => Promise.resolve(mem[k] ?? null)),
    setItem: jest.fn((k: string, v: string) => { mem[k] = v; return Promise.resolve(); }),
    removeItem: jest.fn((k: string) => { delete mem[k]; return Promise.resolve(); }),
    clear: jest.fn(() => { mem = {}; return Promise.resolve(); }),
  } };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createPersistedPingBuffer } from '@/features/trip/pingQueue';

const KEY = 'sms.trip.pingQueue';

describe('createPersistedPingBuffer (survives app kill)', () => {
  afterEach(async () => { await AsyncStorage.clear(); });

  it('persists an enqueued item so a fresh buffer on the same key can recover it', async () => {
    const neverSends = async () => { throw new Error('offline'); };
    const buf = await createPersistedPingBuffer(neverSends, KEY);
    await buf.enqueue({ n: 1 });

    // Simulate the app process being killed before flush ever ran: a brand-new
    // buffer hydrated from the same storage key must see the queued ping.
    const rehydrated = await createPersistedPingBuffer(neverSends, KEY);
    expect(rehydrated.size()).toBe(1);
  });

  it('clears persisted storage once a flush succeeds', async () => {
    const sent: number[][] = [];
    const buf = await createPersistedPingBuffer(async (items: number[]) => { sent.push(items); }, KEY);
    await buf.enqueue(1);
    await buf.flush();

    const rehydrated = await createPersistedPingBuffer(async () => {}, KEY);
    expect(rehydrated.size()).toBe(0);
  });

  it('flushes in batches of at most 20, keeping unsent batches on failure', async () => {
    const sent: number[][] = [];
    let failNext = false;
    const buf = await createPersistedPingBuffer<number>(async (items) => {
      if (failNext) throw new Error('offline');
      sent.push(items);
    }, 'k.batch');
    for (let i = 0; i < 45; i += 1) await buf.enqueue(i);
    // enqueue does not flush by itself
    await buf.flush();
    expect(sent.map((b) => b.length)).toEqual([20, 20, 5]);
    expect(buf.size()).toBe(0);

    for (let i = 0; i < 25; i += 1) await buf.enqueue(i);
    failNext = true;
    await buf.flush();
    expect(buf.size()).toBe(25);
  });

  it('single-flights concurrent flushes so a slow POST cannot double-send or drop a backlog', async () => {
    const sent: number[][] = [];
    const sendBatch = async (items: number[]) => {
      // Long enough that a second flush() call (and a mid-flush enqueue) land before this resolves.
      await new Promise((r) => setTimeout(r, 20));
      sent.push(items);
    };
    const buf = await createPersistedPingBuffer<number>(sendBatch, 'k.concurrent');
    for (let i = 0; i < 25; i += 1) await buf.enqueue(i);

    const p1 = buf.flush();
    const p2 = buf.flush(); // requested while the first batch is still in flight
    expect(p2).toBe(p1); // same in-flight promise — no second run() loop started
    await buf.enqueue(25); // enqueued mid-flush; run()'s while loop must still pick it up

    await Promise.all([p1, p2]);

    // Every ping sent exactly once, in order, across however many batches it took.
    expect(sent.flat()).toEqual(Array.from({ length: 26 }, (_, i) => i));
    expect(buf.size()).toBe(0);
  });
});
