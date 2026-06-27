# Multi-Event Operation Guide

## What changed

- The system now has `Organization`, `EventSeries`, and `Event` records.
- Existing yearly data still works through `eventYear`.
- New participants, donations, prizes, and packages also store optional `organizationId`, `seriesId`, and `eventId`.
- `SystemSetting` stores the active event via `currentEventId`, `currentEventSeriesId`, and `defaultOrganizationId`.
- Superadmin and event-level roles are mapped through backend permissions.

## First rollout

1. Deploy backend and frontend.
2. Open `Admin -> จัดการกิจกรรม`.
3. The first catalog load creates a default organization, series, and event from the current settings.
4. Create additional events or yearly instances from the UI.
5. Use `Activate` to switch the current event.

## Migrate existing records

Use this after the first deployment if the database already has yearly data from the old system.

The migration does three things:

- Finds every `eventYear` from participants, donations, prizes, packages, and system settings.
- Creates missing `Event` records for those years under the default organization and event series.
- Fills missing `eventId`, `seriesId`, and `organizationId` on old records.
- If old records have empty `eventYear`, they are assigned to `BACKFILL_EVENT_YEAR`; if that env var is not set, the current system event year is used.

From the admin UI:

1. Open `Admin -> จัดการกิจกรรม`.
2. Review the `เชื่อมข้อมูลเดิมเข้าระบบกิจกรรม` table.
3. Click `เชื่อมข้อมูลเดิม`.

From the terminal:

```bash
cd backend
npm run migrate:legacy-events
```

Set the year for old rows with empty `eventYear`:

```bash
cd backend
BACKFILL_EVENT_YEAR=2026 npm run migrate:legacy-events
```

Preview only:

```bash
cd backend
npm run migrate:legacy-events -- --dry-run
```

`--dry-run` reads the database and prints what would happen without creating events or updating records.

The actual migration is non-destructive. It does not delete old data and does not overwrite records that already have `eventId`.

## Roles

- `superadmin`: all permissions, including infrastructure-level management.
- `admin`: regular system administration.
- `org_admin`: organization and event administration.
- `event_admin`: event administration and audit read access.
- `event_manager`: event/layout/participant operations.
- `auditor`: event read and audit read.
- `staff`: check-in and registration.
- `kiosk`: check-in and registration through scoped flows.

## Layout config

The first implementation stores layout JSON per event:

- `registrationForm`
- `dashboard`
- `ticket`
- `report`

Each save increments the layout version. The current UI validates JSON before saving.

## Compatibility rules

- Old data with only `eventYear` remains visible.
- New data writes both `eventYear` and current event references when the request uses the current active year.
- If an admin manually changes an old record to another year, event references are cleared to avoid pointing to the wrong event.
- Lucky draw prefers `eventId` but includes legacy records with the same `eventYear` so existing current-year participants remain eligible.
- Package stock data is migrated by year so donation/package reporting stays aligned with each event.
