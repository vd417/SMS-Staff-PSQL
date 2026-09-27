// Recorded from sms-api (postgres) with db/dev-seed/staff_e2e.sql, driver@e2e.test, 2026-09-27.
// GET /leave, GET /staff/issues, POST /leave and POST /staff/issues were recorded in a second
// session the same day (after the trip above had ended), right after the driver submitted one
// leave request and one issue through those POST routes, so the list schemas are exercised
// against a real item rather than an empty array.
// Re-record when the backend contract changes; do not hand-edit field shapes.
export const smsApiFixtures: Record<string, unknown> = {
  "GET /auth/me": {
    "id": "a0000000-0000-4000-8000-000000000101",
    "tenant_id": "a0000000-0000-4000-8000-000000000001",
    "roles": [
      "staff"
    ],
    "is_platform": false,
    "name": "Ramesh Driver",
    "email": "driver@e2e.test",
    "phone": null,
    "employee": "E2E-001",
    "classroom": null,
    "joined": "2026",
    "tenant_name": "Greenfield E2E School",
    "tenant_logo_url": null,
    "tenant_image_url": null,
    "tier": "platinum",
    "plan_name": null,
    "must_set_password": false,
    "title": "Driver",
    "photo_url": null,
    "student_id": null,
    "role_key": "driver",
    "duty_post": "E2E Route 1"
  },
  "GET /staff/dashboard": {
    "hours_this_week": 0,
    "role_card": {
      "kind": "driver",
      "bus_no": "E2E-BUS-01",
      "route_name": "E2E Route 1",
      "shift": "6:30 AM - 3:30 PM",
      "students_assigned": 4,
      "on_board": null,
      "capacity": null,
      "next_stop": null
    }
  },
  "GET /staff/attendance": {
    "checked_in": false,
    "check_in_at": null,
    "last_log": [],
    "duty_post": "Greenfield E2E Main Gate",
    "geofence_radius_m": 150
  },
  "GET /me/attendance/school-location": {
    "lat": 28.4595,
    "lng": 77.0266,
    "radius_meters": 150,
    "name": "Greenfield E2E Main Gate"
  },
  "GET /staff/trip/assignment": {
    "route": {
      "id": "a0000000-0000-4000-8000-000000000301",
      "name": "E2E Route 1",
      "bus_no": "E2E-BUS-01",
      "stops": [
        {
          "id": "a0000000-0000-4000-8000-000000000311",
          "name": "Sector 14 Market",
          "lat": 28.468,
          "lng": 77.03,
          "seq": 1,
          "eta_min": null
        },
        {
          "id": "a0000000-0000-4000-8000-000000000312",
          "name": "Sector 15 Park",
          "lat": 28.4655,
          "lng": 77.029,
          "seq": 2,
          "eta_min": null
        },
        {
          "id": "a0000000-0000-4000-8000-000000000313",
          "name": "Old Railway Road",
          "lat": 28.463,
          "lng": 77.028,
          "seq": 3,
          "eta_min": null
        },
        {
          "id": "a0000000-0000-4000-8000-000000000314",
          "name": "Civil Lines Chowk",
          "lat": 28.461,
          "lng": 77.0272,
          "seq": 4,
          "eta_min": null
        }
      ]
    },
    "bus_id": "a0000000-0000-4000-8000-000000000401",
    "bus_no": "E2E-BUS-01",
    "conductor_name": "Sita Conductor",
    "shift": "6:30 AM - 3:30 PM",
    "students_assigned": 4,
    "driver_name": "Ramesh Driver"
  },
  "GET /staff/trip/current": {
    "id": "e4220d66-00b6-460b-a83a-6f5be4ae9956",
    "tenant_id": "a0000000-0000-4000-8000-000000000001",
    "route_id": "a0000000-0000-4000-8000-000000000301",
    "bus_no": "E2E-BUS-01",
    "driver_id": "a0000000-0000-4000-8000-000000000101",
    "conductor_id": "a0000000-0000-4000-8000-000000000102",
    "direction": "pickup",
    "status": "live",
    "started_at": "2026-09-27T16:16:40.721Z",
    "ended_at": null,
    "driver_last_ping_at": null,
    "conductor_last_ping_at": null,
    "active_broadcaster": null,
    "current_stop_id": null
  },
  "GET /staff/tasks": [],
  "GET /staff/issues": [
    {
      "id": "436bb995-720a-4f62-b860-86c8af781ec8",
      "tenant_id": "a0000000-0000-4000-8000-000000000001",
      "reporter_user_id": "a0000000-0000-4000-8000-000000000101",
      "category": "vehicle",
      "title": "Rear wiper not working",
      "description": "Wiper motor stalls",
      "priority": "normal",
      "status": "open",
      "vehicle_id": null,
      "route_id": null,
      "trip_id": null,
      "photo_url": null,
      "created_at": "2026-09-27T18:04:27.376Z",
      "updated_at": "2026-09-27T18:04:27.376Z"
    }
  ],
  "GET /leave": [
    {
      "id": "38676e3f-80f3-4e09-bf27-47bbd4487fc4",
      "tenant_id": "a0000000-0000-4000-8000-000000000001",
      "requester_id": "a0000000-0000-4000-8000-000000000101",
      "child_id": null,
      "type": "casual",
      "from_date": "2026-10-05T00:00:00.000Z",
      "to_date": "2026-10-06T00:00:00.000Z",
      "reason": "Family function",
      "substitute": null,
      "status": "pending",
      "applied_on": "2026-09-27T00:00:00.000Z",
      "decided_note": null,
      "priority": "medium",
      "attachment_urls": null,
      "requester_name": null,
      "decided_by_name": null,
      "requester_role": null
    }
  ],
  "GET /leave/balances": [
    {
      "type": "casual",
      "total": 12,
      "used": 0
    },
    {
      "type": "sick",
      "total": 10,
      "used": 0
    },
    {
      "type": "earned",
      "total": 15,
      "used": 0
    }
  ],
  "GET /staff/profile": {
    "documents": [],
    "license_number": null,
    "license_expiry": null,
    "emergency_contact_name": null,
    "emergency_contact_phone": null
  },
  "POST /staff/trips": {
    "id": "e4220d66-00b6-460b-a83a-6f5be4ae9956",
    "tenant_id": "a0000000-0000-4000-8000-000000000001",
    "route_id": "a0000000-0000-4000-8000-000000000301",
    "bus_no": "E2E-BUS-01",
    "driver_id": "a0000000-0000-4000-8000-000000000101",
    "conductor_id": "a0000000-0000-4000-8000-000000000102",
    "direction": "pickup",
    "status": "live",
    "started_at": "2026-09-27T16:16:40.721Z",
    "ended_at": null,
    "driver_last_ping_at": null,
    "conductor_last_ping_at": null,
    "active_broadcaster": null,
    "current_stop_id": null
  },
  "GET /staff/trips/e4220d66-00b6-460b-a83a-6f5be4ae9956/roster": [
    {
      "id": "a0000000-0000-4000-8000-000000000501",
      "name": "Aarav Sharma",
      "stop_id": "a0000000-0000-4000-8000-000000000311",
      "photo_url": null
    },
    {
      "id": "a0000000-0000-4000-8000-000000000502",
      "name": "Diya Verma",
      "stop_id": "a0000000-0000-4000-8000-000000000311",
      "photo_url": null
    },
    {
      "id": "a0000000-0000-4000-8000-000000000503",
      "name": "Kabir Singh",
      "stop_id": "a0000000-0000-4000-8000-000000000312",
      "photo_url": null
    },
    {
      "id": "a0000000-0000-4000-8000-000000000504",
      "name": "Meera Iyer",
      "stop_id": "a0000000-0000-4000-8000-000000000314",
      "photo_url": null
    }
  ],
  "GET /staff/trips/e4220d66-00b6-460b-a83a-6f5be4ae9956/boarding": [],
  "GET /staff/trips/e4220d66-00b6-460b-a83a-6f5be4ae9956/stops": {
    "trip_id": "e4220d66-00b6-460b-a83a-6f5be4ae9956",
    "current_stop_id": null,
    "school_arrived_at": null,
    "stops": [
      {
        "stop_id": "a0000000-0000-4000-8000-000000000311",
        "name": "Sector 14 Market",
        "seq": 1,
        "arrived_at": null,
        "confirmed_at": null,
        "departed_at": null
      },
      {
        "stop_id": "a0000000-0000-4000-8000-000000000312",
        "name": "Sector 15 Park",
        "seq": 2,
        "arrived_at": null,
        "confirmed_at": null,
        "departed_at": null
      },
      {
        "stop_id": "a0000000-0000-4000-8000-000000000313",
        "name": "Old Railway Road",
        "seq": 3,
        "arrived_at": null,
        "confirmed_at": null,
        "departed_at": null
      },
      {
        "stop_id": "a0000000-0000-4000-8000-000000000314",
        "name": "Civil Lines Chowk",
        "seq": 4,
        "arrived_at": null,
        "confirmed_at": null,
        "departed_at": null
      }
    ]
  },
  "POST /leave": {
    "id": "38676e3f-80f3-4e09-bf27-47bbd4487fc4",
    "tenant_id": "a0000000-0000-4000-8000-000000000001",
    "requester_id": "a0000000-0000-4000-8000-000000000101",
    "child_id": null,
    "type": "casual",
    "from_date": "2026-10-05T00:00:00.000Z",
    "to_date": "2026-10-06T00:00:00.000Z",
    "reason": "Family function",
    "substitute": null,
    "status": "pending",
    "applied_on": "2026-09-27T00:00:00.000Z",
    "decided_note": null,
    "priority": "medium",
    "attachment_urls": null,
    "requester_name": null,
    "decided_by_name": null,
    "requester_role": null
  },
  "POST /staff/issues": {
    "id": "436bb995-720a-4f62-b860-86c8af781ec8",
    "tenant_id": "a0000000-0000-4000-8000-000000000001",
    "reporter_user_id": "a0000000-0000-4000-8000-000000000101",
    "category": "vehicle",
    "title": "Rear wiper not working",
    "description": "Wiper motor stalls",
    "priority": "normal",
    "status": "open",
    "vehicle_id": null,
    "route_id": null,
    "trip_id": null,
    "photo_url": null,
    "created_at": "2026-09-27T18:04:27.376Z",
    "updated_at": "2026-09-27T18:04:27.376Z"
  }
};
