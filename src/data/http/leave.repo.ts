import type { LeaveRepository } from '@/data/repositories/types';
import type { NewLeaveRequest, LeaveSummary } from '@/data/domain';
import type { HttpClient } from '@/lib/httpClient';
import { toLeaveBalance, toLeaveRequestFromWire, fromNewLeave } from './mappers';
import { parseWire } from './schemas/wire';
import { leaveBalancesSchema, leaveListSchema, leaveRequestSchema } from './schemas/features.schema';

export function httpLeave(http: HttpClient): LeaveRepository {
  return {
    summary: async (): Promise<LeaveSummary> => {
      const [balances, requests] = await Promise.all([
        http.get('/leave/balances').then((d) => parseWire(leaveBalancesSchema, d, 'leave balances')),
        http.get('/leave').then((d) => parseWire(leaveListSchema, d, 'leave requests')),
      ]);
      return { balances: balances.map(toLeaveBalance), requests: requests.map(toLeaveRequestFromWire) };
    },
    submit: (req: NewLeaveRequest) =>
      http.post('/leave', fromNewLeave(req)).then((d) => toLeaveRequestFromWire(parseWire(leaveRequestSchema, d, 'leave request'))),
  };
}
