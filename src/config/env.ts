export type DataSource = 'mock' | 'live';

/**
 * Mock DATA_SOURCE (AsyncStorage business SoT) is development-only.
 * Production / release builds always use live HTTP repositories so mock
 * persistAttendance / persistTrip / persistLeave cannot ship as SoT.
 */
function isDevRuntime(): boolean {
  return (
    (typeof __DEV__ !== 'undefined' && __DEV__) ||
    process.env.NODE_ENV === 'development' ||
    process.env.NODE_ENV === 'test'
  );
}

function resolveDataSource(): DataSource {
  if (!isDevRuntime()) return 'live';
  return process.env.EXPO_PUBLIC_DATA_SOURCE === 'live' ? 'live' : 'mock';
}

const DATA_SOURCE: DataSource = resolveDataSource();

/** Release builds talk to production even if the EAS env var was not inlined. */
const PRODUCTION_API = 'https://api.sms.catretech.me/v1';

export const env = {
  DATA_SOURCE,
  API_BASE_URL:
    process.env.EXPO_PUBLIC_API_BASE_URL ?? (isDevRuntime() ? 'https://api.schoolmate.local' : PRODUCTION_API),
} as const;
