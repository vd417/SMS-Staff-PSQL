import type { AttendanceRepository } from '@/data/repositories/types';
import type { HttpClient } from '@/lib/httpClient';
import { deviceUtcOffsetMinutes } from '@/lib/date';
import { toAttendance, toSchoolLocation } from './mappers';
import { parseWire } from './schemas/wire';
import { attendanceSchema, schoolLocationSchema } from './schemas/attendance.schema';

export function httpAttendance(http: HttpClient): AttendanceRepository {
  const punch = (path: string, at: string, lat: number, lng: number, accuracyMeters: number) =>
    http
      .post(path, { at, lat, lng, accuracy_meters: accuracyMeters, offset_minutes: deviceUtcOffsetMinutes() })
      .then((d) => toAttendance(parseWire(attendanceSchema, d, 'attendance')));
  return {
    status: () =>
      http
        .get('/staff/attendance', { offset_minutes: deviceUtcOffsetMinutes() })
        .then((d) => toAttendance(parseWire(attendanceSchema, d, 'attendance'))),
    schoolLocation: () =>
      http
        .get('/me/attendance/school-location')
        .then((d) => toSchoolLocation(parseWire(schoolLocationSchema, d, 'school location'))),
    checkIn: (at, lat, lng, accuracyMeters) => punch('/staff/attendance/check-in', at, lat, lng, accuracyMeters),
    checkOut: (at, lat, lng, accuracyMeters) => punch('/staff/attendance/check-out', at, lat, lng, accuracyMeters),
  };
}
