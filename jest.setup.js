/* global jest */
import '@testing-library/react-native';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './src/i18n/resources/en.json';
import hi from './src/i18n/resources/hi.json';
import mr from './src/i18n/resources/mr.json';
import ta from './src/i18n/resources/ta.json';

// Silence reanimated in tests
global.__reanimatedWorkletInit = () => {};

// Initialise i18n synchronously so t('common.retry') returns 'Retry' in tests.
if (!i18next.isInitialized) {
  i18next.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      mr: { translation: mr },
      ta: { translation: ta },
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

// Mock react-native-safe-area-context so SafeAreaProvider + useSafeAreaInsets work in tests.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

// Mock react-native-maps globally so any component using it (transitively reached via real
// navigation trees, e.g. src/__tests__/integration.test.tsx) doesn't crash on
// TurboModuleRegistry.getEnforcing. A test that needs finer-grained control (e.g.
// src/features/map/__tests__/LiveMapView.test.tsx) can still declare its own local
// jest.mock('react-native-maps', ...), which takes precedence over this global one.
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockMapView = ({ children, testID }) => React.createElement(View, { testID }, children);
  const MockMarker = ({ testID }) => React.createElement(View, { testID });
  const MockPolyline = ({ testID }) => React.createElement(View, { testID });
  return {
    __esModule: true,
    default: MockMapView,
    Marker: MockMarker,
    Polyline: MockPolyline,
    PROVIDER_GOOGLE: 'google',
  };
});

// Mock expo-task-manager globally. The trip broadcaster imports it at module load, and the
// broadcaster is now reached transitively by anything that renders AuthProvider — without this
// those suites crash on requireNativeModule. Suites that exercise the broadcaster directly
// declare their own jest.mock('expo-task-manager', ...), which takes precedence.
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
}));

// Mock AsyncStorage globally so ThemeProvider (used in renderWithTheme) works in all tests.
jest.mock('@react-native-async-storage/async-storage', () => {
  let mem = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k) => Promise.resolve(mem[k] ?? null)),
      setItem: jest.fn((k, v) => { mem[k] = v; return Promise.resolve(); }),
      removeItem: jest.fn((k) => { delete mem[k]; return Promise.resolve(); }),
      clear: jest.fn(() => { mem = {}; return Promise.resolve(); }),
    },
  };
});
