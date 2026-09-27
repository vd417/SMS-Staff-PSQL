export interface TaskPeek {
  id: string;
  title: string;
  priority: 'urgent' | 'normal';
  done: boolean;
  photoUrl?: string;
}

export type RoleCard =
  | { kind: 'driver'; busNo: string; routeName: string; shift?: string; studentsAssigned: number }
  | { kind: 'conductor'; busNo: string; routeName: string; shift?: string; studentsAssigned: number }
  | { kind: 'guard'; gate: string; roundsDone: number; roundsTotal: number; visitorsToday: number }
  | { kind: 'gardener'; zones: string[]; wateringDue: number }
  | { kind: 'sweeper'; blocks: string[]; suppliesLow: string[] }
  | { kind: 'peon'; errands: number; bellDuty: boolean };

export interface Dashboard {
  hoursThisWeek: number;
  hoursTarget: number;
  /** Undefined when the server has no data source for it (sms-api doesn't compute these). */
  streakDays?: number;
  leaveLeft?: number;
  roleCard: RoleCard | null;
  pendingTasksPeek: TaskPeek[];
  alert?: string;
}
