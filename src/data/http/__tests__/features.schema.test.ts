import { httpTasks } from '@/data/http/tasks.repo';
import { httpIssues } from '@/data/http/issues.repo';
import { httpLeave } from '@/data/http/leave.repo';
import { httpProfile } from '@/data/http/profile.repo';
import { httpVehicleChecks } from '@/data/http/vehicleChecks.repo';
import type { HttpClient } from '@/lib/httpClient';

function fakeHttp(byPath: Record<string, unknown>): HttpClient {
  const lookup = (path: string) => byPath[path.split('?')[0]];
  return {
    get: async <T>(path: string) => lookup(path) as T,
    post: async <T>(path: string) => lookup(path) as T,
    patch: async <T>() => undefined as T,
    delete: async <T>() => undefined as T,
  };
}

// Recorded from the seeded sms-api (nulls where the server has no value).
describe('feature wires', () => {
  it('tasks: nulls become absent optionals', async () => {
    const http = fakeHttp({ '/staff/tasks': [{ id: 'k1', title: 'Sweep', detail: null, priority: 'urgent', done: false, due_label: null, photo_url: null }] });
    await expect(httpTasks(http).list()).resolves.toEqual([{ id: 'k1', title: 'Sweep', priority: 'urgent', done: false }]);
  });

  it('issues: list rows with null trip fields', async () => {
    const http = fakeHttp({ '/staff/issues': [{
      id: 'i1', tenant_id: 't', reporter_user_id: 'u', category: 'vehicle', title: 'Brakes', description: 'Squeal',
      priority: 'high', status: 'open', vehicle_id: null, route_id: null, trip_id: null, photo_url: null,
      created_at: '2026-09-26T02:00:00Z', updated_at: '2026-09-26T02:00:00Z',
    }] });
    const [i] = await httpIssues(http).list();
    expect(i).toEqual({ id: 'i1', category: 'vehicle', title: 'Brakes', description: 'Squeal', priority: 'high', status: 'open', createdAt: '2026-09-26T02:00:00Z' });
  });

  it('leave: accepts the server-wide leave types read-only', async () => {
    const http = fakeHttp({
      '/leave/balances': [{ type: 'casual', total: 12, used: 0 }],
      '/leave': [{ id: 'l1', type: 'maternity', from_date: '2026-10-01', to_date: '2026-10-02', reason: null, status: 'pending' }],
    });
    const s = await httpLeave(http).summary();
    expect(s.requests[0]).toMatchObject({ type: 'maternity', reason: '' });
  });

  it('profile: documents with null ok', async () => {
    const http = fakeHttp({ '/staff/profile': { documents: [{ id: 'd1', label: 'Licence', value: 'DL-1', ok: null }], license_number: null, license_expiry: null, emergency_contact_name: null, emergency_contact_phone: null } });
    const p = await httpProfile(http).get();
    expect(p.documents[0]).toEqual({ id: 'd1', label: 'Licence', value: 'DL-1', ok: undefined });
  });

  it('vehicle checks: inspections list', async () => {
    const http = fakeHttp({ '/staff/vehicle-checks/inspections': [{
      id: 'v1', bus_id: 'b1', brakes: true, tyres: true, lights: true, horn: true, first_aid_kit: true, fire_extinguisher: true,
      emergency_exit: true, fuel_level: true, all_ok: true, remarks: null, inspection_date: '2026-09-26', created_at: '2026-09-26T02:00:00Z',
    }] });
    const [v] = await httpVehicleChecks(http).listInspections('b1');
    expect(v).toMatchObject({ busId: 'b1', allOk: true });
    expect(v.remarks).toBeUndefined();
  });

  it('a drifted feature response is a contract_mismatch', async () => {
    const http = fakeHttp({ '/staff/tasks': [{ id: 1 }] });
    await expect(httpTasks(http).list()).rejects.toMatchObject({ code: 'contract_mismatch' });
  });
});
