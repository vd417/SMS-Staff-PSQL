import { z } from 'zod';
import { AppError } from '@/lib/errors';

/** sms-api writes absent optionals as null; the app's DTOs use undefined. */
export const opt = <T extends z.ZodTypeAny>(schema: T) =>
  schema.nullish().transform((v) => (v ?? undefined) as z.output<T> | undefined);

/** A display string the server may send as null. */
export const orEmpty = z.string().nullish().transform((v) => v ?? '');

/**
 * Validates an unwrapped `data` payload. Unknown fields are stripped (never an error), so new
 * server fields can't break old apps; a missing/mistyped field the app reads fails loudly.
 */
export function parseWire<T extends z.ZodTypeAny>(schema: T, value: unknown, what: string): z.output<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // eslint-disable-next-line no-console
    console.warn(`[contract] ${what}`, result.error.issues);
  }
  throw new AppError('contract_mismatch', 0, `Unexpected ${what} response from the server`);
}
