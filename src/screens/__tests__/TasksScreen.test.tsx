import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme';
import { RepositoryProvider } from '@/data/repositories/RepositoryContext';
import { createMockRepositories } from '@/data/repositories/factory';
import { createStore } from '@/data/mock/store';
import { TasksScreen } from '@/screens/TasksScreen';

jest.mock('@react-native-async-storage/async-storage', () => {
  let mem: Record<string, string> = {};
  return { __esModule: true, default: {
    getItem: jest.fn((k: string) => Promise.resolve(mem[k] ?? null)),
    setItem: jest.fn((k: string, v: string) => { mem[k] = v; return Promise.resolve(); }),
    removeItem: jest.fn((k: string) => { delete mem[k]; return Promise.resolve(); }),
    clear: jest.fn(() => { mem = {}; return Promise.resolve(); }),
  } };
});

async function renderScreen() {
  const repos = createMockRepositories(await createStore());
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <RepositoryProvider repositories={repos}><TasksScreen /></RepositoryProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

it('reveals a required remark field on complete, and only completes once a remark is entered', async () => {
  const { findByText, getByTestId, queryByTestId } = await renderScreen();
  await findByText('Pre-trip bus inspection');

  // Tapping complete reveals the remark input but does NOT complete yet.
  fireEvent.press(getByTestId('task-complete-task_1'));
  expect(getByTestId('task-remark-input-task_1')).toBeTruthy();
  expect(queryByTestId('task-done-task_1')).toBeNull();

  // Submit with no remark is a no-op (required).
  fireEvent.press(getByTestId('task-submit-task_1'));
  expect(queryByTestId('task-done-task_1')).toBeNull();

  // With a remark, Submit completes the task and shows the remark.
  fireEvent.changeText(getByTestId('task-remark-input-task_1'), 'All good');
  fireEvent.press(getByTestId('task-submit-task_1'));
  await waitFor(() => expect(getByTestId('task-done-task_1')).toBeTruthy());
  await waitFor(() => expect(getByTestId('task-remark-task_1')).toBeTruthy());
});
