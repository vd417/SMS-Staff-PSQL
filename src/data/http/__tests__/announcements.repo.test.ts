import { httpAnnouncements } from '@/data/http/announcements.repo';
import type { HttpClient } from '@/lib/httpClient';

function fakeHttp(routes: Record<string, unknown>) {
  const http: HttpClient = {
    get: async <T>(path: string) => routes[`GET ${path}`] as T,
    post: async <T>() => undefined as T,
    patch: async <T>() => undefined as T,
    delete: async <T>() => undefined as T,
  };
  return { http };
}

describe('httpAnnouncements', () => {
  it('maps the announcements feed (snake_case, nullable fields) to domain', async () => {
    const { http } = fakeHttp({
      'GET /announcements': [
        { id: 'a1', title: 'Holi holiday', body: 'Closed', date: '2026-03-14T04:00:00Z', from: 'Principal', type: 'holiday', audience: 'everyone', pinned: true },
        { id: 'a2', title: 'Notice', body: null, date: '2026-03-10T04:00:00Z', from: null, type: null, audience: null, pinned: null },
      ],
    });
    const list = await httpAnnouncements(http).list();
    expect(list[0]).toEqual({ id: 'a1', title: 'Holi holiday', body: 'Closed', date: '2026-03-14T04:00:00Z', from: 'Principal', type: 'holiday', audience: 'everyone', pinned: true });
    // nulls collapse to omitted optionals; pinned defaults to false
    expect(list[1]).toEqual({ id: 'a2', title: 'Notice', date: '2026-03-10T04:00:00Z', pinned: false });
  });
});
