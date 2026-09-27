import { z } from 'zod';
import { opt } from './wire';

const roleCardSchema = z.object({
  kind: z.string(),
  bus_no: opt(z.string()),
  route_name: opt(z.string()),
  shift: opt(z.string()),
  students_assigned: opt(z.number()),
});

const taskPeekSchema = z
  .object({ id: z.string(), title: z.string(), priority: z.enum(['urgent', 'normal']), done: z.boolean(), photo_url: opt(z.string()) })
  .transform((p) => ({ id: p.id, title: p.title, priority: p.priority, done: p.done, photoUrl: p.photo_url }));

export const dashboardSchema = z.object({
  hours_this_week: z.number(),
  hours_target: opt(z.number()),
  streak_days: opt(z.number()),
  leave_left: opt(z.number()),
  role_card: roleCardSchema.nullish(),
  pending_tasks_peek: opt(z.array(taskPeekSchema)),
  alert: opt(z.string()),
});
