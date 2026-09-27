/** Minutes east of UTC (IST → 330) — sms-api's offset_minutes convention. */
export function deviceUtcOffsetMinutes(d: Date = new Date()): number {
  return -d.getTimezoneOffset();
}
