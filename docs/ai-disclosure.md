# AI tool disclosure

## In the product

Relay uses no AI at run time. There are no language models, no machine-learning models and no external AI APIs in the system. The planner is a deterministic heuristic (priority-ordered construction, multi-start, local improvement and an independent validator, described in [allocation-engine.md](allocation-engine.md)): the same orders and fleet always give the same plan, and every deferral has a rule-based reason.

## In building it

We used **Claude Code** (Anthropic, Claude Opus models) as a coding assistant throughout the Hackathon. **OpenAI Codex** assisted with the operating-constraint audit, frozen-order support, depot-specific order closure, outdated-draft publishing checks and their regression tests and documentation. The seeded delivery-day work remains deferred.

| Work | How AI was used | What we did |
| --- | --- | --- |
| Product scope and design | Not used to decide scope. The Hackathon build implements our Day 5 Designathon design (its own AI disclosure covers the design work) | We chose the problems to solve, the four personas, the screens, the degradation scenarios and the fairness rule (a second skip needs a person) |
| Data | Assisted: the loader for the General Data files | We decided which files the Hackathon uses, following the booklet: outlets, vehicles and calendar, plus district travel and service allowance for windows and fuel. No Training, Test or other Datathon data, and nothing invented |
| Planning engine | Assisted: code for scheduling, allocation, the fairness guard, the validator and tests | We set the rules and policies, reviewed plans on the real data, and changed the design when results were wrong (for example sequencing by window, a 45-minute reload, per-outlet skips, the redirect option, stable re-runs) |
| Backend and database | Assisted: schema, migrations, seed, services, the offline sync protocol | We reviewed the data model, idempotent sync and reconciliation behaviour against the full flow |
| Screens | Assisted: porting the Day 5 screens to real data, phone layouts | We checked every screen against the Figma file at desktop and phone sizes |
| Docs | Assisted: first drafts of the README and the docs in this folder | We edited them for accuracy |
| Verification | Assisted: a script that drives the full flow through the services, headless-browser screenshots at phone and desktop sizes | We ran the flow end to end and reviewed the results |

The assistant worked inside this repository with access to the datasets, the challenge booklet and our design files. All generated code was run, tested and reviewed before it was kept. Nothing was copied from other teams or published solutions.
