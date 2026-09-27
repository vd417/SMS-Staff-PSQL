import type { ProfileRepository } from '@/data/repositories/types';
import type { HttpClient } from '@/lib/httpClient';
import { toProfile } from './mappers';
import { parseWire } from './schemas/wire';
import { profileSchema } from './schemas/features.schema';

export function httpProfile(http: HttpClient): ProfileRepository {
  return { get: () => http.get('/staff/profile').then((d) => toProfile(parseWire(profileSchema, d, 'profile'))) };
}
