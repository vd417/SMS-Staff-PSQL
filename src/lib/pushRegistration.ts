import { Platform } from 'react-native';
import { env } from '@/config/env';
import { authSnapshot } from '@/lib/authSnapshot';

/** Registers this phone for banners. Skipped in tests and on web. */
export async function registerDevicePush(): Promise<void> {
  if (process.env.JEST_WORKER_ID) return;
  if (Platform.OS === 'web') return;
  const { accessToken, tenantId } = authSnapshot.get();
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
  } catch {
    /* permission denied or a simulator without push must not block login */
  }
}
