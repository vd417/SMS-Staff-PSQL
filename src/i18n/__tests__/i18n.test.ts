jest.mock('@react-native-async-storage/async-storage', () => {
  const mem: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k: string) => Promise.resolve(mem[k] ?? null)),
      setItem: jest.fn((k: string, v: string) => {
        mem[k] = v;
        return Promise.resolve();
      }),
      removeItem: jest.fn((k: string) => {
        delete mem[k];
        return Promise.resolve();
      }),
    },
  };
});

import { i18n, initI18n, setLanguage, SUPPORTED_LANGUAGES } from '@/i18n';

describe('i18n', () => {
  beforeAll(async () => {
    await initI18n();
  });

  it('supports the four design languages', () => {
    expect(SUPPORTED_LANGUAGES.map((l) => l.code)).toEqual(['en', 'hi', 'mr', 'ta']);
  });

  it('translates a key in English', () => {
    expect(i18n.t('role.driver')).toBe('Bus Driver');
    expect(i18n.t('profile.employeeId')).toBe('Employee ID');
    expect(i18n.t('profile.joined')).toBe('Joined');
    expect(i18n.t('profile.emptyDocuments')).toBe('No documents on file yet');
    expect(i18n.t('profile.light')).toBe('Light');
    expect(i18n.t('profile.dark')).toBe('Dark');
  });

  it('interpolates variables', () => {
    expect(i18n.t('home.goodMorning', { name: 'Ramesh' })).toBe('Good morning, Ramesh');
  });

  it('switches language and falls back to English for missing keys', async () => {
    await i18n.changeLanguage('hi');
    expect(i18n.t('role.driver')).toBe('बस चालक');
    expect(i18n.t('nonexistent.key')).toBe('nonexistent.key');
    await i18n.changeLanguage('en');
  });

  it('setLanguage persists the choice to storage', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    await setLanguage('hi');
    expect(await AsyncStorage.getItem('sms_staff_lang')).toBe(JSON.stringify('hi'));
    await setLanguage('en'); // restore for other tests
  });
});
