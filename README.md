# SchoolMate Staff

Mobile app for non-teaching school staff (drivers, cooks, guards, gardeners, sweepers,
peons, clerks). Part of the SMS suite alongside `sms-student` and `sms-teacher-app`.

## Stack
Expo SDK 54 · React Native 0.81 · TypeScript · React Navigation · TanStack Query ·
react-i18next (en/hi/mr/ta) · Sora + Manrope fonts. Swappable mock→HTTP data layer
(`EXPO_PUBLIC_DATA_SOURCE=mock|live`).

## Run
- `npm install`
- `npm run web` / `npm run android` / `npm run ios`
- `npm test` · `npm run lint` · `npm run typecheck`

## Docs
- Specs: `docs/superpowers/specs/`
- Plans: `docs/superpowers/plans/`
- Design reference (source of truth for tokens, icons, i18n dictionary): `docs/design-handoff/`

## Status
Plans 1–2 complete (scaffold + swappable mock→HTTP data layer + auth). Next: Plan 3
(icons, UI primitives, Splash & Login), Plan 4 (Home & Attendance).

## Running against sms-api locally

1. In `../sms-api`: `docker compose --profile seed up --build` (API on `http://localhost:5080`, seeded demo school — see `sms-api/db/dev-seed/README.md`).
2. Copy `.env.example` to `.env` (`EXPO_PUBLIC_DATA_SOURCE=live`).
3. Web: `npm run web` — `localhost:8081`/`:19006` are already allowed by the API's Development CORS list.
4. Physical device: set `EXPO_PUBLIC_API_BASE_URL=http://<your-PC-LAN-IP>:5080/v1` (`localhost` is the phone itself). For Expo web served from another host, add it with `Cors__AllowedOrigins__N=http://<host>:<port>` on the `api` service.
