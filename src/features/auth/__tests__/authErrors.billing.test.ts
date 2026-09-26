import { authErrorMessage } from '@/features/auth/authErrors';
import { AppError } from '@/lib/errors';

describe('authErrorMessage — gate and contract codes', () => {
  it.each([
    ['tenant_pending_activation', 403, "Your school's account isn't active yet. Please contact your school admin."],
    ['tenant_on_hold', 403, "Your school's account is on hold. Please contact your school admin."],
    ['tenant_deactivated', 403, "Your school's account has been deactivated. Please contact your school admin."],
    ['tenant_suspended', 403, "Your school's account is suspended. Please contact your school admin."],
    ['past_due', 402, "Your school's subscription payment is overdue. Some actions are unavailable."],
    ['payment_required', 402, "Your school's subscription payment is overdue. Some actions are unavailable."],
    ['no_staff_role', 403, 'Your account has no staff app role. Contact your school admin.'],
  ])('%s', (code, status, text) => {
    expect(authErrorMessage(new AppError(code, status, 'server text'))).toBe(text);
  });

  it('contract_mismatch is not reported as a connectivity problem', () => {
    expect(authErrorMessage(new AppError('contract_mismatch', 0, 'x')))
      .toBe('The app and the server are out of sync. Please update the app.');
  });

  it('network still reads as a connectivity problem', () => {
    expect(authErrorMessage(new AppError('network', 0, 'x')))
      .toBe('Cannot reach the server. Please check your connection and try again.');
  });
});
