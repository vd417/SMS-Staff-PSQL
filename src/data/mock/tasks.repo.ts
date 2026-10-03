import type { TasksRepository } from '@/data/repositories/types';
import type { Task } from '@/data/domain';
import type { Store } from './store';
import { simulateLatency } from '@/lib/latency';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function mockTasks(store: Store): TasksRepository {
  return {
    async list(): Promise<Task[]> {
      await simulateLatency();
      return clone(store.tasks);
    },
    async complete(id: string, remark?: string): Promise<Task[]> {
      await simulateLatency();
      const task = store.tasks.find((t) => t.id === id);
      if (task) {
        task.done = true;
        if (remark !== undefined) task.remark = remark;
      }
      return clone(store.tasks);
    },
    async attachPhoto(id: string, photoUri: string): Promise<Task[]> {
      await simulateLatency();
      const task = store.tasks.find((t) => t.id === id);
      if (task) task.photoUrl = photoUri;
      return clone(store.tasks);
    },
  };
}
