import type { TFunction } from 'i18next';
import { isAppError } from '@/lib/errors';
import { authErrorMessage } from '@/features/auth/authErrors';

const KEYS: Record<string, string> = {
  too_far: 'trip.err.tooFar',
  no_location: 'trip.err.noLocation',
  wrong_stop_order: 'trip.err.wrongOrder',
  trip_ended: 'trip.err.tripEnded',
  not_assigned: 'trip.err.notAssigned',
  no_driver_assigned: 'trip.err.noDriverAssigned',
  bus_already_active: 'trip.err.busAlreadyActive',
};

/** User-facing text for a failed trip/stop action; falls back to the shared error copy. */
export function stopActionMessage(err: unknown, t: TFunction): string {
  if (isAppError(err) && KEYS[err.code]) return t(KEYS[err.code]);
  return authErrorMessage(err, t('common.somethingWrong'));
}
