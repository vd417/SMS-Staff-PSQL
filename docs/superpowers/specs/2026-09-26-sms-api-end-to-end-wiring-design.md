# Staff App ↔ sms-api End-to-End Wiring — Design

**Date:** 2026-09-26
**Status:** Approved in conversation; awaiting written-spec review
**Repos:** `sms-staff` (this repo) and `sms-api` (branch `feat/sms-api-e2e-wiring`, based on `postgres-migration`)

## 1. Goal

Make every existing screen of the staff app work end to end against the real `sms-api` + PostgreSQL backend (the retired `sms-backend` is not a reference and none of its behaviour is recreated), including server-driven transport trips in which the backend is the single source of truth for trip attribution and stop progress.

### Success criteria

- A seeded local stack (`docker compose --profile seed up`) plus the app in `live` mode supports the full driver flow and conductor flow described in §8 with no mock data.
- Stop arrival/departure state seen by parent/admin apps comes from persisted `TripStopProgress` rows written by explicit staff actions.
- A conductor is never recorded as `driver_id`.
- Sessions survive the 15-minute access-token lifetime without the user noticing.
- Every live HTTP response is validated against a zod schema; contract drift fails loudly in tests.
- All changes are committed on local feature branches; **nothing is pushed** until the user explicitly approves.

### In scope (decision "B")

1. All existing staff screens against real `sms-api`.
2. Real PostgreSQL data, with an idempotent dev seed.
3. Fixing the identified app/API contract gaps (§4–§6).
4. Server-driven transport trips using the backend's authoritative stop sequence.
5. Conductor assignment fix in `sms-api`.
6. Backend changes only where an existing flow requires them.

### Out of scope (follow-up work)

- Notifications (`/v1/notifications`), payslips, password-reset (`password/forgot|reset`) UI.
- SignalR clients in the staff app (live-event cache invalidation, fleet position subscription).
- GPS-fallback / broadcaster-arbitration changes.
- Any change to the parent, teacher or admin apps — they already consume backend stop/position events.

## 2. Decisions

| # | Decision | Choice |
|---|---|---|
| D1 | Scope | B: existing screens + server-driven trips; backend changes allowed |
| D2 | Who may start a trip | Either the bus's assigned driver or assigned conductor; `driver_id`/`conductor_id` always come from the bus assignment, never from the caller |
| D3 | Required assignment | A driver must be assigned (else 422 `no_driver_assigned`); a conductor is optional (`conductor_id` null) |
| D4 | Stop UX | Explicit **Arrived** (`confirm-arrival`) and **Depart stop** (`complete`) actions; the app never transitions stop state automatically |
| D5 | Manual "no GPS" arrival override | Removed — the server rejects it (`no_location`/`too_far`) |
| D6 | Approach | Contract-first vertical slices: zod schema per feature derived from `sms-api` DTOs, verified against the seeded stack slice by slice |
| D7 | Login role | App stops sending `role`; the duty role comes only from `/auth/me` `role_key` |

## 3. Backend changes (`sms-api`)

### 3.1 Trip start attribution

`POST /v1/staff/trips` (`TripService.StartAsync`). The check is done in C# before calling the unchanged `dbo.trip_start` function, which already fills `ConductorId` from `Buses.ConductorStaffId`; **no migration is needed**:

1. `bus_no` missing/blank → 422 `bus_no_required`.
2. Resolve the bus by `bus_no` within the caller's tenant, with its assigned driver (`Buses.DriverStaffId → Staff.UserId`) and conductor (`Buses.ConductorStaffId → Staff.UserId`). Unknown bus → 404 `bus_not_found`.
3. No assigned driver → 422 `no_driver_assigned`.
4. Caller's user id must equal the assigned driver's or conductor's user id, else 403 `not_assigned`.
5. Call `dbo.trip_start` with `DriverId` = the **assigned driver's** user id (never the caller's). `ConductorId` is filled by the function from the bus (or null). `route_id` defaults to `Buses.RouteId` when omitted.
6. Existing 409 `bus_already_active` preserved. Tenant/RLS rules unchanged.

### 3.2 Assignment for conductors

`GET /v1/staff/trip/assignment` (`TripRepository.GetAssignmentAsync`) matches the caller against `Buses.DriverStaffId` **or** `Buses.ConductorStaffId`. Response gains `driver_name` (nullable) alongside the existing `conductor_name`. All other fields unchanged.

### 3.3 Stop progress read

New `GET /v1/staff/trips/{tripId}/stops` — participant-only (same `GetParticipantRoleAsync` check as the stop write endpoints; non-participant → 403 `forbidden`). Response `data`:

```json
{
  "trip_id": "uuid",
  "current_stop_id": "uuid|null",
  "school_arrived_at": "timestamp|null",
  "stops": [
    { "stop_id": "uuid", "name": "string", "seq": 1,
      "arrived_at": "timestamp|null", "confirmed_at": "timestamp|null", "departed_at": "timestamp|null" }
  ]
}
```

Built from the trip route's `RouteStops` left-joined to `TripStopProgress` for the trip, ordered by `seq`. Readable for ended trips too (history).

### 3.4 Trip JSON

The staff `Trip` response gains `current_stop_id` (from `Trips.CurrentStopId`).

### 3.5 Dev seed

`db/dev-seed/staff_e2e.sql`, idempotent (fixed UUIDs, `INSERT … ON CONFLICT DO UPDATE`), run by a `seed` compose profile service after `migrate`. Never part of the migration chain. Seeds:

- One tenant, status `active`, with a school location (lat/lng/radius).
- Staff with email logins: driver, conductor, sweeper, gardener, guard, peon — designations mapping to each `role_key`. The seed creates each `Users` row (fixed id, `MustSetPassword=true`, no password hash, role `staff`) and links `Staff.UserId`, so user-keyed rows (leave entitlements) can be seeded. First login: email + any password → `password_not_set` → OTP (printed by the dev console sender) → set password.
- One bus with the driver and conductor assigned, on one route with 4 stops.
- Students assigned to the bus at stops.
- One task per staff role, leave balances for each staff member.

### 3.6 Backend tests (`tests/Sms.Tests.Integration`)

1. Driver starts → `driver_id` = assigned driver, `conductor_id` = assigned conductor.
2. Conductor starts → same attribution.
3. Unassigned staff member starts → 403 `not_assigned`.
4. Bus with no assigned driver → 422 `no_driver_assigned`.
5. Confirm-arrival + complete → `GET …/stops` reflects `confirmed_at`/`departed_at` and `current_stop_id`.
6. A user of another tenant cannot read `…/stops` (403/404), RLS enforced.
7. Conductor receives the assignment from `GET /trip/assignment`.

## 4. App: HTTP, auth and session

1. **Config.** `.env.example`: `EXPO_PUBLIC_API_BASE_URL=http://localhost:5080/v1`. README documents LAN-IP usage on devices and `Cors__AllowedOrigins__N` for non-default web origins.
2. **Login.** `buildLoginRequest` → `{email | phone, password}`; no `role`. After `/auth/me`, a null `role_key` aborts the session with a clear "no staff app role — contact your school admin" error. `ThemeProvider` no longer feeds login; it only persists the last theme.
3. **Token refresh.** `httpClient` gains a single-flight 401 handler: on 401 from any non-`/auth/*` request, call `POST /auth/refresh {refresh_token}` once, persist the rotated `{access_token, refresh_token}`, update `authSnapshot`, and replay the original request once. Concurrent 401s await the same refresh. Refresh failure clears the session and routes to Login. `auth.repo.refresh` parses `tokenSchema` (tokens only). Bootstrap attempts a refresh when `/auth/me` returns 401 before logging out.
4. **Errors.** `fetch` rejections → `AppError('network', 0)`. Empty-body 403 → `forbidden`. `authErrors` gains messages for billing-gate codes (`tenant_pending_activation` etc., 403) and `past_due` (402).
5. **Response validation.** Every HTTP repo parses the unwrapped `data` with a zod schema in `src/data/http/schemas/<feature>.schema.ts`. Unknown fields are ignored (zod strips them), so new server fields never break old apps; only fields the app reads are required. Parse failure → `AppError('contract_mismatch', 0)` with the zod path logged in dev.

## 5. App: feature contract fixes

| Feature | Change |
|---|---|
| Dashboard | Server returns only `hours_this_week` and `role_card` (`kind, bus_no, route_name, shift, students_assigned, on_board, capacity, next_stop`). Cards without server data (streak, leave left, alert, tasks peek) are hidden in live mode, not zeroed. |
| Attendance | Map `last_log[].in_zone` → `inZone` (currently passed through raw — bug). Send `offset_minutes` on reads and check-in/out. Surface 422 geofence codes (e.g. `school_location_not_configured`) as messages. |
| Trip | Status union adds `arrived`. Map `active_broadcaster`, `current_stop_id`; assignment maps `driver_name`. Conductor now gets an assignment, so Trip, Vehicle Check and Live Map work for conductors. |
| Bus simulation | `simulateBus` is not used in live mode; RouteStrip progress comes from server stop progress; the bus marker stays the device GPS. |
| Pings | Queue flush sends batches of ≤20 pings per POST instead of one POST per ping. |
| Boarding | Unchanged. |
| Tasks, Issues, Profile, Vehicle checks, Route geometry | Paths already match; add zod schemas. Issues keep sending `photo_url` as a data URI (accepted by the server). |
| Leave | Display the server's wider leave-type set read-only; the request form stays casual/sick/earned. |

## 6. App: server-driven stop flow

- **Query.** `useTripStops(tripId)` → `GET /staff/trips/{id}/stops`; refetched after every stop mutation and every 15 s while the trip is live.
- **Mutations.** `confirmArrival(stopId)`, `departStop(stopId)`, `markSchoolArrived()` — each invalidates the trip-stops and current-trip queries.
- **State (`useStopProgress`, rewritten)** from server data only:
  - `current_stop_id` set → `PICKUP_IN_PROGRESS` at that stop.
  - else first stop with no `departed_at` → `EN_ROUTE` to it.
  - else → `ROUTE_COMPLETED`.
  - `findActiveStop` and the manual-arrival override are deleted; `countPickup` is kept for the per-stop counts.
- **Arrived.** Shown while `EN_ROUTE`, with the device-measured distance as a hint only. The server decides:
  - `too_far` → inline "Not close enough to the stop yet."
  - `no_location` → inline "Waiting for GPS location — try again in a moment."
- **Depart stop.** Enabled only when every rostered student at the current stop is `boarded`, `dropped` or `absent`. Calls `complete`. Never automatic.
- **End of route.** Pickup trips show **Arrived at school** (`school-arrived`) then End trip; drop trips show End trip.
- **Retry safety.** Buttons disable while their mutation is in flight. `already_at_stop` is treated as success. `not_current_stop` is treated as success when the refetched progress shows the stop departed. Other errors surface inline.
- Behaviour is identical for driver and conductor.

## 7. Mock mode

Mock repos move to the live shapes: trips carry `current_stop_id` and `arrived`; a mock stop-progress store enforces the same rules as the server (sequence order, depart only the current stop, school-arrived pickup-only); mock `confirmArrival` always succeeds. The mock dashboard keeps its extra cards. `src/data/__tests__/contract.test.ts` runs both adapters through the zod schemas.

## 8. Testing and verification

**App (Jest, TDD per change):** schema tests against fixtures recorded from the seeded stack; httpClient refresh (single 401, concurrent 401s, refresh failure, network error); login body has no `role` and null `role_key` is refused; `useStopProgress` states from server progress; TripScreen `too_far`/`no_location` messages, Depart gating, retry idempotency, school-arrived path; ping batching ≤20; attendance `in_zone` mapping.

**Backend:** §3.6.

**Manual end-to-end check** (results appended to this spec):

1. `docker compose --profile seed up --build` in `sms-api`.
2. App with `EXPO_PUBLIC_DATA_SOURCE=live` on web (`localhost:8081`) and on an Android device via LAN IP.
3. Driver: first login (OTP from dev console → set password) → check-in → dashboard → start trip → confirm stop (GPS spoofed near it) → board students → depart → … → school arrived → end trip.
4. Conductor (second login): sees the assignment; after the driver's trip has ended, the conductor starts a new trip and the trip shows `driver_id` = the assigned driver; stop progress behaves identically.
5. `TripStopProgress` rows present in Postgres; fleet-hub `stop_arrived`/`stop_completed` events observed via a throwaway SignalR client.
6. Tasks, issue with photo, leave request, profile, vehicle check all succeed.
7. Idle > 15 min, then act → silent refresh.

## 9. Change map

| Repo | Files / areas |
|---|---|
| `sms-api` | `TripService`, `TripController` (new `/stops`), `TransportModule` (bus-assignment lookup, assignment query, stop-progress query, trip `current_stop_id`), `db/dev-seed/staff_e2e.sql`, `docker-compose.yml` (`seed` profile), `tests/Sms.Tests.Integration/Transport/*` |
| `sms-staff` | `.env.example`, `README.md`, `src/lib/httpClient.ts`, `src/lib/errors.ts`, `src/features/auth/*`, `src/data/http/schemas/*` (new), `src/data/http/*.repo.ts`, `src/data/http/mappers.ts`, `src/data/domain*`, `src/data/repositories/types.ts`, `src/data/mock/*`, `src/features/trip/{hooks,useStopProgress,stopProgress,pingQueue,broadcaster}.ts`, `src/screens/{TripScreen,LiveMapScreen,HomeScreen}.tsx`, tests alongside |
| Parent / teacher / admin apps | None |

## 10. Git

Feature branch `feat/sms-api-e2e-wiring` in both repos. Local commits only; no push until explicit user approval.
