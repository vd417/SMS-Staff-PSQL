import { httpIssues } from '@/data/http/issues.repo';
import type { HttpClient } from '@/lib/httpClient';

function fakeHttp(routes: Record<string, unknown>): { http: HttpClient; calls: Array<{ method: string; path: string; body?: unknown }> } {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const http: HttpClient = {
    get: <T>(path: string) => { calls.push({ method: 'GET', path }); return Promise.resolve(routes[`GET ${path}`] as T); },
    post: <T>(path: string, body?: unknown) => { calls.push({ method: 'POST', path, body }); return Promise.resolve(routes[`POST ${path}`] as T); },
    patch: <T>(path: string, body?: unknown) => { calls.push({ method: 'PATCH', path, body }); return Promise.resolve(routes[`PATCH ${path}`] as T); },
    delete: <T>(path: string) => { calls.push({ method: 'DELETE', path }); return Promise.resolve(routes[`DELETE ${path}`] as T); },
  };
  return { http, calls };
}

describe('httpIssues', () => {
  it('list maps DTOs to domain Issues', async () => {
    const { http } = fakeHttp({
      'GET /staff/issues': [
        { id: 'i1', category: 'safety', title: 'Loose seatbelt', description: 'd', priority: 'high', status: 'open', created_at: '2026-09-15T08:00:00Z' },
      ],
    });
    const list = await httpIssues(http).list();
    expect(list).toEqual([
      { id: 'i1', category: 'safety', title: 'Loose seatbelt', description: 'd', priority: 'high', status: 'open', createdAt: '2026-09-15T08:00:00Z' },
    ]);
  });

  it('get fetches a single issue by id and maps its photo_url', async () => {
    const { http, calls } = fakeHttp({
      'GET /staff/issues/i1': {
        id: 'i1', category: 'safety', title: 'Loose seatbelt', description: 'd', priority: 'high',
        status: 'open', photo_url: 'data:image/jpeg;base64,abc', created_at: '2026-09-15T08:00:00Z',
      },
    });
    const issue = await httpIssues(http).get('i1');
    expect(calls[0]).toEqual({ method: 'GET', path: '/staff/issues/i1' });
    expect(issue.id).toBe('i1');
    expect(issue.photoUrl).toBe('data:image/jpeg;base64,abc');
  });

  it('create posts snake_case fields and maps the response back', async () => {
    const { http, calls } = fakeHttp({
      'POST /staff/issues': { id: 'i2', category: 'other', title: 'T', description: 'd', priority: 'normal', status: 'open', created_at: '2026-09-15T08:00:00Z' },
    });
    const created = await httpIssues(http).create({ category: 'other', title: 'T', description: 'd', priority: 'normal', tripId: 'trip_1' });
    expect(created.id).toBe('i2');
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/staff/issues',
      body: { category: 'other', title: 'T', description: 'd', priority: 'normal', trip_id: 'trip_1', photo_url: undefined },
    });
  });
});
