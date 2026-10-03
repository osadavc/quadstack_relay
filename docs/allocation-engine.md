# The planning and allocation engine

`packages/engine` assigns orders to vehicles and trips, times every stop, and defers what cannot go, with a reason for each deferral. Relay uses **assisted planning**: the engine builds the plan automatically, a person decides the cases that need judgement (a second skip for the same outlet), and the dispatcher can move or defer any order by hand, with every move validated against the same rules.

It is pure TypeScript with no I/O: the same input always gives the same plan. Tests run it with `bun test` on the real outlets and vehicles with test orders.

## Rules every plan respects

| Constraint | How it is enforced |
| --- | --- |
| Weight and volume | Each trip's total weight and volume must fit the vehicle (`vehicles.csv`) |
| Temperature | Chilled orders only on reefers; reefers may also carry ambient goods |
| Outlet access | `van_only` outlets only by van; mall outlets only inside the mall window (their delivery window in `outlets.csv`) |
| Delivery windows | Every stop is reached at or before its window closes; a truck that arrives early waits for the window to open. Fresh windows close by 08:00, so the Fresh run must be done before stores open |
| Two trips a day | At most two trips per vehicle; trip 2 leaves after trip 1 is back. The booklet sets no reload time, earliest departure or latest return, so none is imposed (they are settings the engine accepts) |
| Fuel quota | A vehicle's litres for the day (round-trip km over its km/L) plus what it already used since Monday must stay inside its weekly quota |
| Home depot | A vehicle serves only its own depot's outlets |
| One district, one brand per trip | A trip leaves the depot, serves outlets in one district for one brand, and returns. `district_travel.csv` gives travel from the depot to a district and between stops within it, not between districts |
| Whole orders | An order is never split across trips; an order larger than any vehicle is deferred with a reason so the store can split it |
| Vehicles in the workshop | Excluded for the day (`vehicle_days`) |

Travel times are the free-flow minutes in `district_travel.csv` (depot to district, then between stops), and each stop takes the handling allowance for its brand and dock type in `service_allowance.csv`. Two orders for the same outlet are one stop.

## How a plan is built

1. **Person decisions first.** Pins from the fairness guard or manual moves are placed before anything else and never undone by a re-run.
2. **Priority order.** Orders are ordered by the policy. **Protected** outlets, those skipped two runs in a row, always go first.
3. **Cheapest feasible move.** Each order either joins a trip already going to its district, or opens a trip on a vehicle with a slot left. The cost favours fewer stops and kilometres, and vehicles whose capacity matches the district's remaining demand.
4. **Protected resources.** On the first pass reefer space is kept for chilled goods (an ambient order rides along only with the same outlet's chilled order, saving a stop) and vans are kept for van-only outlets. A second pass offers leftover space to everything.
5. **Many passes.** The construction runs 240 times with seeded random tie-breaks and with each policy's ordering. The chosen policy's score picks the winner.
6. **Local improvement.** A deferred order may take the place of a lower-value served order if that improves the score; a trip whose orders all fit into spare space on trips to the same district is folded away, freeing a vehicle.
7. **Sequencing.** Within a trip, outlets are visited in the order that finishes earliest (earliest-closing, earliest-opening and chilled-first orderings are compared); on a tie, chilled goods come off first.
8. **Reasons.** Every deferred order is re-tried against every vehicle that could legally carry it, and the blocking rules are summarised in one line for the dispatcher and the store: "Gampaha reefer trip full (28.7 of 33.4 m³)", "Every reefer at its trip or time limit before 07:30", "Van-only outlet · reefer van trips full", "40.7 m³ is larger than any vehicle (38.0 m³). Needs splitting".

## Policies

| Policy | Ranks orders by | Score |
| --- | --- | --- |
| Fairness first (default) | Protected outlets, then chilled, Fresh, skipped last run, days since served, size | Value of orders served (chilled worth more, plus a little for long gaps), then fewest vehicles, then fewest km |
| Fill reefers first | Chilled volume | Chilled volume delivered before 08:00 |
| Shortest routes | Near districts first | Orders served, less distance |

Changing the policy re-runs the plan as a new draft and keeps every person decision.

## The fairness guard

Deferrals made under pressure can leave the same outlet unserved on consecutive runs. Relay's rule:

- An outlet **skipped two runs in a row is protected**: the engine serves it before anything else.
- A **second skip in a row is never decided by the engine.** If the best plan would skip an outlet that was skipped on the last run, the plan cannot be published until a person decides. The engine hands over the options it has already checked:
  - **Swap** with an order on the same trip whose outlet was served last run, with the trip's load and timing after the swap;
  - **Redirect a trip**: send one of a reefer's trips to that district instead, filled with the orders waiting there, skipped outlets first. The orders taken off are offered back to the fleet so the option shows its real effect, and an option that would skip a protected outlet again is shown but cannot be chosen;
  - **Add to another vehicle**, with every rule that blocks it;
  - **Defer again**, with a reason the area manager sees.

  The decision, the person and the reason are kept on the record (`decisions`, and the event log), and the chosen option becomes a pin for every later re-run.

## Manual planning with validation

On a draft, the dispatcher can open any trip and move an order to another vehicle or defer it. `moveOptions` checks every vehicle at the depot against the full rule set and lists the ones that fit (with the load after the move) and, for the rest, the rule that blocks them. A move becomes a pin and the rest of the plan is re-fitted around it.

## Validation

`validatePlan` re-checks a finished plan from the raw tables without using the scheduler: depot, temperature, access, brand and district per trip, weight, volume, two trips, trip 2 after trip 1 plus reload, every window re-timed stop by stop, fuel quota, and that no order is planned twice. The tests run it on every policy, and the app runs it again before a plan can be published.

## Stable re-runs

A re-run after a decision or a manual move starts one of its passes from the plan being replaced: last time's orders go back on their vehicles first, then the rest are placed. Every order that moves costs value in the score, so a re-run only reshuffles when that gains more than it disturbs. Deferring one order changes that order and nothing else unless the freed space lets a waiting order in.

A run takes about a third of a second.

## Tests

`packages/engine/test/engine.test.ts`, run with `bun test`:

- every policy's plan passes the independent validator, and every order is served once or deferred with a reason;
- a day with more chilled demand than the reefers carry defers orders, each with a reason;
- the protected outlet is served; second skips produce a decision with options; an oversize order is deferred;
- the same input gives the same plan; pins survive a re-run; deferring one order moves nothing else;
- chilled on a dry truck, a truck at a van-only outlet, over capacity, a missed window and an exceeded fuel quota are each refused, and move options name the blocking rule.
