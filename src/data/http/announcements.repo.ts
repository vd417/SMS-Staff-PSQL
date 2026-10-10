import type { AnnouncementsRepository } from '@/data/repositories/types';
import type { HttpClient } from '@/lib/httpClient';
import { toAnnouncement } from './mappers';
import { parseWire } from './schemas/wire';
import { announcementListSchema } from './schemas/features.schema';

// Reuses the shared /v1/announcements feed. The server returns the whole school's announcements;
// staff-relevance filtering (audience + type) happens in the inbox hook, mirroring the other apps.
export function httpAnnouncements(http: HttpClient): AnnouncementsRepository {
  return {
    list: () =>
      http.get('/announcements').then((d) => parseWire(announcementListSchema, d, 'announcements').map(toAnnouncement)),
  };
}
