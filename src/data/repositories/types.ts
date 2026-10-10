import type {
  Session, Staff, Dashboard, Attendance, SchoolLocation,
  TripAssignment, Trip, TripPing, TripSummary, StudentLite, Boarding, TripDirection, RouteGeometry, TripStops,
  Task,
  LeaveSummary, LeaveRequest, NewLeaveRequest,
  Profile,
  Issue, NewIssue,
  VehicleInspection, NewVehicleInspection, FuelLogEntry, NewFuelLogEntry,
  ChatThread, ChatMessage, ChatContact, Announcement,
} from '@/data/domain';
import type { Role } from '@/theme/roles';
import type { Tokens } from '@/lib/tokenStore';

export interface OtpChallenge {
  channel: 'sms' | 'email';
  destination: string;
}

export interface AuthRepository {
  requestOtp(identifier: string): Promise<OtpChallenge>;
  verifyOtp(identifier: string, code: string, roleKey: Role): Promise<Session>;
  login(identifier: string, password: string, roleKey: Role): Promise<Session>;
  setPassword(password: string): Promise<void>;
  refresh(refreshToken: string): Promise<Tokens>;
  me(previous?: Staff): Promise<Staff>;
  logout(refreshToken: string | null): Promise<void>;
}

export interface DashboardRepository {
  get(): Promise<Dashboard>;
}

export interface AttendanceRepository {
  status(): Promise<Attendance>;
  schoolLocation(): Promise<SchoolLocation>;
  checkIn(at: string, lat: number, lng: number, accuracyMeters: number): Promise<Attendance>;
  checkOut(at: string, lat: number, lng: number, accuracyMeters: number): Promise<Attendance>;
}

export interface TripRepository {
  myAssignment(): Promise<TripAssignment>;
  current(): Promise<Trip | null>;
  startTrip(routeId: string, direction: TripDirection, busNo: string): Promise<Trip>;
  publishPings(tripId: string, pings: TripPing[]): Promise<void>;
  endTrip(tripId: string): Promise<TripSummary>;
  roster(tripId: string): Promise<StudentLite[]>;
  setBoarding(b: Boarding): Promise<void>;
  boardingState(tripId: string): Promise<Boarding[]>;
  stops(tripId: string): Promise<TripStops>;
  confirmArrival(tripId: string, stopId: string): Promise<void>;
  departStop(tripId: string, stopId: string): Promise<void>;
  markSchoolArrived(tripId: string): Promise<void>;
}

export interface TasksRepository {
  list(): Promise<Task[]>;
  complete(id: string, remark?: string): Promise<Task[]>;
  attachPhoto(id: string, photoUri: string): Promise<Task[]>;
}

export interface IssuesRepository {
  list(): Promise<Issue[]>;
  /// Single-issue detail, including the attached photo the list intentionally omits.
  get(id: string): Promise<Issue>;
  create(req: NewIssue): Promise<Issue>;
}

export interface LeaveRepository {
  summary(): Promise<LeaveSummary>;
  submit(req: NewLeaveRequest): Promise<LeaveRequest>;
}

export interface ProfileRepository { get(): Promise<Profile>; }

export interface VehicleChecksRepository {
  listInspections(busId: string): Promise<VehicleInspection[]>;
  submitInspection(req: NewVehicleInspection): Promise<VehicleInspection>;
  listFuelLogs(busId: string): Promise<FuelLogEntry[]>;
  submitFuelLog(req: NewFuelLogEntry): Promise<FuelLogEntry>;
}

export interface ChatRepository {
  /** Existing threads for the signed-in staff member. */
  threads(): Promise<ChatThread[]>;
  /** Management accounts (principal/owner/admin/vice) the staff member can start a chat with. */
  contacts(): Promise<ChatContact[]>;
  /** Open (or reuse) a thread with a contact. */
  createThread(contact: ChatContact): Promise<ChatThread>;
  messages(threadId: string): Promise<ChatMessage[]>;
  send(threadId: string, text: string): Promise<ChatMessage>;
}

export interface AnnouncementsRepository {
  /** School announcements visible to this staff member (the hook filters out academic ones). */
  list(): Promise<Announcement[]>;
}

export interface Repositories {
  auth: AuthRepository;
  chat: ChatRepository;
  announcements: AnnouncementsRepository;
  dashboard: DashboardRepository;
  attendance: AttendanceRepository;
  trip: TripRepository;
  tasks: TasksRepository;
  issues: IssuesRepository;
  leave: LeaveRepository;
  profile: ProfileRepository;
  vehicleChecks: VehicleChecksRepository;
  routeGeometry: RouteGeometryRepository;
}

export interface RouteGeometryRepository {
  get(routeId: string): Promise<RouteGeometry>;
}
