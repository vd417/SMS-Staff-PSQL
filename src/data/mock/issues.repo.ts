import type { IssuesRepository } from '@/data/repositories/types';
import type { Issue, NewIssue } from '@/data/domain';
import type { Store } from './store';
import { simulateLatency } from '@/lib/latency';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function mockIssues(store: Store): IssuesRepository {
  return {
    async list(): Promise<Issue[]> {
      await simulateLatency();
      return clone(store.issues);
    },
    async get(id: string): Promise<Issue> {
      await simulateLatency();
      const found = store.issues.find((i) => i.id === id);
      if (!found) throw new Error('issue_not_found');
      return clone(found);
    },
    async create(req: NewIssue): Promise<Issue> {
      await simulateLatency();
      const issue: Issue = {
        id: store.genId('issue'),
        category: req.category,
        title: req.title,
        description: req.description,
        priority: req.priority,
        status: 'open',
        tripId: req.tripId,
        photoUrl: req.photoUri,
        createdAt: new Date().toISOString(),
      };
      store.issues.unshift(issue);
      return clone(issue);
    },
  };
}
