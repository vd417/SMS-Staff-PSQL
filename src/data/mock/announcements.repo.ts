import type { AnnouncementsRepository } from '@/data/repositories/types';
import { simulateLatency } from '@/lib/latency';

// Mock adapter: a couple of staff-relevant demo announcements so the inbox isn't empty offline.
export function mockAnnouncements(): AnnouncementsRepository {
  return {
    async list() {
      await simulateLatency();
      return [
        { id: 'a_holi', title: 'Holi holiday — school closed', body: 'The school will remain closed for Holi.', date: '2026-03-14T04:00:00Z', type: 'holiday', audience: 'everyone', pinned: true },
        { id: 'a_staff', title: 'Staff meeting at 4 PM', body: 'All transport staff to assemble in the yard.', date: '2026-03-10T09:00:00Z', type: 'general', audience: 'staff', pinned: false },
      ];
    },
  };
}
