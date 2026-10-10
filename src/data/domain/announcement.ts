export interface Announcement {
  id: string;
  title: string;
  body?: string;
  /** ISO timestamp the announcement was posted. */
  date: string;
  /** Who posted it (name/role label), when provided. */
  from?: string;
  /** Category, e.g. general / holiday / event / timetable / fee / exam. */
  type?: string;
  /** Target group, e.g. everyone / staff / teachers / parents / students. */
  audience?: string;
  pinned: boolean;
}
