import { Platform } from 'react-native';
import { env } from '@/config/env';
import { authSnapshot } from '@/lib/authSnapshot';

let registeredToken = '';
let watchingRefresh = false;

async function postToken(token: string): Promise<void> {
  const { accessToken, tenantId } = authSnapshot.get();
  if (!accessToken || token.length < 20) return;
  registeredToken = token;
  await fetch(`${env.API_BASE_URL}/push-devices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}),
    },
    body: JSON.stringify({
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      app: 'staff',
    }),
  });
}

/** Drops this phone's token. Call before the auth header is cleared. */
export async function unregisterDevicePush(): Promise<void> {
  const token = registeredToken;
  const { accessToken, tenantId } = authSnapshot.get();
  registeredToken = '';
  if (!token || !accessToken) return;
  try {
    await fetch(`${env.API_BASE_URL}/push-devices`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}),
      },
      body: JSON.stringify({ token }),
    });
  } catch {
    /* logout still continues */
  }
}

/** Registers this phone for banners. Skipped in tests and on web. */
export async function registerDevicePush(): Promise<void> {
  if (process.env.JEST_WORKER_ID) return;
  if (Platform.OS === 'web') return;
  const { accessToken } = authSnapshot.get();
  if (!accessToken) return;
  try {
    const Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    const existing = await Notifications.getPermissionsAsync();
    const granted =
      existing.status === 'granted'
        ? existing
        : await Notifications.requestPermissionsAsync();
    if (granted.status !== 'granted') return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Alerts',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const device = await Notifications.getDevicePushTokenAsync();
    const token = typeof device.data === 'string' ? device.data : '';
    if (token.length < 20) return;
    await postToken(token);
    if (!watchingRefresh) {
      watchingRefresh = true;
      Notifications.addPushTokenListener((next) => {
        const refreshed = typeof next.data === 'string' ? next.data : '';
        if (refreshed.length < 20 || refreshed === registeredToken) return;
        void postToken(refreshed);
      });
    }
  } catch {
    /* permission denied or a simulator without push must not block login */
  }
}
