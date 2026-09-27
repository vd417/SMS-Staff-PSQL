import type { Session, Staff, Tenant, Dashboard, RoleCard, Attendance, AttendanceLog, SchoolLocation, TaskPeek,
  Route, Stop, Trip, TripSummary, StudentLite, Boarding, TripAssignment, TripStops,
  TripDirection, TripStatus, BoardingState,
  Task, LeaveSummary, LeaveBalance, LeaveRequest, NewLeaveRequest,
  Profile, StaffDocument,
  Issue, IssueCategory, IssuePriority, IssueStatus, NewIssue,
  VehicleInspection, NewVehicleInspection, FuelLogEntry, NewFuelLogEntry,
} from '@/data/domain';
import type { Role } from '@/theme/roles';

export interface StaffDTO {
  id: string;
  name: string;
  first_name: string;
  role_key: Role;
  emp_id: string;
  joined: string;
  rating: number;
  duty_post: string;
  shift: string;
  timing: string;
  phone: string;
  // canonical school-admin superset (mapper ignores fields the domain does not use)
  category?: string;
  department?: string;
  attendance_pct?: number;
  status?: 'active' | 'inactive';
  avatar_hue?: number;
}
export interface TenantDTO {
  id: string;
  name: string;
  logo_url?: string;
}
export interface SessionDTO {
  access_token: string;
  refresh_token: string;
  user: StaffDTO;
  tenant: TenantDTO;
}
// Flattened across driver/conductor on the wire (backend's RoleCardResponse) — kind
// discriminates which fields are meaningful, the rest come back null. Only driver/conductor
// are ever populated; every other staff category gets role_card omitted entirely.
export interface RoleCardDTO {
  kind: string;
  bus_no?: string | null;
  route_name?: string | null;
  shift?: string | null;
  students_assigned?: number | null;
}
export function toRoleCard(d: RoleCardDTO): RoleCard | null {
  if (d.kind === 'driver' || d.kind === 'conductor') {
    return {
      kind: d.kind,
      busNo: d.bus_no ?? '',
      routeName: d.route_name ?? '',
      shift: d.shift ?? undefined,
      studentsAssigned: d.students_assigned ?? 0,
    };
  }
  return null;
}

export interface DashboardDTO {
  hours_this_week: number;
  // The live backend only populates these when there's a real data source behind them
  // (e.g. role_card is omitted unless the driver/conductor has an assigned bus) — never
  // fabricated. Treat all of these as optional and default sensibly in toDashboard.
  hours_target?: number;
  streak_days?: number;
  leave_left?: number;
  role_card?: RoleCardDTO | null;
  pending_tasks_peek?: TaskPeek[];
  alert?: string;
}
export interface AttendanceDTO {
  checked_in: boolean;
  check_in_at?: string;
  last_log: AttendanceLog[];
  duty_post: string;
  geofence_radius_m: number;
}

export function toStaff(d: StaffDTO): Staff {
  return {
    id: d.id,
    name: d.name,
    firstName: d.first_name,
    roleKey: d.role_key,
    empId: d.emp_id,
    joined: d.joined,
    rating: d.rating,
    dutyPost: d.duty_post,
    shift: d.shift,
    timing: d.timing,
    phone: d.phone,
  };
}

export function toTenant(d: TenantDTO): Tenant {
  const t: Tenant = { id: d.id, name: d.name };
  if (d.logo_url !== undefined) t.logoUrl = d.logo_url;
  return t;
}

export function toSession(d: SessionDTO): Session {
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    user: toStaff(d.user),
    tenant: toTenant(d.tenant),
  };
}

export function toDashboard(d: DashboardDTO): Dashboard {
  return {
    hoursThisWeek: d.hours_this_week,
    hoursTarget: d.hours_target ?? 0,
    streakDays: d.streak_days,
    leaveLeft: d.leave_left,
    roleCard: d.role_card ? toRoleCard(d.role_card) : null,
    pendingTasksPeek: d.pending_tasks_peek ?? [],
    alert: d.alert,
  };
}

export function toAttendance(d: AttendanceDTO): Attendance {
  const a: Attendance = {
    checkedIn: d.checked_in,
    lastLog: d.last_log,
    dutyPost: d.duty_post,
    geofenceRadiusM: d.geofence_radius_m,
  };
  if (d.check_in_at !== undefined) a.checkInAt = d.check_in_at;
  return a;
}

export interface SchoolLocationDTO {
  lat: number;
  lng: number;
  radius_meters: number;
  name?: string | null;
}
export const toSchoolLocation = (d: SchoolLocationDTO): SchoolLocation => ({
  lat: d.lat,
  lng: d.lng,
  radiusMeters: d.radius_meters,
  name: d.name ?? undefined,
});

export interface StopDTO { id: string; name: string; lat: number; lng: number; seq: number; eta_min?: number; }
export interface RouteDTO { id: string; name: string; bus_no: string; stops: StopDTO[]; }
export interface TripDTO {
  id: string; route_id: string; bus_no: string; driver_id: string; conductor_id?: string;
  direction: TripDirection; status: TripStatus; started_at?: string; ended_at?: string;
  active_broadcaster?: 'driver' | 'conductor'; current_stop_id?: string;
}
export interface TripSummaryDTO { trip_id: string; duration_min: number; distance_km: number; stops_covered: number; boarded_count: number; }
export interface StudentLiteDTO { id: string; name: string; stop_id: string; photo_url?: string; }
export interface BoardingDTO { trip_id: string; student_id: string; stop_id: string; state: BoardingState; at: string; }
export interface TripAssignmentDTO {
  route: RouteDTO; bus_id: string; bus_no: string; driver_name?: string | null; conductor_name?: string | null;
  shift?: string | null; students_assigned: number;
}

export const toStop = (d: StopDTO): Stop => ({ id: d.id, name: d.name, lat: d.lat, lng: d.lng, seq: d.seq, etaMin: d.eta_min });
export const toRoute = (d: RouteDTO): Route => ({ id: d.id, name: d.name, assignedBusNo: d.bus_no, stops: d.stops.map(toStop) });
export const toTrip = (d: TripDTO): Trip => ({
  id: d.id, routeId: d.route_id, busNo: d.bus_no, driverId: d.driver_id, conductorId: d.conductor_id,
  direction: d.direction, status: d.status, startedAt: d.started_at, endedAt: d.ended_at,
  activeBroadcaster: d.active_broadcaster, currentStopId: d.current_stop_id,
});
export const toTripSummary = (d: TripSummaryDTO): TripSummary => ({
  tripId: d.trip_id, durationMin: d.duration_min, distanceKm: d.distance_km, stopsCovered: d.stops_covered, boardedCount: d.boarded_count,
});
export const toStudentLite = (d: StudentLiteDTO): StudentLite => ({ id: d.id, name: d.name, stopId: d.stop_id, photoUrl: d.photo_url });
export const toBoarding = (d: BoardingDTO): Boarding => ({ tripId: d.trip_id, studentId: d.student_id, stopId: d.stop_id, state: d.state, at: d.at });
export const toTripAssignment = (d: TripAssignmentDTO): TripAssignment => ({
  route: toRoute(d.route), busId: d.bus_id, busNo: d.bus_no, driverName: d.driver_name ?? null,
  conductorName: d.conductor_name ?? null, shift: d.shift ?? undefined, studentsAssigned: d.students_assigned,
});

export interface TripStopsDTO {
  trip_id: string; current_stop_id: string | null; school_arrived_at: string | null;
  stops: Array<{ stop_id: string; name: string; seq: number; arrived_at?: string; confirmed_at?: string; departed_at?: string }>;
}
export const toTripStops = (d: TripStopsDTO): TripStops => ({
  tripId: d.trip_id,
  currentStopId: d.current_stop_id,
  schoolArrivedAt: d.school_arrived_at,
  stops: d.stops.map((s) => ({
    stopId: s.stop_id, name: s.name, seq: s.seq, arrivedAt: s.arrived_at, confirmedAt: s.confirmed_at, departedAt: s.departed_at,
  })),
});

export interface TaskDTO { id: string; title: string; detail?: string; priority: 'urgent' | 'normal'; done: boolean; due_label?: string; photo_url?: string; }
export function toTask(d: TaskDTO): Task {
  const t: Task = { id: d.id, title: d.title, priority: d.priority, done: d.done };
  if (d.detail !== undefined) t.detail = d.detail;
  if (d.due_label !== undefined) t.dueLabel = d.due_label;
  if (d.photo_url !== undefined) t.photoUrl = d.photo_url;
  return t;
}

export interface IssueDTO {
  id: string;
  category: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  vehicle_id?: string;
  route_id?: string;
  trip_id?: string;
  photo_url?: string;
  created_at: string;
}
export function toIssue(d: IssueDTO): Issue {
  const i: Issue = {
    id: d.id,
    category: d.category as IssueCategory,
    title: d.title,
    description: d.description,
    priority: d.priority as IssuePriority,
    status: d.status as IssueStatus,
    createdAt: d.created_at,
  };
  if (d.vehicle_id !== undefined) i.vehicleId = d.vehicle_id;
  if (d.route_id !== undefined) i.routeId = d.route_id;
  if (d.trip_id !== undefined) i.tripId = d.trip_id;
  if (d.photo_url !== undefined) i.photoUrl = d.photo_url;
  return i;
}
export const fromNewIssue = (r: NewIssue) => ({
  category: r.category,
  title: r.title,
  description: r.description,
  priority: r.priority,
  trip_id: r.tripId,
  photo_url: r.photoUri,
});

export type CanonicalLeaveType =
  | 'casual' | 'sick' | 'earned' | 'medical' | 'maternity' | 'emergency' | 'other';
export interface LeaveBalanceDTO { type: CanonicalLeaveType; total: number; used: number; }
export interface LeaveRequestDTO { id: string; type: CanonicalLeaveType; from_date: string; to_date: string; reason: string; status: LeaveRequest['status']; }
export interface LeaveSummaryDTO { balances: LeaveBalanceDTO[]; requests: LeaveRequestDTO[]; }
export const toLeaveBalance = (d: LeaveBalanceDTO): LeaveBalance => ({ type: d.type as LeaveBalance['type'], total: d.total, used: d.used });
export const toLeaveRequest = (d: LeaveRequestDTO): LeaveRequest => ({ id: d.id, type: d.type as LeaveRequest['type'], fromDate: d.from_date, toDate: d.to_date, reason: d.reason, status: d.status });
export const toLeaveSummary = (d: LeaveSummaryDTO): LeaveSummary => ({ balances: d.balances.map(toLeaveBalance), requests: d.requests.map(toLeaveRequest) });
export const fromNewLeave = (r: NewLeaveRequest) => ({ type: r.type, from_date: r.fromDate, to_date: r.toDate, reason: r.reason });

// sms-backend's real /v1/leave — a superset of LeaveRequestDTO (requester_id, child_id,
// substitute, applied_on, decided_note, priority, attachment_urls are ignored for now, not
// modeled by sms-staff's domain). /v1/leave/balances is the separate LeaveBalanceDTO[] source.
export interface LeaveRequestWireDTO {
  id: string;
  type: CanonicalLeaveType;
  from_date: string | null;
  to_date: string | null;
  reason: string | null;
  status: LeaveRequest['status'];
}
export const toLeaveRequestFromWire = (d: LeaveRequestWireDTO): LeaveRequest => ({
  id: d.id,
  type: d.type as LeaveRequest['type'],
  fromDate: d.from_date ?? '',
  toDate: d.to_date ?? '',
  reason: d.reason ?? '',
  status: d.status,
});

export interface StaffDocumentDTO { id: string; label: string; value: string; ok?: boolean; }
export interface ProfileDTO {
  documents: StaffDocumentDTO[];
  license_number?: string | null;
  license_expiry?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
}
export const toStaffDocument = (d: StaffDocumentDTO): StaffDocument => ({ id: d.id, label: d.label, value: d.value, ok: d.ok });
export const toProfile = (d: ProfileDTO): Profile => ({
  documents: d.documents.map(toStaffDocument),
  licenseNumber: d.license_number ?? undefined,
  licenseExpiry: d.license_expiry ?? undefined,
  emergencyContactName: d.emergency_contact_name ?? undefined,
  emergencyContactPhone: d.emergency_contact_phone ?? undefined,
});

export interface VehicleInspectionDTO {
  id: string;
  bus_id: string;
  brakes: boolean;
  tyres: boolean;
  lights: boolean;
  horn: boolean;
  first_aid_kit: boolean;
  fire_extinguisher: boolean;
  emergency_exit: boolean;
  fuel_level: boolean;
  all_ok: boolean;
  remarks?: string | null;
  inspection_date: string;
  created_at: string;
}
export function toVehicleInspection(d: VehicleInspectionDTO): VehicleInspection {
  const i: VehicleInspection = {
    id: d.id,
    busId: d.bus_id,
    brakes: d.brakes,
    tyres: d.tyres,
    lights: d.lights,
    horn: d.horn,
    firstAidKit: d.first_aid_kit,
    fireExtinguisher: d.fire_extinguisher,
    emergencyExit: d.emergency_exit,
    fuelLevel: d.fuel_level,
    allOk: d.all_ok,
    inspectionDate: d.inspection_date,
    createdAt: d.created_at,
  };
  if (d.remarks !== undefined && d.remarks !== null) i.remarks = d.remarks;
  return i;
}
export const fromNewVehicleInspection = (r: NewVehicleInspection) => ({
  bus_id: r.busId,
  brakes: r.brakes,
  tyres: r.tyres,
  lights: r.lights,
  horn: r.horn,
  first_aid_kit: r.firstAidKit,
  fire_extinguisher: r.fireExtinguisher,
  emergency_exit: r.emergencyExit,
  fuel_level: r.fuelLevel,
  all_ok: r.brakes && r.tyres && r.lights && r.horn && r.firstAidKit && r.fireExtinguisher && r.emergencyExit && r.fuelLevel,
  remarks: r.remarks,
});

export interface FuelLogDTO {
  id: string;
  bus_id: string;
  odometer_km: number;
  fuel_added_liters: number;
  recorded_at: string;
}
export const toFuelLog = (d: FuelLogDTO): FuelLogEntry => ({
  id: d.id, busId: d.bus_id, odometerKm: d.odometer_km, fuelAddedLiters: d.fuel_added_liters, recordedAt: d.recorded_at,
});
export const fromNewFuelLog = (r: NewFuelLogEntry) => ({
  bus_id: r.busId, odometer_km: r.odometerKm, fuel_added_liters: r.fuelAddedLiters,
});
