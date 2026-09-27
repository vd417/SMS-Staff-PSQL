import type { TasksRepository } from '@/data/repositories/types';
import type { HttpClient } from '@/lib/httpClient';
import { toTask } from './mappers';
import { parseWire } from './schemas/wire';
import { taskListSchema } from './schemas/features.schema';

export function httpTasks(http: HttpClient): TasksRepository {
  return {
    list: () => http.get('/staff/tasks').then((d) => parseWire(taskListSchema, d, 'tasks').map(toTask)),
    complete: (id) => http.post(`/staff/tasks/${id}/complete`, {}).then((d) => parseWire(taskListSchema, d, 'tasks').map(toTask)),
    attachPhoto: (id, photoUri) =>
      http.post(`/staff/tasks/${id}/photo`, { photo_base64: photoUri }).then((d) => parseWire(taskListSchema, d, 'tasks').map(toTask)),
  };
}
