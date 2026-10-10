import { isStaffAnnouncement, filterStaffAnnouncements, unreadCount } from '../announcementFilter';
import type { Announcement } from '@/data/domain';

const mk = (over: Partial<Announcement>): Announcement => ({ id: 'x', title: 'T', date: '2026-03-01T00:00:00Z', pinned: false, ...over });

describe('isStaffAnnouncement', () => {
  it('includes everyone/all/staff audiences and no-audience', () => {
    expect(isStaffAnnouncement(mk({ audience: 'everyone' }))).toBe(true);
    expect(isStaffAnnouncement(mk({ audience: 'staff' }))).toBe(true);
    expect(isStaffAnnouncement(mk({ audience: undefined }))).toBe(true);
  });

  it('excludes parent/student/teacher-only audiences', () => {
    expect(isStaffAnnouncement(mk({ audience: 'parents' }))).toBe(false);
    expect(isStaffAnnouncement(mk({ audience: 'students' }))).toBe(false);
    expect(isStaffAnnouncement(mk({ audience: 'teachers' }))).toBe(false);
  });

  it('excludes academic types (timetable, fee, exam) even for a staff audience', () => {
    expect(isStaffAnnouncement(mk({ audience: 'everyone', type: 'timetable' }))).toBe(false);
    expect(isStaffAnnouncement(mk({ audience: 'everyone', type: 'fee' }))).toBe(false);
    expect(isStaffAnnouncement(mk({ audience: 'staff', type: 'exam' }))).toBe(false);
  });

  it('keeps holidays', () => {
    expect(isStaffAnnouncement(mk({ audience: 'everyone', type: 'holiday' }))).toBe(true);
  });
});

describe('filterStaffAnnouncements', () => {
  it('drops hidden ones and sorts pinned-first then newest', () => {
    const list = [
      mk({ id: 'old', date: '2026-01-01T00:00:00Z' }),
      mk({ id: 'fee', type: 'fee' }),
      mk({ id: 'new', date: '2026-05-01T00:00:00Z' }),
      mk({ id: 'pin', date: '2026-02-01T00:00:00Z', pinned: true }),
    ];
    expect(filterStaffAnnouncements(list).map((a) => a.id)).toEqual(['pin', 'new', 'old']);
  });
});

describe('unreadCount', () => {
  it('counts staff announcements newer than last seen', () => {
    const list = [
      mk({ id: 'a', date: '2026-05-01T00:00:00Z' }),
      mk({ id: 'b', date: '2026-04-01T00:00:00Z' }),
      mk({ id: 'fee', type: 'fee', date: '2026-06-01T00:00:00Z' }),
    ];
    expect(unreadCount(list, '2026-04-15T00:00:00Z')).toBe(1); // only 'a' (fee excluded, b older)
    expect(unreadCount(list, null)).toBe(2); // both staff ones, fee excluded
  });
});
