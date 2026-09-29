import type { IssuesRepository } from '@/data/repositories/types';
import type { HttpClient } from '@/lib/httpClient';
import { toIssue, fromNewIssue } from './mappers';
import { parseWire } from './schemas/wire';
import { issueSchema, issueListSchema } from './schemas/features.schema';

export function httpIssues(http: HttpClient): IssuesRepository {
  return {
    list: () => http.get('/staff/issues').then((d) => parseWire(issueListSchema, d, 'issues').map(toIssue)),
    // Detail carries the real photo_url the list omits for bandwidth — fetched on demand when a
    // report is opened, not on every list poll.
    get: (id) => http.get(`/staff/issues/${id}`).then((d) => toIssue(parseWire(issueSchema, d, 'issue'))),
    create: (req) => http.post('/staff/issues', fromNewIssue(req)).then((d) => toIssue(parseWire(issueSchema, d, 'issue'))),
  };
}
