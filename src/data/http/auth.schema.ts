// src/data/http/auth.schema.ts — real /auth/* wire contract (shared across sms apps).
import { z } from 'zod';
import type { Staff, Tenant } from '@/data/domain';
import type { Role } from '@/theme/roles';

export const tokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
});
export type TokenWire = z.infer<typeof tokenSchema>;

// GET /auth/me. id/tenant_id always present; display fields are optional.
// role_key/duty_post are populated only for users with a linked dbo.Staff row
// (driver/conductor/sweeper/gardener/guard/peon) — null for teachers/admins/
// parents/students, and for staff whose Staff.Role text isn't a recognized
// duty role. rating/shift/timing still aren't on the wire anywhere.
const roleKeyWire = z.enum(['driver', 'conductor', 'sweeper', 'gardener', 'guard', 'peon']);

export const meSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  employee: z.string().nullable().optional(),
  joined: z.string().nullable().optional(),
  tenant_name: z.string().nullable().optional(),
  role_key: roleKeyWire.nullable().optional(),
  duty_post: z.string().nullable().optional(),
});
export type MeWire = z.infer<typeof meSchema>;

/**
 * Builds a Staff from the real /auth/me payload. The backend's `role_key` is
 * authoritative (sourced server-side from the caller's own Staff row) and
 * always wins when present; `roleKey` (the login-screen tile tap, or a prior
 * session's role) is only a fallback for accounts with no linked Staff row
 * (backend returns role_key: null there — teachers/admins/parents/students).
 * `duty_post` follows the same precedence; other fields the backend never
 * returns (rating/shift/timing) still fall back to `previous`.
 */
export function toStaffFromMe(me: MeWire, roleKey: Role, previous?: Staff): Staff {
  return {
    id: me.id,
    name: me.name ?? previous?.name ?? '',
    firstName: previous?.firstName ?? (me.name ?? '').split(' ')[0] ?? '',
    roleKey: me.role_key ?? roleKey,
    empId: me.employee ?? previous?.empId ?? '',
    joined: me.joined ?? previous?.joined ?? '',
    rating: previous?.rating ?? 0,
    dutyPost: me.duty_post ?? previous?.dutyPost ?? '',
    shift: previous?.shift ?? '',
    timing: previous?.timing ?? '',
    phone: me.phone ?? previous?.phone ?? '',
  };
}

export function toTenantFromMe(me: MeWire): Tenant {
  return { id: me.tenant_id, name: me.tenant_name ?? '' };
}

/** Masks an email/phone identifier for display ("a••@x.com" / "••••0118"). */
export function maskIdentifier(identifier: string): string {
  if (identifier.includes('@')) {
    const [local, domain] = identifier.split('@');
    const head = local.slice(0, 1);
    return `${head}${'•'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
  }
  const tail = identifier.slice(-4);
  return `${'•'.repeat(Math.max(identifier.length - 4, 0))}${tail}`;
}

/**
 * Builds the snake_case /auth/login body: email XOR phone, never both. No `role`: sms-api
 * provisions staff logins with only the generic `staff` role, so any duty role here would
 * 403 wrong_role. The duty role comes from /auth/me's role_key instead.
 */
export function buildLoginRequest(
  identifier: string,
  password: string,
): { email?: string; phone?: string; password: string } {
  return identifier.includes('@') ? { email: identifier, password } : { phone: identifier, password };
}
