import type { IssuesRepository } from '@/data/repositories/types';
import type { HttpClient } from '@/lib/httpClient';
import { toIssue, fromNewIssue } from './mappers';
import { parseWire } from './schemas/wire';
import { issueSchema, issueListSchema } from './schemas/features.schema';

export function httpIssues(http: HttpClient): IssuesRepository {
  return {
    list: () => http.get('/staff/issues').then((d) => parseWire(issueListSchema, d, 'issues').map(toIssue)),
    create: (req) => http.post('/staff/issues', fromNewIssue(req)).then((d) => toIssue(parseWire(issueSchema, d, 'issue'))),
  };
}
