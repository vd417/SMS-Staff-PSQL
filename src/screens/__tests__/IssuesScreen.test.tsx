import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AppProviders } from '@/providers/AppProviders';
import { IssuesScreen } from '@/screens/IssuesScreen';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

const mockRequestMediaLibraryPermissionsAsync = jest.fn(async () => ({ status: 'granted' }));
const mockLaunchImageLibraryAsync = jest.fn(async () => ({
  canceled: false,
  assets: [{ uri: 'file:///photo.jpg', base64: 'abc123' }],
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: () => mockRequestMediaLibraryPermissionsAsync(),
  launchImageLibraryAsync: (..._args: unknown[]) => mockLaunchImageLibraryAsync(),
}));

const mockSaveAsync = jest.fn(async () => ({ uri: 'file:///photo-resized.jpg', width: 800, height: 600, base64: 'abc123' }));
const mockManipulatorContext: { resize: jest.Mock; renderAsync: jest.Mock } = {
  resize: jest.fn(() => mockManipulatorContext),
  renderAsync: jest.fn(async () => ({ saveAsync: mockSaveAsync })),
};
const mockManipulate = jest.fn((_uri: string) => mockManipulatorContext);
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: (uri: string) => mockManipulate(uri) },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));

jest.mock('@/features/trip/hooks', () => ({
  ...jest.requireActual('@/features/trip/hooks'),
  useCurrentTrip: () => ({ data: null, isLoading: false }),
}));

const mockCreate = jest.fn(async (req: unknown) => ({ id: 'i1', status: 'open', createdAt: '2026-09-15T08:00:00Z', ...(req as object) }));
let mockIssuesData: any[] = [];
let mockDetail: any = { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
jest.mock('@/features/issues/hooks', () => ({
  useIssues: () => ({ data: mockIssuesData, isLoading: false, isError: false, refetch: jest.fn() }),
  useReportIssue: () => ({ mutateAsync: mockCreate, isPending: false }),
  useIssueDetail: () => mockDetail,
}));

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() } as any;

function renderIssues() {
  return render(<AppProviders><IssuesScreen navigation={mockNavigation} /></AppProviders>);
}

beforeEach(() => {
  mockIssuesData = [];
  mockDetail = { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  mockCreate.mockClear();
  mockRequestMediaLibraryPermissionsAsync.mockClear();
  mockLaunchImageLibraryAsync.mockClear();
  mockManipulate.mockClear();
  mockManipulatorContext.resize.mockClear();
  mockManipulatorContext.renderAsync.mockClear();
  mockSaveAsync.mockClear();
  mockNavigation.goBack.mockClear();
  mockNavigation.navigate.mockClear();
});

it('submits a report with the entered fields', async () => {
  const { getByTestId, getByText, findByTestId } = renderIssues();
  await findByTestId('issue-title');
  fireEvent.changeText(getByTestId('issue-title'), 'Loose seatbelt');
  fireEvent.changeText(getByTestId('issue-description'), 'Row 3 seatbelt is broken.');
  fireEvent.press(getByTestId('issue-category-safety'));
  fireEvent.press(getByTestId('issue-priority-high'));
  fireEvent.press(getByTestId('issue-submit'));
  await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({
    category: 'safety',
    title: 'Loose seatbelt',
    description: 'Row 3 seatbelt is broken.',
    priority: 'high',
  }));
  expect(getByText('Report submitted')).toBeTruthy();
});

it('shows a validation message when required fields are empty', async () => {
  const { getByTestId, getByText, findByTestId } = renderIssues();
  await findByTestId('issue-submit');
  fireEvent.press(getByTestId('issue-submit'));
  await waitFor(() => expect(getByText('Please fill in all required fields')).toBeTruthy());
  expect(mockCreate).not.toHaveBeenCalled();
});

it('attaches a photo and submits it with the report', async () => {
  const { getByTestId, findByTestId } = renderIssues();
  await findByTestId('issue-title');
  fireEvent.changeText(getByTestId('issue-title'), 'Loose seatbelt');
  fireEvent.changeText(getByTestId('issue-description'), 'Row 3 seatbelt is broken.');
  fireEvent.press(getByTestId('issue-attach-photo'));
  await waitFor(() => expect(mockSaveAsync).toHaveBeenCalled());
  fireEvent.press(getByTestId('issue-submit'));
  await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
    photoUri: 'data:image/jpeg;base64,abc123',
  })));
});

it('resizes the photo to at most 1024px before reading base64', async () => {
  const { getByTestId, findByTestId } = renderIssues();
  await findByTestId('issue-title');
  fireEvent.press(getByTestId('issue-attach-photo'));
  await waitFor(() => expect(mockManipulate).toHaveBeenCalledWith('file:///photo.jpg'));
  expect(mockManipulatorContext.resize).toHaveBeenCalledWith({ width: 1024 });
});

it('shows a toast and does not attach the photo when it is still too large after resizing', async () => {
  mockSaveAsync.mockResolvedValueOnce({ uri: 'file:///photo-resized.jpg', width: 800, height: 600, base64: 'a'.repeat(400000) });
  const { getByTestId, getByText, findByTestId } = renderIssues();
  await findByTestId('issue-title');
  fireEvent.changeText(getByTestId('issue-title'), 'Loose seatbelt');
  fireEvent.changeText(getByTestId('issue-description'), 'Row 3 seatbelt is broken.');
  fireEvent.press(getByTestId('issue-attach-photo'));
  await waitFor(() => expect(getByText('Photo is too large, please choose a smaller one')).toBeTruthy());
  fireEvent.press(getByTestId('issue-submit'));
  await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ photoUri: undefined })));
});

it('shows an empty state when there are no past reports', async () => {
  const { getByText } = renderIssues();
  await waitFor(() => expect(getByText('No reports yet')).toBeTruthy());
});

const issueRow = (over: Record<string, unknown> = {}) => ({
  id: 'i1', category: 'safety', title: 'Loose seatbelt', description: 'd', priority: 'high',
  status: 'open', createdAt: '2026-09-15T08:00:00Z', ...over,
});

it('opens a report on tap and shows its attached photo', async () => {
  mockIssuesData = [issueRow()];
  mockDetail = { data: issueRow({ photoUrl: 'data:image/jpeg;base64,abc' }), isLoading: false, isError: false, refetch: jest.fn() };
  const { getByTestId, findByTestId } = renderIssues();
  await findByTestId('issue-row-i1');
  fireEvent.press(getByTestId('issue-row-i1'));
  const photo = await findByTestId('issue-photo');
  expect(photo.props.source).toEqual({ uri: 'data:image/jpeg;base64,abc' });
});

it('shows a no-photo message when an opened report has no photo', async () => {
  mockIssuesData = [issueRow()];
  mockDetail = { data: issueRow(), isLoading: false, isError: false, refetch: jest.fn() };
  const { getByTestId, findByTestId, getByText } = renderIssues();
  await findByTestId('issue-row-i1');
  fireEvent.press(getByTestId('issue-row-i1'));
  await waitFor(() => expect(getByText('No photo attached')).toBeTruthy());
});

it('shows an error with retry when the report detail fails to load', async () => {
  const refetch = jest.fn();
  mockIssuesData = [issueRow()];
  mockDetail = { data: undefined, isLoading: false, isError: true, refetch };
  const { getByTestId, findByTestId, getByText } = renderIssues();
  await findByTestId('issue-row-i1');
  fireEvent.press(getByTestId('issue-row-i1'));
  await waitFor(() => expect(getByText('Something went wrong')).toBeTruthy());
  fireEvent.press(getByText('Retry'));
  expect(refetch).toHaveBeenCalled();
});

it('navigates back when the back button is pressed', async () => {
  const { getByLabelText, findByTestId } = renderIssues();
  await findByTestId('issue-title');
  fireEvent.press(getByLabelText('Back'));
  expect(mockNavigation.goBack).toHaveBeenCalled();
});
