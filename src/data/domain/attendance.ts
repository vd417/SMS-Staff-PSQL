export interface AttendanceLog {
  at: string; // ISO timestamp
  kind: 'in' | 'out';
  inZone: boolean;
}

/** One calendar day from attendance history. `date` is YYYY-MM-DD in the device's local day. */
export interface AttendanceDay {
  date: string;
  checkedIn: boolean;
}

export interface Attendance {
  checkedIn: boolean;
  checkInAt?: string;
  lastLog: AttendanceLog[];
  dutyPost: string;
  geofenceRadiusM: number;
}

export interface SchoolLocation {
  lat: number;
  lng: number;
  radiusMeters: number;
  name?: string;
}
