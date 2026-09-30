import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AppProviders } from '@/providers/AppProviders';
import { VehicleCheckScreen } from '@/screens/VehicleCheckScreen';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('@/features/trip/hooks', () => ({
  ...jest.requireActual('@/features/trip/hooks'),
  useTripAssignment: () => ({ data: { busId: 'bus_1', busNo: 'HR-26-BX-4412' }, isLoading: false, isError: false, refetch: jest.fn() }),
}));

const mockSubmitInspection = jest.fn(async (req: unknown) => ({
  id: 'insp_1', allOk: true, inspectionDate: '2026-09-16', createdAt: '2026-09-16T06:00:00Z', ...(req as object),
}));
const mockSubmitFuelLog = jest.fn(async (req: unknown) => ({
  id: 'fuel_1', recordedAt: '2026-09-16T06:05:00Z', ...(req as object),
}));
jest.mock('@/features/vehicleChecks/hooks', () => ({
  useSubmitInspection: () => ({ mutateAsync: mockSubmitInspection, isPending: false }),
  useSubmitFuelLog: () => ({ mutateAsync: mockSubmitFuelLog, isPending: false }),
}));

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() } as any;

function renderScreen() {
  return render(<AppProviders><VehicleCheckScreen navigation={mockNavigation} /></AppProviders>);
}

beforeEach(() => {
  mockSubmitInspection.mockClear();
  mockSubmitFuelLog.mockClear();
  mockNavigation.goBack.mockClear();
});

it('toggles checklist items and submits the inspection for the assigned bus', async () => {
  const { getByTestId, getByText, findByTestId } = renderScreen();
  await findByTestId('vehicle-check-brakes');
  fireEvent.press(getByTestId('vehicle-check-brakes'));
  fireEvent.press(getByTestId('vehicle-check-tyres'));
  fireEvent.changeText(getByTestId('vehicle-check-remarks'), 'All good');
  fireEvent.press(getByTestId('vehicle-check-submit'));
  await waitFor(() => expect(mockSubmitInspection).toHaveBeenCalledWith({
    busId: 'bus_1',
    brakes: true, tyres: true, lights: false, horn: false,
    firstAidKit: false, fireExtinguisher: false, emergencyExit: false, fuelLevel: false,
    remarks: 'All good',
  }));
  expect(getByText('Inspection submitted')).toBeTruthy();
});

it('disables the inspection submit button after a successful submit so it cannot be re-sent', async () => {
  const { getByTestId, findByTestId } = renderScreen();
  await findByTestId('vehicle-check-submit');
  fireEvent.press(getByTestId('vehicle-check-submit'));
  await waitFor(() => expect(mockSubmitInspection).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(getByTestId('vehicle-check-submit').props.accessibilityState?.disabled).toBe(true));
  fireEvent.press(getByTestId('vehicle-check-submit'));
  expect(mockSubmitInspection).toHaveBeenCalledTimes(1);
});

it('disables the fuel save button after a successful save', async () => {
  const { getByTestId, findByTestId } = renderScreen();
  await findByTestId('fuel-log-odometer');
  fireEvent.changeText(getByTestId('fuel-log-odometer'), '45210');
  fireEvent.changeText(getByTestId('fuel-log-liters'), '30');
  fireEvent.press(getByTestId('fuel-log-save'));
  await waitFor(() => expect(mockSubmitFuelLog).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(getByTestId('fuel-log-save').props.accessibilityState?.disabled).toBe(true));
});

it('saves a fuel log entry with numeric odometer and litres', async () => {
  const { getByTestId, getByText, findByTestId } = renderScreen();
  await findByTestId('fuel-log-odometer');
  fireEvent.changeText(getByTestId('fuel-log-odometer'), '45210');
  fireEvent.changeText(getByTestId('fuel-log-liters'), '30');
  fireEvent.press(getByTestId('fuel-log-save'));
  await waitFor(() => expect(mockSubmitFuelLog).toHaveBeenCalledWith({ busId: 'bus_1', odometerKm: 45210, fuelAddedLiters: 30 }));
  expect(getByText('Fuel record saved')).toBeTruthy();
});

it('shows a validation message and does not save an invalid fuel log', async () => {
  const { getByTestId, getByText, findByTestId } = renderScreen();
  await findByTestId('fuel-log-save');
  fireEvent.press(getByTestId('fuel-log-save'));
  await waitFor(() => expect(getByText('Please enter valid odometer and fuel values')).toBeTruthy());
  expect(mockSubmitFuelLog).not.toHaveBeenCalled();
});

it('navigates back when the back button is pressed', async () => {
  const { getByLabelText, findByTestId } = renderScreen();
  await findByTestId('vehicle-check-brakes');
  fireEvent.press(getByLabelText('Back'));
  expect(mockNavigation.goBack).toHaveBeenCalled();
});
