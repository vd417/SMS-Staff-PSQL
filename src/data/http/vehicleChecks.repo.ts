import type { VehicleChecksRepository } from '@/data/repositories/types';
import type { HttpClient } from '@/lib/httpClient';
import {
  toVehicleInspection, fromNewVehicleInspection,
  toFuelLog, fromNewFuelLog,
} from './mappers';
import { parseWire } from './schemas/wire';
import { inspectionSchema, inspectionListSchema, fuelLogSchema, fuelLogListSchema } from './schemas/features.schema';

export function httpVehicleChecks(http: HttpClient): VehicleChecksRepository {
  return {
    listInspections: (busId) =>
      http.get(`/staff/vehicle-checks/inspections?busId=${busId}`)
        .then((d) => parseWire(inspectionListSchema, d, 'vehicle inspections').map(toVehicleInspection)),
    submitInspection: (req) =>
      http.post('/staff/vehicle-checks/inspections', fromNewVehicleInspection(req))
        .then((d) => toVehicleInspection(parseWire(inspectionSchema, d, 'vehicle inspection'))),
    listFuelLogs: (busId) =>
      http.get(`/staff/vehicle-checks/fuel-logs?busId=${busId}`)
        .then((d) => parseWire(fuelLogListSchema, d, 'fuel logs').map(toFuelLog)),
    submitFuelLog: (req) =>
      http.post('/staff/vehicle-checks/fuel-logs', fromNewFuelLog(req))
        .then((d) => toFuelLog(parseWire(fuelLogSchema, d, 'fuel log'))),
  };
}
