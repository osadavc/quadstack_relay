# Relay

Delivery planning for Waypoint Group, from the store's order to the receipt at the outlet. One system for dispatchers, loaders, drivers and store managers, where every handoff is recorded.

Relay is our Hackathon build for Tech-Triathlon 2026, following our Designathon design. It contains:

- a planner that respects every operating constraint and gives a reason for every deferral;
- a fairness guard that hands any second skip to a person;
- a driver app that keeps working without signal;
- one shared record that all four roles write to.

- **Docs:** [data model](docs/data-model.md) · [architecture diagram](docs/architecture.png) · [offline sync diagram](docs/offline-sync.png) · [demo dataset](docs/demo-dataset.md) · [database snapshot](docs/database-overview.md) · [AI tool disclosure](docs/ai-disclosure.md)

## Run it

### Docker (the whole stack)

```bash
cp .env.example .env   # optional: every value has a working default
docker compose up --build
```

Open http://localhost:3000. Compose does three things:

1. starts Postgres;
2. runs a one-off `setup` job that applies the migrations, then loads the General Data files, seven accounts, demo products and a realistic delivery day into an empty database; on an existing database it adds only missing seeded accounts;
3. starts the app.

### Local development

Requires [Bun](https://bun.sh) 1.4 and Docker for Postgres.

```bash
bun install
cp .env.example .env            # set DB_PORT if 5432 is taken, and DATABASE_URL to match
docker compose up -d db
bun run db:setup                # migrations, reference data, accounts, demo day
cp .env apps/web/.env.local
bun run dev                     # http://localhost:3000
```

`bun run db:setup` also works on an existing installation: it applies migrations and adds any missing seeded accounts by email, preserving existing profiles and passwords. To add the demo day without wiping your records, run `bun run db:seed-day`; see [Seeded delivery day](#seeded-delivery-day) for date selection and repeat behavior. `bun run db:wipe` empties every table and is only needed when intentionally starting over.

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://relay:relay@localhost:5432/relay` | Postgres connection |
| `AUTH_SECRET` | development value | Signs session cookies; set a long random string in production |
| `SEED_PASSWORD` | `relay2026` | Initial password for all newly seeded accounts; existing passwords are preserved |
| `POSTGRES_*`, `DB_PORT`, `WEB_PORT` | `relay`, `5432`, `3000` | Docker Compose |

## Accounts

Fresh installations include **seven accounts** from [`demo_users.csv`](packages/db/data/demo_users.csv): the four original walkthrough accounts and the three additional users created locally. Each newly seeded account gets the password from `SEED_PASSWORD` (`relay2026` by default). Everyone signs in at `/login`, lands on their own screens, and can change their password from the account menu.

| Role | Person | Email | Works at |
| --- | --- | --- | --- |
| Dispatcher | Gayan Gimhana | `gayan@waypoint.lk` | Peliyagoda |
| Loader | Gayashan Gamage | `gayashan@waypoint.lk` | Peliyagoda dock |
| Driver | Nimal Vidath | `nimal@waypoint.lk` | VEH007 |
| Store manager | Yoshitha Dissanayake | `yoshitha@waypoint.lk` | OUT074, Puttalam |
| Store manager | Kanishka Perera | `kanishka@waypoint.lk` | OUT053, Galle |
| Driver | Osada Sethum | `osada@waypoint.lk` | VEH035, Peliyagoda |
| Store manager | Thenul Bandara | `thenul@waypoint.lk` | OUT065, Kurunegala |

Use **Gayan, Gayashan, Nimal and Yoshitha** for the [judge walkthrough](#judge-walkthrough). Kanishka and Thenul can inspect and receive their outlets' orders; Osada can work trips assigned to VEH035. The seed preserves each account's title, phone number where supplied, active status, and depot/outlet/vehicle assignment. It generates password hashes from `SEED_PASSWORD`; local password hashes and account ids are not copied into the seed files. Changing `SEED_PASSWORD` affects newly created seed accounts, not existing logins.

Dispatchers add further users under **People**:

- choose the person's role;
- choose where they work: a depot, a vehicle or an outlet;
- give them a temporary password.

The same page switches accounts off and sets new passwords. If the database has no accounts at all, the sign-in page offers to create the first dispatcher. Every screen works on a phone and on a desktop.

## Data

Relay uses the competition's General Data files for the shared network. The Hackathon booklet (page 12) also requires at least one realistic seeded delivery day. Demo products, demand and recent service history are synthetic examples, described in [the demo dataset](docs/demo-dataset.md).

**Loaded (`packages/db/data`)**

| File | What it gives Relay |
| --- | --- |
| `outlets.csv` | The 120 outlets: brand, district, depot, dock type, van-only access, mall window and delivery window. An outlet is known by its id and district, as in the file. |
| `vehicles.csv` | The 60 vehicles: type, refrigeration, weight and volume limits, fuel economy, weekly fuel quota and home depot. |
| `calendar.csv` | Operating days, festivals and paydays. After the file ends, Monday to Saturday, as the booklet states. |
| `district_travel.csv` | Distance and free-flow minutes from the depot and between stops. The planner needs them to check delivery windows, trip times and fuel against the quota. |
| `service_allowance.csv` | Unloading minutes per brand and dock type, for timing each stop. |
| `demo_products.csv` | Demo catalogue: 60 active products from the local database plus four frozen products, each with a unit, weight and volume. |
| `demo_users.csv` | Seven demo accounts with their roles, contact details and depot, outlet or vehicle assignments. Passwords come from `SEED_PASSWORD`. |

The two depots are the ones these files name.

**Not loaded**

- `traffic_speed.csv` and `road_conditions.csv`: the booklet lists them as Datathon files and no Hackathon requirement needs them.
- Nothing from the Training or Test Data folders.
- No orders from Training or Test Data. Demo orders are generated locally, and outlets retain the shared file's identifiers and districts.

Orders are captured per outlet, day and temperature (chilled, frozen and ambient for Fresh, ambient for Style and Tech). Every vehicle has a weight and a volume limit, so each order carries its total units, weight and volume. Stores place orders in the app, and dispatch enters the ones that are phoned in.

## Seeded delivery day

The booklet requires the shared network and at least one realistic delivery day on a fresh installation. The seed provides **137 confirmed orders across 89 outlets and both depots**, with **706 product lines**. It starts at the planning stage; loaders, drivers and stores complete the remaining handoffs using the walkthrough.

| Brand and temperature | Orders | Why this amount |
| --- | ---: | --- |
| Fresh ambient | 80 | Every Fresh outlet receives daily dry-grocery replenishment. |
| Fresh chilled | 40 | Half the outlets have a separate chilled replenishment on this day. |
| Fresh frozen | 8 | A smaller frozen replenishment cohort. |
| Style ambient | 5 | One weekly replenishment cohort from the 25 Style outlets. |
| Tech ambient | 4 | As-needed appliances and televisions, generally one or two items. |
| **Total** | **137** | **89 distinct outlets; some Fresh outlets have multiple temperature orders.** |

Quantities vary by outlet and product. Van-only stores receive smaller drops; Style cartons use more volume per kilogram; Tech orders contain individual appliances. Every line has an integer quantity, and its weight and volume come from the product's per-unit values. Orders include app and phone channels with placement times before the preceding day's 16:00 cutoff. Two prior operating runs of labelled demo service history give the fairness guard context, including a previous chilled deferral at OUT077.

Both OUT074 orders are reserved for **VEH007**, connecting Yoshitha and Nimal for the four-role walkthrough. This reservation goes through the normal planning checks. The Tech cohort includes van-only OUT093 to exercise restricted-access capacity. For the local **October 7, 2026** example, planning serves all **84 Peliyagoda orders** and **52 of 53 Kandy orders**; OUT093 is deferred with a van-capacity reason. The day totals about **111,124 kg and 602.862 m³**. Allocation can change after edits to orders, fleet availability, fuel usage or policy.

### Loading and dates

```bash
bun run db:setup                   # fresh install: reference data, seven accounts, products and orders
                                  # existing install: migrations and missing accounts only
bun run db:seed-day                # add the demo day to an existing installation
bun run db:seed-day 2026-10-07      # optionally choose an unplanned operating date
```

The root commands read the root `.env` and apply pending migrations first. The default seed chooses the next operating day whose preceding-day 16:00 cutoff has not passed, skipping dates that already have plans. It uses `calendar.csv` while available and the application's Monday-to-Saturday fallback afterwards. All operational timestamps use Asia/Colombo time. Read the selected date in the app rather than assuming a fixed date on every fresh installation.

The inspected local database already had a completed October 6 delivery at OUT065, so the additional demo day was loaded for **October 7**. That existing order, its receipt, users, products and plan were preserved. It remains local history; fresh installations generate the confirmed demo day instead of copying the completed transaction.

Delivery-day loading is transactional and records a seed marker. Repeating `db:seed-day` without a date, or with the same explicit date, inserts nothing even after orders have progressed or been deferred. A different explicit operating date creates another demo day; the seed refuses dates that already have plans. Account seeding adds missing emails and leaves existing profiles, passwords and active states unchanged. Detailed assumptions and validation are in [the demo dataset notes](docs/demo-dataset.md); implementation is in [`reference.ts`](packages/db/seed/reference.ts) and [`delivery-day.ts`](packages/db/seed/delivery-day.ts).

## Products

The General Data files have no products. `demo_products.csv` seeds 64 illustrative products: the 60 active products from the local catalogue plus four frozen products. Dispatch keeps the product list under **Products** in the sidebar. Existing products are preserved when adding the demo to a populated database.

- **Add a product:** code, name, brand, temperature, what one unit is (a case, a carton, an item), and its weight and volume per unit. Style and Tech products are ambient only.
- **Import a CSV** with the header `sku,name,brand,temp,unit,weight_kg,volume_m3`. A row whose code exists updates that product, and nothing is saved if a row is wrong.
- **Edit or switch off a product.** A product that has been ordered is switched off rather than deleted. Changes apply to new orders; lines already ordered keep the figures they were placed with.

Where a brand has products for a temperature, the store's order form and dispatch's phone order list them with a quantity each, and the order's weight and volume are worked out from the per-unit figures. Each product becomes its own line, loaded, delivered and counted on its own. Where there are none, the form asks for the units, weight and volume directly.

**Planning rules**

Plans follow the constraints the booklet sets:

- weight and volume limits;
- refrigeration for chilled and frozen goods;
- van-only and mall access;
- delivery windows, with Fresh before 08:00;
- up to two trips per vehicle per day;
- weekly fuel quotas;
- each vehicle's home depot.

The booklet sets no earliest departure, reload time, latest return or spare vehicle, so the planner imposes none.

## A delivery day

Times in Relay are real Asia/Colombo time. A fresh install starts with 137 confirmed orders across 89 outlets, ready for planning. The seed chooses the next operating day whose order cutoff is still open; on an existing database it skips days with plans. The working day stays visible until its orders are handled.

**1. Order** · store manager, or dispatch for a phoned-in order

- As Yoshitha, open *Order*. The store orders for the next operating day. Orders close at 16:00 the day before; after that, new orders go to the following run.
- For each temperature, enter a quantity per product, or the units, weight and volume where the brand has no products yet. **Place order**.
- As Gayan, use **New phone order** on *Orders* to enter orders other outlets phone in. Planning against more demand than the fleet can carry shows deferrals and their reasons.
- The order screen shows the outlet's last runs and whether it is protected after missed deliveries.

**2. Plan** · dispatcher

- *Orders* shows the working day's queue, with each outlet's recent service.
- **Close orders and plan** closes the queue for that depot. Subsequent store and phone orders go to the next open operating run; other depots stay open until their cutoff or their own planning step.
- **Plan these orders** runs the planner in well under a second. The draft shows what is served, what is deferred and why, and the cold-chain fill.
- Open any trip to see its stops, load and fuel. **Move or defer** checks every vehicle and names the rule that blocks the ones that can't take an order.
- **Second skips.** If an outlet skipped on the last run would be skipped again, the plan holds for a decision. The engine has already checked the options: swap, send a reefer's trip there instead, add to another vehicle, or defer again with a reason.

**3. Publish** · dispatcher

- Publishing hands the trips to the dock and the drivers, and tells every store when its order arrives or why it moved.
- If orders or operating constraints have changed since the draft, publishing asks you to re-run the planner. Every current order must be served on its assigned trip or deferred with a reason.
- Deferred orders move to the next run with their reason.

**4. Load** · loader

- The dock lists the trucks in departure order. The load sheet runs in reverse stop order, so the first stop's goods are at the doors.
- **Flag a shortfall** before the truck leaves (damaged, missing, substituted, warm). The store, the driver and dispatch are told, and a credit is raised.
- **Release** takes the seal number, plus the reefer temperature for a refrigerated truck. The dock then shows a QR code and a four-digit code for the driver.

**5. Deliver** · driver

- The driver accepts the load with the code, or by scanning the QR code.
- On the road, the phone reports its position to dispatch while the driver allows location.
- Arrival, counts, a photo, the probe temperature and the receiver's signature save on the phone first. With no signal they wait in the outbox.
- When the signal returns, the outbox sends each record once. Dispatch sees a truck that has been silent for three minutes as out of contact.

**6. Receive** · store manager

- The store counts what arrived against what was loaded, less any credited shortfall, and adds a note or a photo.
- If the count differs from the driver's handover, the driver settles it in two taps; a disputed count goes to dispatch.

**7. The record**

- Every delivery has one record: ordered, loaded, delivered and received for each line, the evidence, any credits, and the log from all four roles, with offline records marked.
- Dispatch keeps the deferral record: every move, the decisions and who made them.

## What's in the box

| Area | Highlights |
| --- | --- |
| Dispatcher | Order queue with skip history and phoned-in orders; product list with CSV import; plan board with KPIs, timeline, deferral ledger, policy re-runs and validated manual moves; fairness guard decisions; live board sorted by attention, with last-known position and a feed from every role; messages to drivers; deferral record; fleet records with workshop status; people and accounts |
| Loader | Dock queue; load sheet in reverse stop order with a load map, on a phone too; shortfall report before departure; release with seal and reefer temperature, QR and code handover; plan changes highlighted per truck |
| Driver | Offline-first app: run with arrival bands, arrival, proof of delivery (counts, photo, probe temperature, signature), outbox, sync and reconcile, problem reports, messages from dispatch, location heartbeat |
| Store manager | Order before the cutoff, deferral notice, arrival window and handoff trail, receipt count with notes and photo, delivery record, issues, notifications |
| Engine | Capacity, refrigeration for chilled and frozen goods, van and mall access, delivery windows, two trips a day, weekly fuel quota, home depot, workshop vehicles; three policies; reasons for every deferral; fairness guard; stable re-runs; independent validator; 21 tests |

## Judge walkthrough

Use Gayan, Gayashan, Nimal and Yoshitha from the accounts table in separate browser profiles, or sign out between roles. On a fresh installation they use `SEED_PASSWORD`; an existing account keeps its current password. Read the actual delivery date shown in the app; the seed selects it at installation time.

1. **Dispatcher · Gayan:** select **Peliyagoda**, open **Orders**, and review the confirmed queue. Choose **Close orders and plan** with **Fairness first**. Verify that both OUT074 orders (ambient and chilled) are assigned to **VEH007**, Nimal's vehicle; the seed reserves this pairing for the walkthrough. Resolve any pending decisions with a feasible option or a stated reason, then publish. You can use **Move or defer** on other orders to demonstrate validated edits.
2. **Loader · Gayashan:** open the dock queue and the VEH007 load sheet. Start loading; optionally flag one damaged case on an OUT074 line to demonstrate the shortfall and credit. Load the remaining units, release with a seal number and reefer temperature, and copy the four-digit handover code. If VEH007 has two trips, load and release its first trip first; repeat these steps when the driver returns for the second.
3. **Driver · Nimal:** accept using that code, depart, and follow the stop sequence. If OUT074 is on the second trip, finish the first trip and accept the second load before continuing to OUT074. Record arrival and handover counts, temperature, a delivery photo and receiver signature. To demonstrate recovery, record the stop with connectivity disabled after the run is loaded, restore connectivity, and sync the outbox. Finish the other stops on the run if present.
4. **Store manager · Yoshitha:** open **Today** at OUT074. Review the ETA, shortfall notice (if raised), and delivery record. Confirm each order using the actual delivered counts. If you enter a different count, return to Nimal to reconcile it, then inspect the shared record.
5. **Dispatcher · Gayan:** switch to **Kandy** and plan its queue. The demo day exercises van capacity: some demand is deferred with a reason while most deliveries are served. Review the prior skip at OUT077, any fairness decisions, and the deferral notice/next run after publication. Switch back to Peliyagoda to inspect the live delivery trail.

## Departures from the Designathon submission

- **Reference data comes from General Data.** Outlets retain their ids and districts. Products and orders are illustrative seed data so a judge can start the required delivery workflow on a fresh install; they are not imported Datathon orders.
- **The fairness decision** has one more option than the design: **redirect a reefer's trip** to the skipped outlet's district, with its knock-on effects checked.
- **Manual planning** on the plan board is new: move or defer an order and see the rule that blocks each vehicle that can't take it.
- **Deferrals** in the dispatcher's navigation opens the deferral record rather than the decision sheet.
- **Deferred orders move.** A published deferral moves the order to the next run, where it is planned again with that run's orders.
- **Responsive throughout.** Every screen designed for a phone also works on a desktop, and every desktop screen works on a phone.
- **People, products and phoned-in orders** are new screens for dispatch.

## Project structure

```
apps/web              Next.js 16 app: screens, server actions, route handlers, services, read models
  src/app             routes per role: /dispatcher, /loader, /driver, /store, /login, /api
  src/server          services (planning, dock, driver, store, ops, admin), clock and working day, progress
  src/server/queries  one read model per screen
  scripts             check-flow.ts (end-to-end service check), session.ts (a session cookie for curl)
packages/engine       planner, fairness guard, validator, tests
packages/db           Drizzle schema, migrations, seed (General Data, seven accounts, demo catalogue and delivery day), wipe
packages/domain       order rules and time helpers
docs                  architecture, data model, allocation engine, AI tool disclosure
```

## Tests and checks

```bash
bun run test                                        # engine constraints and realistic seed demand/planning checks
bun run lint                                        # biome
cd apps/web && bunx tsc --noEmit                    # types
cd apps/web && bun scripts/check-flow.ts --reset    # the whole flow through the real services (empties the database first)
```

`check-flow.ts` empties the database, loads the data and accounts, and places test orders with more chilled volume than the reefers carry. Then it runs the whole flow end to end:

- order and plan, then decisions and publish;
- load, shortfall and release;
- accept, then an offline handover;
- the store's receipt, sync and reconciliation.

The publishing and order-closure regressions can also be checked on an **empty, disposable database**. Apply the migrations first, then run `bun scripts/check-constraints.ts` from `apps/web`, setting both `DATABASE_URL` and `CONSTRAINT_CHECK_DATABASE_URL` to that database. The script refuses a database with existing reference data and does not wipe anything.

Migration `0002_operating_constraints` adds frozen temperatures and the draft's input hash. `docker compose up --build` applies it through the setup job; an existing draft created before this migration needs to be re-run before publishing.

The datasets are competition data. Keep the repository private and share it with the judges.
