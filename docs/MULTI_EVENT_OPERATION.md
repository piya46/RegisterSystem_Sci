# Multi-Event Operation Guide

## What changed

- The system now has `Organization`, `EventSeries`, and `Event` records.
- Existing yearly data still works through `eventYear`.
- New participants, donations, prizes, and packages also store optional `organizationId`, `seriesId`, and `eventId`.
- `SystemSetting` stores the active event via `currentEventId`, `currentEventSeriesId`, and `defaultOrganizationId`.
- Superadmin and event-level roles are mapped through backend permissions.
- Public event pages are now event-scoped through `/e/:eventSlug` and `/e/:eventSlug/register`.
- Event landing layouts are block-based and sanitized on the backend before saving.

## First rollout

1. Deploy backend and frontend.
2. Open `Admin -> จัดการกิจกรรม`.
3. The first catalog load creates a default organization, series, and event from the current settings.
4. Create additional events or yearly instances from the UI.
5. Use `ปัจจุบัน` to switch the current event for legacy/system-wide views.
6. Use `Publish` to publish a public landing page.
7. Use `เปิดรับ` only when the public registration form should accept submissions.

## Admin workspace pages

The event admin UI is intentionally separated by responsibility:

- `/workspace`: default post-login event workspace. Users choose an assigned event before opening tools.
- `/admin/events`: event portal for listing events, creating organizations/series/events, and lifecycle shortcuts.
- `/admin/events/migration`: legacy data migration and verification.
- `/admin/events/:eventId/settings`: public-event settings such as logo, cover image, colors, welcome text, and contact email.
- `/admin/events/:eventId/layouts`: layout builder for landing page, registration form, dashboard, ticket, and report templates.

Keep operational setup, public visual content, and layout editing separate. This reduces accidental edits and makes permission review easier.

Superadmin/Admin use the workspace as a control center and can open the event system management pages from there. Staff and event-level users use the workspace as an assigned-event picker and only see tools that match their role.

## Event lifecycle

The event status controls public visibility and registration safety:

- `draft`: internal setup only.
- `published`: public landing page can be viewed, but registration is not open yet.
- `registration_open`: public landing page and public registration are open.
- `registration_closed`: landing can remain visible, registration is closed.
- `event_day`: event-day public screens can be used.
- `archived`: historical event. Keep for reporting and lookup, not public registration.

`ปัจจุบัน` is separate from lifecycle status. It updates `SystemSetting.currentEventId/currentEventYear` so old screens that do not yet pass `eventSlug` continue to know which event is current.

## Public links

Every event uses its own slug:

- Landing page: `/e/:eventSlug`
- Registration page: `/e/:eventSlug/register`
- Future check-in/report links: `/e/:eventSlug/checkin`, `/e/:eventSlug/report`

Public registration requests send `eventSlug` back to the API. The backend resolves the exact `Event` and writes `organizationId`, `seriesId`, `eventId`, and `eventYear` together. This prevents a public link for one event from accidentally writing into the current global event.

## Layout and branding

Open `Admin -> จัดการกิจกรรม`, select an event, then edit:

- Logo URL
- Cover image URL
- Theme colors
- Welcome message
- Contact email
- Landing page blocks

Supported landing blocks:

- `hero`
- `richText`
- `schedule`
- `faq`
- `cta`
- `details`
- `packages`
- `sponsors`
- `map`
- `divider`

The backend accepts only known block types and known field shapes. URLs must be relative paths or `http/https`. Script tags and unknown executable content are not stored.

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

The system stores layout JSON per event:

- `landingPage`
- `registrationForm`
- `dashboard`
- `ticket`
- `report`

Each save increments the layout version and appends an event version-history entry. Publish also snapshots the current public payload.

## Permission scope

System roles are permission-based, but event access is also scoped:

- `superadmin` and `admin` can see and manage all events.
- `org_admin` can manage events under assigned `organizationIds`.
- `event_admin` and `event_manager` can manage assigned `eventIds`.
- Migration is restricted to `superadmin` and `admin`.
- Public event endpoints expose only published/open/event-day events.

## Compatibility rules

- Old data with only `eventYear` remains visible.
- New global legacy requests write both `eventYear` and current event references when the request uses the current active year.
- New event-scoped public requests write exact references from `eventSlug`, regardless of the current global event.
- If an admin manually changes an old record to another year, event references are cleared to avoid pointing to the wrong event.
- Lucky draw prefers `eventId` but includes legacy records with the same `eventYear` so existing current-year participants remain eligible.
- Package stock data is migrated by year so donation/package reporting stays aligned with each event.
