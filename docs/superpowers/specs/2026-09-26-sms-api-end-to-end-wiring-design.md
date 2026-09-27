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

## 11. End-to-end check results (2026-09-27)

Environment: Docker is not installed on the check machine, so the brief's compose stack and the live app were replaced by an API-level scripted walkthrough (Node 18+ `fetch`, plus a throwaway `@microsoft/signalr` client). The scripts exercise the same endpoints and request bodies the app's `src/data/http/*.repo.ts` send. The API ran from the `sms-api` worktree on branch `feat/sms-api-e2e-impl`, against a freshly rebuilt local Postgres 18 database `sms_e2e` (PgMigrator `init` + `db/dev-seed/staff_e2e.sql`), connected as the non-superuser `sms_app`. Run 1 used the default 15-minute access tokens. Run 2 used `Jwt__AccessTokenMinutes=1` and `Timezone=UTC` in the connection string. Anything that needs the Android app, the web UI, GPS spoofing in the app, or killing the app was not run.

| Check | Web | Android | API-scripted | Notes |
|---|---|---|---|---|
| Driver first login (OTP → set password) | NOT RUN — needs a human on a device | NOT RUN — needs a human on a device | PASS | login → 409 `password_not_set` → OTP request 200 (code read from the API console) → verify 200 → set-password 204 → login 200 → `/auth/me` `role_key=driver`. |
| Attendance check-in (in zone) | NOT RUN — needs a human on a device | NOT RUN — needs a human on a device | FAIL | Check-in at 28.4595, 77.0266 → 201, and the row was stored with `Verified=true` at 0 m. But the response and `GET /staff/attendance` said `checked_in=false, last_log=[]`, because the DB session timezone was Asia/Calcutta (F1). Re-reading under a UTC session: `checked_in=true`, `in_zone=true`. Outside the zone (sweeper, 2279 m): 201 with `in_zone=false`, not rejected. |
| Dashboard role card | NOT RUN — needs a human on a device | NOT RUN — needs a human on a device | PASS | `role_card={kind:driver, bus_no:E2E-BUS-01, route_name:E2E Route 1, students_assigned:4}`. The payload has only `hours_this_week` and `role_card`, so the app has no streak/leave data to show. Sweeper: `role_card=null`. |
| Start trip / Arrived / too_far message | NOT RUN — needs a human on a device | NOT RUN — needs a human on a device | PASS | Start 201. `/trip/current` shows `driver_id=…101, conductor_id=…102`. Arrived before any ping → 409 `no_location`. Ping at stop 1 → Arrived 204. Arrived at stop 2 while at stop 1 → 409 `wrong_stop_order`. From ~2 km away → 409 `too_far`. |
| Depart gating (incl. empty stop) | NOT RUN — needs a human on a device | NOT RUN — needs a human on a device | PASS | Stop 1: boarded + absent → depart 204. The server does not gate on unresolved students: depart at stop 2 with its student unresolved → 204 (gating is client-side only, F5). Stop 3 (0 students): Arrived 204, then depart 204 immediately. |
| School arrived → end trip | NOT RUN — needs a human on a device | NOT RUN — needs a human on a device | PASS | Stop 4 Arrived/depart 204. School-arrived 204. End 200 with summary `{distance_km:4.44, stops_covered:3, boarded_count:3}` (`stops_covered` leaves out the empty stop, F6). A ping to the ended trip → 409 `trip_ended`. |
| Resume broadcasting after restart | NOT RUN — needs a human on a device | NOT RUN — needs a human on a device | NOT RUN — needs a human on a device | Needs the app to be killed and reopened on a device. |
| Conductor assignment + attribution | NOT RUN — needs a human on a device | NOT RUN — needs a human on a device | PASS | Conductor: OTP → set password → `role_key=conductor`. The assignment shows `driver_name=Ramesh Driver`. The conductor's start → 201 with `driver_id=…101, conductor_id=…102`, and SQL on the latest `Trips` row agrees. The driver's `/trip/current` shows the conductor's trip. A fresh trip with no pings → Arrived 409 `no_location`. |
| Concurrent Arrived (driver + conductor) | NOT RUN — needs a human on a device | NOT RUN — needs a human on a device | PASS | Neither phone ever got an error. In the walkthrough, a parallel Arrived gave driver 204 and conductor 409 `already_at_stop`, and a retry gave 409 `already_at_stop`. Over 12 more parallel trials, both calls got 204 every time, and depart got 204+204 six times out of twelve (a server race, F2). |
| TripStopProgress rows + fleet events | NOT RUN — needs a human on a device | NOT RUN — needs a human on a device | PASS | 4 `TripStopProgress` rows, each with `ConfirmedAt` and `DepartedAt`. `GET /stops`: all 4 confirmed and departed, `school_arrived_at` set, `current_stop_id=null`. Hub `JoinBus(…401)` → true, then `stop_arrived`×4, `stop_completed`×4, `school_arrived`×1, `trip_ended`×1 and `position_update`×6. |
| Tasks / issues / leave / profile / vehicle | NOT RUN — needs a human on a device | NOT RUN — needs a human on a device | PASS | Tasks: 1 task after the seed fix (F3); complete 200 → `done=true`; photo (base64 data URI) 200 → `photo_url` set. Issue with photo: 201, photo stored, but the list returns `photo_url=null` by design (F4). Leave: 201, shows `pending`, balances 12/10/15. Profile: 200. Inspection: 200. Fuel log: 201. Both lists return the new rows. |
| Silent token refresh | NOT RUN — needs a human on a device | NOT RUN — needs a human on a device | PASS | The 1-minute token was rejected with 401 after ~361 s (`exp` plus the default 5-minute JwtBearer clock skew, F7). Refresh with the stored token → 200, and the retried call → 200. Reusing the old refresh token → 401 `invalid_token` (rotation). The new refresh token → 200. |
| Sweeper login (non-transport role) | NOT RUN — needs a human on a device | NOT RUN — needs a human on a device | PASS | OTP → set password → `role_key=sweeper`. `role_card=null`, 1 task, `/trip/assignment` → 404 `not_found`. |

Counts: API-scripted: 11 PASS, 1 FAIL, 1 NOT RUN. Web and Android: 13 NOT RUN each.

### Findings

- **F1 (backend defect, FAIL above).** The attendance "today" window is built from `DateTimeKind.Unspecified` bounds (`CheckInRepository.LocalDayBoundsUtc`). Npgsql sends these as `timestamp`, and Postgres converts them to `timestamptz` using the session `TimeZone`. On a server that is not on UTC (the local Postgres 18 here is Asia/Calcutta), the window moves by the offset. A punch made between 18:30 and 24:00 IST is missing from `GET /staff/attendance` and from the check-in response, and the previous evening's punches count as today. The same SQL returns 0 rows under Asia/Calcutta and 1 under UTC. The Docker `postgres` image defaults to UTC, so the compose stack hides this. Fix: `DateTime.SpecifyKind(..., DateTimeKind.Utc)` on the bounds, or pin `Timezone=UTC` in the connection string. Not fixed here.
- **F2 (backend race).** `confirm-arrival` and `stops/{id}/complete` check the current stop and then write, with no lock or conditional update. When both phones tap at the same moment, both get 204: 12/12 parallel Arrived trials and 6/12 parallel departs. The second write rewrites `ConfirmedAt`/`DepartedAt`, and the second call emits a duplicate `stop_arrived`/`stop_completed` event (and may send duplicate parent alerts). No duplicate rows are created. The app is unaffected, because it treats 204 and `already_at_stop`/`not_current_stop` alike. A conditional update in `TripStopProgress_ConfirmArrival`/`_Complete` would make the second call the 409 the design assumes.
- **F3 (seed bug, fixed).** `db/dev-seed/staff_e2e.sql` seeded tasks into the legacy `dbo."StaffTasks"` table, but `TaskService` reads `dbo."Tasks"` by `AssignedToUserId`, so `/v1/staff/tasks` returned `[]`. The seed now inserts the same fixed ids (…0701–0706) into `dbo."Tasks"`. It still applies twice cleanly. Committed as `6827180` in the `sms-api` worktree (`feat/sms-api-e2e-impl`).
- **F4 (app gap).** `GET /staff/issues` always returns `photo_url: null`, on purpose, to keep list polls small. The photo is only in `GET /staff/issues/{id}`, whose shape is `{issue, notes}`. The app only calls the list, so a photo attached to an issue never shows in the app.
- **F5 (by design).** The server lets a stop be departed while students are unresolved. Depart gating exists only in the app (Review Focus #5 / Task B8), and that path was not exercised on a device.
- **F6 (surprise).** The end-of-trip summary's `stops_covered` counts distinct stops that have a `Boardings` row, not `TripStopProgress`. It reported 3 for a trip that confirmed and departed all 4 stops, because stop 3 had no students.
- **F7 (environment).** The API project's user-secrets pin `Kestrel:Endpoints:Http:Url` to `0.0.0.0:5262` and hold real SMTP credentials. Both beat `--urls`/`ASPNETCORE_URLS`. The runs overrode them with `Kestrel__Endpoints__Http__Url=http://localhost:5080` and `Smtp__Host=127.0.0.1`, so no mail left the machine. JwtBearer uses the default 5-minute `ClockSkew`, so a "15-minute" access token is accepted for about 20 minutes.
- **F8 (minor inconsistency).** `POST /staff/vehicle-checks/inspections` returns 200, while `fuel-logs` (and every other create) returns 201. The app accepts any 2xx.
