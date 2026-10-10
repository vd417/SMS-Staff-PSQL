import { httpChat } from '@/data/http/chat.repo';
import type { HttpClient } from '@/lib/httpClient';

function fakeHttp(routes: Record<string, unknown>) {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const http: HttpClient = {
    get: async <T>(path: string) => { calls.push({ method: 'GET', path }); return routes[`GET ${path}`] as T; },
    post: async <T>(path: string, body?: unknown) => { calls.push({ method: 'POST', path, body }); return routes[`POST ${path}`] as T; },
    patch: async <T>() => undefined as T,
    delete: async <T>() => undefined as T,
  };
  return { http, calls };
}

describe('httpChat', () => {
  it('maps the thread list (snake_case) to domain ChatThread', async () => {
    const { http } = fakeHttp({
      'GET /threads': [
        { id: 't1', name: 'Principal', role: 'school.principal', last_message: 'Please call', last_at: '2026-10-10T06:00:00Z', unread: 2 },
        { id: 't2', name: 'Office', role: null, last_message: null, last_at: null, unread: 0 },
      ],
    });
    const threads = await httpChat(http).threads();
    expect(threads[0]).toEqual({ id: 't1', name: 'Principal', role: 'school.principal', lastMessage: 'Please call', lastAt: '2026-10-10T06:00:00Z', unread: 2 });
    expect(threads[1]).toEqual({ id: 't2', name: 'Office', unread: 0 });
  });

  it('maps messages and marks is_mine', async () => {
    const { http } = fakeHttp({
      'GET /threads/t1/messages': [
        { id: 'm1', text: 'Hi', sent_at: '2026-10-10T06:00:00Z', is_mine: false, image_url: null },
        { id: 'm2', text: 'On my way', sent_at: '2026-10-10T06:01:00Z', is_mine: true, image_url: null },
      ],
    });
    const msgs = await httpChat(http).messages('t1');
    expect(msgs[0]).toEqual({ id: 'm1', text: 'Hi', sentAt: '2026-10-10T06:00:00Z', isMine: false });
    expect(msgs[1].isMine).toBe(true);
  });

  it('sends a trimmed message to the thread and maps the response', async () => {
    const { http, calls } = fakeHttp({
      'POST /threads/t1/messages': { id: 'm3', text: 'Running late', sent_at: '2026-10-10T06:02:00Z', is_mine: true, image_url: null },
    });
    const sent = await httpChat(http).send('t1', '  Running late  ');
    expect(calls[0]).toEqual({ method: 'POST', path: '/threads/t1/messages', body: { text: 'Running late', image_url: null } });
    expect(sent).toEqual({ id: 'm3', text: 'Running late', sentAt: '2026-10-10T06:02:00Z', isMine: true });
  });
});
