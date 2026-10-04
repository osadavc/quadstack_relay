# Finalized database overview

The supplied Supabase database contains an exact snapshot of the finalized local Relay application data. A native PostgreSQL export and transactional import preserved existing ids, timestamps, password hashes, relationships, JSON records, media and sequence states. The ordinary demo seeder was not rerun, so it did not replace the existing delivery history or regenerate account passwords.

## Contents

| Area | Records |
| --- | ---: |
| Depots | 2: Peliyagoda and Kandy |
| Districts | 12 |
| Outlets | 120: 80 Fresh, 25 Style, 15 Tech |
| Vehicles | 60: 52 trucks and 8 vans; 16 refrigerated vehicles |
| Products | 65: 64 active and 1 inactive |
| User accounts | 7 active: 1 dispatcher, 1 loader, 2 drivers and 3 store managers |
| Orders | 138 |
| Order lines | 712 |
| Calendar dates | 910, from January 1, 2024 through June 28, 2026 |
| Service-history records | 274, all recorded as served in the local snapshot |
| Events | 148 |

## Delivery days

| Delivery day | Status | Orders | Outlets | Weight | Volume |
| --- | --- | ---: | ---: | ---: | ---: |
| October 6, 2026 | Received | 1 | 1: OUT065 | 163.3 kg | 0.798 m³ |
| October 7, 2026 | Confirmed, ready for planning | 137 | 89 | 111,123.7 kg | 602.862 m³ |

The October 6 order retains its published plan, completed trip and stop, six load units, receipt, two media records and offline synchronization records. The October 7 orders contain 706 product lines: 80 Fresh ambient orders, 40 chilled, 8 frozen, 5 Style and 4 Tech. Both OUT074 orders retain their VEH007 planning reservations.

There are no loading shortfalls, reconciliations, reported issues, dispatch messages or vehicle-workshop entries in this snapshot. The database contains five notifications, four applied offline client records and one fuel-log entry.

## Accounts

| Person | Email | Role | Assignment |
| --- | --- | --- | --- |
| Gayan Gimhana | `gayan@waypoint.lk` | dispatcher | Peliyagoda |
| Gayashan Gamage | `gayashan@waypoint.lk` | loader | Peliyagoda |
| Nimal Vidath | `nimal@waypoint.lk` | driver | VEH007 |
| Yoshitha Dissanayake | `yoshitha@waypoint.lk` | store | OUT074 |
| Kanishka Perera | `kanishka@waypoint.lk` | store | OUT053 |
| Osada Sethum | `osada@waypoint.lk` | driver | VEH035 |
| Thenul Bandara | `thenul@waypoint.lk` | store | OUT065 |

Each account retains its exact local password hash, title, phone number, active state and assignment. Existing local credentials work against the copied records; passwords were not reset to `SEED_PASSWORD`.

## Verification and scope

Verification compared all **33 application tables and 2,488 rows**, including the Drizzle migration history. Every table passed a SHA-256 comparison of canonical, complete row values. Time-zone, floating-point output and ordering settings were normalized for comparison; stored values were preserved.

The schema comparison also matched 315 columns, 93 constraints, 51 indexes, 8 enum types and all 5 sequence definitions and current states. The three migration records were copied exactly. [Verification details](database-verification.json) contain counts and table fingerprints, without password hashes, database credentials or media contents.

The copied schemas are `public` (32 Relay tables) and `drizzle` (one migration table). Supabase-managed `auth`, `storage`, `realtime` and `vault` schemas were retained. Access to imported Relay tables and sequences is limited to the database owner, matching the local database-only access model; Supabase API-role grants automatically added during table creation were removed from these imported objects.

This is a verified snapshot, not an ongoing replication connection. The local `.env` and application database configuration were not changed. Future local or remote writes require another deliberate synchronization if the two databases must continue to match.

## Table inventory

| Schema | Table | Rows |
| --- | --- | ---: |
| `drizzle` | `__drizzle_migrations` | 3 |
| `public` | `calendar` | 910 |
| `public` | `client_records` | 4 |
| `public` | `decisions` | 0 |
| `public` | `depots` | 2 |
| `public` | `districts` | 12 |
| `public` | `events` | 148 |
| `public` | `fuel_log` | 1 |
| `public` | `issues` | 0 |
| `public` | `load_units` | 6 |
| `public` | `media` | 2 |
| `public` | `messages` | 0 |
| `public` | `notifications` | 5 |
| `public` | `ops_state` | 1 |
| `public` | `order_lines` | 712 |
| `public` | `orders` | 138 |
| `public` | `outlets` | 120 |
| `public` | `pins` | 2 |
| `public` | `plan_assignments` | 1 |
| `public` | `plan_stops` | 1 |
| `public` | `plan_trips` | 1 |
| `public` | `plans` | 1 |
| `public` | `products` | 65 |
| `public` | `receipts` | 1 |
| `public` | `reconciliations` | 0 |
| `public` | `service_allowances` | 9 |
| `public` | `service_log` | 274 |
| `public` | `shortfalls` | 0 |
| `public` | `stop_runs` | 1 |
| `public` | `trip_runs` | 1 |
| `public` | `users` | 7 |
| `public` | `vehicle_days` | 0 |
| `public` | `vehicles` | 60 |
