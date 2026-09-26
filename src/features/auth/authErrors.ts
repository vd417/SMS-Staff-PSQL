import { AppError } from '@/lib/errors';

const MESSAGES: Record<string, string> = {
  not_registered: "This mobile or email isn't registered.",
  invalid_code: 'Code is invalid or expired.',
  password_not_set: "You haven't set a password yet.",
  invalid_credentials: 'Incorrect email/phone or password.',
  weak_password: 'Password must be at least 8 characters.',
  no_staff_role: 'Your account has no staff app role. Contact your school admin.',
  tenant_pending_activation: "Your school's account isn't active yet. Please contact your school admin.",
  tenant_on_hold: "Your school's account is on hold. Please contact your school admin.",
  tenant_deactivated: "Your school's account has been deactivated. Please contact your school admin.",
  tenant_suspended: "Your school's account is suspended. Please contact your school admin.",
  past_due: "Your school's subscription payment is overdue. Some actions are unavailable.",
  payment_required: "Your school's subscription payment is overdue. Some actions are unavailable.",
  contract_mismatch: 'The app and the server are out of sync. Please update the app.',
};

// wrong_role / access_removed / access_inactive: the backend supplies specific,
// role- or admin-authored wording (e.g. "Use the Guard tab to sign in.") — prefer
// err.message for these codes rather than a generic static string, falling back
// to a generic line only if the server ever omits it.
const PREFER_SERVER_MESSAGE: Record<string, string> = {
  wrong_role: 'This account is not registered for that role.',
  access_removed: 'Your access to this school has been removed by the admin.',
  access_inactive: 'Your access to this school has been deactivated by the admin.',
};

const DEFAULT_FALLBACK = 'Something went wrong. Please try again.';

/** Maps an unknown error (usually an AppError from httpClient) to user-facing copy. */
export function authErrorMessage(err: unknown, fallback: string = DEFAULT_FALLBACK): string {
  if (err instanceof AppError) {
    if (err.status === 0 && err.code !== 'contract_mismatch') {
      return 'Cannot reach the server. Please check your connection and try again.';
    }
    if (err.status === 429) return 'Too many attempts. Please wait a moment and try again.';
    if (err.code in PREFER_SERVER_MESSAGE) return err.message || PREFER_SERVER_MESSAGE[err.code];
    return MESSAGES[err.code] ?? err.message ?? fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
