# AI tool disclosure

Relay uses no AI at runtime. Its planner follows fixed rules and produces the same plan for the same inputs.

We used **Claude Code** (Anthropic, Claude Opus models) minimally during the Hackathon for coding help, tests and documentation. We made the product and engineering decisions, reviewed the code and tested the final system.

**OpenAI Codex** assisted with the operating-constraint audit, frozen-order support, depot-specific order closure, outdated-draft publishing checks, and their regression tests and documentation. Codex also inspected the local database and booklet to create and validate the realistic delivery-day seed, added the three extra local users to the seven-account seed, documented the dataset and judge walkthrough, and copied the finalized local application data to the supplied database with table and schema verification.

The shared network uses the permitted General Data files. The product catalogue, delivery-day demand and labelled service history are illustrative synthetic demo data, described in [the demo dataset](demo-dataset.md), to satisfy the Hackathon seeded-day requirement. No Datathon training or test orders were imported, and nothing was copied from other teams or published solutions.
