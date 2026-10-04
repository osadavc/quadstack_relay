# Realistic seeded delivery day

The booklet's Hackathon requirements (page 12) call for the shared datasets and at least one realistic delivery day. This seed adds illustrative operational demand; the shared 120 outlets, 60 vehicles, districts, depots, access restrictions and delivery windows retain their supplied values. It does not use Datathon training or test orders.

| Order stream | Orders | Rationale |
| --- | ---: | --- |
| Fresh ambient | 80 | Dry-grocery replenishment for every Fresh outlet on an operating day |
| Fresh chilled | 40 | Separate cold replenishments at half the stores, rather than all stores every day |
| Fresh frozen | 8 | A smaller frozen replenishment cohort |
| Style ambient | 5 | One weekly cohort from the 25 Style stores |
| Tech ambient | 4 | As-needed appliance deliveries, usually one item, with one two-TV order |
| **Total** | **137** | **89 outlets across both depots** |

The orders contain about 700 product lines, using integer case/carton/item quantities. Each line snapshots its product's name, unit, weight and volume; order totals are the sums of its lines. Restricted stores receive smaller drops so an individual order fits an eligible van. Style's cartons consume considerably more space per kilogram than groceries. Tech includes refrigerators, washing machines, air conditioners and televisions. The Tech cohort always includes van-only OUT093, making restricted-access capacity visible.

`packages/db/data/demo_products.csv` contains the user's 60 active local catalogue entries plus four illustrative frozen products. They are demo assumptions, not products specified by the competition. Existing catalogue entries, including deactivated products, are never overwritten. Two prior operating days of labelled synthetic service history support the fairness view; OUT077 has a prior chilled deferral. These are service summaries, not fabricated proof-of-delivery records.

`packages/db/data/demo_users.csv` seeds seven accounts: the original four walkthrough roles, plus Kanishka at OUT053, Osada on VEH035, and Thenul at OUT065. Titles, supplied contact details, assignments and active status match the local profiles. New accounts use `SEED_PASSWORD`; existing profiles and passwords are preserved by email. Local account ids and password hashes are not exported. `bun run db:setup` adds missing seed accounts to existing installations without replacing their delivery data.

The seed reserves OUT074's ambient and chilled orders for VEH007, linking Yoshitha's outlet and Nimal's vehicle for the four-role walkthrough. This is a labelled demo planning reservation; it still passes the normal capacity, access, time and fuel checks. VEH007 may have two trips, so the driver completes its first trip before accepting the next one. Plans, loads, handovers and receipts are created by following the README walkthrough.

## Dates and safe loading

On a fresh installation, the seed selects the next operating day whose preceding-day 16:00 cutoff has not passed. The calendar file is used where available, with the application's existing Monday-to-Saturday fallback afterwards. Confirmed orders have illustrative placement times between 09:00 and 15:59 on the preceding day. All operational timestamps use Asia/Colombo wall-clock time.

On an existing installation, dates that already have plans are skipped. In the inspected local database, October 6, 2026 already had a published and completed OUT065 delivery, so the new day is **October 7, 2026**. Its orders total approximately **111,124 kg and 602.862 m³** across the network. This is one network-wide day, rather than a large historical dataset.

Fresh installation: `bun run db:setup`, or the normal Docker Compose setup service. Existing database: `bun run db:seed-day`. Optional explicit date: `bun run db:seed-day YYYY-MM-DD`. Root commands load the root `.env` and apply migrations first. Loading is transactional, preserves existing orders and products, and records a seed marker. A repeat inserts nothing, including after the day's orders have progressed or been deferred.

## Validation

- Product totals, brand/temperature consistency, integer quantities and placement before cutoff are checked.
- All three planning policies pass the independent validator for both depots. The October 7 day serves all 84 Peliyagoda orders and 52 of 53 Kandy orders, with one van-capacity deferral.
- Each individual order fits an eligible vehicle across all six weekday cohorts. Deferrals arise from shared operating capacity, rather than deliberately impossible orders.
- A fresh, temporary database was migrated and seeded, then tested through planning, publication, loading, release, both VEH007 trips, offline proof of delivery, duplicate sync and receipt of both OUT074 orders.
- Repeated seeding inserts zero rows. All original local orders, lines, catalogue entries, accounts, plans, trips and receipts were checked for preservation.
