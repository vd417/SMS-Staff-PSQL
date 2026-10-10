export type LeaveType = 'casual' | 'sick' | 'earned';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';
export interface LeaveBalance { type: LeaveType; total: number; used: number; }
export interface LeaveRequest { id: string; type: LeaveType; fromDate: string; toDate: string; reason: string; status: LeaveStatus; decidedByName?: string; decidedNote?: string; }
export interface LeaveSummary { balances: LeaveBalance[]; requests: LeaveRequest[]; }
export interface NewLeaveRequest { type: LeaveType; fromDate: string; toDate: string; reason: string; }
