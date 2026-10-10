import type { Announcement } from '@/data/domain';

// Audiences a transport-staff member should see. Academic-only audiences (parents/students) and
// teacher-only notices are left out.
const STAFF_AUDIENCES = new Set(['everyone', 'all', 'staff']);
// Academic categories that don't concern transport staff (timetable, fees, exams).
const HIDDEN_TYPES = new Set(['timetable', 'fee', 'fees', 'exam', 'exams']);

/** True if this announcement is relevant to staff (e.g. a holiday or a staff notice). */
export function isStaffAnnouncement(a: Announcement): boolean {
  const audience = a.audience?.trim().toLowerCase();
  const type = a.type?.trim().toLowerCase();
  if (type && HIDDEN_TYPES.has(type)) return false;
  if (!audience) return true;
  return STAFF_AUDIENCES.has(audience);
}

/** Staff-relevant announcements, pinned first then newest first. */
export function filterStaffAnnouncements(list: Announcement[]): Announcement[] {
  return list
    .filter(isStaffAnnouncement)
    .sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (Date.parse(b.date) - Date.parse(a.date)));
}

/** How many staff announcements are newer than the last time the inbox was opened. */
export function unreadCount(list: Announcement[], lastSeenAt: string | null): number {
  const since = lastSeenAt ? Date.parse(lastSeenAt) : 0;
  return filterStaffAnnouncements(list).filter((a) => Date.parse(a.date) > since).length;
}
