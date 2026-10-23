import type { Attendance, AttendanceLog } from '@/data/domain';

function sameLocalDay(iso: string, now: Date): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function hasLog(logs: AttendanceLog[], at: string, kind: AttendanceLog['kind']): boolean {
  return logs.some((log) => log.at === at && log.kind === kind);
}

/**
 * The attendance "today" window can drop a punch that was just stored, so
 * check-in returns checked_in=false and last_log=[]. Keep that punch for the
 * local day until the server reports it or a later opposite punch.
 */
export function retainPunch(server: Attendance, punch: AttendanceLog | undefined, now = new Date()): Attendance {
  if (!punch || !sameLocalDay(punch.at, now)) return server;
  const atMs = Date.parse(punch.at);

  if (punch.kind === 'in') {
    if (server.checkedIn || hasLog(server.lastLog, punch.at, 'in')) {
      return { ...server, checkedIn: true, checkInAt: server.checkInAt ?? punch.at };
    }
    const laterOut = server.lastLog.some((log) => log.kind === 'out' && Date.parse(log.at) > atMs);
    if (laterOut) return server;
    return {
      ...server,
      checkedIn: true,
      checkInAt: punch.at,
      lastLog: [punch, ...server.lastLog],
    };
  }

  if (hasLog(server.lastLog, punch.at, 'out')) {
    return { ...server, checkedIn: false, checkInAt: undefined };
  }
  const laterIn = server.lastLog.some((log) => log.kind === 'in' && Date.parse(log.at) > atMs);
  if (laterIn) return server;
  return {
    ...server,
    checkedIn: false,
    checkInAt: undefined,
    lastLog: [punch, ...server.lastLog],
  };
}

/** Latest log on the cached record, which is stored newest-first. */
export function latestPunch(attendance: Attendance | undefined): AttendanceLog | undefined {
  return attendance?.lastLog[0];
}

/** Trust today's newest log when the checked_in flag and the log disagree. */
export function withTodayFlag(server: Attendance, now = new Date()): Attendance {
  const latestToday = server.lastLog.find((log) => sameLocalDay(log.at, now));
  if (!latestToday) return server;
  if (latestToday.kind === 'in') {
    return { ...server, checkedIn: true, checkInAt: server.checkInAt ?? latestToday.at };
  }
  return { ...server, checkedIn: false, checkInAt: undefined };
}
