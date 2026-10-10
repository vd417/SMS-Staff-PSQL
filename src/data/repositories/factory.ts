import type { Repositories } from './types';
import type { Store } from '@/data/mock/store';
import type { HttpClient } from '@/lib/httpClient';
import { mockAuth } from '@/data/mock/auth.repo';
import { mockDashboard } from '@/data/mock/dashboard.repo';
import { mockAttendance } from '@/data/mock/attendance.repo';
import { mockTrip } from '@/data/mock/trip.repo';
import { mockTasks } from '@/data/mock/tasks.repo';
import { mockIssues } from '@/data/mock/issues.repo';
import { mockLeave } from '@/data/mock/leave.repo';
import { mockProfile } from '@/data/mock/profile.repo';
import { mockVehicleChecks } from '@/data/mock/vehicleChecks.repo';
import { mockRouteGeometry } from '@/data/mock/routeGeometry.repo';
import { mockChat } from '@/data/mock/chat.repo';
import { mockAnnouncements } from '@/data/mock/announcements.repo';
import { httpAuth } from '@/data/http/auth.repo';
import { httpDashboard } from '@/data/http/dashboard.repo';
import { httpAttendance } from '@/data/http/attendance.repo';
import { httpTrip } from '@/data/http/trip.repo';
import { httpTasks } from '@/data/http/tasks.repo';
import { httpIssues } from '@/data/http/issues.repo';
import { httpLeave } from '@/data/http/leave.repo';
import { httpProfile } from '@/data/http/profile.repo';
import { httpVehicleChecks } from '@/data/http/vehicleChecks.repo';
import { httpRouteGeometry } from '@/data/http/routeGeometry.repo';
import { httpChat } from '@/data/http/chat.repo';
import { httpAnnouncements } from '@/data/http/announcements.repo';

export function createMockRepositories(store: Store): Repositories {
  return {
    auth: mockAuth(store),
    chat: mockChat(),
    announcements: mockAnnouncements(),
    dashboard: mockDashboard(store),
    attendance: mockAttendance(store),
    trip: mockTrip(store),
    tasks: mockTasks(store),
    issues: mockIssues(store),
    leave: mockLeave(store),
    profile: mockProfile(store),
    vehicleChecks: mockVehicleChecks(store),
    routeGeometry: mockRouteGeometry(),
  };
}

export function createHttpRepositories(http: HttpClient): Repositories {
  return {
    auth: httpAuth(http),
    chat: httpChat(http),
    announcements: httpAnnouncements(http),
    dashboard: httpDashboard(http),
    attendance: httpAttendance(http),
    trip: httpTrip(http),
    tasks: httpTasks(http),
    issues: httpIssues(http),
    leave: httpLeave(http),
    profile: httpProfile(http),
    vehicleChecks: httpVehicleChecks(http),
    routeGeometry: httpRouteGeometry(http),
  };
}
