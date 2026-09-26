# Staff App ↔ sms-api End-to-End Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every existing staff-app screen work against the real `sms-api` + PostgreSQL backend, with server-authoritative trip attribution and stop progress.

**Architecture:** Part A changes `sms-api` minimally (trip-start attribution from the bus assignment, conductor assignment lookup, a stop-progress read endpoint, `current_stop_id` on trips, an idempotent dev seed). Part B hardens the app's HTTP layer (401 refresh, typed network errors, zod validation of every response), fixes the known contract gaps feature by feature, and replaces the client-derived stop sequence with the server's `TripStopProgress` driven by explicit Arrived / Depart stop / Arrived at school actions.

**Tech Stack:** .NET 10, ASP.NET Core, Dapper, PostgreSQL 18, xUnit + FluentAssertions + `WebApplicationFactory`; Expo SDK 54 / React Native 0.81, TypeScript, TanStack Query 5, zod 4, Jest (`jest-expo`) + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-09-26-sms-api-end-to-end-wiring-design.md` (in `sms-staff`). Read it before starting; this plan argues from it.

## Global Constraints

- Repos: `D:\convert\SMS backend\sms-api` (Part A) and `D:\convert\SMS backend\sms-staff` (Part B). Both on branch `feat/sms-api-e2e-wiring` (already created). **Never push.** Commit locally after each task.
- Every commit message ends with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Backend JSON is snake_case both ways; success is `{ "data": … }`, error is `{ "error": { "code", "message", "details" } }`.
- The bus assignment is the source of truth: `Trips.DriverId` is always the bus's assigned driver's user id, `Trips.ConductorId` the bus's assigned conductor's user id (or null). The caller's identity never populates either.
- Error codes introduced by this plan (exact strings): `bus_no_required` (422), `bus_not_found` (404), `no_driver_assigned` (422), `not_assigned` (403), `no_staff_role` (403, app-side), `network` (status 0, app-side), `contract_mismatch` (status 0, app-side), `forbidden` (empty-body 403, app-side).
- Existing server stop codes the app must handle: `too_far`, `no_location`, `already_at_stop`, `wrong_stop_order`, `not_current_stop`, `trip_ended`, `invalid_state`, `bus_already_active`.
- App login body is `{email | phone, password}` — never `role`.
- The app never transitions stop state without a user tap.
- `offset_minutes` = `-new Date().getTimezoneOffset()` (IST → `330`), same as `sms-teacher-app`.
- Ping batches are at most 20 pings per POST.
- Stop-progress query refetches every 15 s while the trip is `live` or `arrived`.
- i18n: every new key is added to all four of `src/i18n/resources/{en,hi,mr,ta}.json` (flat dotted keys).
- Out of scope — do not add: notifications, payslips, password-reset UI, SignalR clients, GPS-fallback/broadcaster changes, parent/teacher/admin app changes, SQL migrations.
- Backend tests need Docker running (`PostgresFixture`). App commands run from the `sms-staff` root.

## Review Focus

1. **App restarted mid-trip.** After the app process is killed and reopened, the phone that started the trip resumes GPS broadcasting when the Trip or Live Map screen opens; otherwise every Arrived tap fails with `no_location`/`too_far`. → Task B10 test "resumes broadcasting for a persisted live trip".
2. **Queued pings for an ended trip.** Pings buffered offline for a trip that has since ended (server 409 `trip_ended`) must be dropped, not retried forever ahead of the new trip's pings. → Task B10 test "drops a batch the server permanently rejects".
3. **Offline cold start.** Opening the app with no network must keep the stored session (driver mid-route in a dead zone), not log the user out; only an auth rejection logs out. → Task B2 test "keeps the stored session when /auth/me fails with a network error".
4. **Driver and conductor tap the same stop.** When both phones confirm/depart the same stop, the second tap's `already_at_stop` / `not_current_stop` is treated as success, and no error is shown. → Task B8 tests for `isAlreadyApplied`, Task B9 screen test.
5. **Stop with no rostered students.** Depart stop is enabled immediately after Arrived at a stop with zero assigned students (vacuously resolved). → Task B8 test "canDepart is true at a stop with no assigned students".

---

# Part A — sms-api

All Part A paths are relative to `D:\convert\SMS backend\sms-api`. Run tests with `dotnet test tests/Sms.Tests.Integration --filter "FullyQualifiedName~<Class>"`.

### Task A1: Test seed helper that assigns a bus's driver, applied to existing trip-start tests

This task changes no production code. It makes the existing tests seed a real driver assignment so they keep passing once Task A2 enforces it. The suite must be green on the current code at the end of this task.

**Files:**
- Create: `tests/Sms.Tests.Integration/Transport/TripTestSeed.cs`
- Modify: `tests/Sms.Tests.Integration/Transport/TransportTripsTests.cs:46-50`
- Modify: `tests/Sms.Tests.Integration/Transport/StaffTripAssignmentTests.cs:146,162-166`
- Modify: `tests/Sms.Tests.Integration/Transport/TripOwnershipTests.cs:51-55,111-113,134-138`
- Modify: `tests/Sms.Tests.Integration/Transport/TripBroadcastTests.cs:110-113,161,198,251-260,293`
- Modify: `tests/Sms.Tests.Integration/Transport/BusConductorAssignmentTests.cs:93-95`
- Modify: `tests/Sms.Tests.Integration/Transport/TripStopEndpointsTests.cs:148`
- Modify: `tests/Sms.Tests.Integration/Issues/IssueEndpointTests.cs:265,297-298`

**Interfaces:**
- Produces: `TripTestSeed.AssignDriverAsync(string cs, Guid tenantId, string busNo, Guid driverUserId, Guid? conductorUserId = null) : Task<Guid>` (returns the bus id). Reuses an existing `Staff` row with that `UserId` if one exists; creates the bus if absent, otherwise updates its `DriverStaffId` (and `ConductorStaffId` only when `conductorUserId` is given).

- [ ] **Step 1: Write the helper**

```csharp
using Dapper;
using Npgsql;

namespace Sms.Tests.Integration.Transport;

/// Seeds the bus-assignment rows POST /v1/staff/trips requires: the caller must be the bus's
/// assigned driver or conductor (Buses.DriverStaffId/ConductorStaffId -> Staff.UserId).
internal static class TripTestSeed
{
    public static async Task<Guid> AssignDriverAsync(
        string cs, Guid tenantId, string busNo, Guid driverUserId, Guid? conductorUserId = null)
    {
        await using var conn = new NpgsqlConnection(cs);
        await conn.OpenAsync();
        await conn.ExecuteAsync("SELECT set_config('app.tenant_id', @t::text, false)", new { t = tenantId });

        var driverStaffId = await EnsureStaffAsync(conn, tenantId, driverUserId, "Test Driver");
        Guid? conductorStaffId = conductorUserId is { } cu
            ? await EnsureStaffAsync(conn, tenantId, cu, "Test Conductor")
            : null;

        var busId = await conn.ExecuteScalarAsync<Guid?>(
            "SELECT \"Id\" FROM \"dbo\".\"Buses\" WHERE \"TenantId\" = @tenantId AND \"BusNo\" = @busNo ORDER BY \"Id\" LIMIT 1",
            new { tenantId, busNo });
        if (busId is null)
        {
            busId = Guid.NewGuid();
            await conn.ExecuteAsync(
                "INSERT INTO \"dbo\".\"Buses\" (\"Id\", \"TenantId\", \"BusNo\", \"DriverStaffId\", \"ConductorStaffId\") VALUES (@Id, @TenantId, @BusNo, @DriverStaffId, @ConductorStaffId)",
                new { Id = busId, TenantId = tenantId, BusNo = busNo, DriverStaffId = driverStaffId, ConductorStaffId = conductorStaffId });
        }
        else
        {
            await conn.ExecuteAsync(
                "UPDATE \"dbo\".\"Buses\" SET \"DriverStaffId\" = @DriverStaffId, \"ConductorStaffId\" = COALESCE(@ConductorStaffId, \"ConductorStaffId\") WHERE \"Id\" = @Id",
                new { Id = busId, DriverStaffId = driverStaffId, ConductorStaffId = conductorStaffId });
        }
        return busId.Value;
    }

    private static async Task<Guid> EnsureStaffAsync(NpgsqlConnection conn, Guid tenantId, Guid userId, string name)
    {
        // IX_Staff_UserId is unique — reuse a Staff row a test already created for this user.
        var existing = await conn.ExecuteScalarAsync<Guid?>(
            "SELECT \"Id\" FROM \"dbo\".\"Staff\" WHERE \"UserId\" = @userId", new { userId });
        if (existing is { } id) return id;
        var staffId = Guid.NewGuid();
        await conn.ExecuteAsync(
            "INSERT INTO \"dbo\".\"Staff\" (\"Id\", \"TenantId\", \"Name\", \"UserId\") VALUES (@Id, @TenantId, @Name, @UserId)",
            new { Id = staffId, TenantId = tenantId, Name = name, UserId = userId });
        return staffId;
    }
}
```

- [ ] **Step 2: Apply it at every existing trip-start call site**

Insert the call immediately before the `PostAsJsonAsync("/v1/staff/trips", …)` shown. Where the client was built with an inline `Guid.NewGuid()`, hoist it to a variable first. Exact edits:

`TransportTripsTests.cs` (`Trip_lifecycle_start_ping_board_end`), replace:
```csharp
        var client = StaffClient(app, Guid.NewGuid(), Guid.NewGuid());
```
with:
```csharp
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        await TripTestSeed.AssignDriverAsync(fx.ConnectionString, tenantId, "KA-01-F-2207", userId);
        var client = StaffClient(app, tenantId, userId);
```
(If `fx` is not a constructor parameter of this class, check its declaration: every class in `Transport/` is `[Collection("sql")]` with a `PostgresFixture fx` primary-constructor parameter; add `(PostgresFixture fx)` to the class if missing.)

`StaffTripAssignmentTests.cs` — `GetRoster_returns_the_bus_students_for_the_trip`: before `var client = DriverClient(app, tenantId, userId);` add
```csharp
        await TripTestSeed.AssignDriverAsync(fx.ConnectionString, tenantId, busNo, userId);
```
`GetRoster_returns_403_for_a_peer_drivers_trip`: replace
```csharp
        var owner = DriverClient(app, tenantId, Guid.NewGuid());
```
with
```csharp
        var ownerId = Guid.NewGuid();
        await TripTestSeed.AssignDriverAsync(fx.ConnectionString, tenantId, "KA-01-F-4501", ownerId);
        var owner = DriverClient(app, tenantId, ownerId);
```

`TripOwnershipTests.cs` — `Peer_driver_in_same_tenant_cannot_mutate_anothers_trip`: replace
```csharp
        var driver1 = StaffClient(app, tenantId, Guid.NewGuid());
```
with
```csharp
        var driver1Id = Guid.NewGuid();
        await TripTestSeed.AssignDriverAsync(fx.ConnectionString, tenantId, "KA-01-F-9001", driver1Id);
        var driver1 = StaffClient(app, tenantId, driver1Id);
```
The conductor test at line ~111: replace
```csharp
        var driver = StaffClient(app, tenantId, Guid.NewGuid());
        var trip = await Data(await driver.PostAsJsonAsync("/v1/staff/trips",
            new { direction = "pickup", bus_no = busNo }), HttpStatusCode.Created);
```
with
```csharp
        var driverId = Guid.NewGuid();
        await TripTestSeed.AssignDriverAsync(fx.ConnectionString, tenantId, busNo, driverId);
        var driver = StaffClient(app, tenantId, driverId);
        var trip = await Data(await driver.PostAsJsonAsync("/v1/staff/trips",
            new { direction = "pickup", bus_no = busNo }), HttpStatusCode.Created);
```
`Peer_conductor_not_assigned_to_the_trip_cannot_mutate_it`: replace
```csharp
        var driver = StaffClient(app, tenantId, Guid.NewGuid());
        var peerConductor = ConductorClient(app, tenantId, Guid.NewGuid());
```
with
```csharp
        var driverId = Guid.NewGuid();
        await TripTestSeed.AssignDriverAsync(fx.ConnectionString, tenantId, "KA-01-F-7701", driverId);
        var driver = StaffClient(app, tenantId, driverId);
        var peerConductor = ConductorClient(app, tenantId, Guid.NewGuid());
```

`TripBroadcastTests.cs`:
- `Starting_pinging_and_ending_a_trip_each_broadcast_live_updates`: replace `var client = StaffClient(app, tenantId, Guid.NewGuid());` with
  ```csharp
        var userId = Guid.NewGuid();
        await TripTestSeed.AssignDriverAsync(fx.ConnectionString, tenantId, "KA-01-F-3301", userId);
        var client = StaffClient(app, tenantId, userId);
  ```
- The two tests that build `var driver = StaffClient(app, tenantId, driverUserId);` right after a seeding block (lines ~161 and ~198): add before that line
  ```csharp
        await TripTestSeed.AssignDriverAsync(fx.ConnectionString, tenantId, busNo, driverUserId);
  ```
  (For the ~161 test the bus already has a conductor; the helper keeps it because `conductorUserId` is not passed.)
- The duplicate-trip test (~251-260): replace
  ```csharp
        var driver = StaffClient(app, tenantId, Guid.NewGuid());
        var first = await driver.PostAsJsonAsync("/v1/staff/trips", new { direction = "pickup", bus_no = busNo });
        first.StatusCode.Should().Be(HttpStatusCode.Created);
  ```
  with
  ```csharp
        var driverId = Guid.NewGuid();
        await TripTestSeed.AssignDriverAsync(fx.ConnectionString, tenantId, busNo, driverId);
        var driver = StaffClient(app, tenantId, driverId);
        var first = await driver.PostAsJsonAsync("/v1/staff/trips", new { direction = "pickup", bus_no = busNo });
        first.StatusCode.Should().Be(HttpStatusCode.Created);
  ```
  and replace the second start
  ```csharp
        var otherDriver = StaffClient(app, tenantId, Guid.NewGuid());
        var second = await otherDriver.PostAsJsonAsync("/v1/staff/trips", new { direction = "pickup", bus_no = busNo });
  ```
  with (after A2 an unassigned "other driver" gets 403, which would no longer test the duplicate guard)
  ```csharp
        var second = await driver.PostAsJsonAsync("/v1/staff/trips", new { direction = "pickup", bus_no = busNo });
  ```
- The route test (~293): add before `var driver = StaffClient(app, tenantId, driverUserId);`
  ```csharp
        await TripTestSeed.AssignDriverAsync(fx.ConnectionString, tenantId, busNo, driverUserId);
  ```

`BusConductorAssignmentTests.cs`: replace
```csharp
        var driver = DriverClient(app, tenantId, Guid.NewGuid());
```
with
```csharp
        var driverId = Guid.NewGuid();
        await TripTestSeed.AssignDriverAsync(fx.ConnectionString, tenantId, busNo, driverId);
        var driver = DriverClient(app, tenantId, driverId);
```

`TripStopEndpointsTests.cs` — `SchoolArrived_then_End_then_a_drop_trip_can_start_on_the_same_bus`: before the `startRes` line add
```csharp
        await TripTestSeed.AssignDriverAsync(fx.ConnectionString, tenantId, "BUS-1", driverId);
```

`IssueEndpointTests.cs` (namespace `Sms.Tests.Integration.Issues` — add `using Sms.Tests.Integration.Transport;` at the top):
- `Reporting_against_a_trip_that_does_not_belong_to_the_caller_is_rejected`: before the `startTrip` line add
  ```csharp
        await TripTestSeed.AssignDriverAsync(fx.ConnectionString, tenantId, "BUS-1", otherDriverId);
  ```
- `Reporting_against_the_callers_own_trip_populates_vehicle_and_route_from_the_trip`: before the `startTrip` line add
  ```csharp
        await TripTestSeed.AssignDriverAsync(fx.ConnectionString, tenantId, "BUS-OWN", driverId);
  ```

- [ ] **Step 3: Run the affected suites (still on unchanged production code)**

Run: `dotnet test tests/Sms.Tests.Integration --filter "FullyQualifiedName~Transport|FullyQualifiedName~IssueEndpointTests"`
Expected: PASS (same count as before the edits).

- [ ] **Step 4: Commit**

```bash
git add tests/Sms.Tests.Integration
git commit -m "test(transport): seed a real bus driver assignment before starting trips

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task A2: Trip start attribution from the bus assignment

**Files:**
- Modify: `src/Sms.Modules.Transport/TransportModule.cs` (add record + `GetBusAssignmentByNoAsync` to `TripRepository`)
- Modify: `src/Sms.Application/Services/Transport/TripService.cs:40-58` (`StartAsync`)
- Test: `tests/Sms.Tests.Integration/Transport/StaffTripStartAttributionTests.cs` (create)

**Interfaces:**
- Consumes: `TripTestSeed.AssignDriverAsync` (A1).
- Produces: `TripRepository.GetBusAssignmentByNoAsync(Guid tenantId, string busNo, CancellationToken ct) : Task<BusAssignmentRow?>` with `public sealed record BusAssignmentRow(Guid BusId, Guid? RouteId, Guid? DriverUserId, Guid? ConductorUserId);`

- [ ] **Step 1: Write the failing tests**

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Sms.Shared.Kernel.Auth;
using Sms.Shared.Kernel.Time;

namespace Sms.Tests.Integration.Transport;

/// POST /v1/staff/trips: the bus assignment is the source of truth for DriverId/ConductorId;
/// the caller is only the authorized actor (assigned driver or conductor).
[Collection("sql")]
public class StaffTripStartAttributionTests(PostgresFixture fx)
{
    private const string Key = "integration-test-signing-key-32-bytes-min!!";

    private WebApplicationFactory<Program> App() =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("environment", "Production");
            b.UseSetting("ConnectionStrings:Sql", fx.ConnectionString);
            b.UseSetting("Jwt:SigningKey", Key);
        });

    private static HttpClient Staff(WebApplicationFactory<Program> app, Guid tenantId, Guid userId)
    {
        var jwt = new JwtTokenService(
            new JwtOptions { Issuer = "sms", Audience = "sms-apps", SigningKey = Key, AccessTokenMinutes = 15 },
            new SystemClock());
        var client = app.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", jwt.IssueAccess(userId, tenantId, ["staff"], isPlatform: false));
        return client;
    }

    private static string NewBusNo() => $"KA-{Guid.NewGuid():N}"[..12];

    private static async Task<JsonElement> Data(HttpResponseMessage res, HttpStatusCode expected)
    {
        res.StatusCode.Should().Be(expected, await res.Content.ReadAsStringAsync());
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("data").Clone();
    }

    private static async Task<string> ErrorCode(HttpResponseMessage res)
    {
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("error").GetProperty("code").GetString()!;
    }

    [Fact]
    public async Task Driver_starts_and_the_trip_is_attributed_to_the_assigned_driver_and_conductor()
    {
        await using var app = App();
        var (tenantId, driverId, conductorId, busNo) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), NewBusNo());
        await TripTestSeed.AssignDriverAsync(fx.ConnectionString, tenantId, busNo, driverId, conductorId);

        var trip = await Data(await Staff(app, tenantId, driverId).PostAsJsonAsync("/v1/staff/trips",
            new { direction = "pickup", bus_no = busNo }), HttpStatusCode.Created);

        trip.GetProperty("driver_id").GetGuid().Should().Be(driverId);
        trip.GetProperty("conductor_id").GetGuid().Should().Be(conductorId);
    }

    [Fact]
    public async Task Conductor_starts_and_the_trip_is_still_attributed_to_the_assigned_driver()
    {
        await using var app = App();
        var (tenantId, driverId, conductorId, busNo) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), NewBusNo());
        await TripTestSeed.AssignDriverAsync(fx.ConnectionString, tenantId, busNo, driverId, conductorId);

        var trip = await Data(await Staff(app, tenantId, conductorId).PostAsJsonAsync("/v1/staff/trips",
            new { direction = "pickup", bus_no = busNo }), HttpStatusCode.Created);

        trip.GetProperty("driver_id").GetGuid().Should().Be(driverId, "a conductor must never become driver_id");
        trip.GetProperty("conductor_id").GetGuid().Should().Be(conductorId);
    }

    [Fact]
    public async Task Staff_member_not_assigned_to_the_bus_gets_403_not_assigned()
    {
        await using var app = App();
        var (tenantId, driverId, busNo) = (Guid.NewGuid(), Guid.NewGuid(), NewBusNo());
        await TripTestSeed.AssignDriverAsync(fx.ConnectionString, tenantId, busNo, driverId);

        var res = await Staff(app, tenantId, Guid.NewGuid()).PostAsJsonAsync("/v1/staff/trips",
            new { direction = "pickup", bus_no = busNo });

        res.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await ErrorCode(res)).Should().Be("not_assigned");
    }

    [Fact]
    public async Task Bus_with_no_assigned_driver_gets_422_no_driver_assigned()
    {
        await using var app = App();
        var (tenantId, driverId, conductorId, busNo) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), NewBusNo());
        await TripTestSeed.AssignDriverAsync(fx.ConnectionString, tenantId, busNo, driverId, conductorId);
        await using (var conn = new Npgsql.NpgsqlConnection(fx.ConnectionString))
        {
            await conn.OpenAsync();
            await Dapper.SqlMapper.ExecuteAsync(conn, "SELECT set_config('app.tenant_id', @t::text, false)", new { t = tenantId });
            await Dapper.SqlMapper.ExecuteAsync(conn,
                "UPDATE \"dbo\".\"Buses\" SET \"DriverStaffId\" = NULL WHERE \"TenantId\" = @tenantId AND \"BusNo\" = @busNo", new { tenantId, busNo });
        }

        var res = await Staff(app, tenantId, conductorId).PostAsJsonAsync("/v1/staff/trips",
            new { direction = "pickup", bus_no = busNo });

        res.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
        (await ErrorCode(res)).Should().Be("no_driver_assigned");
    }

    [Fact]
    public async Task Unknown_bus_gets_404_bus_not_found()
    {
        await using var app = App();
        var res = await Staff(app, Guid.NewGuid(), Guid.NewGuid()).PostAsJsonAsync("/v1/staff/trips",
            new { direction = "pickup", bus_no = NewBusNo() });

        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await ErrorCode(res)).Should().Be("bus_not_found");
    }

    [Fact]
    public async Task Missing_bus_no_gets_422_bus_no_required()
    {
        await using var app = App();
        var res = await Staff(app, Guid.NewGuid(), Guid.NewGuid()).PostAsJsonAsync("/v1/staff/trips",
            new { direction = "pickup" });

        res.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
        (await ErrorCode(res)).Should().Be("bus_no_required");
    }

    [Fact]
    public async Task Route_defaults_to_the_buses_route_when_omitted()
    {
        await using var app = App();
        var (tenantId, driverId, busNo, routeId) = (Guid.NewGuid(), Guid.NewGuid(), NewBusNo(), Guid.NewGuid());
        await TripTestSeed.AssignDriverAsync(fx.ConnectionString, tenantId, busNo, driverId);
        await using (var conn = new Npgsql.NpgsqlConnection(fx.ConnectionString))
        {
            await conn.OpenAsync();
            await Dapper.SqlMapper.ExecuteAsync(conn, "SELECT set_config('app.tenant_id', @t::text, false)", new { t = tenantId });
            await Dapper.SqlMapper.ExecuteAsync(conn,
                "UPDATE \"dbo\".\"Buses\" SET \"RouteId\" = @routeId WHERE \"TenantId\" = @tenantId AND \"BusNo\" = @busNo", new { routeId, tenantId, busNo });
        }

        var trip = await Data(await Staff(app, tenantId, driverId).PostAsJsonAsync("/v1/staff/trips",
            new { direction = "pickup", bus_no = busNo }), HttpStatusCode.Created);

        trip.GetProperty("route_id").GetGuid().Should().Be(routeId);
    }
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test tests/Sms.Tests.Integration --filter "FullyQualifiedName~StaffTripStartAttributionTests"`
Expected: FAIL — conductor test gets `driver_id` = conductor; 403/422/404 tests get 201.

- [ ] **Step 3: Add the repository lookup** in `TransportModule.cs`, next to the other records at the top add:

```csharp
public sealed record BusAssignmentRow(Guid BusId, Guid? RouteId, Guid? DriverUserId, Guid? ConductorUserId);
```

and inside `TripRepository` (after `StartAsync`):

```csharp
    /// The bus's assigned driver/conductor login identities — the authoritative attribution for
    /// a staff-started trip. Tenant-filtered explicitly on top of RLS, like Trip_Start itself.
    public async Task<BusAssignmentRow?> GetBusAssignmentByNoAsync(Guid tenantId, string busNo, CancellationToken ct = default) =>
        (await QueryInlineAsync<BusAssignmentRow>(
            @"SELECT b.""Id"" AS ""BusId"", b.""RouteId"", ds.""UserId"" AS ""DriverUserId"", cs.""UserId"" AS ""ConductorUserId""
              FROM ""dbo"".""Buses"" b
              LEFT JOIN ""dbo"".""Staff"" ds ON ds.""Id"" = b.""DriverStaffId""
              LEFT JOIN ""dbo"".""Staff"" cs ON cs.""Id"" = b.""ConductorStaffId""
              WHERE b.""TenantId"" = @tenantId AND b.""BusNo"" = @busNo
              ORDER BY b.""Id"" LIMIT 1", new { tenantId, busNo }, ct)).FirstOrDefault();
```

- [ ] **Step 4: Enforce it in `TripService.StartAsync`.** Replace the body's first `if` and the `repo.StartAsync` call so the method starts:

```csharp
    public async Task<ApiResult<TripResponse>> StartAsync(StartTripRequest req, CancellationToken ct = default)
    {
        if (tenant.TenantId is not { } tid || tenant.UserId is not { } uid)
            return ApiResult<TripResponse>.Fail(new Error("forbidden", "no tenant/user context"), 403);
        if (string.IsNullOrWhiteSpace(req.BusNo))
            return ApiResult<TripResponse>.Fail(new Error("bus_no_required", "bus_no is required"), 422);
        // The bus assignment — never the caller — decides who the trip's driver and conductor are.
        // The caller only has to be one of them; a conductor pressing Start must not become DriverId.
        if (await repo.GetBusAssignmentByNoAsync(tid, req.BusNo, ct) is not { } bus)
            return ApiResult<TripResponse>.Fail(new Error("bus_not_found", "no bus with that number in this school"), 404);
        if (bus.DriverUserId is not { } driverUserId)
            return ApiResult<TripResponse>.Fail(new Error("no_driver_assigned", "this bus has no driver assigned"), 422);
        if (uid != driverUserId && uid != bus.ConductorUserId)
            return ApiResult<TripResponse>.Fail(new Error("not_assigned", "you are not assigned to this bus"), 403);

        var effective = req with { RouteId = req.RouteId ?? bus.RouteId };
        // dbo.Trip_Start returns no row (instead of inserting) when the bus already has a live
        // trip; it fills ConductorId from Buses.ConductorStaffId itself.
        if (await repo.StartAsync(tid, driverUserId, effective, ct) is not { } trip)
            return ApiResult<TripResponse>.Fail(new Error("bus_already_active", "This bus already has an active trip"), 409);
```

Keep the rest of the method (broadcasts and the `return … Ok(…, 201)`) unchanged. Delete the old comment block about `dbo.Trip_Start` returning no row that sat above the old `repo.StartAsync` line.

- [ ] **Step 5: Run the new and existing transport tests**

Run: `dotnet test tests/Sms.Tests.Integration --filter "FullyQualifiedName~Transport|FullyQualifiedName~IssueEndpointTests|FullyQualifiedName~SecurityIdorTests"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/Sms.Modules.Transport/TransportModule.cs src/Sms.Application/Services/Transport/TripService.cs tests/Sms.Tests.Integration/Transport/StaffTripStartAttributionTests.cs
git commit -m "feat(transport): attribute staff-started trips to the bus's assigned driver and conductor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task A3: Trip assignment resolves for conductors and includes the driver's name

**Files:**
- Modify: `src/Sms.Modules.Transport/TransportModule.cs` (`StaffTripAssignmentResponse`, `AssignedBusRow`, `GetAssignmentAsync`)
- Modify: `tests/Sms.Tests.Integration/Transport/StaffTripAssignmentTests.cs` (add tests)

**Interfaces:**
- Produces: `StaffTripAssignmentResponse(... , int StudentsAssigned, string? DriverName = null)` → JSON adds `driver_name`.

- [ ] **Step 1: Write the failing tests** (append to `StaffTripAssignmentTests`):

```csharp
    [Fact]
    public async Task GetAssignment_resolves_for_the_buses_conductor_with_both_names()
    {
        await using var app = App();
        var (tenantId, driverUserId, conductorUserId) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        var (driverStaffId, conductorStaffId, busId, routeId) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        var busNo = $"KA-{Guid.NewGuid():N}"[..12];

        await Seed(fx.ConnectionString, tenantId, async conn =>
        {
            await conn.ExecuteAsync(
                "INSERT INTO \"dbo\".\"Staff\" (\"Id\", \"TenantId\", \"Name\", \"Shift\", \"UserId\") VALUES (@Id, @TenantId, @Name, @Shift, @UserId)",
                new[]
                {
                    new { Id = driverStaffId, TenantId = tenantId, Name = "Ram Kumar", Shift = "7:00 AM - 4:00 PM", UserId = driverUserId },
                    new { Id = conductorStaffId, TenantId = tenantId, Name = "Priya Rao", Shift = "7:30 AM - 4:30 PM", UserId = conductorUserId },
                });
            await conn.ExecuteAsync(
                "INSERT INTO \"dbo\".\"TransportRoutes\" (\"Id\", \"TenantId\", \"Name\") VALUES (@Id, @TenantId, 'North Route')",
                new { Id = routeId, TenantId = tenantId });
            await conn.ExecuteAsync(
                "INSERT INTO \"dbo\".\"Buses\" (\"Id\", \"TenantId\", \"BusNo\", \"RouteId\", \"DriverStaffId\", \"ConductorStaffId\") VALUES (@Id, @TenantId, @BusNo, @RouteId, @D, @C)",
                new { Id = busId, TenantId = tenantId, BusNo = busNo, RouteId = routeId, D = driverStaffId, C = conductorStaffId });
        });

        var data = await Data(await DriverClient(app, tenantId, conductorUserId).GetAsync("/v1/staff/trip/assignment"), HttpStatusCode.OK);

        data.GetProperty("bus_id").GetGuid().Should().Be(busId);
        data.GetProperty("driver_name").GetString().Should().Be("Ram Kumar");
        data.GetProperty("conductor_name").GetString().Should().Be("Priya Rao");
        data.GetProperty("shift").GetString().Should().Be("7:30 AM - 4:30 PM", "shift is the caller's own");
    }

    [Fact]
    public async Task GetAssignment_for_the_driver_includes_driver_name()
    {
        await using var app = App();
        var (tenantId, userId, staffId, routeId) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        var busNo = $"KA-{Guid.NewGuid():N}"[..12];
        await Seed(fx.ConnectionString, tenantId, async conn =>
        {
            await conn.ExecuteAsync(
                "INSERT INTO \"dbo\".\"Staff\" (\"Id\", \"TenantId\", \"Name\", \"UserId\") VALUES (@Id, @TenantId, 'Ram Kumar', @UserId)",
                new { Id = staffId, TenantId = tenantId, UserId = userId });
            await conn.ExecuteAsync(
                "INSERT INTO \"dbo\".\"TransportRoutes\" (\"Id\", \"TenantId\", \"Name\") VALUES (@Id, @TenantId, 'North Route')",
                new { Id = routeId, TenantId = tenantId });
            await conn.ExecuteAsync(
                "INSERT INTO \"dbo\".\"Buses\" (\"Id\", \"TenantId\", \"BusNo\", \"RouteId\", \"DriverStaffId\") VALUES (gen_random_uuid(), @TenantId, @BusNo, @RouteId, @D)",
                new { TenantId = tenantId, BusNo = busNo, RouteId = routeId, D = staffId });
        });

        var data = await Data(await DriverClient(app, tenantId, userId).GetAsync("/v1/staff/trip/assignment"), HttpStatusCode.OK);
        data.GetProperty("driver_name").GetString().Should().Be("Ram Kumar");
    }
```

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test tests/Sms.Tests.Integration --filter "FullyQualifiedName~StaffTripAssignmentTests"`
Expected: FAIL — conductor gets 404; `driver_name` property missing.

- [ ] **Step 3: Implement.** In `TransportModule.cs` change the response record to:

```csharp
public sealed record StaffTripAssignmentResponse(
    StaffRouteResponse Route, Guid BusId, string BusNo, string? ConductorName, string? Shift, int StudentsAssigned,
    string? DriverName = null);
```

Replace `AssignedBusRow` and the first query of `GetAssignmentAsync`:

```csharp
    private sealed record AssignedBusRow(Guid BusId, string BusNo, Guid? RouteId, string? DriverName, string? ConductorName, string? Shift);
    private sealed record RouteRow(Guid Id, string Name);

    /// Resolved by the caller's own identity (Staff.UserId -> Buses.DriverStaffId or
    /// ConductorStaffId), never by a client-supplied id. Shift is the caller's own.
    public async Task<StaffTripAssignmentResponse?> GetAssignmentAsync(Guid userId, CancellationToken ct = default)
    {
        var bus = (await QueryInlineAsync<AssignedBusRow>(
            @"SELECT b.""Id"" AS ""BusId"", b.""BusNo"", b.""RouteId"", ds.""Name"" AS ""DriverName"", cs.""Name"" AS ""ConductorName"",
                     CASE WHEN ds.""UserId"" = @userId THEN ds.""Shift"" ELSE cs.""Shift"" END AS ""Shift""
              FROM ""dbo"".""Buses"" b
              LEFT JOIN ""dbo"".""Staff"" ds ON ds.""Id"" = b.""DriverStaffId""
              LEFT JOIN ""dbo"".""Staff"" cs ON cs.""Id"" = b.""ConductorStaffId""
              WHERE ds.""UserId"" = @userId OR cs.""UserId"" = @userId
              ORDER BY (ds.""UserId"" = @userId) DESC NULLS LAST, b.""Id""
              LIMIT 1", new { userId }, ct)).FirstOrDefault();
        if (bus?.RouteId is not { } routeId) return null;
```

and the final `return` of the method:

```csharp
        return new StaffTripAssignmentResponse(
            new StaffRouteResponse(route.Id, route.Name, bus.BusNo, stops), bus.BusId, bus.BusNo, bus.ConductorName, bus.Shift, studentsAssigned,
            bus.DriverName);
```

Leave the route/stops/students queries between them unchanged. Check the call site in `TripService.GetAssignmentAsync` still compiles (it passes the caller's user id positionally — no change needed).

- [ ] **Step 4: Run tests**

Run: `dotnet test tests/Sms.Tests.Integration --filter "FullyQualifiedName~StaffTripAssignmentTests|FullyQualifiedName~Dashboard"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Sms.Modules.Transport/TransportModule.cs tests/Sms.Tests.Integration/Transport/StaffTripAssignmentTests.cs
git commit -m "feat(transport): resolve the staff trip assignment for conductors and return driver_name

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task A4: Stop-progress read endpoint and `current_stop_id` on the trip

**Files:**
- Modify: `src/Sms.Modules.Transport/TransportModule.cs` (records, `TripResponse.CurrentStopId`, `GetStopProgressAsync`)
- Modify: `src/Sms.Application/Services/Transport/TripService.cs` (interface + `GetStopProgressAsync`, `GetCurrentAsync`)
- Modify: `src/Sms.Api/Controllers/TripController.cs` (new GET route)
- Test: `tests/Sms.Tests.Integration/Transport/TripStopProgressReadTests.cs` (create)

**Interfaces:**
- Produces: `GET /v1/staff/trips/{tripId}/stops` → `{ trip_id, current_stop_id, school_arrived_at, stops: [{ stop_id, name, seq, arrived_at, confirmed_at, departed_at }] }`; staff `Trip` JSON gains `current_stop_id` (on `GET /v1/staff/trip/current`).

- [ ] **Step 1: Write the failing tests**

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Dapper;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Npgsql;
using Sms.Shared.Kernel.Auth;
using Sms.Shared.Kernel.Time;

namespace Sms.Tests.Integration.Transport;

[Collection("sql")]
public class TripStopProgressReadTests(PostgresFixture fx)
{
    private const string Key = "integration-test-signing-key-32-bytes-min!!";

    private WebApplicationFactory<Program> App() =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("environment", "Production");
            b.UseSetting("ConnectionStrings:Sql", fx.ConnectionString);
            b.UseSetting("Jwt:SigningKey", Key);
        });

    private static HttpClient Staff(WebApplicationFactory<Program> app, Guid tenantId, Guid userId)
    {
        var jwt = new JwtTokenService(
            new JwtOptions { Issuer = "sms", Audience = "sms-apps", SigningKey = Key, AccessTokenMinutes = 15 },
            new SystemClock());
        var client = app.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", jwt.IssueAccess(userId, tenantId, ["staff"], isPlatform: false));
        return client;
    }

    private static async Task<JsonElement> Data(HttpResponseMessage res, HttpStatusCode expected)
    {
        res.StatusCode.Should().Be(expected, await res.Content.ReadAsStringAsync());
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("data").Clone();
    }

    /// A live trip started through the real endpoint by the assigned driver, on a route with two
    /// stops, and a ping sitting exactly on Stop A so confirm-arrival passes the radius check.
    private async Task<(Guid tenantId, Guid driverId, Guid conductorId, Guid tripId, Guid stopA, Guid stopB, HttpClient driver)> LiveTrip(WebApplicationFactory<Program> app)
    {
        var (tenantId, driverId, conductorId) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        var (routeId, stopA, stopB) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        var busNo = $"KA-{Guid.NewGuid():N}"[..12];
        await TripTestSeed.AssignDriverAsync(fx.ConnectionString, tenantId, busNo, driverId, conductorId);
        await using (var conn = new NpgsqlConnection(fx.ConnectionString))
        {
            await conn.OpenAsync();
            await conn.ExecuteAsync("SELECT set_config('app.tenant_id', @t::text, false)", new { t = tenantId });
            await conn.ExecuteAsync(
                @"INSERT INTO ""dbo"".""RouteStops"" (""Id"", ""TenantId"", ""RouteId"", ""Name"", ""Seq"", ""Lat"", ""Lng"") VALUES
                  (@A, @T, @R, 'Stop A', 1, 12.1000, 77.1000), (@B, @T, @R, 'Stop B', 2, 12.2000, 77.2000)",
                new { A = stopA, B = stopB, T = tenantId, R = routeId });
        }
        var driver = Staff(app, tenantId, driverId);
        var trip = await Data(await driver.PostAsJsonAsync("/v1/staff/trips",
            new { direction = "pickup", bus_no = busNo, route_id = routeId }), HttpStatusCode.Created);
        var tripId = trip.GetProperty("id").GetGuid();
        (await driver.PostAsJsonAsync($"/v1/staff/trips/{tripId}/pings", new
        {
            pings = new[] { new { lat = 12.1000, lng = 77.1000, speed_kmh = 0, heading = 0, at = DateTime.UtcNow } },
        })).StatusCode.Should().Be(HttpStatusCode.NoContent);
        return (tenantId, driverId, conductorId, tripId, stopA, stopB, driver);
    }

    [Fact]
    public async Task Stops_lists_every_route_stop_in_seq_order_with_no_progress_initially()
    {
        await using var app = App();
        var (_, _, _, tripId, stopA, stopB, driver) = await LiveTrip(app);

        var data = await Data(await driver.GetAsync($"/v1/staff/trips/{tripId}/stops"), HttpStatusCode.OK);

        data.GetProperty("trip_id").GetGuid().Should().Be(tripId);
        data.GetProperty("current_stop_id").ValueKind.Should().Be(JsonValueKind.Null);
        data.GetProperty("school_arrived_at").ValueKind.Should().Be(JsonValueKind.Null);
        var stops = data.GetProperty("stops");
        stops.GetArrayLength().Should().Be(2);
        stops[0].GetProperty("stop_id").GetGuid().Should().Be(stopA);
        stops[0].GetProperty("seq").GetInt32().Should().Be(1);
        stops[0].GetProperty("confirmed_at").ValueKind.Should().Be(JsonValueKind.Null);
        stops[1].GetProperty("stop_id").GetGuid().Should().Be(stopB);
    }

    [Fact]
    public async Task Confirm_then_complete_is_read_back_and_current_stop_id_tracks_it()
    {
        await using var app = App();
        var (tenantId, _, conductorId, tripId, stopA, _, driver) = await LiveTrip(app);

        (await driver.PostAsync($"/v1/staff/trips/{tripId}/stops/{stopA}/confirm-arrival", null)).IsSuccessStatusCode.Should().BeTrue();
        var afterConfirm = await Data(await driver.GetAsync($"/v1/staff/trips/{tripId}/stops"), HttpStatusCode.OK);
        afterConfirm.GetProperty("current_stop_id").GetGuid().Should().Be(stopA);
        afterConfirm.GetProperty("stops")[0].GetProperty("confirmed_at").ValueKind.Should().Be(JsonValueKind.String);

        var current = await Data(await driver.GetAsync("/v1/staff/trip/current"), HttpStatusCode.OK);
        current.GetProperty("current_stop_id").GetGuid().Should().Be(stopA);

        // The conductor reads the same authoritative state.
        (await Staff(app, tenantId, conductorId).PostAsync($"/v1/staff/trips/{tripId}/stops/{stopA}/complete", null)).IsSuccessStatusCode.Should().BeTrue();
        var afterComplete = await Data(await Staff(app, tenantId, conductorId).GetAsync($"/v1/staff/trips/{tripId}/stops"), HttpStatusCode.OK);
        afterComplete.GetProperty("current_stop_id").ValueKind.Should().Be(JsonValueKind.Null);
        afterComplete.GetProperty("stops")[0].GetProperty("departed_at").ValueKind.Should().Be(JsonValueKind.String);
    }

    [Fact]
    public async Task A_non_participant_in_the_same_tenant_gets_403()
    {
        await using var app = App();
        var (tenantId, _, _, tripId, _, _, _) = await LiveTrip(app);
        (await Staff(app, tenantId, Guid.NewGuid()).GetAsync($"/v1/staff/trips/{tripId}/stops"))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task A_user_of_another_tenant_cannot_read_the_stops()
    {
        await using var app = App();
        var (_, driverId, _, tripId, _, _, _) = await LiveTrip(app);
        // Same user id, different tenant claim: RLS + the tenant-filtered participant check hide the trip.
        var res = await Staff(app, Guid.NewGuid(), driverId).GetAsync($"/v1/staff/trips/{tripId}/stops");
        res.StatusCode.Should().BeOneOf(HttpStatusCode.Forbidden, HttpStatusCode.NotFound);
    }
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test tests/Sms.Tests.Integration --filter "FullyQualifiedName~TripStopProgressReadTests"`
Expected: FAIL — `/stops` returns 404/405; `current_stop_id` missing on the trip.

- [ ] **Step 3: Add records and the query** in `TransportModule.cs`. Add `CurrentStopId` to `TripResponse` next to `ActiveBroadcaster` (same init-only reason as the existing comment):

```csharp
    public string? ActiveBroadcaster { get; init; }
    public Guid? CurrentStopId { get; init; }
```

Add records near the others:

```csharp
public sealed record TripStopProgressItem(Guid StopId, string Name, int Seq, DateTime? ArrivedAt, DateTime? ConfirmedAt, DateTime? DepartedAt);
public sealed record TripStopsResponse(Guid TripId, Guid? CurrentStopId, DateTime? SchoolArrivedAt, IReadOnlyList<TripStopProgressItem> Stops);
```

Inside `TripRepository` (near `GetCurrentStopIdAsync`):

```csharp
    private sealed record TripStopHeaderRow(Guid? RouteId, Guid? CurrentStopId, DateTime? SchoolArrivedAt);

    /// Every stop of the trip's route in Seq order, left-joined to this trip's persisted
    /// TripStopProgress — the authoritative arrival/departure state the staff app renders.
    public async Task<TripStopsResponse?> GetStopProgressAsync(Guid tenantId, Guid tripId, CancellationToken ct = default)
    {
        var head = (await QueryInlineAsync<TripStopHeaderRow>(
            "SELECT \"RouteId\", \"CurrentStopId\", \"SchoolArrivedAt\" FROM \"dbo\".\"Trips\" WHERE \"Id\" = @tripId AND \"TenantId\" = @tenantId",
            new { tripId, tenantId }, ct)).FirstOrDefault();
        if (head is null) return null;
        if (head.RouteId is not { } routeId)
            return new TripStopsResponse(tripId, head.CurrentStopId, head.SchoolArrivedAt, []);

        var stops = await QueryInlineAsync<TripStopProgressItem>(
            @"SELECT rs.""Id"" AS ""StopId"", rs.""Name"", rs.""Seq"", p.""ArrivedAt"", p.""ConfirmedAt"", p.""DepartedAt""
              FROM ""dbo"".""RouteStops"" rs
              LEFT JOIN ""dbo"".""TripStopProgress"" p ON p.""StopId"" = rs.""Id"" AND p.""TripId"" = @tripId
              WHERE rs.""RouteId"" = @routeId AND rs.""TenantId"" = @tenantId
              ORDER BY rs.""Seq""", new { tripId, routeId, tenantId }, ct);
        return new TripStopsResponse(tripId, head.CurrentStopId, head.SchoolArrivedAt, stops.ToList());
    }
```

- [ ] **Step 4: Service + controller.** In `ITripService` add:

```csharp
    Task<ApiResult<TripStopsResponse>> GetStopProgressAsync(Guid tripId, CancellationToken ct = default);
```

In `TripService` add:

```csharp
    public async Task<ApiResult<TripStopsResponse>> GetStopProgressAsync(Guid tripId, CancellationToken ct = default)
    {
        if (tenant.TenantId is not { } tid || tenant.UserId is not { } uid)
            return ApiResult<TripStopsResponse>.Fail(new Error("forbidden", "no tenant/user context"), 403);
        if (await repo.GetParticipantRoleAsync(tid, tripId, uid, ct) is null)
            return ApiResult<TripStopsResponse>.Fail(new Error("forbidden", "not your trip"), 403);
        return await repo.GetStopProgressAsync(tid, tripId, ct) is { } progress
            ? ApiResult<TripStopsResponse>.Ok(progress)
            : ApiResult<TripStopsResponse>.Fail(new Error("not_found", "trip not found"), 404);
    }
```

and change `GetCurrentAsync` so the returned trip carries the current stop:

```csharp
    public async Task<ApiResult<TripResponse?>> GetCurrentAsync(CancellationToken ct = default)
    {
        if (tenant.UserId is not { } uid)
            return ApiResult<TripResponse?>.Fail(new Error("forbidden", "no user context"), 403);
        var trip = await repo.GetCurrentAsync(uid, ct);
        if (trip is null) return ApiResult<TripResponse?>.Ok(null);
        var currentStopId = await repo.GetCurrentStopIdAsync(trip.Id, ct);
        return ApiResult<TripResponse?>.Ok(WithActiveBroadcaster(trip) with { CurrentStopId = currentStopId });
    }
```

In `TripController` add (after `ListBoarding`):

```csharp
    [HttpGet("trips/{tripId:guid}/stops")]
    public async Task<IActionResult> GetStopProgress(Guid tripId, CancellationToken ct) =>
        FromResult(await trips.GetStopProgressAsync(tripId, ct));
```

- [ ] **Step 5: Run tests**

Run: `dotnet test tests/Sms.Tests.Integration --filter "FullyQualifiedName~Transport"`
Expected: PASS.

- [ ] **Step 6: Run the whole backend suite once**

Run: `dotnet test`
Expected: PASS (unit + integration).

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "feat(transport): GET /v1/staff/trips/{id}/stops and current_stop_id on the staff trip

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task A5: Idempotent dev seed behind a `seed` compose profile

**Files:**
- Create: `db/dev-seed/staff_e2e.sql`
- Create: `db/dev-seed/README.md`
- Modify: `docker-compose.yml` (add `seed` service)

**Interfaces:**
- Produces: fixed identities used by Part B's manual check — tenant `a0000000-0000-4000-8000-000000000001` ("Greenfield E2E School", slug `greenfield-e2e`); logins `driver@e2e.test`, `conductor@e2e.test`, `sweeper@e2e.test`, `gardener@e2e.test`, `guard@e2e.test`, `peon@e2e.test`; bus `E2E-BUS-01` on route "E2E Route 1" with 4 stops.

- [ ] **Step 1: Write the seed**

```sql
-- Dev-only, idempotent seed for the staff-app end-to-end check. Run as the schema owner
-- ("sms"), which bypasses RLS. Fixed UUIDs + ON CONFLICT make re-runs no-ops/updates.
-- Never part of db/postgres/migrations.
BEGIN;

-- Tenant (must be 'active' or BillingStateMiddleware 403s every staff route).
INSERT INTO "dbo"."Tenants" ("Id", "Name", "Slug", "Status", "Tier", "Lat", "Lng", "GeofenceRadiusMeters")
VALUES ('a0000000-0000-4000-8000-000000000001', 'Greenfield E2E School', 'greenfield-e2e', 'active', 'platinum', 28.4595, 77.0266, 150)
ON CONFLICT ("Id") DO UPDATE SET "Status" = 'active', "Name" = EXCLUDED."Name", "Tier" = EXCLUDED."Tier",
  "Lat" = EXCLUDED."Lat", "Lng" = EXCLUDED."Lng", "GeofenceRadiusMeters" = EXCLUDED."GeofenceRadiusMeters";

INSERT INTO "dbo"."SchoolLocations" ("Id", "TenantId", "Lat", "Lng", "RadiusMeters", "Name")
VALUES ('a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 28.4595, 77.0266, 150, 'Greenfield E2E Main Gate')
ON CONFLICT ("Id") DO UPDATE SET "Lat" = EXCLUDED."Lat", "Lng" = EXCLUDED."Lng", "RadiusMeters" = EXCLUDED."RadiusMeters", "Name" = EXCLUDED."Name";

-- Logins: no password yet (MustSetPassword) -> first sign-in goes password_not_set -> OTP -> set password.
INSERT INTO "dbo"."Users" ("Id", "TenantId", "Email", "Status", "MustSetPassword", "Name") VALUES
  ('a0000000-0000-4000-8000-000000000101', 'a0000000-0000-4000-8000-000000000001', 'driver@e2e.test',    'active', true, 'Ramesh Driver'),
  ('a0000000-0000-4000-8000-000000000102', 'a0000000-0000-4000-8000-000000000001', 'conductor@e2e.test', 'active', true, 'Sita Conductor'),
  ('a0000000-0000-4000-8000-000000000103', 'a0000000-0000-4000-8000-000000000001', 'sweeper@e2e.test',   'active', true, 'Mohan Sweeper'),
  ('a0000000-0000-4000-8000-000000000104', 'a0000000-0000-4000-8000-000000000001', 'gardener@e2e.test',  'active', true, 'Lata Gardener'),
  ('a0000000-0000-4000-8000-000000000105', 'a0000000-0000-4000-8000-000000000001', 'guard@e2e.test',     'active', true, 'Vikram Guard'),
  ('a0000000-0000-4000-8000-000000000106', 'a0000000-0000-4000-8000-000000000001', 'peon@e2e.test',      'active', true, 'Anil Peon')
ON CONFLICT ("Id") DO UPDATE SET "Email" = EXCLUDED."Email", "Status" = 'active', "Name" = EXCLUDED."Name";

INSERT INTO "dbo"."UserRoles" ("UserId", "Role")
SELECT u, 'staff' FROM unnest(ARRAY[
  'a0000000-0000-4000-8000-000000000101', 'a0000000-0000-4000-8000-000000000102', 'a0000000-0000-4000-8000-000000000103',
  'a0000000-0000-4000-8000-000000000104', 'a0000000-0000-4000-8000-000000000105', 'a0000000-0000-4000-8000-000000000106']::uuid[]) AS u
ON CONFLICT ("UserId", "Role") DO NOTHING;

-- Staff rows. Role (designation) drives /auth/me role_key via StaffRoleMapper; Category drives the dashboard role_card.
INSERT INTO "dbo"."Staff" ("Id", "TenantId", "Name", "Role", "Category", "Department", "Shift", "Route", "Status", "UserId", "Email", "EmployeeCode") VALUES
  ('a0000000-0000-4000-8000-000000000201', 'a0000000-0000-4000-8000-000000000001', 'Ramesh Driver',  'Driver',         'driver',    'Transport',    '6:30 AM - 3:30 PM', 'E2E Route 1', 'active', 'a0000000-0000-4000-8000-000000000101', 'driver@e2e.test',    'E2E-001'),
  ('a0000000-0000-4000-8000-000000000202', 'a0000000-0000-4000-8000-000000000001', 'Sita Conductor', 'Conductor',      'conductor', 'Transport',    '6:30 AM - 3:30 PM', 'E2E Route 1', 'active', 'a0000000-0000-4000-8000-000000000102', 'conductor@e2e.test', 'E2E-002'),
  ('a0000000-0000-4000-8000-000000000203', 'a0000000-0000-4000-8000-000000000001', 'Mohan Sweeper',  'Sweeper',        'support',   'Housekeeping', '7:00 AM - 4:00 PM', NULL,          'active', 'a0000000-0000-4000-8000-000000000103', 'sweeper@e2e.test',   'E2E-003'),
  ('a0000000-0000-4000-8000-000000000204', 'a0000000-0000-4000-8000-000000000001', 'Lata Gardener',  'Gardener',       'support',   'Grounds',      '7:00 AM - 4:00 PM', NULL,          'active', 'a0000000-0000-4000-8000-000000000104', 'gardener@e2e.test',  'E2E-004'),
  ('a0000000-0000-4000-8000-000000000205', 'a0000000-0000-4000-8000-000000000001', 'Vikram Guard',   'Security Guard', 'support',   'Security',     '6:00 AM - 6:00 PM', NULL,          'active', 'a0000000-0000-4000-8000-000000000105', 'guard@e2e.test',     'E2E-005'),
  ('a0000000-0000-4000-8000-000000000206', 'a0000000-0000-4000-8000-000000000001', 'Anil Peon',      'Peon',           'support',   'Office',       '8:00 AM - 5:00 PM', NULL,          'active', 'a0000000-0000-4000-8000-000000000106', 'peon@e2e.test',      'E2E-006')
ON CONFLICT ("Id") DO UPDATE SET "Name" = EXCLUDED."Name", "Role" = EXCLUDED."Role", "Category" = EXCLUDED."Category",
  "Department" = EXCLUDED."Department", "Shift" = EXCLUDED."Shift", "Route" = EXCLUDED."Route", "Status" = 'active',
  "UserId" = EXCLUDED."UserId", "Email" = EXCLUDED."Email";

-- Route with 4 stops (~1 km apart, north of the school).
INSERT INTO "dbo"."TransportRoutes" ("Id", "TenantId", "Name")
VALUES ('a0000000-0000-4000-8000-000000000301', 'a0000000-0000-4000-8000-000000000001', 'E2E Route 1')
ON CONFLICT ("Id") DO UPDATE SET "Name" = EXCLUDED."Name";

INSERT INTO "dbo"."RouteStops" ("Id", "TenantId", "RouteId", "Name", "Seq", "Lat", "Lng") VALUES
  ('a0000000-0000-4000-8000-000000000311', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000301', 'Sector 14 Market',  1, 28.4680, 77.0300),
  ('a0000000-0000-4000-8000-000000000312', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000301', 'Sector 15 Park',    2, 28.4655, 77.0290),
  ('a0000000-0000-4000-8000-000000000313', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000301', 'Old Railway Road',  3, 28.4630, 77.0280),
  ('a0000000-0000-4000-8000-000000000314', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000301', 'Civil Lines Chowk', 4, 28.4610, 77.0272)
ON CONFLICT ("Id") DO UPDATE SET "Name" = EXCLUDED."Name", "Seq" = EXCLUDED."Seq", "Lat" = EXCLUDED."Lat", "Lng" = EXCLUDED."Lng";

INSERT INTO "dbo"."Buses" ("Id", "TenantId", "BusNo", "RouteName", "RouteId", "DriverStaffId", "ConductorStaffId", "Capacity")
VALUES ('a0000000-0000-4000-8000-000000000401', 'a0000000-0000-4000-8000-000000000001', 'E2E-BUS-01', 'E2E Route 1',
        'a0000000-0000-4000-8000-000000000301', 'a0000000-0000-4000-8000-000000000201', 'a0000000-0000-4000-8000-000000000202', 40)
ON CONFLICT ("Id") DO UPDATE SET "BusNo" = EXCLUDED."BusNo", "RouteId" = EXCLUDED."RouteId",
  "DriverStaffId" = EXCLUDED."DriverStaffId", "ConductorStaffId" = EXCLUDED."ConductorStaffId", "Capacity" = EXCLUDED."Capacity";

-- Students: 2 at stop 1, 1 at stop 2, none at stop 3 (vacuous stop), 1 at stop 4.
INSERT INTO "dbo"."Students" ("Id", "TenantId", "AdmissionNo", "Name", "Grade", "Section", "Status") VALUES
  ('a0000000-0000-4000-8000-000000000501', 'a0000000-0000-4000-8000-000000000001', 'E2E-S1', 'Aarav Sharma', '5', 'A', 'active'),
  ('a0000000-0000-4000-8000-000000000502', 'a0000000-0000-4000-8000-000000000001', 'E2E-S2', 'Diya Verma',   '3', 'B', 'active'),
  ('a0000000-0000-4000-8000-000000000503', 'a0000000-0000-4000-8000-000000000001', 'E2E-S3', 'Kabir Singh',  '7', 'A', 'active'),
  ('a0000000-0000-4000-8000-000000000504', 'a0000000-0000-4000-8000-000000000001', 'E2E-S4', 'Meera Iyer',   '2', 'C', 'active')
ON CONFLICT ("Id") DO UPDATE SET "Name" = EXCLUDED."Name", "Status" = 'active';

INSERT INTO "dbo"."StudentBusAssignments" ("Id", "TenantId", "StudentId", "BusId", "StopId", "RouteId") VALUES
  ('a0000000-0000-4000-8000-000000000601', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000501', 'a0000000-0000-4000-8000-000000000401', 'a0000000-0000-4000-8000-000000000311', 'a0000000-0000-4000-8000-000000000301'),
  ('a0000000-0000-4000-8000-000000000602', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000502', 'a0000000-0000-4000-8000-000000000401', 'a0000000-0000-4000-8000-000000000311', 'a0000000-0000-4000-8000-000000000301'),
  ('a0000000-0000-4000-8000-000000000603', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000503', 'a0000000-0000-4000-8000-000000000401', 'a0000000-0000-4000-8000-000000000312', 'a0000000-0000-4000-8000-000000000301'),
  ('a0000000-0000-4000-8000-000000000604', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000504', 'a0000000-0000-4000-8000-000000000401', 'a0000000-0000-4000-8000-000000000314', 'a0000000-0000-4000-8000-000000000301')
ON CONFLICT ("Id") DO UPDATE SET "BusId" = EXCLUDED."BusId", "StopId" = EXCLUDED."StopId", "RouteId" = EXCLUDED."RouteId";

-- One open task per staff member.
INSERT INTO "dbo"."StaffTasks" ("Id", "TenantId", "StaffId", "Title", "Detail", "Priority", "Done", "DueLabel")
SELECT ('a0000000-0000-4000-8000-0000000007' || lpad(n::text, 2, '0'))::uuid, 'a0000000-0000-4000-8000-000000000001',
       ('a0000000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid,
       'E2E task for staff ' || n, 'Seeded for the end-to-end check.', CASE WHEN n = 1 THEN 'urgent' ELSE 'normal' END, false, 'Today'
FROM generate_series(1, 6) AS n
ON CONFLICT ("Id") DO UPDATE SET "Title" = EXCLUDED."Title", "Done" = false;

-- Leave entitlements for the current year (casual 12, sick 10, earned 15) for every staff login.
INSERT INTO "dbo"."LeaveEntitlements" ("Id", "TenantId", "RequesterId", "Type", "Year", "TotalDays")
SELECT gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', ('a0000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid,
       t.type, EXTRACT(year FROM now())::int, t.days
FROM generate_series(1, 6) AS n
CROSS JOIN (VALUES ('casual', 12), ('sick', 10), ('earned', 15)) AS t(type, days)
ON CONFLICT ("TenantId", "RequesterId", "Type", "Year") DO UPDATE SET "TotalDays" = EXCLUDED."TotalDays";

COMMIT;
```

- [ ] **Step 2: Add the compose service** in `docker-compose.yml`, after the `migrate` service:

```yaml
  # Dev-only demo data for the staff-app end-to-end check: `docker compose --profile seed up`.
  # Idempotent (fixed ids + ON CONFLICT); runs as the schema owner after migrations.
  seed:
    image: postgres:18-alpine
    profiles: ["seed"]
    depends_on:
      migrate: { condition: service_completed_successfully }
    environment:
      PGPASSWORD: "Local_Dev_Pass123!"
    volumes:
      - ./db/dev-seed:/seed:ro
    command: ["psql", "-h", "db", "-U", "sms", "-d", "sms_dev", "-v", "ON_ERROR_STOP=1", "-f", "/seed/staff_e2e.sql"]
```

- [ ] **Step 3: Write `db/dev-seed/README.md`**

```markdown
# Dev seed (staff app end-to-end check)

`docker compose --profile seed up --build` — applies `staff_e2e.sql` after migrations. Safe to re-run.

Logins (tenant "Greenfield E2E School"): driver@e2e.test, conductor@e2e.test, sweeper@e2e.test,
gardener@e2e.test, guard@e2e.test, peon@e2e.test. None has a password yet: sign in with any
password → "You haven't set a password yet" → request a code (printed in the `api` container log
by the Development OTP sender) → set a password.

Bus `E2E-BUS-01` (driver + conductor assigned) runs "E2E Route 1": 4 stops, students at stops
1, 2 and 4 (stop 3 has none).
```

- [ ] **Step 4: Verify it applies and is idempotent**

Run:
```bash
docker compose --profile seed up --build -d db migrate seed
docker compose logs seed | tail -5
docker compose run --rm seed
docker compose exec db psql -U sms -d sms_dev -c "SELECT (SELECT count(*) FROM dbo.\"Staff\" WHERE \"TenantId\"='a0000000-0000-4000-8000-000000000001') AS staff, (SELECT count(*) FROM dbo.\"RouteStops\" WHERE \"RouteId\"='a0000000-0000-4000-8000-000000000301') AS stops, (SELECT count(*) FROM dbo.\"LeaveEntitlements\" WHERE \"TenantId\"='a0000000-0000-4000-8000-000000000001') AS leave"
```
Expected: both seed runs end with `COMMIT` and no `ERROR`; the query prints `staff=6, stops=4, leave=18`.

- [ ] **Step 5: Commit**

```bash
git add db/dev-seed docker-compose.yml
git commit -m "chore(dev): idempotent staff-app end-to-end seed behind a compose 'seed' profile

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

# Part B — sms-staff

All Part B paths are relative to `D:\convert\SMS backend\sms-staff`. Run single tests with `npx jest <path>`; run everything with `npm test && npm run typecheck && npm run lint`.

### Task B1: Config, typed network/forbidden errors and billing-gate messages

**Files:**
- Modify: `.env.example`
- Modify: `README.md` (append a section)
- Modify: `src/lib/httpClient.ts:39-65`
- Modify: `src/features/auth/authErrors.ts`
- Test: `src/lib/__tests__/httpClient.errors.test.ts` (create), `src/features/auth/__tests__/authErrors.billing.test.ts` (create)

**Interfaces:**
- Produces: `httpClient` throws `AppError('network', 0, 'Network request failed')` when `fetch` rejects, and `AppError('forbidden', 403, …)` for a 403 with no error body. `authErrorMessage` handles `contract_mismatch`, `no_staff_role`, `tenant_pending_activation`, `tenant_on_hold`, `tenant_deactivated`, `tenant_suspended`, `past_due`, `payment_required`.

- [ ] **Step 1: Write the failing tests**

`src/lib/__tests__/httpClient.errors.test.ts`:
```ts
import { createHttpClient } from '@/lib/httpClient';
import { AppError } from '@/lib/errors';

const auth = () => ({ accessToken: 't', tenantId: 'x' });

describe('httpClient error typing', () => {
  it('turns a fetch rejection into AppError(network, 0)', async () => {
    const http = createHttpClient({ baseUrl: 'http://api', getAuth: auth, fetchImpl: jest.fn().mockRejectedValue(new TypeError('Network request failed')) });
    await expect(http.get('/x')).rejects.toMatchObject({ code: 'network', status: 0 });
    await expect(http.get('/x')).rejects.toBeInstanceOf(AppError);
  });

  it('maps an empty-body 403 (tenant header mismatch) to forbidden', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 403, json: () => Promise.reject(new Error('no body')) });
    const http = createHttpClient({ baseUrl: 'http://api', getAuth: auth, fetchImpl });
    await expect(http.get('/x')).rejects.toMatchObject({ code: 'forbidden', status: 403 });
  });
});
```

`src/features/auth/__tests__/authErrors.billing.test.ts`:
```ts
import { authErrorMessage } from '@/features/auth/authErrors';
import { AppError } from '@/lib/errors';

describe('authErrorMessage — gate and contract codes', () => {
  it.each([
    ['tenant_pending_activation', 403, "Your school's account isn't active yet. Please contact your school admin."],
    ['tenant_on_hold', 403, "Your school's account is on hold. Please contact your school admin."],
    ['tenant_deactivated', 403, "Your school's account has been deactivated. Please contact your school admin."],
    ['tenant_suspended', 403, "Your school's account is suspended. Please contact your school admin."],
    ['past_due', 402, "Your school's subscription payment is overdue. Some actions are unavailable."],
    ['payment_required', 402, "Your school's subscription payment is overdue. Some actions are unavailable."],
    ['no_staff_role', 403, 'Your account has no staff app role. Contact your school admin.'],
  ])('%s', (code, status, text) => {
    expect(authErrorMessage(new AppError(code, status, 'server text'))).toBe(text);
  });

  it('contract_mismatch is not reported as a connectivity problem', () => {
    expect(authErrorMessage(new AppError('contract_mismatch', 0, 'x')))
      .toBe('The app and the server are out of sync. Please update the app.');
  });

  it('network still reads as a connectivity problem', () => {
    expect(authErrorMessage(new AppError('network', 0, 'x')))
      .toBe('Cannot reach the server. Please check your connection and try again.');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/lib/__tests__/httpClient.errors.test.ts src/features/auth/__tests__/authErrors.billing.test.ts`
Expected: FAIL — rejection is a `TypeError`; codes fall through to server text.

- [ ] **Step 3: Implement.** In `httpClient.ts` replace the `fetchImpl(...)` call and the `!res.ok` branch:

```ts
    let res: Response;
    try {
      res = await fetchImpl(`${opts.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      // No response at all (offline, DNS, server down) — typed so screens can say
      // "cannot reach server" instead of surfacing a raw TypeError.
      throw new AppError('network', 0, 'Network request failed');
    }
```
and
```ts
    if (!res.ok) {
      const err = envelope.error ?? envelope;
      // sms-api's tenant-header mismatch is a bare 403 with no body.
      const fallbackCode = res.status === 403 ? 'forbidden' : 'http_error';
      throw new AppError(err.code ?? fallbackCode, res.status, err.message ?? `HTTP ${res.status}`);
    }
```
Also update the comment `// sms-backend wraps every body:` to `// sms-api wraps every body:`.

In `authErrors.ts` add to `MESSAGES`:
```ts
  no_staff_role: 'Your account has no staff app role. Contact your school admin.',
  tenant_pending_activation: "Your school's account isn't active yet. Please contact your school admin.",
  tenant_on_hold: "Your school's account is on hold. Please contact your school admin.",
  tenant_deactivated: "Your school's account has been deactivated. Please contact your school admin.",
  tenant_suspended: "Your school's account is suspended. Please contact your school admin.",
  past_due: "Your school's subscription payment is overdue. Some actions are unavailable.",
  payment_required: "Your school's subscription payment is overdue. Some actions are unavailable.",
  contract_mismatch: 'The app and the server are out of sync. Please update the app.',
```
and in `authErrorMessage` replace the status-0 check with:
```ts
    if (err.status === 0 && err.code !== 'contract_mismatch') {
      return 'Cannot reach the server. Please check your connection and try again.';
    }
```
`contract_mismatch` then falls through to `MESSAGES[err.code]`.

`.env.example` first line becomes:
```
EXPO_PUBLIC_API_BASE_URL=http://localhost:5080/v1
```

Append to `README.md`:
```markdown
## Running against sms-api locally

1. In `../sms-api`: `docker compose --profile seed up --build` (API on `http://localhost:5080`, seeded demo school — see `sms-api/db/dev-seed/README.md`).
2. Copy `.env.example` to `.env` (`EXPO_PUBLIC_DATA_SOURCE=live`).
3. Web: `npm run web` — `localhost:8081`/`:19006` are already allowed by the API's Development CORS list.
4. Physical device: set `EXPO_PUBLIC_API_BASE_URL=http://<your-PC-LAN-IP>:5080/v1` (`localhost` is the phone itself). For Expo web served from another host, add it with `Cors__AllowedOrigins__N=http://<host>:<port>` on the `api` service.
```

- [ ] **Step 4: Run tests**

Run: `npx jest src/lib src/features/auth`
Expected: PASS (existing authErrors tests included).

- [ ] **Step 5: Commit**

```bash
git add .env.example README.md src/lib/httpClient.ts src/features/auth/authErrors.ts src/lib/__tests__/httpClient.errors.test.ts src/features/auth/__tests__/authErrors.billing.test.ts
git commit -m "feat(http): typed network/forbidden errors, billing-gate messages, sms-api local config

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B2: Single-flight token refresh on 401 and resilient bootstrap

**Files:**
- Create: `src/lib/sessionEvents.ts`, `src/lib/sessionRefresher.ts`
- Modify: `src/lib/httpClient.ts` (options + retry)
- Modify: `src/data/repositories/types.ts` (`AuthRepository.refresh`)
- Modify: `src/data/http/auth.repo.ts` (`refresh`)
- Modify: `src/data/mock/auth.repo.ts` (`refresh`)
- Modify: `src/providers/AppProviders.tsx`
- Modify: `src/features/auth/AuthProvider.tsx`
- Test: `src/lib/__tests__/sessionRefresher.test.ts`, `src/lib/__tests__/httpClient.refresh.test.ts`, `src/features/auth/__tests__/AuthProvider.session.test.tsx` (create all three)

**Interfaces:**
- Produces:
  - `sessionEvents.onExpired(listener: () => void): () => void`, `sessionEvents.emitExpired(): void`
  - `createSessionRefresher(deps: { readRefreshToken(): Promise<string|null>; refresh(rt: string): Promise<Tokens>; saveTokens(t: Tokens): Promise<void>; onRefreshed(accessToken: string): void; onExpired(): void }): { refresh(): Promise<string|null> }`
  - `HttpClientOptions.onUnauthorized?: () => Promise<string | null>`
  - `AuthRepository.refresh(refreshToken: string): Promise<Tokens>` (`Tokens` from `@/lib/tokenStore`)

- [ ] **Step 1: Write the failing tests**

`src/lib/__tests__/sessionRefresher.test.ts`:
```ts
import { createSessionRefresher } from '@/lib/sessionRefresher';
import { AppError } from '@/lib/errors';

function deps(overrides: Partial<Parameters<typeof createSessionRefresher>[0]> = {}) {
  return {
    readRefreshToken: jest.fn().mockResolvedValue('rt-1'),
    refresh: jest.fn().mockResolvedValue({ accessToken: 'at-2', refreshToken: 'rt-2' }),
    saveTokens: jest.fn().mockResolvedValue(undefined),
    onRefreshed: jest.fn(),
    onExpired: jest.fn(),
    ...overrides,
  };
}

describe('createSessionRefresher', () => {
  it('rotates tokens and returns the new access token', async () => {
    const d = deps();
    await expect(createSessionRefresher(d).refresh()).resolves.toBe('at-2');
    expect(d.refresh).toHaveBeenCalledWith('rt-1');
    expect(d.saveTokens).toHaveBeenCalledWith({ accessToken: 'at-2', refreshToken: 'rt-2' });
    expect(d.onRefreshed).toHaveBeenCalledWith('at-2');
  });

  it('shares one in-flight refresh between concurrent callers (rotation would revoke a second one)', async () => {
    let resolve!: (v: { accessToken: string; refreshToken: string }) => void;
    const d = deps({ refresh: jest.fn(() => new Promise((r) => { resolve = r; })) });
    const r = createSessionRefresher(d);
    const a = r.refresh();
    const b = r.refresh();
    await Promise.resolve();
    resolve({ accessToken: 'at-2', refreshToken: 'rt-2' });
    await expect(Promise.all([a, b])).resolves.toEqual(['at-2', 'at-2']);
    expect(d.refresh).toHaveBeenCalledTimes(1);
  });

  it('expires the session when the server rejects the refresh token', async () => {
    const d = deps({ refresh: jest.fn().mockRejectedValue(new AppError('invalid_token', 401, 'refresh token invalid')) });
    await expect(createSessionRefresher(d).refresh()).resolves.toBeNull();
    expect(d.onExpired).toHaveBeenCalledTimes(1);
  });

  it('does not expire the session on a network failure', async () => {
    const d = deps({ refresh: jest.fn().mockRejectedValue(new AppError('network', 0, 'offline')) });
    await expect(createSessionRefresher(d).refresh()).resolves.toBeNull();
    expect(d.onExpired).not.toHaveBeenCalled();
  });

  it('expires when there is no refresh token stored', async () => {
    const d = deps({ readRefreshToken: jest.fn().mockResolvedValue(null) });
    await expect(createSessionRefresher(d).refresh()).resolves.toBeNull();
    expect(d.onExpired).toHaveBeenCalled();
  });
});
```

`src/lib/__tests__/httpClient.refresh.test.ts`:
```ts
import { createHttpClient } from '@/lib/httpClient';

const ok = (data: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve({ data }) });
const unauthorized = () => ({ ok: false, status: 401, json: () => Promise.resolve({ error: { code: 'unauthorized', message: 'x' } }) });

describe('httpClient 401 handling', () => {
  it('refreshes once and replays the request with the new token', async () => {
    let token = 'old';
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(ok({ n: 1 }));
    const onUnauthorized = jest.fn(async () => { token = 'new'; return 'new'; });
    const http = createHttpClient({ baseUrl: 'http://api', getAuth: () => ({ accessToken: token, tenantId: 't' }), fetchImpl, onUnauthorized });

    await expect(http.get('/staff/tasks')).resolves.toEqual({ n: 1 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe('Bearer new');
  });

  it('gives up after one replay', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(unauthorized());
    const http = createHttpClient({ baseUrl: 'http://api', getAuth: () => ({ accessToken: 'a', tenantId: 't' }), fetchImpl, onUnauthorized: async () => 'b' });
    await expect(http.get('/staff/tasks')).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rethrows the 401 when the refresh yields no token', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(unauthorized());
    const http = createHttpClient({ baseUrl: 'http://api', getAuth: () => ({ accessToken: 'a', tenantId: 't' }), fetchImpl, onUnauthorized: async () => null });
    await expect(http.get('/staff/tasks')).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each(['/auth/login', '/auth/refresh', '/auth/otp/verify', '/auth/logout'])('never refreshes for %s', async (path) => {
    const fetchImpl = jest.fn().mockResolvedValue(unauthorized());
    const onUnauthorized = jest.fn(async () => 'b');
    const http = createHttpClient({ baseUrl: 'http://api', getAuth: () => ({ accessToken: 'a', tenantId: null }), fetchImpl, onUnauthorized });
    await expect(http.post(path, {})).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('does refresh for /auth/me (bootstrap with an expired access token)', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(ok({ id: 'u' }));
    const http = createHttpClient({ baseUrl: 'http://api', getAuth: () => ({ accessToken: 'a', tenantId: null }), fetchImpl, onUnauthorized: async () => 'b' });
    await expect(http.get('/auth/me')).resolves.toEqual({ id: 'u' });
  });
});
```

`src/features/auth/__tests__/AuthProvider.session.test.tsx`:
```tsx
import React from 'react';
import { Text } from 'react-native';
import { render, waitFor, act } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { RepositoryProvider } from '@/data/repositories/RepositoryContext';
import { ThemeProvider } from '@/theme';
import { sessionEvents } from '@/lib/sessionEvents';
import { AppError } from '@/lib/errors';
import type { Repositories } from '@/data/repositories/types';

const mockTokens = { read: jest.fn(), save: jest.fn(), clear: jest.fn() };
jest.mock('@/lib/tokenStore', () => ({ tokenStore: mockTokens }));
const mockStore: Record<string, unknown> = {};
jest.mock('@/lib/asyncStore', () => ({
  asyncStore: {
    get: jest.fn(async (k: string) => mockStore[k] ?? null),
    set: jest.fn(async (k: string, v: unknown) => { mockStore[k] = v; }),
    remove: jest.fn(async (k: string) => { delete mockStore[k]; }),
  },
}));

const user = { id: 'u1', name: 'Ramesh', firstName: 'Ramesh', roleKey: 'driver', empId: '', joined: '', rating: 0, dutyPost: '', shift: '', timing: '', phone: '' };
const stored = { accessToken: 'at-old', refreshToken: 'rt-old', user, tenant: { id: 't1', name: 'School' } };

function repos(me: jest.Mock): Repositories {
  return { auth: { me, logout: jest.fn().mockResolvedValue(undefined) } } as unknown as Repositories;
}

const Probe = () => { const a = useAuth(); return <Text testID="status">{a.status}</Text>; };
const renderWith = (r: Repositories) =>
  render(<ThemeProvider><RepositoryProvider repositories={r}><AuthProvider><Probe /></AuthProvider></RepositoryProvider></ThemeProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  mockStore['sms.session'] = stored;
  mockTokens.read.mockResolvedValue({ accessToken: 'at-old', refreshToken: 'rt-old' });
});

describe('AuthProvider session lifecycle', () => {
  it('keeps the stored session when /auth/me fails with a network error', async () => {
    const r = renderWith(repos(jest.fn().mockRejectedValue(new AppError('network', 0, 'offline'))));
    await waitFor(() => expect(r.getByTestId('status').props.children).toBe('authenticated'));
    expect(mockTokens.clear).not.toHaveBeenCalled();
  });

  it('logs out when /auth/me is rejected for auth reasons', async () => {
    const r = renderWith(repos(jest.fn().mockRejectedValue(new AppError('unauthorized', 401, 'x'))));
    await waitFor(() => expect(r.getByTestId('status').props.children).toBe('unauthenticated'));
    expect(mockTokens.clear).toHaveBeenCalled();
  });

  it('adopts tokens rotated during bootstrap instead of the ones read before /auth/me', async () => {
    const { authSnapshot } = require('@/lib/authSnapshot');
    mockTokens.read
      .mockResolvedValueOnce({ accessToken: 'at-old', refreshToken: 'rt-old' })
      .mockResolvedValue({ accessToken: 'at-new', refreshToken: 'rt-new' });
    const r = renderWith(repos(jest.fn().mockResolvedValue(user)));
    await waitFor(() => expect(r.getByTestId('status').props.children).toBe('authenticated'));
    expect(authSnapshot.get().accessToken).toBe('at-new');
  });

  it('returns to unauthenticated when the session expires', async () => {
    const r = renderWith(repos(jest.fn().mockResolvedValue(user)));
    await waitFor(() => expect(r.getByTestId('status').props.children).toBe('authenticated'));
    act(() => sessionEvents.emitExpired());
    await waitFor(() => expect(r.getByTestId('status').props.children).toBe('unauthenticated'));
    expect(mockTokens.clear).toHaveBeenCalled();
  });
});
```

If `ThemeProvider` reads AsyncStorage and `jest.setup.js` does not already mock `@react-native-async-storage/async-storage`, add the in-memory mock used at the top of `src/data/__tests__/contract.test.ts` to this test file.

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/lib/__tests__/sessionRefresher.test.ts src/lib/__tests__/httpClient.refresh.test.ts src/features/auth/__tests__/AuthProvider.session.test.tsx`
Expected: FAIL — modules/options do not exist; network error logs out.

- [ ] **Step 3: Implement `sessionEvents.ts`**

```ts
type Listener = () => void;
const listeners = new Set<Listener>();

/** Fired when the refresh token is rejected — the app must drop back to Login. */
export const sessionEvents = {
  onExpired(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  emitExpired(): void {
    listeners.forEach((l) => l());
  },
};
```

- [ ] **Step 4: Implement `sessionRefresher.ts`**

```ts
import { isAppError } from './errors';
import type { Tokens } from './tokenStore';

export interface SessionRefresherDeps {
  readRefreshToken: () => Promise<string | null>;
  refresh: (refreshToken: string) => Promise<Tokens>;
  saveTokens: (tokens: Tokens) => Promise<void>;
  onRefreshed: (accessToken: string) => void;
  onExpired: () => void;
}

export interface SessionRefresher {
  /** New access token, or null if the session could not be refreshed. */
  refresh(): Promise<string | null>;
}

// sms-api rotates the refresh token on every use and revokes the old one, so two parallel
// refreshes would revoke each other — every concurrent 401 must await the same attempt.
export function createSessionRefresher(deps: SessionRefresherDeps): SessionRefresher {
  let inFlight: Promise<string | null> | null = null;

  async function run(): Promise<string | null> {
    const refreshToken = await deps.readRefreshToken();
    if (!refreshToken) {
      deps.onExpired();
      return null;
    }
    try {
      const tokens = await deps.refresh(refreshToken);
      await deps.saveTokens(tokens);
      deps.onRefreshed(tokens.accessToken);
      return tokens.accessToken;
    } catch (err) {
      // Only an auth rejection ends the session; a network blip mid-route must not log out.
      if (isAppError(err) && err.status >= 400 && err.status < 500 && err.status !== 429) deps.onExpired();
      return null;
    }
  }

  return {
    refresh() {
      if (!inFlight) inFlight = run().finally(() => { inFlight = null; });
      return inFlight;
    },
  };
}
```

- [ ] **Step 5: httpClient retry.** Add to `HttpClientOptions`:

```ts
  /** Called once on a 401 from a non-auth route; resolves to a new access token or null. */
  onUnauthorized?: () => Promise<string | null>;
```

Add above `createHttpClient`:

```ts
// Credential-exchange routes answer 401 for bad credentials, never for an expired access token.
// /auth/me is the exception: it is a normal [Authorize] read (used at bootstrap).
function isAuthExchangePath(path: string): boolean {
  return path.startsWith('/auth/') && !path.startsWith('/auth/me');
}
```

Change the signature to `async function request<T>(method: string, path: string, body?: unknown, replayed = false): Promise<T>` and, directly after the `try { res = await fetchImpl… } catch {…}` block from B1, add:

```ts
    if (res.status === 401 && !replayed && opts.onUnauthorized && !isAuthExchangePath(path)) {
      const fresh = await opts.onUnauthorized();
      if (fresh) return request<T>(method, path, body, true);
    }
```

- [ ] **Step 6: `refresh` returns tokens only.** In `types.ts` add `import type { Tokens } from '@/lib/tokenStore';` and change the line to `refresh(refreshToken: string): Promise<Tokens>;`. In `src/data/http/auth.repo.ts` replace the `refresh` entry with:

```ts
    // sms-api returns only the rotated pair (TokenResponse) — no user/tenant.
    refresh: async (refreshToken) => {
      const t = tokenSchema.parse(await http.post('/auth/refresh', { refresh_token: refreshToken }));
      return { accessToken: t.access_token, refreshToken: t.refresh_token };
    },
```
and delete the now-unused `toSession, type SessionDTO` import. In `src/data/mock/auth.repo.ts` make `refresh` return `{ accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' }` after `await simulateLatency()` (keep whatever latency call the existing body used).

- [ ] **Step 7: Wire it in `AppProviders.tsx`.** Add imports `import { tokenStore } from '@/lib/tokenStore';`, `import { sessionEvents } from '@/lib/sessionEvents';`, `import { createSessionRefresher } from '@/lib/sessionRefresher';` and replace the live branch:

```tsx
      if (env.DATA_SOURCE === 'live') {
        // The refresher needs the auth repo, which needs the http client, which needs the
        // refresher — resolve the cycle through a holder filled in right below.
        const holder: { repos?: Repositories } = {};
        const refresher = createSessionRefresher({
          readRefreshToken: async () => (await tokenStore.read())?.refreshToken ?? null,
          refresh: (rt) => holder.repos!.auth.refresh(rt),
          saveTokens: (t) => tokenStore.save(t),
          onRefreshed: (accessToken) => authSnapshot.set({ ...authSnapshot.get(), accessToken }),
          onExpired: () => sessionEvents.emitExpired(),
        });
        const http = createHttpClient({
          baseUrl: env.API_BASE_URL,
          getAuth: () => authSnapshot.get(),
          onUnauthorized: () => refresher.refresh(),
        });
        holder.repos = createHttpRepositories(http);
        setRepositories(holder.repos);
      } else {
```

- [ ] **Step 8: AuthProvider.** Add `import { sessionEvents } from '@/lib/sessionEvents';` and `import { isAppError } from '@/lib/errors';`.

Inside the bootstrap `try` replace the three lines from `const user = await repos.auth.me(stored.user);` through `authSnapshot.set(...)` with:

```tsx
          const user = await repos.auth.me(stored.user);
          // /auth/me may have triggered a silent refresh that rotated the pair — re-read it.
          const latest = (await tokenStore.read()) ?? tokens;
          const rehydrated: Session = { ...stored, ...latest, user };
          authSnapshot.set({ accessToken: rehydrated.accessToken, tenantId: rehydrated.tenant.id });
```

and replace its `catch {` block with:

```tsx
        } catch (err) {
          if (isAppError(err) && err.code === 'network') {
            // Offline cold start (driver in a dead zone): keep the stored session; requests
            // retry once connectivity returns. Only an auth rejection logs out.
            const offline: Session = { ...stored, ...tokens };
            authSnapshot.set({ accessToken: offline.accessToken, tenantId: offline.tenant.id });
            applyRoleFromSession(offline);
            setSession(offline);
            setStatus('authenticated');
            return;
          }
          await tokenStore.clear();
          await asyncStore.remove(SESSION_KEY);
          setStatus('unauthenticated');
        }
```

Add a new effect after the bootstrap effect:

```tsx
  // The refresh token was rejected (revoked / expired after 30 days): drop to Login.
  useEffect(() => sessionEvents.onExpired(() => {
    void tokenStore.clear();
    void asyncStore.remove(SESSION_KEY);
    authSnapshot.clear();
    queryClient.clear();
    setSession(null);
    setPendingPasswordSetup(null);
    setStatus('unauthenticated');
  }), []);
```

In `signOut` replace `await repos.auth.logout(session?.refreshToken ?? null);` with:

```tsx
      // The stored pair is authoritative — it may have been rotated since sign-in.
      const current = (await tokenStore.read())?.refreshToken ?? session?.refreshToken ?? null;
      await repos.auth.logout(current);
```

- [ ] **Step 9: Run tests + typecheck**

Run: `npx jest src/lib src/features/auth src/data && npm run typecheck`
Expected: PASS. Fix any existing test that asserted the old `refresh` shape (`src/data/http/__tests__/repos.test.ts` or mock auth tests) to expect `{ accessToken, refreshToken }`.

- [ ] **Step 10: Commit**

```bash
git add src
git commit -m "feat(auth): single-flight 401 refresh with rotation, offline-safe bootstrap, session expiry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B3: Login without `role`; refuse accounts with no staff role

**Files:**
- Modify: `src/data/http/auth.schema.ts` (`buildLoginRequest`)
- Modify: `src/data/http/auth.repo.ts` (`login`, `verifyOtp`, `me`)
- Modify: `src/data/http/__tests__/auth.schema.test.ts` (existing `buildLoginRequest` expectations)
- Test: `src/data/http/__tests__/auth.repo.role.test.ts` (create)

**Interfaces:**
- Produces: `buildLoginRequest(identifier: string, password: string): { email?: string; phone?: string; password: string }`. `httpAuth` throws `AppError('no_staff_role', 403, …)` from `login`, `verifyOtp` and `me` when `/auth/me` has no `role_key`. `AuthRepository` signatures are unchanged (the `roleKey` argument is ignored by the HTTP adapter).

- [ ] **Step 1: Write the failing tests**

```ts
import { httpAuth } from '@/data/http/auth.repo';
import { buildLoginRequest } from '@/data/http/auth.schema';
import { authSnapshot } from '@/lib/authSnapshot';
import type { HttpClient } from '@/lib/httpClient';

function fakeHttp(me: Record<string, unknown>) {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const http: HttpClient = {
    get: async <T>(path: string) => { calls.push({ method: 'GET', path }); return me as T; },
    post: async <T>(path: string, body?: unknown) => {
      calls.push({ method: 'POST', path, body });
      return (path === '/auth/logout' ? undefined : { access_token: 'at', refresh_token: 'rt' }) as T;
    },
    patch: async <T>() => undefined as T,
    delete: async <T>() => undefined as T,
  };
  return { http, calls };
}

describe('login wire', () => {
  it('never sends role', () => {
    expect(buildLoginRequest('a@b.com', 'pw')).toEqual({ email: 'a@b.com', password: 'pw' });
    expect(buildLoginRequest('9876543210', 'pw')).toEqual({ phone: '9876543210', password: 'pw' });
  });

  it('takes the duty role from /auth/me, not the login screen', async () => {
    const { http, calls } = fakeHttp({ id: 'u', tenant_id: 't', role_key: 'conductor' });
    const s = await httpAuth(http).login('a@b.com', 'pw', 'driver');
    expect(s.user.roleKey).toBe('conductor');
    expect(calls[0].body).toEqual({ email: 'a@b.com', password: 'pw' });
  });

  it('refuses an account with no staff role, revokes its tokens and clears the snapshot', async () => {
    const { http, calls } = fakeHttp({ id: 'u', tenant_id: 't', role_key: null });
    await expect(httpAuth(http).login('a@b.com', 'pw', 'driver')).rejects.toMatchObject({ code: 'no_staff_role', status: 403 });
    expect(calls.some((c) => c.path === '/auth/logout')).toBe(true);
    expect(authSnapshot.get().accessToken).toBeNull();
  });

  it('refuses it on OTP verify too', async () => {
    const { http } = fakeHttp({ id: 'u', tenant_id: 't' });
    await expect(httpAuth(http).verifyOtp('a@b.com', '123456', 'driver')).rejects.toMatchObject({ code: 'no_staff_role' });
  });

  it('refuses it on bootstrap /auth/me', async () => {
    const { http } = fakeHttp({ id: 'u', tenant_id: 't', role_key: null });
    await expect(httpAuth(http).me()).rejects.toMatchObject({ code: 'no_staff_role' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/data/http/__tests__/auth.repo.role.test.ts`
Expected: FAIL — body contains `role`; null `role_key` falls back to `driver`.

- [ ] **Step 3: Implement.** In `auth.schema.ts` replace `buildLoginRequest`:

```ts
/**
 * Builds the snake_case /auth/login body: email XOR phone, never both. No `role`: sms-api
 * provisions staff logins with only the generic `staff` role, so any duty role here would
 * 403 wrong_role. The duty role comes from /auth/me's role_key instead.
 */
export function buildLoginRequest(
  identifier: string,
  password: string,
): { email?: string; phone?: string; password: string } {
  return identifier.includes('@') ? { email: identifier, password } : { phone: identifier, password };
}
```

In `auth.repo.ts` add imports `import { AppError } from '@/lib/errors';` and `type TokenWire` from `./auth.schema`, then inside `httpAuth` before `return {` add:

```ts
  const NO_ROLE = 'Your account has no staff app role. Contact your school admin.';

  // /auth/me is [Authorize]: the snapshot must carry the new token before it goes out.
  async function sessionFromTokens(t: TokenWire): Promise<Session> {
    authSnapshot.set({ accessToken: t.access_token, tenantId: null });
    const me = meSchema.parse(await http.get('/auth/me'));
    if (!me.role_key) {
      // Not a staff-app user (teacher/admin, or a designation with no duty role): revoke the
      // tokens just issued rather than leaving them valid, and refuse the session.
      authSnapshot.clear();
      void http.post('/auth/logout', { refresh_token: t.refresh_token }).catch(() => {});
      throw new AppError('no_staff_role', 403, NO_ROLE);
    }
    authSnapshot.set({ accessToken: t.access_token, tenantId: me.tenant_id });
    return {
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      user: toStaffFromMe(me, me.role_key),
      tenant: toTenantFromMe(me),
    };
  }
```

and replace `verifyOtp`, `login` and `me`:

```ts
    verifyOtp: async (identifier, code) =>
      sessionFromTokens(tokenSchema.parse(await http.post('/auth/otp/verify', { identifier, code }))),
    login: async (identifier, password) =>
      sessionFromTokens(tokenSchema.parse(await http.post('/auth/login', buildLoginRequest(identifier, password)))),
```
```ts
    me: async (previous) => {
      const me = meSchema.parse(await http.get('/auth/me'));
      if (!me.role_key) throw new AppError('no_staff_role', 403, NO_ROLE);
      return toStaffFromMe(me, me.role_key, previous);
    },
```

Update `src/data/http/__tests__/auth.schema.test.ts`: every `buildLoginRequest(x, y, role)` call drops the third argument and every expected object drops `role`. Update `src/data/__tests__/contract.test.ts`'s `meDTO` to include `role_key: 'driver'` (otherwise the live adapter now refuses it).

- [ ] **Step 4: Run tests**

Run: `npx jest src/data src/screens/__tests__/LoginScreen.test.tsx src/screens/__tests__/LoginScreen.roleSync.test.tsx && npm run typecheck`
Expected: PASS. If `LoginScreen.roleSync.test.tsx` asserts the login body contains the tapped role, change that assertion to `expect(body).not.toHaveProperty('role')` — the role now always comes from the server.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "fix(auth): stop sending role on login; refuse accounts without a staff role_key

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B4: Wire-validation helpers, attendance and dashboard schemas

**Files:**
- Create: `src/data/http/schemas/wire.ts`, `src/data/http/schemas/attendance.schema.ts`, `src/data/http/schemas/dashboard.schema.ts`
- Create: `src/lib/date.ts`
- Modify: `src/data/http/attendance.repo.ts`, `src/data/http/dashboard.repo.ts`
- Modify: `src/data/domain/dashboard.ts` (`streakDays?`, `leaveLeft?`)
- Modify: `src/data/http/mappers.ts` (`DashboardDTO`, `toDashboard`)
- Modify: `src/components/ui/StatTrio.tsx`
- Test: `src/data/http/__tests__/schemas.attendance-dashboard.test.ts`, `src/components/ui/__tests__/StatTrio.test.tsx` (create)

**Interfaces:**
- Produces:
  - `opt<T extends z.ZodTypeAny>(s: T)` — accepts value | null | undefined, outputs value | undefined.
  - `orEmpty` — `z.string().nullish()` → `string` (`''` for null).
  - `parseWire<T extends z.ZodTypeAny>(schema: T, value: unknown, what: string): z.output<T>` — throws `AppError('contract_mismatch', 0, …)`.
  - `deviceUtcOffsetMinutes(d?: Date): number` in `src/lib/date.ts`.
  - `attendanceSchema`, `schoolLocationSchema`, `dashboardSchema`.
  - `Dashboard.streakDays?: number`, `Dashboard.leaveLeft?: number`.

- [ ] **Step 1: Write the failing tests**

`src/data/http/__tests__/schemas.attendance-dashboard.test.ts`:
```ts
import { httpAttendance } from '@/data/http/attendance.repo';
import { httpDashboard } from '@/data/http/dashboard.repo';
import type { HttpClient } from '@/lib/httpClient';

function fakeHttp(routes: Record<string, unknown>) {
  const calls: Array<{ method: string; path: string; params?: unknown; body?: unknown }> = [];
  const http: HttpClient = {
    get: async <T>(path: string, params?: Record<string, unknown>) => { calls.push({ method: 'GET', path, params }); return routes[`GET ${path}`] as T; },
    post: async <T>(path: string, body?: unknown) => { calls.push({ method: 'POST', path, body }); return routes[`POST ${path}`] as T; },
    patch: async <T>() => undefined as T,
    delete: async <T>() => undefined as T,
  };
  return { http, calls };
}

// Shapes recorded from sms-api (StaffAttendanceResponse / DashboardResponse): nulls, not omissions.
const attendanceWire = {
  checked_in: true, check_in_at: '2026-09-26T03:10:00Z',
  last_log: [{ kind: 'in', at: '2026-09-26T03:10:00Z', in_zone: true }],
  duty_post: 'Greenfield E2E Main Gate', geofence_radius_m: 150,
};

describe('attendance wire', () => {
  it('maps last_log[].in_zone to inZone', async () => {
    const { http } = fakeHttp({ 'GET /staff/attendance': attendanceWire });
    const a = await httpAttendance(http).status();
    expect(a.lastLog).toEqual([{ kind: 'in', at: '2026-09-26T03:10:00Z', inZone: true }]);
  });

  it('treats a null check_in_at as absent and sends offset_minutes', async () => {
    const { http, calls } = fakeHttp({ 'GET /staff/attendance': { ...attendanceWire, checked_in: false, check_in_at: null, last_log: [] } });
    const a = await httpAttendance(http).status();
    expect(a.checkInAt).toBeUndefined();
    expect(calls[0].params).toEqual({ offset_minutes: -new Date().getTimezoneOffset() });
  });

  it('sends offset_minutes on check-in', async () => {
    const { http, calls } = fakeHttp({ 'POST /staff/attendance/check-in': attendanceWire });
    await httpAttendance(http).checkIn('2026-09-26T03:10:00Z', 28.4, 77.0, 12);
    expect(calls[0].body).toEqual({ at: '2026-09-26T03:10:00Z', lat: 28.4, lng: 77.0, accuracy_meters: 12, offset_minutes: -new Date().getTimezoneOffset() });
  });

  it('rejects a drifted shape with contract_mismatch', async () => {
    const { http } = fakeHttp({ 'GET /staff/attendance': { checkedIn: true } });
    await expect(httpAttendance(http).status()).rejects.toMatchObject({ code: 'contract_mismatch' });
  });
});

describe('dashboard wire', () => {
  it('leaves streak and leave-left undefined when sms-api does not send them', async () => {
    const { http } = fakeHttp({
      'GET /staff/dashboard': {
        hours_this_week: 12.5,
        role_card: { kind: 'driver', bus_no: 'E2E-BUS-01', route_name: 'E2E Route 1', shift: null, students_assigned: 4, on_board: 0, capacity: 40, next_stop: null },
      },
    });
    const d = await httpDashboard(http).get();
    expect(d.hoursThisWeek).toBe(12.5);
    expect(d.streakDays).toBeUndefined();
    expect(d.leaveLeft).toBeUndefined();
    expect(d.roleCard).toEqual({ kind: 'driver', busNo: 'E2E-BUS-01', routeName: 'E2E Route 1', shift: undefined, studentsAssigned: 4 });
  });

  it('accepts a null role_card', async () => {
    const { http } = fakeHttp({ 'GET /staff/dashboard': { hours_this_week: 0, role_card: null } });
    await expect(httpDashboard(http).get()).resolves.toMatchObject({ roleCard: null });
  });
});
```

`src/components/ui/__tests__/StatTrio.test.tsx`:
```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme';
import { StatTrio } from '@/components/ui/StatTrio';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

const r = (props: React.ComponentProps<typeof StatTrio>) => render(<ThemeProvider><StatTrio {...props} /></ThemeProvider>);

describe('StatTrio', () => {
  it('hides streak and leave cards when the server sends no data for them', () => {
    const { queryByTestId } = r({ hoursThisWeek: 10, hoursTarget: 0 });
    expect(queryByTestId('stat-streak')).toBeNull();
    expect(queryByTestId('stat-leave')).toBeNull();
  });

  it('shows them when present', () => {
    const { getByTestId } = r({ hoursThisWeek: 10, hoursTarget: 48, streakDays: 3, leaveLeft: 5 });
    expect(getByTestId('stat-streak')).toBeTruthy();
    expect(getByTestId('stat-leave')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/data/http/__tests__/schemas.attendance-dashboard.test.ts src/components/ui/__tests__/StatTrio.test.tsx`
Expected: FAIL — `inZone` undefined, no `offset_minutes`, no testIDs.

- [ ] **Step 3: Helpers.** `src/data/http/schemas/wire.ts`:

```ts
import { z } from 'zod';
import { AppError } from '@/lib/errors';

/** sms-api writes absent optionals as null; the app's DTOs use undefined. */
export const opt = <T extends z.ZodTypeAny>(schema: T) =>
  schema.nullish().transform((v) => (v ?? undefined) as z.output<T> | undefined);

/** A display string the server may send as null. */
export const orEmpty = z.string().nullish().transform((v) => v ?? '');

/**
 * Validates an unwrapped `data` payload. Unknown fields are stripped (never an error), so new
 * server fields can't break old apps; a missing/mistyped field the app reads fails loudly.
 */
export function parseWire<T extends z.ZodTypeAny>(schema: T, value: unknown, what: string): z.output<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // eslint-disable-next-line no-console
    console.warn(`[contract] ${what}`, result.error.issues);
  }
  throw new AppError('contract_mismatch', 0, `Unexpected ${what} response from the server`);
}
```

`src/lib/date.ts`:
```ts
/** Minutes east of UTC (IST → 330) — sms-api's offset_minutes convention. */
export function deviceUtcOffsetMinutes(d: Date = new Date()): number {
  return -d.getTimezoneOffset();
}
```

- [ ] **Step 4: Schemas.** `src/data/http/schemas/attendance.schema.ts`:

```ts
import { z } from 'zod';
import { opt, orEmpty } from './wire';

const logSchema = z
  .object({ at: z.string(), kind: z.enum(['in', 'out']), in_zone: z.boolean() })
  .transform((l) => ({ at: l.at, kind: l.kind, inZone: l.in_zone }));

export const attendanceSchema = z.object({
  checked_in: z.boolean(),
  check_in_at: opt(z.string()),
  last_log: z.array(logSchema),
  duty_post: orEmpty,
  geofence_radius_m: z.number(),
});

export const schoolLocationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  radius_meters: z.number(),
  name: opt(z.string()),
});
```

`src/data/http/schemas/dashboard.schema.ts`:

```ts
import { z } from 'zod';
import { opt } from './wire';

const roleCardSchema = z.object({
  kind: z.string(),
  bus_no: opt(z.string()),
  route_name: opt(z.string()),
  shift: opt(z.string()),
  students_assigned: opt(z.number()),
});

const taskPeekSchema = z
  .object({ id: z.string(), title: z.string(), priority: z.enum(['urgent', 'normal']), done: z.boolean(), photo_url: opt(z.string()) })
  .transform((p) => ({ id: p.id, title: p.title, priority: p.priority, done: p.done, photoUrl: p.photo_url }));

export const dashboardSchema = z.object({
  hours_this_week: z.number(),
  hours_target: opt(z.number()),
  streak_days: opt(z.number()),
  leave_left: opt(z.number()),
  role_card: roleCardSchema.nullish(),
  pending_tasks_peek: opt(z.array(taskPeekSchema)),
  alert: opt(z.string()),
});
```

- [ ] **Step 5: Repos, domain, mapper, component.**

`attendance.repo.ts`:
```ts
import type { AttendanceRepository } from '@/data/repositories/types';
import type { HttpClient } from '@/lib/httpClient';
import { deviceUtcOffsetMinutes } from '@/lib/date';
import { toAttendance, toSchoolLocation } from './mappers';
import { parseWire } from './schemas/wire';
import { attendanceSchema, schoolLocationSchema } from './schemas/attendance.schema';

export function httpAttendance(http: HttpClient): AttendanceRepository {
  const punch = (path: string, at: string, lat: number, lng: number, accuracyMeters: number) =>
    http
      .post(path, { at, lat, lng, accuracy_meters: accuracyMeters, offset_minutes: deviceUtcOffsetMinutes() })
      .then((d) => toAttendance(parseWire(attendanceSchema, d, 'attendance')));
  return {
    status: () =>
      http
        .get('/staff/attendance', { offset_minutes: deviceUtcOffsetMinutes() })
        .then((d) => toAttendance(parseWire(attendanceSchema, d, 'attendance'))),
    schoolLocation: () =>
      http
        .get('/me/attendance/school-location')
        .then((d) => toSchoolLocation(parseWire(schoolLocationSchema, d, 'school location'))),
    checkIn: (at, lat, lng, accuracyMeters) => punch('/staff/attendance/check-in', at, lat, lng, accuracyMeters),
    checkOut: (at, lat, lng, accuracyMeters) => punch('/staff/attendance/check-out', at, lat, lng, accuracyMeters),
  };
}
```

`dashboard.repo.ts`:
```ts
import type { DashboardRepository } from '@/data/repositories/types';
import type { HttpClient } from '@/lib/httpClient';
import { deviceUtcOffsetMinutes } from '@/lib/date';
import { toDashboard } from './mappers';
import { parseWire } from './schemas/wire';
import { dashboardSchema } from './schemas/dashboard.schema';

export function httpDashboard(http: HttpClient): DashboardRepository {
  return {
    get: () =>
      http
        .get('/staff/dashboard', { offset_minutes: deviceUtcOffsetMinutes() })
        .then((d) => toDashboard(parseWire(dashboardSchema, d, 'dashboard'))),
  };
}
```

`domain/dashboard.ts` — change two fields:
```ts
  /** Undefined when the server has no data source for it (sms-api doesn't compute these). */
  streakDays?: number;
  leaveLeft?: number;
```

`mappers.ts` — in `toDashboard` replace the two lines with `streakDays: d.streak_days,` and `leaveLeft: d.leave_left,`; in `DashboardDTO` keep the fields optional (already are).

`StatTrio.tsx` — make the props optional and render conditionally:
```tsx
export interface StatTrioProps {
  hoursThisWeek: number;
  hoursTarget: number;
  streakDays?: number;
  leaveLeft?: number;
}
```
Wrap the streak `<Card style={styles.statCard}>` as `{streakDays !== undefined && (<Card testID="stat-streak" style={styles.statCard}>…</Card>)}`, the leave card as `{leaveLeft !== undefined && (<Card testID="stat-leave" style={styles.statCard}>…</Card>)}`, and render `<View style={styles.statColumn}>` only when `streakDays !== undefined || leaveLeft !== undefined`. If `Card` does not forward `testID`, add `testID?: string` to its props and pass it to its root `View` (check `src/components/ui/Card.tsx`).

- [ ] **Step 6: Run tests + typecheck**

Run: `npx jest src/data src/components src/screens/__tests__/HomeScreen.test.tsx src/screens/__tests__/Attendance* && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat(data): zod wire validation; fix attendance in_zone mapping; send offset_minutes; hide unsourced dashboard stats

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B5: Trip wire schemas and domain alignment (`arrived`, `active_broadcaster`, `current_stop_id`, `driver_name`)

**Files:**
- Create: `src/data/http/schemas/trip.schema.ts`
- Modify: `src/data/domain/trip.ts`
- Modify: `src/data/http/mappers.ts` (trip DTOs + mappers)
- Modify: `src/data/http/trip.repo.ts`
- Modify: `src/data/mock/trip.repo.ts` (`broadcasterId` → `activeBroadcaster`)
- Modify: `src/data/http/__tests__/trip.repo.test.ts`
- Test: `src/data/http/__tests__/trip.schema.test.ts` (create)

**Interfaces:**
- Produces:
  - `TripStatus = 'idle' | 'live' | 'arrived' | 'ended'`
  - `Trip`: `broadcasterId` removed; adds `activeBroadcaster?: 'driver' | 'conductor'`, `currentStopId?: string`.
  - `TripAssignment.driverName?: string | null`
  - Schemas: `tripAssignmentSchema`, `tripSchema`, `tripSummarySchema`, `rosterSchema`, `boardingListSchema` (all exported from `trip.schema.ts`).
  - `setBoarding` sends `stop_id: null` when `stopId` is `''`.

- [ ] **Step 1: Write the failing tests** — `src/data/http/__tests__/trip.schema.test.ts`:

```ts
import { httpTrip } from '@/data/http/trip.repo';
import type { HttpClient } from '@/lib/httpClient';

function fakeHttp(routes: Record<string, unknown>) {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const http: HttpClient = {
    get: async <T>(path: string) => { calls.push({ method: 'GET', path }); return routes[`GET ${path}`] as T; },
    post: async <T>(path: string, body?: unknown) => { calls.push({ method: 'POST', path, body }); return routes[`POST ${path}`] as T; },
    patch: async <T>() => undefined as T,
    delete: async <T>() => undefined as T,
  };
  return { http, calls };
}

// Recorded sms-api TripResponse (staff): nullable ids, active_broadcaster, current_stop_id.
const tripWire = {
  id: 't1', tenant_id: 'ten', route_id: 'r1', bus_no: 'E2E-BUS-01', driver_id: 'd1', conductor_id: null,
  direction: 'pickup', status: 'arrived', started_at: '2026-09-26T02:00:00Z', ended_at: null,
  driver_last_ping_at: '2026-09-26T02:30:00Z', conductor_last_ping_at: null,
  active_broadcaster: 'driver', current_stop_id: 's2',
};

describe('trip wire', () => {
  it('maps a school-arrived trip with broadcaster and current stop', async () => {
    const { http } = fakeHttp({ 'GET /staff/trip/current': tripWire });
    const t = await httpTrip(http).current();
    expect(t).toMatchObject({ id: 't1', status: 'arrived', activeBroadcaster: 'driver', currentStopId: 's2', conductorId: undefined });
  });

  it('maps a null current trip to null', async () => {
    const { http } = fakeHttp({ 'GET /staff/trip/current': null });
    await expect(httpTrip(http).current()).resolves.toBeNull();
  });

  it('maps the assignment including driver_name', async () => {
    const { http } = fakeHttp({
      'GET /staff/trip/assignment': {
        route: { id: 'r1', name: 'E2E Route 1', bus_no: 'E2E-BUS-01', stops: [{ id: 's1', name: 'A', lat: 1, lng: 2, seq: 1, eta_min: null }] },
        bus_id: 'b1', bus_no: 'E2E-BUS-01', conductor_name: 'Sita', driver_name: 'Ramesh', shift: null, students_assigned: 4,
      },
    });
    const a = await httpTrip(http).myAssignment();
    expect(a).toMatchObject({ busId: 'b1', driverName: 'Ramesh', conductorName: 'Sita', shift: undefined, studentsAssigned: 4 });
    expect(a.route.stops[0].etaMin).toBeUndefined();
  });

  it('maps roster and boarding rows with a null stop to an empty stop id', async () => {
    const { http } = fakeHttp({
      'GET /staff/trips/t1/roster': [{ id: 'st1', name: 'Aarav', stop_id: null, photo_url: null }],
      'GET /staff/trips/t1/boarding': [{ trip_id: 't1', student_id: 'st1', stop_id: null, state: 'boarded', at: '2026-09-26T02:10:00Z' }],
    });
    await expect(httpTrip(http).roster('t1')).resolves.toEqual([{ id: 'st1', name: 'Aarav', stopId: '', photoUrl: undefined }]);
    await expect(httpTrip(http).boardingState('t1')).resolves.toEqual([{ tripId: 't1', studentId: 'st1', stopId: '', state: 'boarded', at: '2026-09-26T02:10:00Z' }]);
  });

  it('sends stop_id null for a student with no stop (Guid? on the server)', async () => {
    const { http, calls } = fakeHttp({ 'POST /staff/trips/t1/boarding': undefined });
    await httpTrip(http).setBoarding({ tripId: 't1', studentId: 'st1', stopId: '', state: 'boarded', at: 'x' });
    expect(calls[0].body).toEqual({ student_id: 'st1', stop_id: null, state: 'boarded', at: 'x' });
  });

  it('rejects an unknown trip status', async () => {
    const { http } = fakeHttp({ 'GET /staff/trip/current': { ...tripWire, status: 'paused' } });
    await expect(httpTrip(http).current()).rejects.toMatchObject({ code: 'contract_mismatch' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/data/http/__tests__/trip.schema.test.ts`
Expected: FAIL.

- [ ] **Step 3: Schemas** — `src/data/http/schemas/trip.schema.ts`:

```ts
import { z } from 'zod';
import { opt, orEmpty } from './wire';

const stopSchema = z.object({ id: z.string(), name: z.string(), lat: z.number(), lng: z.number(), seq: z.number(), eta_min: opt(z.number()) });
const routeSchema = z.object({ id: z.string(), name: z.string(), bus_no: z.string(), stops: z.array(stopSchema) });

export const tripAssignmentSchema = z.object({
  route: routeSchema,
  bus_id: z.string(),
  bus_no: z.string(),
  driver_name: z.string().nullish(),
  conductor_name: z.string().nullish(),
  shift: opt(z.string()),
  students_assigned: z.number(),
});

export const tripSchema = z.object({
  id: z.string(),
  route_id: orEmpty,
  bus_no: orEmpty,
  driver_id: orEmpty,
  conductor_id: opt(z.string()),
  direction: z.enum(['pickup', 'drop']),
  status: z.enum(['live', 'arrived', 'ended']),
  started_at: opt(z.string()),
  ended_at: opt(z.string()),
  active_broadcaster: opt(z.enum(['driver', 'conductor'])),
  current_stop_id: opt(z.string()),
});

export const tripSummarySchema = z.object({
  trip_id: z.string(), duration_min: z.number(), distance_km: z.number(), stops_covered: z.number(), boarded_count: z.number(),
});

export const rosterSchema = z.array(z.object({ id: z.string(), name: z.string(), stop_id: orEmpty, photo_url: opt(z.string()) }));

export const boardingListSchema = z.array(z.object({
  trip_id: z.string(), student_id: z.string(), stop_id: orEmpty, state: z.enum(['boarded', 'dropped', 'absent']), at: z.string(),
}));
```

- [ ] **Step 4: Domain + mappers + repos.**

`domain/trip.ts`: set `export type TripStatus = 'idle' | 'live' | 'arrived' | 'ended';`, replace `broadcasterId?: string;` in `Trip` with:
```ts
  /** Whose phone is currently feeding GPS (a ping < 30 s old), per sms-api. */
  activeBroadcaster?: 'driver' | 'conductor';
  /** Stop confirmed as arrived and not yet departed (server-authoritative). */
  currentStopId?: string;
```
and add `driverName?: string | null;` to `TripAssignment` after `busNo`.

`mappers.ts`: replace `TripDTO`, `TripAssignmentDTO`, `StopDTO` and the `toTrip`/`toTripAssignment` mappers:
```ts
export interface StopDTO { id: string; name: string; lat: number; lng: number; seq: number; eta_min?: number; }
export interface RouteDTO { id: string; name: string; bus_no: string; stops: StopDTO[]; }
export interface TripDTO {
  id: string; route_id: string; bus_no: string; driver_id: string; conductor_id?: string;
  direction: TripDirection; status: TripStatus; started_at?: string; ended_at?: string;
  active_broadcaster?: 'driver' | 'conductor'; current_stop_id?: string;
}
```
```ts
export interface TripAssignmentDTO {
  route: RouteDTO; bus_id: string; bus_no: string; driver_name?: string | null; conductor_name?: string | null;
  shift?: string; students_assigned: number;
}
```
```ts
export const toTrip = (d: TripDTO): Trip => ({
  id: d.id, routeId: d.route_id, busNo: d.bus_no, driverId: d.driver_id, conductorId: d.conductor_id,
  direction: d.direction, status: d.status, startedAt: d.started_at, endedAt: d.ended_at,
  activeBroadcaster: d.active_broadcaster, currentStopId: d.current_stop_id,
});
```
```ts
export const toTripAssignment = (d: TripAssignmentDTO): TripAssignment => ({
  route: toRoute(d.route), busId: d.bus_id, busNo: d.bus_no, driverName: d.driver_name ?? null,
  conductorName: d.conductor_name ?? null, shift: d.shift, studentsAssigned: d.students_assigned,
});
```

`trip.repo.ts` (keep `publishPing` for now — Task B10 replaces it):
```ts
import type { TripRepository } from '@/data/repositories/types';
import type { TripPing, Boarding, TripDirection } from '@/data/domain';
import type { HttpClient } from '@/lib/httpClient';
import { toTripAssignment, toTrip, toTripSummary, toStudentLite, toBoarding } from './mappers';
import { parseWire } from './schemas/wire';
import { tripAssignmentSchema, tripSchema, tripSummarySchema, rosterSchema, boardingListSchema } from './schemas/trip.schema';

export function httpTrip(http: HttpClient): TripRepository {
  return {
    myAssignment: () =>
      http.get('/staff/trip/assignment').then((d) => toTripAssignment(parseWire(tripAssignmentSchema, d, 'trip assignment'))),
    current: () =>
      http.get('/staff/trip/current').then((d) => (d ? toTrip(parseWire(tripSchema, d, 'current trip')) : null)),
    // bus_no is required: sms-api resolves the bus (and its assigned driver/conductor) from it.
    startTrip: (routeId: string, direction: TripDirection, busNo: string) =>
      http.post('/staff/trips', { route_id: routeId, bus_no: busNo, direction }).then((d) => toTrip(parseWire(tripSchema, d, 'trip'))),
    publishPing: (ping: TripPing) =>
      http
        .post<void>(`/staff/trips/${ping.tripId}/pings`, {
          pings: [{ lat: ping.lat, lng: ping.lng, speed_kmh: ping.speedKmh, heading: ping.heading, at: ping.at }],
        })
        .then(() => undefined),
    endTrip: (tripId: string) =>
      http.post(`/staff/trips/${tripId}/end`, {}).then((d) => toTripSummary(parseWire(tripSummarySchema, d, 'trip summary'))),
    roster: (tripId: string) =>
      http.get(`/staff/trips/${tripId}/roster`).then((d) => parseWire(rosterSchema, d, 'roster').map(toStudentLite)),
    setBoarding: (b: Boarding) =>
      http
        .post<void>(`/staff/trips/${b.tripId}/boarding`, {
          // StopId is Guid? server-side: '' would fail model binding.
          student_id: b.studentId, stop_id: b.stopId || null, state: b.state, at: b.at,
        })
        .then(() => undefined),
    boardingState: (tripId: string) =>
      http.get(`/staff/trips/${tripId}/boarding`).then((d) => parseWire(boardingListSchema, d, 'boarding').map(toBoarding)),
  };
}
```

`mock/trip.repo.ts`: replace `broadcasterId: store.session.user.id,` with `activeBroadcaster: 'driver',`, and make `myAssignment` also return `driverName: store.session.user.name`.

`trip.repo.test.ts`: the `startTrip` fixture already has the required fields; add `tenant_id: 'ten'` is unnecessary (stripped). Leave the existing `publishPing` test as is.

- [ ] **Step 5: Run tests + typecheck**

Run: `npx jest src/data src/features/trip src/screens && npm run typecheck`
Expected: PASS. Fix any test fixture that still sets `broadcasterId` (rename to `activeBroadcaster: 'driver'`), and any `mockAssignment` missing `busId` that now fails typecheck.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat(trip): validate trip wire; add arrived status, active_broadcaster, current_stop_id, driver_name

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B6: Schemas for tasks, issues, leave, profile, vehicle checks and route geometry

**Files:**
- Create: `src/data/http/schemas/features.schema.ts`
- Modify: `src/data/http/{tasks,issues,leave,profile,vehicleChecks,routeGeometry}.repo.ts`
- Test: `src/data/http/__tests__/features.schema.test.ts` (create)

**Interfaces:**
- Produces (from `features.schema.ts`): `taskListSchema`, `issueSchema`, `issueListSchema`, `leaveBalancesSchema`, `leaveRequestSchema`, `leaveListSchema`, `profileSchema`, `inspectionSchema`, `inspectionListSchema`, `fuelLogSchema`, `fuelLogListSchema`, `routeGeometrySchema`. Output types are assignable to the existing DTO interfaces in `mappers.ts` (and the geometry DTO in `routeGeometry.repo.ts`), so the existing mappers stay unchanged.

- [ ] **Step 1: Read the six repos** so the rewrite keeps each one's paths, params (`busId` query on vehicle checks) and request bodies exactly. Only the response handling changes: `http.get<X>(…).then(map)` becomes `http.get(…).then((d) => map(parseWire(schema, d, '<what>')))`.

- [ ] **Step 2: Write the failing tests** — `src/data/http/__tests__/features.schema.test.ts`:

```ts
import { httpTasks } from '@/data/http/tasks.repo';
import { httpIssues } from '@/data/http/issues.repo';
import { httpLeave } from '@/data/http/leave.repo';
import { httpProfile } from '@/data/http/profile.repo';
import { httpVehicleChecks } from '@/data/http/vehicleChecks.repo';
import type { HttpClient } from '@/lib/httpClient';

function fakeHttp(byPath: Record<string, unknown>): HttpClient {
  const lookup = (path: string) => byPath[path.split('?')[0]];
  return {
    get: async <T>(path: string) => lookup(path) as T,
    post: async <T>(path: string) => lookup(path) as T,
    patch: async <T>() => undefined as T,
    delete: async <T>() => undefined as T,
  };
}

// Recorded from the seeded sms-api (nulls where the server has no value).
describe('feature wires', () => {
  it('tasks: nulls become absent optionals', async () => {
    const http = fakeHttp({ '/staff/tasks': [{ id: 'k1', title: 'Sweep', detail: null, priority: 'urgent', done: false, due_label: null, photo_url: null }] });
    await expect(httpTasks(http).list()).resolves.toEqual([{ id: 'k1', title: 'Sweep', priority: 'urgent', done: false }]);
  });

  it('issues: list rows with null trip fields', async () => {
    const http = fakeHttp({ '/staff/issues': [{
      id: 'i1', tenant_id: 't', reporter_user_id: 'u', category: 'vehicle', title: 'Brakes', description: 'Squeal',
      priority: 'high', status: 'open', vehicle_id: null, route_id: null, trip_id: null, photo_url: null,
      created_at: '2026-09-26T02:00:00Z', updated_at: '2026-09-26T02:00:00Z',
    }] });
    const [i] = await httpIssues(http).list();
    expect(i).toEqual({ id: 'i1', category: 'vehicle', title: 'Brakes', description: 'Squeal', priority: 'high', status: 'open', createdAt: '2026-09-26T02:00:00Z' });
  });

  it('leave: accepts the server-wide leave types read-only', async () => {
    const http = fakeHttp({
      '/leave/balances': [{ type: 'casual', total: 12, used: 0 }],
      '/leave': [{ id: 'l1', type: 'maternity', from_date: '2026-10-01', to_date: '2026-10-02', reason: null, status: 'pending' }],
    });
    const s = await httpLeave(http).summary();
    expect(s.requests[0]).toMatchObject({ type: 'maternity', reason: '' });
  });

  it('profile: documents with null ok', async () => {
    const http = fakeHttp({ '/staff/profile': { documents: [{ id: 'd1', label: 'Licence', value: 'DL-1', ok: null }], license_number: null, license_expiry: null, emergency_contact_name: null, emergency_contact_phone: null } });
    const p = await httpProfile(http).get();
    expect(p.documents[0]).toEqual({ id: 'd1', label: 'Licence', value: 'DL-1', ok: undefined });
  });

  it('vehicle checks: inspections list', async () => {
    const http = fakeHttp({ '/staff/vehicle-checks/inspections': [{
      id: 'v1', bus_id: 'b1', brakes: true, tyres: true, lights: true, horn: true, first_aid_kit: true, fire_extinguisher: true,
      emergency_exit: true, fuel_level: true, all_ok: true, remarks: null, inspection_date: '2026-09-26', created_at: '2026-09-26T02:00:00Z',
    }] });
    const [v] = await httpVehicleChecks(http).listInspections('b1');
    expect(v).toMatchObject({ busId: 'b1', allOk: true });
    expect(v.remarks).toBeUndefined();
  });

  it('a drifted feature response is a contract_mismatch', async () => {
    const http = fakeHttp({ '/staff/tasks': [{ id: 1 }] });
    await expect(httpTasks(http).list()).rejects.toMatchObject({ code: 'contract_mismatch' });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx jest src/data/http/__tests__/features.schema.test.ts`
Expected: FAIL (null `detail` passes through as `null`; drift not rejected).

- [ ] **Step 4: Schemas** — `src/data/http/schemas/features.schema.ts`:

```ts
import { z } from 'zod';
import { opt } from './wire';

export const taskSchema = z.object({
  id: z.string(), title: z.string(), detail: opt(z.string()), priority: z.enum(['urgent', 'normal']),
  done: z.boolean(), due_label: opt(z.string()), photo_url: opt(z.string()),
});
export const taskListSchema = z.array(taskSchema);

export const issueSchema = z.object({
  id: z.string(), category: z.string(), title: z.string(), description: z.string(), priority: z.string(), status: z.string(),
  vehicle_id: opt(z.string()), route_id: opt(z.string()), trip_id: opt(z.string()), photo_url: opt(z.string()), created_at: z.string(),
});
export const issueListSchema = z.array(issueSchema);

const leaveType = z.enum(['casual', 'sick', 'earned', 'medical', 'maternity', 'emergency', 'other']);
export const leaveBalancesSchema = z.array(z.object({ type: leaveType, total: z.number(), used: z.number() }));
export const leaveRequestSchema = z.object({
  id: z.string(), type: leaveType, from_date: z.string().nullable(), to_date: z.string().nullable(),
  reason: z.string().nullable(), status: z.enum(['pending', 'approved', 'rejected']),
});
export const leaveListSchema = z.array(leaveRequestSchema);

export const profileSchema = z.object({
  documents: z.array(z.object({ id: z.string(), label: z.string(), value: z.string(), ok: opt(z.boolean()) })),
  license_number: z.string().nullish(), license_expiry: z.string().nullish(),
  emergency_contact_name: z.string().nullish(), emergency_contact_phone: z.string().nullish(),
});

export const inspectionSchema = z.object({
  id: z.string(), bus_id: z.string(), brakes: z.boolean(), tyres: z.boolean(), lights: z.boolean(), horn: z.boolean(),
  first_aid_kit: z.boolean(), fire_extinguisher: z.boolean(), emergency_exit: z.boolean(), fuel_level: z.boolean(),
  all_ok: z.boolean(), remarks: z.string().nullish(), inspection_date: z.string(), created_at: z.string(),
});
export const inspectionListSchema = z.array(inspectionSchema);

export const fuelLogSchema = z.object({
  id: z.string(), bus_id: z.string(), odometer_km: z.number(), fuel_added_liters: z.number(), recorded_at: z.string(),
});
export const fuelLogListSchema = z.array(fuelLogSchema);

export const routeGeometrySchema = z.object({
  route_id: z.string(), status: z.enum(['available', 'unavailable']), format: z.string().nullable(), geometry: z.string().nullable(),
  distance_meters: z.number().nullable(), duration_seconds: z.number().nullable(),
  stop_sequence_hash: z.string(), generated_at: z.string().nullable(),
});
```

Check `LeaveRequest['status']` in `src/data/domain/leave.ts`; if it has more values than `pending | approved | rejected`, use exactly its union in `leaveRequestSchema.status`. Check the geometry DTO in `routeGeometry.repo.ts` and match its field names/nullability exactly.

- [ ] **Step 5: Apply `parseWire` in each repo.** Examples — `tasks.repo.ts`:

```ts
    list: () => http.get('/staff/tasks').then((d) => parseWire(taskListSchema, d, 'tasks').map(toTask)),
```
(apply the same to `complete` and `attachPhoto`, which also return the full list). `issues.repo.ts`: `list` → `issueListSchema` + `toIssue`, `create` → `issueSchema` + `toIssue`. `leave.repo.ts`: balances → `leaveBalancesSchema` + `toLeaveBalance`, list → `leaveListSchema` + `toLeaveRequestFromWire`, submit → `leaveRequestSchema` + `toLeaveRequestFromWire`. `profile.repo.ts` → `profileSchema` + `toProfile`. `vehicleChecks.repo.ts`: the two lists and two submits with their schemas and existing mappers. `routeGeometry.repo.ts` → `routeGeometrySchema` then its existing mapper.

- [ ] **Step 6: Run tests + typecheck**

Run: `npx jest src/data src/screens && npm run typecheck`
Expected: PASS. If an existing repo test's fixture lacks a now-required field (e.g. `created_at` on an issue), add the field to the fixture — the fixture was out of step with the server.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat(data): validate tasks, issues, leave, profile, vehicle-check and geometry responses

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B7: Stop-progress repository methods (HTTP + mock)

**Files:**
- Modify: `src/data/domain/trip.ts` (add `TripStopState`, `TripStops`)
- Modify: `src/data/repositories/types.ts` (`TripRepository`)
- Modify: `src/data/http/schemas/trip.schema.ts` (`tripStopsSchema`), `src/data/http/mappers.ts` (`toTripStops`), `src/data/http/trip.repo.ts`
- Modify: `src/data/mock/store.ts` (`tripStops` state), `src/data/mock/trip.repo.ts`
- Test: `src/data/http/__tests__/trip.stops.test.ts`, `src/data/mock/__tests__/trip.stops.test.ts` (create)

**Interfaces:**
- Produces:
  ```ts
  export interface TripStopState { stopId: string; name: string; seq: number; arrivedAt?: string; confirmedAt?: string; departedAt?: string; }
  export interface TripStops { tripId: string; currentStopId: string | null; schoolArrivedAt: string | null; stops: TripStopState[]; }
  ```
  `TripRepository` gains `stops(tripId: string): Promise<TripStops>`, `confirmArrival(tripId: string, stopId: string): Promise<void>`, `departStop(tripId: string, stopId: string): Promise<void>`, `markSchoolArrived(tripId: string): Promise<void>`.
  Mock errors mirror the server: `AppError('already_at_stop', 409)`, `AppError('wrong_stop_order', 409)`, `AppError('not_current_stop', 409)`, `AppError('invalid_state', 409)`.

- [ ] **Step 1: Write the failing tests**

`src/data/http/__tests__/trip.stops.test.ts`:
```ts
import { httpTrip } from '@/data/http/trip.repo';
import type { HttpClient } from '@/lib/httpClient';

function fakeHttp(routes: Record<string, unknown>) {
  const calls: Array<{ method: string; path: string }> = [];
  const http: HttpClient = {
    get: async <T>(path: string) => { calls.push({ method: 'GET', path }); return routes[`GET ${path}`] as T; },
    post: async <T>(path: string) => { calls.push({ method: 'POST', path }); return undefined as T; },
    patch: async <T>() => undefined as T,
    delete: async <T>() => undefined as T,
  };
  return { http, calls };
}

describe('httpTrip stop progress', () => {
  it('reads GET /staff/trips/{id}/stops', async () => {
    const { http } = fakeHttp({
      'GET /staff/trips/t1/stops': {
        trip_id: 't1', current_stop_id: 's1', school_arrived_at: null,
        stops: [
          { stop_id: 's1', name: 'A', seq: 1, arrived_at: '2026-09-26T02:05:00Z', confirmed_at: '2026-09-26T02:05:00Z', departed_at: null },
          { stop_id: 's2', name: 'B', seq: 2, arrived_at: null, confirmed_at: null, departed_at: null },
        ],
      },
    });
    await expect(httpTrip(http).stops('t1')).resolves.toEqual({
      tripId: 't1', currentStopId: 's1', schoolArrivedAt: null,
      stops: [
        { stopId: 's1', name: 'A', seq: 1, arrivedAt: '2026-09-26T02:05:00Z', confirmedAt: '2026-09-26T02:05:00Z', departedAt: undefined },
        { stopId: 's2', name: 'B', seq: 2, arrivedAt: undefined, confirmedAt: undefined, departedAt: undefined },
      ],
    });
  });

  it('posts the three stop actions to the sms-api routes', async () => {
    const { http, calls } = fakeHttp({});
    const repo = httpTrip(http);
    await repo.confirmArrival('t1', 's1');
    await repo.departStop('t1', 's1');
    await repo.markSchoolArrived('t1');
    expect(calls).toEqual([
      { method: 'POST', path: '/staff/trips/t1/stops/s1/confirm-arrival' },
      { method: 'POST', path: '/staff/trips/t1/stops/s1/complete' },
      { method: 'POST', path: '/staff/trips/t1/school-arrived' },
    ]);
  });
});
```

`src/data/mock/__tests__/trip.stops.test.ts`:
```ts
import { createStore } from '@/data/mock/store';
import { mockTrip } from '@/data/mock/trip.repo';

jest.mock('@/lib/latency', () => ({ simulateLatency: () => Promise.resolve(), maybeFail: () => undefined }));
jest.mock('@react-native-async-storage/async-storage', () => {
  let mem: Record<string, string> = {};
  return { __esModule: true, default: {
    getItem: jest.fn((k: string) => Promise.resolve(mem[k] ?? null)),
    setItem: jest.fn((k: string, v: string) => { mem[k] = v; return Promise.resolve(); }),
    removeItem: jest.fn((k: string) => { delete mem[k]; return Promise.resolve(); }),
    clear: jest.fn(() => { mem = {}; return Promise.resolve(); }),
  } };
});

async function started() {
  const store = await createStore();
  store.currentTrip = null;
  const repo = mockTrip(store);
  const trip = await repo.startTrip(store.route.id, 'pickup', store.route.assignedBusNo);
  const [first, second] = [...store.route.stops].sort((a, b) => a.seq - b.seq);
  return { repo, trip, first, second, store };
}

describe('mock stop progress mirrors sms-api rules', () => {
  it('starts with no progress', async () => {
    const { repo, trip, store } = await started();
    const s = await repo.stops(trip.id);
    expect(s.currentStopId).toBeNull();
    expect(s.stops).toHaveLength(store.route.stops.length);
    expect(s.stops.every((x) => !x.departedAt)).toBe(true);
  });

  it('enforces sequence and current-stop rules', async () => {
    const { repo, trip, first, second } = await started();
    await expect(repo.confirmArrival(trip.id, second.id)).rejects.toMatchObject({ code: 'wrong_stop_order' });
    await repo.confirmArrival(trip.id, first.id);
    await expect(repo.confirmArrival(trip.id, first.id)).rejects.toMatchObject({ code: 'already_at_stop' });
    await expect(repo.departStop(trip.id, second.id)).rejects.toMatchObject({ code: 'not_current_stop' });
    await repo.departStop(trip.id, first.id);
    const s = await repo.stops(trip.id);
    expect(s.currentStopId).toBeNull();
    expect(s.stops.find((x) => x.stopId === first.id)?.departedAt).toBeDefined();
  });

  it('school-arrived is pickup-only and sets the trip to arrived', async () => {
    const { repo, trip } = await started();
    await repo.markSchoolArrived(trip.id);
    expect((await repo.stops(trip.id)).schoolArrivedAt).not.toBeNull();
    expect((await repo.current())?.status).toBe('arrived');
    await expect(repo.markSchoolArrived(trip.id)).rejects.toMatchObject({ code: 'invalid_state' });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/data/http/__tests__/trip.stops.test.ts src/data/mock/__tests__/trip.stops.test.ts`
Expected: FAIL — methods do not exist.

- [ ] **Step 3: Domain, schema, mapper, interface.** Append to `domain/trip.ts`:

```ts
export interface TripStopState {
  stopId: string;
  name: string;
  seq: number;
  arrivedAt?: string;
  confirmedAt?: string;
  departedAt?: string;
}

/** Server-authoritative stop progress for one trip (sms-api TripStopProgress). */
export interface TripStops {
  tripId: string;
  currentStopId: string | null;
  schoolArrivedAt: string | null;
  stops: TripStopState[];
}
```
Check `src/data/domain/index.ts` re-exports everything from `./trip` (it does via `export *` if the other trip types are importable from `@/data/domain`; if it lists names explicitly, add these two).

Append to `trip.schema.ts`:
```ts
export const tripStopsSchema = z.object({
  trip_id: z.string(),
  current_stop_id: z.string().nullish().transform((v) => v ?? null),
  school_arrived_at: z.string().nullish().transform((v) => v ?? null),
  stops: z.array(z.object({
    stop_id: z.string(), name: z.string(), seq: z.number(),
    arrived_at: opt(z.string()), confirmed_at: opt(z.string()), departed_at: opt(z.string()),
  })),
});
```

Append to `mappers.ts` (and add `TripStops` to its domain import list):
```ts
export interface TripStopsDTO {
  trip_id: string; current_stop_id: string | null; school_arrived_at: string | null;
  stops: Array<{ stop_id: string; name: string; seq: number; arrived_at?: string; confirmed_at?: string; departed_at?: string }>;
}
export const toTripStops = (d: TripStopsDTO): TripStops => ({
  tripId: d.trip_id,
  currentStopId: d.current_stop_id,
  schoolArrivedAt: d.school_arrived_at,
  stops: d.stops.map((s) => ({
    stopId: s.stop_id, name: s.name, seq: s.seq, arrivedAt: s.arrived_at, confirmedAt: s.confirmed_at, departedAt: s.departed_at,
  })),
});
```

In `types.ts` add `TripStops` to the domain import and to `TripRepository`:
```ts
  stops(tripId: string): Promise<TripStops>;
  confirmArrival(tripId: string, stopId: string): Promise<void>;
  departStop(tripId: string, stopId: string): Promise<void>;
  markSchoolArrived(tripId: string): Promise<void>;
```

- [ ] **Step 4: HTTP adapter** — add to the object returned by `httpTrip` (import `toTripStops` and `tripStopsSchema`):

```ts
    stops: (tripId: string) =>
      http.get(`/staff/trips/${tripId}/stops`).then((d) => toTripStops(parseWire(tripStopsSchema, d, 'trip stops'))),
    confirmArrival: (tripId: string, stopId: string) =>
      http.post<void>(`/staff/trips/${tripId}/stops/${stopId}/confirm-arrival`).then(() => undefined),
    departStop: (tripId: string, stopId: string) =>
      http.post<void>(`/staff/trips/${tripId}/stops/${stopId}/complete`).then(() => undefined),
    markSchoolArrived: (tripId: string) =>
      http.post<void>(`/staff/trips/${tripId}/school-arrived`).then(() => undefined),
```

- [ ] **Step 5: Mock adapter.** In `store.ts` add to `Store`:
```ts
  /** In-memory stop progress for the current mock trip (not persisted). */
  tripStops: { currentStopId: string | null; schoolArrivedAt: string | null; arrived: Record<string, string>; departed: Record<string, string> };
```
and initialise it in `createStore` next to `pings`: `tripStops: { currentStopId: null, schoolArrivedAt: null, arrived: {}, departed: {} },`.

In `mock/trip.repo.ts` add `import { AppError } from '@/lib/errors';` and `TripStops` to the domain import; in `startTrip`, after `store.pings = [];` add `store.tripStops = { currentStopId: null, schoolArrivedAt: null, arrived: {}, departed: {} };`; then add the methods:

```ts
    async stops(tripId: string): Promise<TripStops> {
      await simulateLatency();
      const p = store.tripStops;
      return {
        tripId,
        currentStopId: p.currentStopId,
        schoolArrivedAt: p.schoolArrivedAt,
        stops: [...store.route.stops].sort((a, b) => a.seq - b.seq).map((s) => ({
          stopId: s.id, name: s.name, seq: s.seq,
          arrivedAt: p.arrived[s.id], confirmedAt: p.arrived[s.id], departedAt: p.departed[s.id],
        })),
      };
    },

    // Same rules as sms-api TripService (sequence, current stop, pickup-only school arrival);
    // no GPS radius check — there is no real location in mock mode.
    async confirmArrival(_tripId: string, stopId: string): Promise<void> {
      await simulateLatency();
      const p = store.tripStops;
      if (p.currentStopId === stopId) throw new AppError('already_at_stop', 409, 'this stop is already confirmed as current');
      if (p.currentStopId) throw new AppError('wrong_stop_order', 409, 'a different stop is already current');
      const next = [...store.route.stops].sort((a, b) => a.seq - b.seq).find((s) => !p.departed[s.id]);
      if (!next || next.id !== stopId) throw new AppError('wrong_stop_order', 409, 'stops must be confirmed in sequence');
      p.arrived[stopId] = new Date().toISOString();
      p.currentStopId = stopId;
    },

    async departStop(_tripId: string, stopId: string): Promise<void> {
      await simulateLatency();
      const p = store.tripStops;
      if (p.currentStopId !== stopId) throw new AppError('not_current_stop', 409, 'this stop is not the confirmed current stop');
      p.departed[stopId] = new Date().toISOString();
      p.currentStopId = null;
    },

    async markSchoolArrived(_tripId: string): Promise<void> {
      await simulateLatency();
      const trip = store.currentTrip;
      if (!trip || trip.direction !== 'pickup' || trip.status !== 'live') {
        throw new AppError('invalid_state', 409, 'not a pickup trip in progress');
      }
      store.tripStops.schoolArrivedAt = new Date().toISOString();
      trip.status = 'arrived';
      await store.persistTrip();
    },
```

Also make mock `current()` include `currentStopId: store.tripStops.currentStopId ?? undefined` in the cloned trip.

- [ ] **Step 6: Run tests + typecheck**

Run: `npx jest src/data && npm run typecheck`
Expected: PASS. `src/data/__tests__/contract.test.ts` may now fail typecheck/assertions for the live adapter because its fixture has no `/stops` route — add `'GET /staff/trips/<id>/stops'` only if the contract test calls `stops`; otherwise leave it (Task B11 extends it).

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat(trip): stop-progress repository (GET stops, confirm-arrival, complete, school-arrived) for http and mock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B8: Server-driven stop progress derivation, retry-safe stop actions

**Files:**
- Modify: `src/features/trip/stopProgress.ts` (rewrite)
- Modify: `src/features/trip/useStopProgress.ts` (rewrite)
- Modify: `src/features/trip/hooks.ts` (`useTripStops`, `useStopActions`)
- Modify: `src/lib/queryClient.ts` (`tripStops` key)
- Modify: `src/features/trip/__tests__/stopProgress.test.ts`, `src/features/trip/__tests__/useStopProgress.test.ts` (rewrite)
- Test: `src/features/trip/__tests__/useStopActions.test.tsx` (create)

**Interfaces:**
- Consumes: `TripStops` (B7), `TripRepository.stops/confirmArrival/departStop/markSchoolArrived` (B7).
- Produces:
  - `isStopResolved(stop: Stop, roster: StudentLite[], boarding: Boarding[]): boolean` (now exported)
  - `countPickup(activeStop, roster, boarding): StopPickupCounts` (unchanged)
  - `type StopProgressState = 'EN_ROUTE' | 'PICKUP_IN_PROGRESS' | 'ROUTE_COMPLETED'`
  - `interface StopProgress extends StopPickupCounts { state: StopProgressState; activeStop: Stop | null; departedCount: number; canDepart: boolean; schoolArrived: boolean }`
  - `deriveStopProgress(stops: Stop[], progress: TripStops | undefined, roster: StudentLite[], boarding: Boarding[]): StopProgress`
  - `routeStripFor(stops: Stop[], progress: TripStops | undefined): { progress: number; currentStopName?: string; nextStopName?: string }`
  - `type StopAction = { kind: 'arrive'; stopId: string } | { kind: 'depart'; stopId: string } | { kind: 'school' }`
  - `isAlreadyApplied(err: unknown, action: StopAction, fresh: TripStops | null): boolean`
  - `useStopProgress(stops, progress, roster, boarding): StopProgress`
  - `useTripStops(tripId: string | undefined, active: boolean)` → react-query result of `TripStops`
  - `useStopActions(tripId: string | undefined)` → `UseMutationResult<void, unknown, StopAction>`
  - `queryKeys.tripStops(tripId: string)`

- [ ] **Step 1: Write the failing tests.** Replace `src/features/trip/__tests__/stopProgress.test.ts` with:

```ts
import { deriveStopProgress, routeStripFor, isAlreadyApplied, isStopResolved } from '../stopProgress';
import { AppError } from '@/lib/errors';
import type { Stop, StudentLite, Boarding, TripStops } from '@/data/domain';

const stops: Stop[] = [
  { id: 's2', name: 'Market', lat: 12.2, lng: 77.2, seq: 2 },
  { id: 's1', name: 'Gate', lat: 12.1, lng: 77.1, seq: 1 },
  { id: 's3', name: 'Chowk', lat: 12.3, lng: 77.3, seq: 3 },
];
const roster: StudentLite[] = [
  { id: 'st1', name: 'A', stopId: 's1' },
  { id: 'st2', name: 'B', stopId: 's1' },
];
const progress = (over: Partial<TripStops> = {}, departed: string[] = []): TripStops => ({
  tripId: 't1', currentStopId: null, schoolArrivedAt: null,
  stops: [...stops].sort((a, b) => a.seq - b.seq).map((s) => ({
    stopId: s.id, name: s.name, seq: s.seq, departedAt: departed.includes(s.id) ? '2026-09-26T02:00:00Z' : undefined,
  })),
  ...over,
});
const boarded = (id: string, stopId = 's1'): Boarding => ({ tripId: 't1', studentId: id, stopId, state: 'boarded', at: 'x' });

describe('deriveStopProgress', () => {
  it('is EN_ROUTE to the first stop (by seq) before any progress', () => {
    const p = deriveStopProgress(stops, progress(), roster, []);
    expect(p.state).toBe('EN_ROUTE');
    expect(p.activeStop?.id).toBe('s1');
    expect(p.departedCount).toBe(0);
  });

  it('is PICKUP_IN_PROGRESS at the server current stop', () => {
    const p = deriveStopProgress(stops, progress({ currentStopId: 's1' }), roster, [boarded('st1')]);
    expect(p.state).toBe('PICKUP_IN_PROGRESS');
    expect(p.activeStop?.id).toBe('s1');
    expect(p).toMatchObject({ assignedCount: 2, pickedUpCount: 1, remainingCount: 1, canDepart: false });
  });

  it('canDepart once every student at the current stop is resolved', () => {
    const b: Boarding[] = [boarded('st1'), { tripId: 't1', studentId: 'st2', stopId: 's1', state: 'absent', at: 'x' }];
    expect(deriveStopProgress(stops, progress({ currentStopId: 's1' }), roster, b).canDepart).toBe(true);
  });

  it('canDepart is true at a stop with no assigned students', () => {
    const p = deriveStopProgress(stops, progress({ currentStopId: 's2' }, ['s1']), roster, []);
    expect(p.canDepart).toBe(true);
    expect(p.assignedCount).toBe(0);
  });

  it('never advances on boarding alone: all students resolved but not departed stays at the stop', () => {
    const b: Boarding[] = [boarded('st1'), boarded('st2')];
    const p = deriveStopProgress(stops, progress({ currentStopId: 's1' }), roster, b);
    expect(p.activeStop?.id).toBe('s1');
    expect(p.state).toBe('PICKUP_IN_PROGRESS');
  });

  it('is EN_ROUTE to the next undeparted stop after a departure', () => {
    const p = deriveStopProgress(stops, progress({}, ['s1']), roster, []);
    expect(p.state).toBe('EN_ROUTE');
    expect(p.activeStop?.id).toBe('s2');
    expect(p.departedCount).toBe(1);
  });

  it('is ROUTE_COMPLETED when every stop is departed, with schoolArrived from the server', () => {
    const p = deriveStopProgress(stops, progress({ schoolArrivedAt: '2026-09-26T03:00:00Z' }, ['s1', 's2', 's3']), roster, []);
    expect(p.state).toBe('ROUTE_COMPLETED');
    expect(p.activeStop).toBeNull();
    expect(p.schoolArrived).toBe(true);
  });

  it('treats unloaded progress as EN_ROUTE to the first stop', () => {
    expect(deriveStopProgress(stops, undefined, roster, []).activeStop?.id).toBe('s1');
  });
});

describe('isStopResolved', () => {
  it('needs a boarding record for every assigned student', () => {
    expect(isStopResolved(stops[1], roster, [boarded('st1')])).toBe(false);
    expect(isStopResolved(stops[1], roster, [boarded('st1'), boarded('st2')])).toBe(true);
  });
});

describe('routeStripFor', () => {
  it('reports departed fraction and stop names', () => {
    expect(routeStripFor(stops, progress({ currentStopId: 's2' }, ['s1']))).toEqual({ progress: 1 / 3, currentStopName: 'Market', nextStopName: 'Chowk' });
    expect(routeStripFor(stops, progress({}, ['s1']))).toEqual({ progress: 1 / 3, currentStopName: 'Gate', nextStopName: 'Market' });
    expect(routeStripFor(stops, undefined)).toEqual({ progress: 0, currentStopName: undefined, nextStopName: 'Gate' });
  });
});

describe('isAlreadyApplied', () => {
  const conflict = (code: string) => new AppError(code, 409, code);
  it('treats a repeated arrival as applied', () => {
    expect(isAlreadyApplied(conflict('already_at_stop'), { kind: 'arrive', stopId: 's1' }, null)).toBe(true);
  });
  it('treats a repeated departure as applied only if the stop really departed', () => {
    expect(isAlreadyApplied(conflict('not_current_stop'), { kind: 'depart', stopId: 's1' }, progress({}, ['s1']))).toBe(true);
    expect(isAlreadyApplied(conflict('not_current_stop'), { kind: 'depart', stopId: 's1' }, progress())).toBe(false);
  });
  it('treats a repeated school arrival as applied only if recorded', () => {
    expect(isAlreadyApplied(conflict('invalid_state'), { kind: 'school' }, progress({ schoolArrivedAt: 'x' }))).toBe(true);
    expect(isAlreadyApplied(conflict('invalid_state'), { kind: 'school' }, progress())).toBe(false);
  });
  it('never swallows real failures', () => {
    expect(isAlreadyApplied(conflict('too_far'), { kind: 'arrive', stopId: 's1' }, null)).toBe(false);
    expect(isAlreadyApplied(new Error('boom'), { kind: 'arrive', stopId: 's1' }, null)).toBe(false);
  });
});
```

Replace `src/features/trip/__tests__/useStopProgress.test.ts` with:
```ts
import { renderHook } from '@testing-library/react-native';
import { useStopProgress } from '../useStopProgress';
import type { Stop, TripStops } from '@/data/domain';

const stops: Stop[] = [{ id: 's1', name: 'Gate', lat: 12.1, lng: 77.1, seq: 1 }];
const progress: TripStops = { tripId: 't1', currentStopId: 's1', schoolArrivedAt: null, stops: [{ stopId: 's1', name: 'Gate', seq: 1 }] };

describe('useStopProgress', () => {
  it('derives state from server progress, ignoring device GPS entirely', () => {
    const { result } = renderHook(() => useStopProgress(stops, progress, [], []));
    expect(result.current.state).toBe('PICKUP_IN_PROGRESS');
  });
});
```

`src/features/trip/__tests__/useStopActions.test.tsx`:
```tsx
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RepositoryProvider } from '@/data/repositories/RepositoryContext';
import { useStopActions } from '../hooks';
import { AppError } from '@/lib/errors';
import type { Repositories } from '@/data/repositories/types';

jest.mock('@/features/auth/AuthProvider', () => ({ useTenantId: () => 't' }));

function setup(trip: Partial<Repositories['trip']>) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const repos = { trip } as unknown as Repositories;
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}><RepositoryProvider repositories={repos}>{children}</RepositoryProvider></QueryClientProvider>
  );
  return renderHook(() => useStopActions('t1'), { wrapper });
}

describe('useStopActions', () => {
  it('resolves when the other phone already confirmed this stop', async () => {
    const { result } = setup({ confirmArrival: jest.fn().mockRejectedValue(new AppError('already_at_stop', 409, 'x')) });
    await act(() => result.current.mutateAsync({ kind: 'arrive', stopId: 's1' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('resolves a repeated depart when the stop is already departed', async () => {
    const { result } = setup({
      departStop: jest.fn().mockRejectedValue(new AppError('not_current_stop', 409, 'x')),
      stops: jest.fn().mockResolvedValue({ tripId: 't1', currentStopId: null, schoolArrivedAt: null, stops: [{ stopId: 's1', name: 'A', seq: 1, departedAt: 'x' }] }),
    });
    await act(() => result.current.mutateAsync({ kind: 'depart', stopId: 's1' }));
  });

  it('surfaces too_far', async () => {
    const { result } = setup({ confirmArrival: jest.fn().mockRejectedValue(new AppError('too_far', 409, 'x')) });
    await expect(act(() => result.current.mutateAsync({ kind: 'arrive', stopId: 's1' }))).rejects.toMatchObject({ code: 'too_far' });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/features/trip`
Expected: FAIL — new functions/hooks not defined.

- [ ] **Step 3: Rewrite `stopProgress.ts`**

```ts
import type { Stop, StudentLite, Boarding, TripStops } from '@/data/domain';
import { isAppError } from '@/lib/errors';

export interface StopPickupCounts {
  assignedCount: number;
  pickedUpCount: number;
  remainingCount: number;
}

export type StopProgressState = 'EN_ROUTE' | 'PICKUP_IN_PROGRESS' | 'ROUTE_COMPLETED';

export interface StopProgress extends StopPickupCounts {
  state: StopProgressState;
  /** The current stop (PICKUP_IN_PROGRESS) or the next one to reach (EN_ROUTE). */
  activeStop: Stop | null;
  departedCount: number;
  /** Every rostered student at the current stop has a boarding record. */
  canDepart: boolean;
  schoolArrived: boolean;
}

export type StopAction = { kind: 'arrive'; stopId: string } | { kind: 'depart'; stopId: string } | { kind: 'school' };

const RESOLVED_STATES = ['boarded', 'dropped', 'absent'] as const;

export function isStopResolved(stop: Stop, roster: StudentLite[], boarding: Boarding[]): boolean {
  const assigned = roster.filter((s) => s.stopId === stop.id);
  if (assigned.length === 0) return true;
  return assigned.every((s) => {
    const state = boarding.find((b) => b.studentId === s.id)?.state;
    return state != null && (RESOLVED_STATES as readonly string[]).includes(state);
  });
}

export function countPickup(activeStop: Stop | null, roster: StudentLite[], boarding: Boarding[]): StopPickupCounts {
  if (!activeStop) return { assignedCount: 0, pickedUpCount: 0, remainingCount: 0 };
  const assigned = roster.filter((s) => s.stopId === activeStop.id);
  const pickedUp = assigned.filter((s) => boarding.find((b) => b.studentId === s.id)?.state === 'boarded');
  return { assignedCount: assigned.length, pickedUpCount: pickedUp.length, remainingCount: assigned.length - pickedUp.length };
}

const bySeq = (stops: Stop[]) => [...stops].sort((a, b) => a.seq - b.seq);

/**
 * Stop state comes only from the server's TripStopProgress: the current stop is the one the
 * server confirmed and hasn't departed; otherwise the next stop without a departure. Boarding
 * and device GPS never move the trip forward — only an explicit Arrived / Depart stop tap does.
 */
export function deriveStopProgress(
  stops: Stop[], progress: TripStops | undefined, roster: StudentLite[], boarding: Boarding[],
): StopProgress {
  const sorted = bySeq(stops);
  const departed = new Set((progress?.stops ?? []).filter((s) => s.departedAt).map((s) => s.stopId));
  const current = progress?.currentStopId ? sorted.find((s) => s.id === progress.currentStopId) ?? null : null;
  const activeStop = current ?? sorted.find((s) => !departed.has(s.id)) ?? null;
  const state: StopProgressState = current ? 'PICKUP_IN_PROGRESS' : activeStop ? 'EN_ROUTE' : 'ROUTE_COMPLETED';
  return {
    state,
    activeStop,
    ...countPickup(activeStop, roster, boarding),
    departedCount: sorted.filter((s) => departed.has(s.id)).length,
    canDepart: current != null && isStopResolved(current, roster, boarding),
    schoolArrived: !!progress?.schoolArrivedAt,
  };
}

/** RouteStrip inputs from server progress: fraction of stops departed and the stops around the bus. */
export function routeStripFor(
  stops: Stop[], progress: TripStops | undefined,
): { progress: number; currentStopName?: string; nextStopName?: string } {
  const sorted = bySeq(stops);
  if (sorted.length === 0) return { progress: 0 };
  const departed = new Set((progress?.stops ?? []).filter((s) => s.departedAt).map((s) => s.stopId));
  const departedCount = sorted.filter((s) => departed.has(s.id)).length;
  const currentIdx = progress?.currentStopId ? sorted.findIndex((s) => s.id === progress.currentStopId) : -1;
  if (currentIdx >= 0) {
    return { progress: departedCount / sorted.length, currentStopName: sorted[currentIdx].name, nextStopName: sorted[currentIdx + 1]?.name };
  }
  const nextIdx = sorted.findIndex((s) => !departed.has(s.id));
  return {
    progress: departedCount / sorted.length,
    currentStopName: nextIdx > 0 ? sorted[nextIdx - 1].name : nextIdx === -1 ? sorted[sorted.length - 1].name : undefined,
    nextStopName: nextIdx >= 0 ? sorted[nextIdx].name : undefined,
  };
}

/**
 * A retried or concurrent tap (driver and conductor both pressing) that the server rejects
 * only because the transition already happened is a success, not an error.
 */
export function isAlreadyApplied(err: unknown, action: StopAction, fresh: TripStops | null): boolean {
  if (!isAppError(err) || err.status !== 409) return false;
  if (action.kind === 'arrive') return err.code === 'already_at_stop';
  if (action.kind === 'depart') {
    return err.code === 'not_current_stop' && !!fresh?.stops.find((s) => s.stopId === action.stopId)?.departedAt;
  }
  return err.code === 'invalid_state' && !!fresh?.schoolArrivedAt;
}
```

Note: the `routeStripFor` expectation `{ progress: 0, currentStopName: undefined, nextStopName: 'Gate' }` for `undefined` progress relies on `nextIdx === 0` → `currentStopName: undefined`; `toEqual` treats an explicit `undefined` property as equal to a missing one.

- [ ] **Step 4: Rewrite `useStopProgress.ts`**

```ts
import { useMemo } from 'react';
import type { Stop, StudentLite, Boarding, TripStops } from '@/data/domain';
import { deriveStopProgress, type StopProgress } from './stopProgress';

export type { StopProgress, StopProgressState } from './stopProgress';

export function useStopProgress(
  stops: Stop[], progress: TripStops | undefined, roster: StudentLite[], boarding: Boarding[],
): StopProgress {
  return useMemo(() => deriveStopProgress(stops, progress, roster, boarding), [stops, progress, roster, boarding]);
}
```

- [ ] **Step 5: Query key + hooks.** In `queryClient.ts` add `tripStops: (tripId: string) => ['trip', 'stops', tripId] as const,`. In `hooks.ts` add these imports:

```ts
import { AppError } from '@/lib/errors';
import { isAlreadyApplied, type StopAction } from './stopProgress';
import type { TripStops } from '@/data/domain';
```

and append:

```ts
export function useTripStops(tripId: string | undefined, active: boolean) {
  const repos = useRepositories();
  return useQuery({
    queryKey: queryKeys.tripStops(tripId ?? 'none'),
    queryFn: () => repos.trip.stops(tripId as string),
    enabled: !!tripId,
    // The other phone (driver/conductor) can advance stops too — keep in step while live.
    refetchInterval: active ? 15_000 : false,
  });
}

export function useStopActions(tripId: string | undefined) {
  const repos = useRepositories();
  const qc = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: async (action: StopAction): Promise<void> => {
      if (!tripId) throw new AppError('no_trip', 0, 'No active trip');
      try {
        if (action.kind === 'arrive') await repos.trip.confirmArrival(tripId, action.stopId);
        else if (action.kind === 'depart') await repos.trip.departStop(tripId, action.stopId);
        else await repos.trip.markSchoolArrived(tripId);
      } catch (err) {
        const fresh: TripStops | null = action.kind === 'arrive' ? null : await repos.trip.stops(tripId).catch(() => null);
        if (isAlreadyApplied(err, action, fresh)) return;
        throw err;
      }
    },
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.tripStops(tripId ?? 'none') }),
        qc.invalidateQueries({ queryKey: queryKeys.tripCurrent(tenantId) }),
      ]),
  });
}
```

- [ ] **Step 6: Run tests**

Run: `npx jest src/features/trip`
Expected: PASS. (`LiveMapScreen`/`TripScreen` still call the old `useStopProgress` signature and fail typecheck until B9/B10 — do not run `npm run typecheck` in this task; B9 restores it.)

- [ ] **Step 7: Commit**

```bash
git add src/features/trip src/lib/queryClient.ts
git commit -m "feat(trip): derive stop progress from server state; retry-safe stop actions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B9: Live Map — Arrived, Depart stop, Arrived at school

**Files:**
- Create: `src/features/trip/stopActionMessage.ts`
- Modify: `src/screens/LiveMapScreen.tsx`
- Modify: `src/i18n/resources/{en,hi,mr,ta}.json`
- Modify: `src/screens/__tests__/LiveMapScreen.test.tsx`

**Interfaces:**
- Consumes: `useTripStops`, `useStopActions`, `useStopProgress`, `StopAction` (B8).
- Produces: `stopActionMessage(err: unknown, t: TFunction): string`. Screen testIDs: `arrived-btn`, `depart-stop-btn`, `depart-hint`, `school-arrived-btn`, `back-to-trip-btn`, `stop-action-error`, `stop-completed-confirm` (kept), `mark-picked-up-btn` (kept). `manual-arrived-btn` is removed.

- [ ] **Step 1: Add i18n keys** to all four resource files (keep alphabetical placement near the other `trip.*` keys):

`en.json`:
```json
  "trip.arrived": "Arrived",
  "trip.departStop": "Depart stop",
  "trip.departHint": "Mark every student at this stop before departing.",
  "trip.schoolArrived": "Arrived at school",
  "trip.backToTrip": "Back to trip",
  "trip.endFromTripHint": "End the trip from the Trip screen.",
  "trip.err.tooFar": "Not close enough to the stop yet.",
  "trip.err.noLocation": "Waiting for GPS location — try again in a moment.",
  "trip.err.wrongOrder": "Stops must be completed in order.",
  "trip.err.tripEnded": "This trip has already ended.",
  "trip.err.notAssigned": "You are not assigned to this bus.",
  "trip.err.noDriverAssigned": "This bus has no driver assigned. Contact your school admin.",
  "trip.err.busAlreadyActive": "This bus already has a trip in progress.",
```
`hi.json`:
```json
  "trip.arrived": "पहुंच गए",
  "trip.departStop": "स्टॉप से रवाना",
  "trip.departHint": "रवाना होने से पहले इस स्टॉप के हर छात्र को चिह्नित करें।",
  "trip.schoolArrived": "स्कूल पहुंच गए",
  "trip.backToTrip": "ट्रिप पर वापस",
  "trip.endFromTripHint": "ट्रिप स्क्रीन से ट्रिप समाप्त करें।",
  "trip.err.tooFar": "आप अभी स्टॉप के पर्याप्त पास नहीं हैं।",
  "trip.err.noLocation": "GPS लोकेशन का इंतज़ार है — थोड़ी देर में फिर कोशिश करें।",
  "trip.err.wrongOrder": "स्टॉप क्रम से पूरे करने होंगे।",
  "trip.err.tripEnded": "यह ट्रिप पहले ही समाप्त हो चुकी है।",
  "trip.err.notAssigned": "आप इस बस पर नियुक्त नहीं हैं।",
  "trip.err.noDriverAssigned": "इस बस पर कोई ड्राइवर नियुक्त नहीं है। अपने स्कूल एडमिन से संपर्क करें।",
  "trip.err.busAlreadyActive": "इस बस की एक ट्रिप पहले से चल रही है।",
```
`mr.json`:
```json
  "trip.arrived": "पोहोचलो",
  "trip.departStop": "थांब्यावरून निघा",
  "trip.departHint": "निघण्यापूर्वी या थांब्यावरील प्रत्येक विद्यार्थ्याची नोंद करा.",
  "trip.schoolArrived": "शाळेत पोहोचलो",
  "trip.backToTrip": "ट्रिपवर परत",
  "trip.endFromTripHint": "ट्रिप स्क्रीनवरून ट्रिप संपवा.",
  "trip.err.tooFar": "तुम्ही अजून थांब्याच्या पुरेसे जवळ नाही.",
  "trip.err.noLocation": "GPS स्थानाची वाट पाहत आहे — थोड्या वेळाने पुन्हा प्रयत्न करा.",
  "trip.err.wrongOrder": "थांबे क्रमाने पूर्ण करावे लागतील.",
  "trip.err.tripEnded": "ही ट्रिप आधीच संपली आहे.",
  "trip.err.notAssigned": "तुम्ही या बसवर नियुक्त नाही.",
  "trip.err.noDriverAssigned": "या बसवर कोणताही चालक नियुक्त नाही. तुमच्या शाळेच्या प्रशासकाशी संपर्क साधा.",
  "trip.err.busAlreadyActive": "या बसची एक ट्रिप आधीच सुरू आहे.",
```
`ta.json`:
```json
  "trip.arrived": "வந்தடைந்தோம்",
  "trip.departStop": "நிறுத்தத்திலிருந்து புறப்படு",
  "trip.departHint": "புறப்படும் முன் இந்த நிறுத்தத்தின் ஒவ்வொரு மாணவரையும் குறிக்கவும்.",
  "trip.schoolArrived": "பள்ளியை வந்தடைந்தோம்",
  "trip.backToTrip": "பயணத்திற்குத் திரும்பு",
  "trip.endFromTripHint": "பயணத் திரையிலிருந்து பயணத்தை முடிக்கவும்.",
  "trip.err.tooFar": "நீங்கள் இன்னும் நிறுத்தத்திற்கு போதுமான அருகில் இல்லை.",
  "trip.err.noLocation": "GPS இருப்பிடத்திற்காகக் காத்திருக்கிறது — சிறிது நேரத்தில் மீண்டும் முயலவும்.",
  "trip.err.wrongOrder": "நிறுத்தங்களை வரிசைப்படி முடிக்க வேண்டும்.",
  "trip.err.tripEnded": "இந்தப் பயணம் ஏற்கனவே முடிந்துவிட்டது.",
  "trip.err.notAssigned": "நீங்கள் இந்தப் பேருந்துக்கு நியமிக்கப்படவில்லை.",
  "trip.err.noDriverAssigned": "இந்தப் பேருந்துக்கு ஓட்டுநர் நியமிக்கப்படவில்லை. உங்கள் பள்ளி நிர்வாகியைத் தொடர்பு கொள்ளவும்.",
  "trip.err.busAlreadyActive": "இந்தப் பேருந்தில் ஏற்கனவே ஒரு பயணம் நடைபெறுகிறது.",
```
Run `npx jest src/i18n` — Expected: PASS (key parity).

- [ ] **Step 2: Write `stopActionMessage.ts`**

```ts
import type { TFunction } from 'i18next';
import { isAppError } from '@/lib/errors';
import { authErrorMessage } from '@/features/auth/authErrors';

const KEYS: Record<string, string> = {
  too_far: 'trip.err.tooFar',
  no_location: 'trip.err.noLocation',
  wrong_stop_order: 'trip.err.wrongOrder',
  trip_ended: 'trip.err.tripEnded',
  not_assigned: 'trip.err.notAssigned',
  no_driver_assigned: 'trip.err.noDriverAssigned',
  bus_already_active: 'trip.err.busAlreadyActive',
};

/** User-facing text for a failed trip/stop action; falls back to the shared error copy. */
export function stopActionMessage(err: unknown, t: TFunction): string {
  if (isAppError(err) && KEYS[err.code]) return t(KEYS[err.code]);
  return authErrorMessage(err, t('common.somethingWrong'));
}
```

- [ ] **Step 3: Update the screen test first (failing).** In `src/screens/__tests__/LiveMapScreen.test.tsx`:
  - extend the hooks mock:
    ```ts
    const mockStops = { data: undefined as any, isLoading: false };
    const mockAction = { mutate: jest.fn(), isPending: false, variables: undefined as any };
    jest.mock('@/features/trip/hooks', () => ({
      useTripAssignment: () => mockAssignment,
      useCurrentTrip: () => mockCurrent,
      useRoster: () => mockRoster,
      useBoarding: () => mockBoarding,
      useTripStops: () => mockStops,
      useStopActions: () => mockAction,
    }));
    ```
  - in `beforeEach` reset: `mockStops.data = { tripId: 't1', currentStopId: null, schoolArrivedAt: null, stops: [{ stopId: 's1', name: 'Gate', seq: 1 }, { stopId: 's2', name: 'Market', seq: 2 }] }; mockAction.mutate.mockReset(); mockCurrent.data.direction = 'pickup';`
  - delete every test that references `manual-arrived-btn`, `gpsUnavailable` or GPS-radius-driven `PICKUP_IN_PROGRESS`, and every expectation that `mark-picked-up-btn` shows `stop-completed-confirm`.
  - add:
    ```tsx
    const renderScreen = () =>
      render(<ThemeProvider><ToastProvider><LiveMapScreen navigation={{ goBack: jest.fn() }} route={{ params: { tripId: 't1' } }} /></ToastProvider></ThemeProvider>);

    it('EN_ROUTE shows Arrived for the next stop and confirms it on tap', async () => {
      const { findByTestId } = renderScreen();
      fireEvent.press(await findByTestId('arrived-btn'));
      expect(mockAction.mutate).toHaveBeenCalledWith({ kind: 'arrive', stopId: 's1' }, expect.any(Object));
    });

    it('shows the too_far message inline', async () => {
      mockAction.mutate.mockImplementation((_a: unknown, opts: any) => opts.onError(new (require('@/lib/errors').AppError)('too_far', 409, 'x')));
      const { findByTestId } = renderScreen();
      fireEvent.press(await findByTestId('arrived-btn'));
      expect((await findByTestId('stop-action-error')).props.children).toBe('Not close enough to the stop yet.');
    });

    it('shows the no_location message inline', async () => {
      mockAction.mutate.mockImplementation((_a: unknown, opts: any) => opts.onError(new (require('@/lib/errors').AppError)('no_location', 409, 'x')));
      const { findByTestId } = renderScreen();
      fireEvent.press(await findByTestId('arrived-btn'));
      expect((await findByTestId('stop-action-error')).props.children).toBe('Waiting for GPS location — try again in a moment.');
    });

    it('PICKUP_IN_PROGRESS disables Depart stop until every student is resolved', async () => {
      mockStops.data = { ...mockStops.data, currentStopId: 's2' };
      mockStops.data.stops[0].departedAt = 'x';
      const { findByTestId, getByTestId } = renderScreen();
      expect((await findByTestId('depart-stop-btn')).props.accessibilityState?.disabled).toBe(true);
      expect(getByTestId('depart-hint')).toBeTruthy();
    });

    it('Depart stop calls complete once resolved, and marking pickups never departs by itself', async () => {
      mockStops.data = { ...mockStops.data, currentStopId: 's2' };
      mockBoarding.data = [{ tripId: 't1', studentId: 'st1', stopId: 's2', state: 'boarded', at: 'x' }];
      const { findByTestId } = renderScreen();
      fireEvent.press(await findByTestId('mark-picked-up-btn'));
      expect(mockAction.mutate).not.toHaveBeenCalled();
      fireEvent.press(await findByTestId('depart-stop-btn'));
      expect(mockAction.mutate).toHaveBeenCalledWith({ kind: 'depart', stopId: 's2' }, expect.any(Object));
    });

    it('ROUTE_COMPLETED on a pickup trip offers Arrived at school', async () => {
      mockStops.data.stops.forEach((s: any) => { s.departedAt = 'x'; });
      const { findByTestId } = renderScreen();
      fireEvent.press(await findByTestId('school-arrived-btn'));
      expect(mockAction.mutate).toHaveBeenCalledWith({ kind: 'school' }, expect.any(Object));
    });

    it('ROUTE_COMPLETED on a drop trip goes back to the Trip screen to end it', async () => {
      mockCurrent.data.direction = 'drop';
      mockStops.data.stops.forEach((s: any) => { s.departedAt = 'x'; });
      const { findByTestId, queryByTestId } = renderScreen();
      expect(await findByTestId('back-to-trip-btn')).toBeTruthy();
      expect(queryByTestId('school-arrived-btn')).toBeNull();
    });
    ```
  If `Btn` does not set `accessibilityState={{ disabled }}` on its `Pressable`, assert on `props.disabled` instead (read `src/components/ui/Btn.tsx` and use whichever prop it forwards).

Run: `npx jest src/screens/__tests__/LiveMapScreen.test.tsx` — Expected: FAIL.

- [ ] **Step 4: Update `LiveMapScreen.tsx`.**
  - Imports: `useTripAssignment, useCurrentTrip, useRoster, useBoarding, useTripStops, useStopActions` from hooks; `import { stopActionMessage } from '@/features/trip/stopActionMessage';` and `import type { StopAction } from '@/features/trip/stopProgress';`.
  - Remove `gpsUnavailable` state, the `noFixTimeout` timer and every `setGpsUnavailable` call (keep the permission-denied toast and the watch subscription).
  - After `const boarding = useBoarding(tripId);` add:
    ```tsx
    const tripActive = current.data?.status === 'live' || current.data?.status === 'arrived';
    const tripStops = useTripStops(tripId, tripActive);
    const stopAction = useStopActions(tripId);
    const [stopError, setStopError] = useState<string | null>(null);
    ```
  - Replace the `progress` line with `const progress = useStopProgress(stops, tripStops.data, roster.data ?? [], boarding.data ?? []);`
  - Add the action runner (replace `onMarkPickedUp`'s completion side effects):
    ```tsx
    const runStopAction = (action: StopAction, onDone?: () => void) => {
      setStopError(null);
      stopAction.mutate(action, {
        onSuccess: () => onDone?.(),
        onError: (e) => setStopError(stopActionMessage(e, t)),
      });
    };

    const onMarkPickedUp = () => {
      if (!activeStop) return;
      // Records boarding only — departing the stop is a separate, explicit Depart stop tap.
      stopStudents.forEach((s) => {
        const hasRecord = boarding.data?.some((b) => b.studentId === s.id);
        if (!hasRecord) {
          boarding.setBoarding.mutate({ tripId, studentId: s.id, stopId: s.stopId, state: 'boarded', at: new Date().toISOString() });
        }
      });
    };

    const onDepart = () => {
      if (!activeStop) return;
      const name = activeStop.name;
      runStopAction({ kind: 'depart', stopId: activeStop.id }, () => {
        setJustCompletedStopName(name);
        setTimeout(() => setJustCompletedStopName(null), 1200);
      });
    };
    const pending = stopAction.isPending || tripStops.isLoading;
    ```
  - Replace the `{gpsUnavailable && progress.state === 'EN_ROUTE' && (…manual-arrived-btn…)}` block with:
    ```tsx
            {progress.state === 'EN_ROUTE' && (
              <Btn
                testID="arrived-btn"
                label={t('trip.arrived')}
                icon="location"
                onPress={() => runStopAction({ kind: 'arrive', stopId: activeStop.id })}
                loading={stopAction.isPending && stopAction.variables?.kind === 'arrive'}
                disabled={pending}
                style={styles.markPickedUpBtn}
              />
            )}
    ```
  - Inside the `progress.state === 'PICKUP_IN_PROGRESS'` fragment, after the `mark-picked-up-btn` `Btn`, add:
    ```tsx
                <Btn
                  testID="depart-stop-btn"
                  label={t('trip.departStop')}
                  icon="route"
                  variant="ghost"
                  onPress={onDepart}
                  loading={stopAction.isPending && stopAction.variables?.kind === 'depart'}
                  disabled={pending || !progress.canDepart}
                  style={styles.markPickedUpBtn}
                />
                {!progress.canDepart && (
                  <Text testID="depart-hint" style={[TextScale.caption, { color: colors.inkSoft, marginTop: 4 }]}>
                    {t('trip.departHint')}
                  </Text>
                )}
    ```
  - Replace the `ROUTE_COMPLETED` block with:
    ```tsx
        {progress.state === 'ROUTE_COMPLETED' && (
          <View style={styles.nextStopCard}>
            <Text style={[TextScale.cardTitle, { color: colors.ink }]}>{t('trip.routeCompleteTitle')}</Text>
            {current.data?.direction === 'pickup' && !progress.schoolArrived ? (
              <Btn
                testID="school-arrived-btn"
                label={t('trip.schoolArrived')}
                icon="check"
                onPress={() => runStopAction({ kind: 'school' })}
                loading={stopAction.isPending}
                disabled={pending}
                style={styles.markPickedUpBtn}
              />
            ) : (
              <>
                <Text style={[TextScale.caption, { color: colors.inkSoft, marginTop: 4 }]}>{t('trip.endFromTripHint')}</Text>
                <Btn
                  testID="back-to-trip-btn"
                  label={t('trip.backToTrip')}
                  variant="ghost"
                  onPress={() => navigation.goBack()}
                  style={styles.markPickedUpBtn}
                />
              </>
            )}
          </View>
        )}
        {stopError && (
          <Text testID="stop-action-error" style={[TextScale.caption, { color: colors.danger }]}>{stopError}</Text>
        )}
    ```
  - Use the icon names that exist in `@/components/icons` (`location`, `check`, `route` are already used in this codebase).

- [ ] **Step 5: Run tests + typecheck**

Run: `npx jest src/screens/__tests__/LiveMapScreen.test.tsx src/features/trip src/i18n`
Expected: PASS. (`npm run typecheck` still fails in `TripScreen.tsx` until B10.)

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat(trip): explicit Arrived / Depart stop / Arrived at school actions on the live map

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B10: Trip screen from server progress; batched, resumable GPS pings

**Files:**
- Modify: `src/features/trip/pingQueue.ts` (`createPersistedPingBuffer` batches)
- Modify: `src/features/trip/broadcaster.ts` (batched `onPings`, permanent-rejection drop, persisted trip id, resume)
- Create: `src/features/trip/useResumeBroadcast.ts`
- Modify: `src/data/repositories/types.ts`, `src/data/http/trip.repo.ts`, `src/data/mock/trip.repo.ts` (`publishPing` → `publishPings`)
- Modify: `src/screens/TripScreen.tsx`, `src/screens/LiveMapScreen.tsx` (call `useResumeBroadcast`)
- Delete: `src/features/trip/simulateBus.ts`, `src/features/trip/__tests__/simulateBus.test.ts`
- Modify: `src/features/trip/__tests__/pingQueue.persist.test.ts`, `src/features/trip/__tests__/broadcaster.test.ts`, `src/data/http/__tests__/trip.repo.test.ts`, `src/screens/__tests__/TripScreen.test.tsx`, `src/screens/__tests__/TripScreen.conductor.test.tsx`

**Interfaces:**
- Consumes: `useTripStops`, `routeStripFor` (B8), `stopActionMessage` (B9).
- Produces:
  - `TripRepository.publishPings(tripId: string, pings: TripPing[]): Promise<void>` (replaces `publishPing`)
  - `createPersistedPingBuffer<T>(sendBatch: (items: T[]) => Promise<void>, storageKey: string, batchSize?: number /* 20 */)`
  - `BroadcastDeps = { tripId: string; onPings: (tripId: string, pings: TripPing[]) => Promise<void> }`
  - `isBroadcasting(): boolean`, `getPersistedBroadcastTripId(): Promise<string | null>` from `broadcaster.ts`
  - `useResumeBroadcast(trip: Trip | null | undefined): void`

- [ ] **Step 1: Write the failing tests.**

In `pingQueue.persist.test.ts` replace the per-item `send` tests with:
```ts
it('flushes in batches of at most 20, keeping unsent batches on failure', async () => {
  const sent: number[][] = [];
  let failNext = false;
  const buf = await createPersistedPingBuffer<number>(async (items) => {
    if (failNext) throw new Error('offline');
    sent.push(items);
  }, 'k.batch');
  for (let i = 0; i < 45; i += 1) await buf.enqueue(i);
  // enqueue does not flush by itself
  await buf.flush();
  expect(sent.map((b) => b.length)).toEqual([20, 20, 5]);
  expect(buf.size()).toBe(0);

  for (let i = 0; i < 25; i += 1) await buf.enqueue(i);
  failNext = true;
  await buf.flush();
  expect(buf.size()).toBe(25);
});
```
(Keep this file's existing AsyncStorage mock; keep its rehydration test but change its `send` callback to take an array.)

In `broadcaster.test.ts` add (reuse the file's existing `expo-location`/`expo-task-manager` mocks; if its AsyncStorage mock is missing, add the in-memory one used in `contract.test.ts`):
```ts
import { AppError } from '@/lib/errors';
import { startBroadcast, stopBroadcast, isBroadcasting, getPersistedBroadcastTripId } from '../broadcaster';

it('persists the broadcasting trip id and clears it on stop', async () => {
  await startBroadcast({ tripId: 't1', onPings: jest.fn().mockResolvedValue(undefined) });
  expect(isBroadcasting()).toBe(true);
  await expect(getPersistedBroadcastTripId()).resolves.toBe('t1');
  await stopBroadcast();
  expect(isBroadcasting()).toBe(false);
  await expect(getPersistedBroadcastTripId()).resolves.toBeNull();
});

it('drops a batch the server permanently rejects so it cannot block newer pings', async () => {
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  await AsyncStorage.setItem('sms.trip.pingQueue', JSON.stringify([
    { tripId: 'old', lat: 1, lng: 1, speedKmh: 0, heading: 0, at: 'x' },
  ]));
  const onPings = jest.fn()
    .mockRejectedValueOnce(new AppError('trip_ended', 409, 'ended'))
    .mockResolvedValue(undefined);
  await startBroadcast({ tripId: 't2', onPings });
  expect(onPings).toHaveBeenCalledWith('old', expect.any(Array));
  expect(JSON.parse(await AsyncStorage.getItem('sms.trip.pingQueue'))).toEqual([]);
  await stopBroadcast();
});
```

In `trip.repo.test.ts` replace the `publishPing` describe with:
```ts
describe('httpTrip.publishPings', () => {
  it('posts the batch in the BulkPingRequest shape', async () => {
    const { http, calls } = fakeHttp({ 'POST /staff/trips/t1/pings': undefined });
    await httpTrip(http).publishPings('t1', [
      { tripId: 't1', lat: 12.9, lng: 77.6, speedKmh: 32, heading: 90, at: '2026-08-29T00:00:00Z' },
      { tripId: 't1', lat: 12.91, lng: 77.61, speedKmh: 30, heading: 92, at: '2026-08-29T00:00:10Z' },
    ]);
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/staff/trips/t1/pings',
      body: { pings: [
        { lat: 12.9, lng: 77.6, speed_kmh: 32, heading: 90, at: '2026-08-29T00:00:00Z' },
        { lat: 12.91, lng: 77.61, speed_kmh: 30, heading: 92, at: '2026-08-29T00:00:10Z' },
      ] },
    });
  });
});
```

In `TripScreen.test.tsx` add a hooks-mock entry `useTripStops: () => ({ data: { tripId: 't1', currentStopId: null, schoolArrivedAt: null, stops: [] }, isLoading: false })`, mock the broadcaster module:
```ts
const mockBroadcaster = { startBroadcast: jest.fn(async () => true), stopBroadcast: jest.fn(async () => {}), isBroadcasting: jest.fn(() => false), getPersistedBroadcastTripId: jest.fn(async () => null as string | null) };
jest.mock('@/features/trip/broadcaster', () => mockBroadcaster);
```
and add:
```tsx
it('resumes broadcasting for a persisted live trip after an app restart', async () => {
  mockBroadcaster.getPersistedBroadcastTripId.mockResolvedValue('t1');
  // current trip mock: { id: 't1', status: 'live', ... } — reuse this file's live-trip setup
  renderLiveTrip();
  await waitFor(() => expect(mockBroadcaster.startBroadcast).toHaveBeenCalledWith(expect.objectContaining({ tripId: 't1' })));
});

it('does not start broadcasting on a phone that did not start the trip', async () => {
  mockBroadcaster.getPersistedBroadcastTripId.mockResolvedValue(null);
  renderLiveTrip();
  await new Promise((r) => setTimeout(r, 0));
  expect(mockBroadcaster.startBroadcast).not.toHaveBeenCalled();
});

it('shows a clear message when the server refuses the start', async () => {
  mockStartTrip.mutateAsync.mockRejectedValue(new (require('@/lib/errors').AppError)('not_assigned', 403, 'x'));
  const { findByTestId, findByText } = renderPreTrip();
  fireEvent.press(await findByTestId('trip-start'));
  expect(await findByText('You are not assigned to this bus.')).toBeTruthy();
});
```
Adapt `renderLiveTrip`/`renderPreTrip`/`mockStartTrip` to the helpers and mock names this test file already uses (read it first). If the start button has no testID, add `testID="trip-start"` to it in `TripScreen.tsx`. Remove any expectation that depends on `simulateBusPosition`. Apply the same `useTripStops` hooks-mock entry and broadcaster mock to `TripScreen.conductor.test.tsx`, and add one assertion there: with `mockAssignment.data.driverName = 'Ramesh'` and role conductor, the text `Driver · Ramesh` is rendered (use the exact `role.driver` label from `en.json`).

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/features/trip src/data/http/__tests__/trip.repo.test.ts src/screens/__tests__/TripScreen.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Batch the persisted buffer.** Replace `createPersistedPingBuffer` in `pingQueue.ts`:

```ts
// Same FIFO semantics as createPingBuffer, but mirrored to disk on every mutation so a killed
// app doesn't drop GPS pings, and flushed in batches (sms-api's pings endpoint is batch-only).
export async function createPersistedPingBuffer<T>(
  sendBatch: (items: T[]) => Promise<void>,
  storageKey: string,
  batchSize = 20,
): Promise<PersistedPingBuffer<T>> {
  let queue: T[] = (await asyncStore.get<T[]>(storageKey)) ?? [];
  const persist = () => asyncStore.set(storageKey, queue);

  return {
    async enqueue(item) {
      queue.push(item);
      await persist();
    },
    size() { return queue.length; },
    async flush() {
      while (queue.length > 0) {
        const batch = queue.slice(0, batchSize);
        try {
          await sendBatch(batch);
        } catch {
          break;
        }
        queue = queue.slice(batch.length);
        await persist();
      }
    },
  };
}
```

- [ ] **Step 4: Broadcaster.** In `broadcaster.ts`:
  - imports: add `import { asyncStore } from '@/lib/asyncStore';` and `import { isAppError } from '@/lib/errors';`.
  - add `const BROADCAST_TRIP_KEY = 'sms.trip.broadcastingTripId';`
  - replace `BroadcastDeps`:
    ```ts
    export interface BroadcastDeps {
      tripId: string;
      onPings: (tripId: string, pings: TripPing[]) => Promise<void>;
    }
    ```
  - add above `startBroadcast`:
    ```ts
    // A 4xx other than 401/429 (trip_ended, not your trip, validation) will never succeed on
    // retry — drop that trip's pings so they can't wedge the queue ahead of the new trip's.
    const isPermanent = (err: unknown) =>
      isAppError(err) && err.status >= 400 && err.status < 500 && err.status !== 401 && err.status !== 429;

    function sendGrouped(onPings: BroadcastDeps['onPings']) {
      return async (pings: TripPing[]) => {
        const byTrip = new Map<string, TripPing[]>();
        for (const p of pings) byTrip.set(p.tripId, [...(byTrip.get(p.tripId) ?? []), p]);
        for (const [tripId, group] of byTrip) {
          try {
            await onPings(tripId, group);
          } catch (err) {
            if (!isPermanent(err)) throw err;
          }
        }
      };
    }

    export const isBroadcasting = (): boolean => activeTripId !== null;
    export const getPersistedBroadcastTripId = (): Promise<string | null> => asyncStore.get<string>(BROADCAST_TRIP_KEY);
    ```
  - in `startBroadcast`, change the signature to `({ tripId, onPings }: BroadcastDeps)`, replace `createPersistedPingBuffer(onPing, PING_QUEUE_KEY)` with `createPersistedPingBuffer(sendGrouped(onPings), PING_QUEUE_KEY)`, and after `activeTripId = tripId;` add `await asyncStore.set(BROADCAST_TRIP_KEY, tripId);`. In its `catch` add `await asyncStore.remove(BROADCAST_TRIP_KEY).catch(() => {});`.
  - in `stopBroadcast`'s `finally`, add `await asyncStore.remove(BROADCAST_TRIP_KEY).catch(() => {});` (make the finally block `async`-safe by moving it into a `try { … } finally { … }` that already exists — `stopBroadcast` is already `async`).
  - Check `asyncStore` exposes `remove` (it is used as `asyncStore.remove(SESSION_KEY)` in `AuthProvider`).

- [ ] **Step 5: `publishPings` in both adapters and the interface.** `types.ts`: replace `publishPing(ping: TripPing): Promise<void>;` with `publishPings(tripId: string, pings: TripPing[]): Promise<void>;`. HTTP:

```ts
    publishPings: (tripId: string, pings: TripPing[]) =>
      http
        .post<void>(`/staff/trips/${tripId}/pings`, {
          pings: pings.map((p) => ({ lat: p.lat, lng: p.lng, speed_kmh: p.speedKmh, heading: p.heading, at: p.at })),
        })
        .then(() => undefined),
```
Mock:
```ts
    async publishPings(_tripId: string, pings: TripPing[]): Promise<void> {
      await simulateLatency();
      if (!store.currentTrip || store.currentTrip.status === 'ended') return;
      store.pings.push(...pings);
      if (store.pings.length > 500) store.pings.splice(0, store.pings.length - 500);
    },
```

- [ ] **Step 6: `useResumeBroadcast.ts`**

```ts
import { useEffect } from 'react';
import type { Trip } from '@/data/domain';
import { useRepositories } from '@/data/repositories/RepositoryContext';
import { startBroadcast, isBroadcasting, getPersistedBroadcastTripId } from './broadcaster';

/**
 * After the app process restarts mid-trip, the module-level broadcaster is empty and the
 * server stops receiving GPS — every Arrived tap would then fail with no_location/too_far.
 * Resume only on the phone that started this trip (its id was persisted at start).
 */
export function useResumeBroadcast(trip: Trip | null | undefined): void {
  const repos = useRepositories();
  const tripId = trip && (trip.status === 'live' || trip.status === 'arrived') ? trip.id : null;
  useEffect(() => {
    if (!tripId || isBroadcasting()) return;
    let cancelled = false;
    void (async () => {
      const persisted = await getPersistedBroadcastTripId();
      if (cancelled || persisted !== tripId || isBroadcasting()) return;
      await startBroadcast({ tripId, onPings: (id, pings) => repos.trip.publishPings(id, pings) });
    })();
    return () => { cancelled = true; };
  }, [tripId, repos]);
}
```

- [ ] **Step 7: TripScreen.**
  - Remove `import { simulateBusPosition } from '@/features/trip/simulateBus';`, the `now` state, the 5-second tick `useEffect`, and the `routeProgress` `useCallback` (and `useCallback` from the React import if now unused).
  - Add imports: `useTripStops` from hooks, `import { routeStripFor } from '@/features/trip/stopProgress';`, `import { useResumeBroadcast } from '@/features/trip/useResumeBroadcast';`, `import { stopActionMessage } from '@/features/trip/stopActionMessage';`.
  - After `const trip = current.data;` add:
    ```tsx
    const tripStops = useTripStops(trip?.id, !!trip);
    useResumeBroadcast(trip);
    ```
  - Replace `onStart` with:
    ```tsx
    const onStart = async () => {
      if (!assignment.data) return;
      let started;
      try {
        started = await startTrip.mutateAsync({
          routeId: assignment.data.route.id, direction, busNo: assignment.data.busNo,
        });
      } catch (e) {
        // not_assigned / no_driver_assigned / bus_already_active — say why instead of failing silently.
        toast.show(stopActionMessage(e, t), 'error');
        return;
      }
      const ok = await startBroadcast({ tripId: started.id, onPings: (id, pings) => repos.trip.publishPings(id, pings) });
      if (!ok) {
        toast.show(t('trip.permissionDenied'), 'error');
        await endTrip.mutateAsync(started.id);
        return;
      }
      navigation.navigate('LiveMap', { tripId: started.id });
    };
    ```
  - Replace the RouteStrip IIFE with:
    ```tsx
            {assignment.data && (() => {
              const strip = routeStripFor(assignment.data.route.stops, tripStops.data);
              return (
                <RouteStrip
                  route={assignment.data.route}
                  progress={strip.progress}
                  accent={accent}
                  currentStopName={strip.currentStopName}
                  nextStopName={strip.nextStopName}
                />
              );
            })()}
    ```
  - In the pre-trip card, next to the conductor pill, show the driver for conductors:
    ```tsx
                  {role.key === 'conductor' && assignment.data.driverName ? (
                    <Pill label={`${t('role.driver')} · ${assignment.data.driverName}`} color={colors.primary} bg={colors.primaryDim} icon="visitor" />
                  ) : null}
    ```
    (check `role.driver` exists in `en.json`; the file already has `role.conductor`, and all six roles are labelled.)
  - Ensure the start button has `testID="trip-start"`.
- In `LiveMapScreen.tsx` add `import { useResumeBroadcast } from '@/features/trip/useResumeBroadcast';` and call `useResumeBroadcast(current.data);` after `const current = useCurrentTrip();`. In `LiveMapScreen.test.tsx` add `jest.mock('@/features/trip/useResumeBroadcast', () => ({ useResumeBroadcast: () => undefined }));`.
- Delete `src/features/trip/simulateBus.ts` and `src/features/trip/__tests__/simulateBus.test.ts` (`git rm`).

- [ ] **Step 8: Run the full app checks**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS. Typecheck is green again from this task on.

- [ ] **Step 9: Commit**

```bash
git add -A src
git commit -m "feat(trip): server-driven route strip, batched and resumable GPS pings, clear start errors

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B11: Contract test against recorded sms-api shapes

**Files:**
- Modify: `src/data/__tests__/contract.test.ts`
- Create: `src/data/__tests__/fixtures/smsApi.ts`

**Interfaces:**
- Consumes: every schema and repo method from B3–B10.
- Produces: `smsApiFixtures: Record<string, unknown>` keyed `'<METHOD> <path>'`, recorded from the seeded stack.

- [ ] **Step 1: Record real responses.** With the Part A stack running (`docker compose --profile seed up --build` in `sms-api`) and a driver password set (see `db/dev-seed/README.md`), run this throwaway script from the `sms-staff` root and paste its JSON into the fixture file. It is not committed.

```bash
node -e '
const base="http://localhost:5080/v1";
(async()=>{
  const j=async(r)=>{const t=await r.text();return t?JSON.parse(t):null};
  const login=await j(await fetch(base+"/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"driver@e2e.test",password:process.env.PW})}));
  const H={Authorization:"Bearer "+login.data.access_token};
  const get=async(p)=>(await j(await fetch(base+p,{headers:H}))).data;
  const out={};
  for (const p of ["/auth/me","/staff/dashboard","/staff/attendance","/me/attendance/school-location","/staff/trip/assignment","/staff/trip/current","/staff/tasks","/staff/issues","/leave","/leave/balances","/staff/profile"]) out["GET "+p]=await get(p);
  console.log(JSON.stringify(out,null,2));
})();'
```
(Set `PW` in the environment first, e.g. `PW='<the password you set>' node -e …`.)

- [ ] **Step 2: Write the fixture module** `src/data/__tests__/fixtures/smsApi.ts`:

```ts
// Recorded from sms-api (postgres) with db/dev-seed/staff_e2e.sql, driver@e2e.test, 2026-09-26.
// Re-record when the backend contract changes; do not hand-edit field shapes.
export const smsApiFixtures: Record<string, unknown> = {
  // paste the recorded object here, then add the trip-scoped entries below, recorded the same
  // way while a trip is live: 'GET /staff/trips/<id>/roster', 'GET /staff/trips/<id>/boarding',
  // 'GET /staff/trips/<id>/stops', and 'POST /staff/trips' (the start response).
};
```
Replace the placeholder comment with the recorded data (this is data capture, not design — the recorded values are the content).

- [ ] **Step 3: Point the contract test's live adapter at the fixtures.** In `contract.test.ts`, replace the hand-written `routes` of `fixtureHttp()` with `{ ...smsApiFixtures, 'POST /auth/otp/request': {}, 'POST /auth/otp/verify': tokenDTO, 'POST /auth/login': tokenDTO }` (keep `tokenDTO`) and make the http fake resolve paths by stripping the query string (`path.split('?')[0]`). Add assertions that the live adapter parses each recorded response without throwing:

```ts
it('parses every recorded sms-api response', async () => {
  const repos = createHttpRepositories(fixtureHttp());
  await expect(repos.dashboard.get()).resolves.toBeDefined();
  await expect(repos.attendance.status()).resolves.toBeDefined();
  await expect(repos.attendance.schoolLocation()).resolves.toBeDefined();
  await expect(repos.trip.myAssignment()).resolves.toMatchObject({ busNo: 'E2E-BUS-01' });
  await expect(repos.tasks.list()).resolves.toBeInstanceOf(Array);
  await expect(repos.issues.list()).resolves.toBeInstanceOf(Array);
  await expect(repos.leave.summary()).resolves.toBeDefined();
  await expect(repos.profile.get()).resolves.toBeDefined();
});
```
Also add `stops`, `confirmArrival`, `departStop`, `markSchoolArrived` and `publishPings` to whatever "both adapters implement the same interface" check the file already has.

- [ ] **Step 4: Run**

Run: `npx jest src/data/__tests__/contract.test.ts`
Expected: PASS. A failure here is a real contract gap: fix the schema (or mapper) in the task that owns it, not the fixture.

- [ ] **Step 5: Commit**

```bash
git add src/data/__tests__
git commit -m "test(contract): validate both adapters against recorded sms-api responses

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B12: Manual end-to-end check and results

**Files:**
- Modify: `docs/superpowers/specs/2026-09-26-sms-api-end-to-end-wiring-design.md` (append `## 11. End-to-end check results`)

- [ ] **Step 1: Bring up the stack**

Run (in `sms-api`): `docker compose --profile seed up --build`
Expected: `api` logs `Now listening on: http://[::]:8080`; `curl http://localhost:5080/health/ready` → 200.

- [ ] **Step 2: Run the app live** (in `sms-staff`): `cp .env.example .env` then `npm run web`; separately on an Android device with `EXPO_PUBLIC_API_BASE_URL=http://<LAN-IP>:5080/v1`.

- [ ] **Step 3: Driver flow** — record pass/fail and notes for each:
  1. `driver@e2e.test` + any password → "You haven't set a password yet" → OTP (read the code from `docker compose logs api`) → set password → Home shows role Driver.
  2. Attendance check-in inside the school geofence (spoof device location to 28.4595, 77.0266) → checked in; last log shows in-zone.
  3. Dashboard shows the driver role card for `E2E-BUS-01`; streak/leave tiles hidden.
  4. Trip → Start (pickup) → Live Map. Spoof location to Stop 1 (28.4680, 77.0300), wait ≥ 10 s for a ping → Arrived → pickup in progress. Try Arrived at Stop 2 while still at Stop 1 → not offered (only the next stop's Arrived shows).
  5. Spoof location 2 km away before tapping Arrived on the next stop → "Not close enough to the stop yet."
  6. Mark students (boarded/absent) → Depart stop enabled only after all resolved → depart. Stop 3 (no students) → Depart enabled right after Arrived.
  7. After Stop 4 → Arrived at school → Back to trip → End trip → summary.
  8. Kill the app mid-trip (after step 4), reopen, open Trip → broadcasting resumes (pings continue: `docker compose exec db psql -U sms -d sms_dev -c 'SELECT max("At") FROM dbo."TripPings"'` advances).

- [ ] **Step 4: Conductor flow** — `conductor@e2e.test` (set password via OTP): Trip shows the assignment with the driver's name; starts a new trip after the driver's ended; `SELECT "DriverId","ConductorId" FROM dbo."Trips" ORDER BY "StartedAt" DESC LIMIT 1` shows DriverId = driver user `a0000000-0000-4000-8000-000000000101`, ConductorId = `…102`. While both are logged in on two devices, tap Arrived on both for the same stop → no error on the second.

- [ ] **Step 5: Server state** — `SELECT "StopId","ConfirmedAt","DepartedAt" FROM dbo."TripStopProgress" WHERE "TripId"='<id>' ORDER BY "Seq"` shows a row per visited stop. Observe fleet events with a throwaway SignalR client (not committed), e.g. in a scratch folder:
```bash
npm i @microsoft/signalr && node -e '
const s=require("@microsoft/signalr");
const c=new s.HubConnectionBuilder().withUrl("http://localhost:5080/hubs/transport-fleet?access_token="+process.env.TOKEN).build();
["stop_arrived","stop_completed","school_arrived","position_update"].forEach(e=>c.on(e,d=>console.log(e,JSON.stringify(d))));
c.start().then(()=>c.invoke("JoinBus","a0000000-0000-4000-8000-000000000401")).then(ok=>console.log("joined",ok));'
```
(`TOKEN` = the driver's current access token while the trip is live.) Expected: `stop_arrived`/`stop_completed` print on each tap.

- [ ] **Step 6: Other screens** — tasks (complete one, attach a photo), issue with a photo (appears in list), leave request (appears pending), profile, vehicle inspection + fuel log; sweeper/guard login shows the non-transport quick actions.

- [ ] **Step 7: Token refresh** — leave the app idle 16+ minutes, then pull to refresh Home → data loads without a login prompt (`api` log shows `POST /v1/auth/refresh` 200).

- [ ] **Step 8: Record results** — append to the spec:

```markdown
## 11. End-to-end check results (YYYY-MM-DD)

| Check | Web | Android | Notes |
|---|---|---|---|
| Driver first login (OTP → set password) | | | |
| Attendance check-in (in zone) | | | |
| Dashboard role card | | | |
| Start trip / Arrived / too_far message | | | |
| Depart gating (incl. empty stop) | | | |
| School arrived → end trip | | | |
| Resume broadcasting after restart | | | |
| Conductor assignment + attribution | | | |
| Concurrent Arrived (driver + conductor) | | | |
| TripStopProgress rows + fleet events | | | |
| Tasks / issues / leave / profile / vehicle | | | |
| Silent token refresh | | | |
```
Fill every cell with PASS/FAIL. For any FAIL, open the owning task, add a failing test, fix, and re-run this check.

- [ ] **Step 9: Commit**

```bash
git add docs/superpowers/specs/2026-09-26-sms-api-end-to-end-wiring-design.md
git commit -m "docs: record staff-app ↔ sms-api end-to-end check results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Spec coverage map

| Spec section | Task(s) |
|---|---|
| §3.1 trip start attribution | A1, A2 |
| §3.2 conductor assignment + `driver_name` | A3, B5, B10 (driver pill) |
| §3.3 stop progress read | A4, B7 |
| §3.4 trip `current_stop_id` | A4, B5 |
| §3.5 dev seed | A5 |
| §3.6 backend tests | A2, A3, A4 |
| §4.1 config/README | B1 |
| §4.2 login without role, null role_key | B3 |
| §4.3 token refresh | B2 |
| §4.4 errors | B1 |
| §4.5 response validation | B4, B5, B6, B11 |
| §5 feature contract fixes | B4 (attendance, dashboard), B5 (trip), B6 (others), B10 (pings, simulateBus) |
| §6 server-driven stop flow | B7, B8, B9, B10 |
| §7 mock mode | B7 (mock stops), B5/B10 (mock trip), B11 (contract) |
| §8 testing & manual check | every task; B11; B12 |
| §10 git (local only) | Global Constraints |
