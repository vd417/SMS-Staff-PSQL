import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useRepositories } from '@/data/repositories/RepositoryContext';
import { queryKeys } from '@/lib/queryClient';
import { asyncStore } from '@/lib/asyncStore';
import { filterStaffAnnouncements, unreadCount } from './announcementFilter';

const LAST_SEEN_KEY = 'sms.inbox.lastSeenAt';
const POLL_MS = 60_000;

function useAnnouncementsQuery() {
  const repos = useRepositories();
  return useQuery({
    queryKey: queryKeys.announcements(),
    queryFn: () => repos.announcements.list(),
    refetchInterval: POLL_MS,
  });
}

/** When the staff member last opened the inbox (persisted), as reactive query state. */
function useLastSeen() {
  return useQuery({
    queryKey: queryKeys.inboxLastSeen(),
    queryFn: () => asyncStore.get<string>(LAST_SEEN_KEY),
    staleTime: Infinity,
  });
}

/** The staff-relevant announcements shown on the Inbox screen. */
export function useStaffAnnouncements() {
  const q = useAnnouncementsQuery();
  const data = useMemo(() => (q.data ? filterStaffAnnouncements(q.data) : undefined), [q.data]);
  return { ...q, data };
}

/** Unread count for the Inbox tab badge (announcements newer than the last open). */
export function useInboxUnread(): number {
  const announcements = useAnnouncementsQuery();
  const lastSeen = useLastSeen();
  return useMemo(
    () => (announcements.data ? unreadCount(announcements.data, lastSeen.data ?? null) : 0),
    [announcements.data, lastSeen.data],
  );
}

/** Marks the inbox read (clears the badge). Call when the Inbox screen opens. */
export function useMarkInboxSeen() {
  const qc = useQueryClient();
  return () => {
    const now = new Date().toISOString();
    qc.setQueryData(queryKeys.inboxLastSeen(), now);
    void asyncStore.set(LAST_SEEN_KEY, now);
  };
}
