import { toSession, toStaff, toTenant, toDashboard, toAttendance, toSchoolLocation, toTripAssignment } from '@/data/http/mappers';

describe('http mappers', () => {
  it('toStaff maps snake_case to domain', () => {
    const staff = toStaff({
      id: 's1', name: 'Ramesh Kumar', first_name: 'Ramesh', role_key: 'driver',
      emp_id: 'EMP-1', joined: '2019-06-12', rating: 4.6, duty_post: 'Bus / Route',
      shift: 'Morning Shift', timing: '7:30–3:30', phone: '98765 43210',
    });
    expect(staff.firstName).toBe('Ramesh');
    expect(staff.roleKey).toBe('driver');
    expect(staff.empId).toBe('EMP-1');
    expect(staff.dutyPost).toBe('Bus / Route');
  });

  it('toTenant maps logo_url to logoUrl', () => {
    expect(toTenant({ id: 't1', name: 'School', logo_url: 'http://x/y.png' }))
      .toEqual({ id: 't1', name: 'School', logoUrl: 'http://x/y.png' });
  });

  it('toSession maps tokens and nested user/tenant', () => {
    const s = toSession({
      access_token: 'a', refresh_token: 'r',
      user: { id: 's1', name: 'R K', first_name: 'R', role_key: 'conductor', emp_id: 'E', joined: '2020-01-01', rating: 4, duty_post: 'Bus / Students', shift: 'Morning Shift', timing: '7:30–3:30', phone: '1' },
      tenant: { id: 't1', name: 'School' },
    });
    expect(s.accessToken).toBe('a');
    expect(s.refreshToken).toBe('r');
    expect(s.user.roleKey).toBe('conductor');
    expect(s.tenant.id).toBe('t1');
  });

  it('toDashboard maps stats and passes nested structures through', () => {
    const d = toDashboard({
      hours_this_week: 34, hours_target: 44, streak_days: 21, leave_left: 12,
      role_card: { kind: 'driver', bus_no: 'X', route_name: 'R7', shift: '7:00 AM - 4:00 PM', students_assigned: 24 },
      pending_tasks_peek: [{ id: 't1', title: 'A', priority: 'urgent', done: false }],
      alert: 'Meeting',
    });
    expect(d.hoursThisWeek).toBe(34);
    expect(d.leaveLeft).toBe(12);
    expect(d.roleCard?.kind).toBe('driver');
    expect(d.pendingTasksPeek[0].id).toBe('t1');
    expect(d.alert).toBe('Meeting');
  });

  it('toDashboard maps the real backend\'s flattened snake_case role_card into the domain union', () => {
    const d = toDashboard({
      hours_this_week: 10,
      role_card: { kind: 'driver', bus_no: 'KA-01-F-3301', route_name: 'Route 7', shift: '7:00 AM - 4:00 PM', students_assigned: 24 },
    });
    expect(d.roleCard).toEqual({
      kind: 'driver', busNo: 'KA-01-F-3301', routeName: 'Route 7', shift: '7:00 AM - 4:00 PM', studentsAssigned: 24,
    });
  });

  it('toTripAssignment maps busId/shift/studentsAssigned from the real backend', () => {
    const a = toTripAssignment({
      route: { id: 'r1', name: 'North Route', bus_no: 'KA-01-F-3301', stops: [] },
      bus_id: 'bus_1', bus_no: 'KA-01-F-3301', conductor_name: null,
      shift: '7:00 AM - 4:00 PM', students_assigned: 24,
    });
    expect(a).toEqual({
      route: { id: 'r1', name: 'North Route', assignedBusNo: 'KA-01-F-3301', stops: [] },
      busId: 'bus_1', busNo: 'KA-01-F-3301', driverName: null, conductorName: null,
      shift: '7:00 AM - 4:00 PM', studentsAssigned: 24,
    });
  });

  it('toAttendance maps snake_case fields', () => {
    const a = toAttendance({
      checked_in: true, check_in_at: '2026-06-03T08:00:00Z',
      last_log: [{ at: '2026-06-03T08:00:00Z', kind: 'in', inZone: true }],
      duty_post: 'Bus / Route', geofence_radius_m: 120,
    });
    expect(a.checkedIn).toBe(true);
    expect(a.checkInAt).toBe('2026-06-03T08:00:00Z');
    expect(a.dutyPost).toBe('Bus / Route');
    expect(a.geofenceRadiusM).toBe(120);
  });

  it('toSchoolLocation maps snake_case fields', () => {
    const loc = toSchoolLocation({ lat: 28.4595, lng: 77.0266, radius_meters: 120, name: 'Greenfield Public School' });
    expect(loc).toEqual({ lat: 28.4595, lng: 77.0266, radiusMeters: 120, name: 'Greenfield Public School' });
  });

  it('toSchoolLocation defaults a missing name to undefined', () => {
    const loc = toSchoolLocation({ lat: 28.4595, lng: 77.0266, radius_meters: 120 });
    expect(loc.name).toBeUndefined();
  });
});
