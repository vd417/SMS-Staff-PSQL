import { meSchema, maskIdentifier, toStaffFromMe, toTenantFromMe, buildLoginRequest } from '@/data/http/auth.schema';
import type { Staff } from '@/data/domain';

const previous: Staff = {
  id: 'staff_ramesh', name: 'Ramesh Kumar', firstName: 'Ramesh', roleKey: 'driver',
  empId: 'EMP-2041', joined: '2019-06-12', rating: 4.6, dutyPost: 'Bus / Route',
  shift: 'Morning Shift', timing: '7:30–3:30', phone: '98765 43210',
};

describe('meSchema', () => {
  it('parses the minimal real backend payload', () => {
    const me = meSchema.parse({ id: 's1', tenant_id: 't1' });
    expect(me.id).toBe('s1');
    expect(me.tenant_id).toBe('t1');
  });

  it('accepts the full payload with optional identity fields', () => {
    const me = meSchema.parse({
      id: 's1', tenant_id: 't1', name: 'R K', email: 'r@x.com', phone: '1',
      employee: 'E1', joined: '2020-01-01', tenant_name: 'School',
    });
    expect(me.name).toBe('R K');
    expect(me.tenant_name).toBe('School');
  });

  it('accepts a real role_key/duty_post payload for a linked Staff row', () => {
    const me = meSchema.parse({ id: 's1', tenant_id: 't1', role_key: 'guard', duty_post: 'Main Gate' });
    expect(me.role_key).toBe('guard');
    expect(me.duty_post).toBe('Main Gate');
  });

  it('accepts role_key/duty_post as explicit null (no linked Staff row)', () => {
    const me = meSchema.parse({ id: 's1', tenant_id: 't1', role_key: null, duty_post: null });
    expect(me.role_key).toBeNull();
    expect(me.duty_post).toBeNull();
  });

  it('rejects an unrecognized role_key value', () => {
    expect(() => meSchema.parse({ id: 's1', tenant_id: 't1', role_key: 'storekeeper' })).toThrow();
  });
});

describe('maskIdentifier', () => {
  it('masks a phone number, keeping the last 4 digits', () => {
    expect(maskIdentifier('9876543210')).toBe('••••••3210');
  });

  it('masks an email, keeping the first local-part character and the domain', () => {
    expect(maskIdentifier('ramesh@example.com')).toBe('r•••••@example.com');
  });
});

describe('toStaffFromMe', () => {
  it('fills identity fields from the wire payload on a fresh login (no previous)', () => {
    const staff = toStaffFromMe({ id: 's1', tenant_id: 't1', name: 'Ramesh Kumar', phone: '1' }, 'guard');
    expect(staff.id).toBe('s1');
    expect(staff.name).toBe('Ramesh Kumar');
    expect(staff.roleKey).toBe('guard');
    // Fields the real backend never returns default to empty/zero on a fresh login.
    expect(staff.dutyPost).toBe('');
    expect(staff.rating).toBe(0);
  });

  it('preserves roleKey/dutyPost/rating/shift/timing from `previous` on rehydrate', () => {
    const staff = toStaffFromMe({ id: 's1', tenant_id: 't1', name: 'Ramesh K.' }, previous.roleKey, previous);
    expect(staff.roleKey).toBe('driver');
    expect(staff.dutyPost).toBe('Bus / Route');
    expect(staff.rating).toBe(4.6);
    expect(staff.shift).toBe('Morning Shift');
    expect(staff.timing).toBe('7:30–3:30');
    // Identity fields the backend does return are refreshed.
    expect(staff.name).toBe('Ramesh K.');
  });

  it('falls back to the caller-supplied roleKey when the backend has no linked Staff row', () => {
    const staff = toStaffFromMe({ id: 's1', tenant_id: 't1', role_key: null }, 'conductor', previous);
    expect(staff.roleKey).toBe('conductor');
  });

  it('prefers the backend role_key over the caller-supplied roleKey and over previous', () => {
    const staff = toStaffFromMe({ id: 's1', tenant_id: 't1', role_key: 'gardener' }, 'conductor', previous);
    expect(staff.roleKey).toBe('gardener');
  });

  it('prefers the backend duty_post over previous', () => {
    const staff = toStaffFromMe({ id: 's1', tenant_id: 't1', duty_post: 'Block C' }, 'driver', previous);
    expect(staff.dutyPost).toBe('Block C');
  });

  it('falls back to previous dutyPost when the backend omits duty_post', () => {
    const staff = toStaffFromMe({ id: 's1', tenant_id: 't1' }, 'driver', previous);
    expect(staff.dutyPost).toBe('Bus / Route');
  });
});

describe('toTenantFromMe', () => {
  it('maps tenant_id/tenant_name', () => {
    const tenant = toTenantFromMe({ id: 's1', tenant_id: 't1', tenant_name: 'Greenfield' });
    expect(tenant).toEqual({ id: 't1', name: 'Greenfield' });
  });
});

describe('buildLoginRequest', () => {
  it('sends email for an @ identifier', () => {
    expect(buildLoginRequest('ramesh@example.com', 'hunter2222')).toEqual({
      email: 'ramesh@example.com',
      password: 'hunter2222',
    });
  });

  it('sends phone for a non-@ identifier', () => {
    expect(buildLoginRequest('9876543210', 'hunter2222')).toEqual({
      phone: '9876543210',
      password: 'hunter2222',
    });
  });
});
