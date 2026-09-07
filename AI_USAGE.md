# AI Usage

How AI was used to build this project, where it helped, where it was wrong, and how the result was verified.

The brief said AI tools are welcome and that what matters is how they are steered, questioned, and turned into something shippable. This document is written in that spirit: it includes the places where the AI produced work that looked finished and was not, because those are the more useful data points.

---

## Which AI tools I used

| Tool | Role | Output |
| ---- | ---- | ------ |
| **OpenAI Codex** | Requirements and architecture drafting | First drafts (v1.0) of the PRD, technical spec, backlog, and design notes |
| **Claude Code** (Opus 5 / Sonnet 5) | Design interrogation, implementation, testing, debugging, documentation | Everything in this repository, plus the v1.1 rewrite of the planning notes |

Two tools, split by phase rather than used interchangeably. The planning documents live outside the repository (they are gitignored — a reviewer sees the README, not a 500-line internal PRD), so this is the only place their existence is recorded.

### Phase breakdown

| Phase | Tool | What it produced |
| ----- | ---- | ---------------- |
| Read and analyse the brief | Codex | Requirement extraction, ambiguity list |
| PRD, technical spec, backlog, design notes (v1.0) | Codex | ~1,700 lines of planning across four documents, including business rules BR-01…BR-14, functional requirements FR-01…FR-10, and 18 acceptance scenarios AT-01…AT-18 |
| Design interrogation | Claude Code | A structured interview that surfaced 10 unresolved architecture decisions, one question at a time |
| Rewrite planning notes to v1.1 | Claude Code | Reconciled all four documents with the decisions from the interview |
| Project conventions | Claude Code | `CLAUDE.md` — language rules, git workflow, security constraints, and the non-negotiable invariants |
| Implementation | Claude Code | Schema, migrations, seed, service layer, Route Handlers, three pages |
| Tests | Claude Code | 13 unit + 21 integration tests |
| Debugging | Claude Code | Schema type mismatches, the concurrency harness, migration ordering |
| README and this file | Claude Code | Reviewer-facing documentation |

---

## What I used AI for

**Drafting the specification.** The four planning documents were AI-drafted from the brief. The value was not the prose — it was being forced to answer questions like "what happens when a mock failure response arrives after the booking is already confirmed?" before writing a line of code. The acceptance scenarios AT-01…AT-18 came out of that phase and became the test plan verbatim.

**Generating the schema and migrations.** Six tables, six enums, foreign keys, indexes, and the four raw-SQL constraints that Prisma's schema language cannot express (a partial unique index and three CHECK constraints).

**Writing the transaction logic.** The lock ordering, the `ON CONFLICT DO NOTHING` idempotency claim, and the branch table for the five operation result codes.

**Writing the tests.** All 34, including the concurrency harness — which is also where the AI failed most instructively.

**Debugging.** Consistently the highest-value use. Several failures in this project had misleading symptoms, and having a tool that will methodically bisect a hypothesis space is genuinely faster than doing it alone.

**Documentation.** The README, this file, and the code comments.

---

## Where AI moved me faster

**The six-table schema with its non-obvious constraints, in one pass.**

The data model is not large, but it has details that are easy to get wrong and expensive to discover late:

- a partial unique index (`WHERE result = 'succeeded'`) enforcing at most one successful payment per booking, which cannot be expressed as a plain unique constraint;
- a biconditional CHECK tying `confirmed_at IS NOT NULL` to `status = 'confirmed'`, so the two can never disagree;
- a CHECK matching each attempt `result` to its legal `reason`, written with enum comparisons so no branch passes by being NULL;
- a **composite** foreign key from `payment_attempts (operation_id, booking_id)` to `payment_operations (operation_id, booking_id)` — not the obvious single-column FK — so an attempt physically cannot reference another booking's operation receipt.

That last one is the sort of thing I would plausibly have shipped as a single-column FK and only noticed under review. Getting all four right in the first migration meant the subsequent tests were written against a schema that already made the illegal states unrepresentable.

Same category of speed-up: knowing up front that Prisma's interactive `$transaction` defaults to a 2-second `maxWait` and 5-second `timeout`, and that both must be raised or the concurrency test fails on a Prisma timeout rather than on the logic under test. That is a 20-minute debugging session avoided by a sentence of advice.

---

## Where I disagreed with, corrected, or rejected AI output

### 1. The design interview: I rejected the recommendation to cut test coverage

Before any code, I ran a structured design interview against the planning documents — the AI asking one question at a time, each with its own recommended answer, walking down the decision tree.

The tension it surfaced was real and the backlog admitted it in writing: the estimated work was **366 minutes against the brief's 240-minute cap**. Something had to give, and the interview put the options on the table. The timebox-rational answer was to automate only the critical subset — the race, capacity, idempotency — and cover the remaining acceptance scenarios with written manual verification steps.

**I rejected it.** My answer was that all 18 scenarios get automated, and then, when asked what else should be trimmed to make room: *"gausah ada yang di potong"* — nothing gets cut.

**Why I overrode the recommendation.** The brief's own evaluation criteria rank "sensible tests or verification" and "correctness under payment and double-booking edge cases" above feature breadth and frontend polish, and it says so explicitly. Trading tests for time would have sacrificed exactly what is being graded in order to protect things the brief states it does not care about. A written manual verification step is a *claim* that something works. An automated test is *evidence*. For a submission whose entire thesis is "this system is correct under concurrency", claims are not good enough.

If the timebox had forced a cut, the right thing to lose was UI polish — which is what the backlog's cut-order already said, and which is the order I held to.

I made the same call on a second question: the AI offered a simplification from six tables to five, folding the operation ledger into the payment attempts table. I kept six. The separate `payment_operations` ledger is what makes idempotency provable — it is the row that lets a replayed request be answered from storage without re-running anything, and it is what allows an operation to be recorded as `already_confirmed` with no attempt attached. Merging it would have saved a table and cost the guarantee.

**This decision is the reason the next failure was caught at all.** The test I insisted on automating is precisely the test that turned out to be lying.

### 2. The concurrency test that passed while proving nothing

This is the most important correction in the project.

The AI wrote the AT-07 barrier test to the design we had agreed: a guard connection takes `SELECT … FOR UPDATE` on the class row and holds it; two independent Prisma clients call `finalizeMockPayment` concurrently and should both block; an observer polls `pg_stat_activity` until both workers report `wait_event_type = 'Lock'`; the guard commits; assert exactly one winner.

**The suite reported green.** The assertions on the outcome — one `confirmed`, one `class_full`, roster exactly 4 — all passed.

They passed because they would pass under *sequential* execution too. The workers were never actually contending. The observer had not confirmed the blocked state, and the test did not fail when it could not.

I pushed back with three words: *"ini engga di tes"* — this isn't actually being tested.

**What the investigation found**, after roughly 40 minutes and about ten throwaway diagnostic scripts, checking `pg_locks` from an independent third connection:

> A raw `pg.Client` holding `FOR UPDATE` in the **same Node process** as a Prisma client using `@prisma/adapter-pg` did **not** block that Prisma client. The worker showed `granted: true` immediately, and the guard's lock never appeared as a tuple lock under its own verified `pg_backend_pid()`.

The reverse combination worked correctly (Prisma holds, raw `pg` waits), and raw-holds-raw-waits worked correctly. Only the specific arrangement the test depended on was broken.

**The fix** was to move the guard into a genuinely separate OS process via `child_process.spawn` (`tests/helpers/guard-lock-process.ts`). The workers then measurably blocked for the guard's hold duration, and the test began proving what its name claimed.

**A second bug surfaced during the fix**, and it is a good illustration of how a test can be wrong in more than one way at once:

```js
// Wrong: by the time this runs, Promise.all has already resolved.
// If the guard has exited, the event fired and was lost — EventEmitter
// does not replay past events — and the test hangs for the full timeout.
await new Promise((resolve) => guard.on("exit", resolve));
```

The listener was registered too late. Every assertion passed and the test still hung for its entire 20-second timeout. The fix was to create the `exited` promise at spawn time, before anything could race it.

**What I took from this:** a passing test is not evidence of anything by itself. A test that *cannot fail* is worse than no test, because it converts "unverified" into "verified" in your head. If I had accepted the AI's green checkmark, the single headline claim of this submission — that the last-seat race is handled and proven — would have been false, and I would have said it in a video with total confidence.

### 3. Smaller corrections

Each of these was AI-generated code or configuration that was wrong, and had to be caught and fixed:

| What the AI produced | Why it was wrong | Correction |
| -------------------- | ---------------- | ---------- |
| `prisma init` installed **8.0.0-rc** | A release candidate pulled in silently on a take-home with a hard deadline | Pinned to stable `7.10.0` |
| Schema without `@db.Uuid` on ID/FK columns | Prisma emitted `text` columns; `SELECT … WHERE id = $1::uuid FOR UPDATE` failed with `operator does not exist: text = uuid` | Added `@db.Uuid` throughout, regenerated the migration |
| `@default(now())` on operation/attempt timestamps | `now()` is fixed at transaction start. A finalisation timestamp must reflect the moment **after** waiting for the lock, or two racing operations get identical times | `@default(dbgenerated("clock_timestamp()"))` |
| `reset-demo.ts` deleting four hardcoded booking IDs | Left orphan rows whenever manual testing created new bookings against the fixture classes, which then broke the foreign-key deletion order | Delete by `trialClassId`, not by a hardcoded list |
| The identical bug in the test helper's `cleanupScenario` | Inferred parents from existing bookings, so it missed any case where a booking was correctly rejected before a row was written | Delete via the scenario's own `parentId` |
| `prisma migrate dev` for a column rename | Prisma's diff engine treats a rename as a destructive DROP + ADD, which would have dropped the data | Hand-wrote `ALTER TABLE … RENAME COLUMN`, then verified the whole migration applied cleanly in one pass against a throwaway database before trusting it |
| React effects calling a named async helper | React 19's `react-hooks/set-state-in-effect` traces the *closure*, not just syntactic position | Inlined the fetch logic as anonymous async IIFEs inside each effect |
| `Date.now()` in a component render body | `react-hooks/purity` — impure during render | Computed inside the effect that loads the booking, stored as state |
| `navigator.clipboard.writeText()` with no catch | An unhandled promise rejection. When the browser denies clipboard permission the button silently did nothing — no copy, no error, no feedback | `try/catch` with a visible "Couldn't copy" state |
| Next.js 16 auto-writing agent rules into `CLAUDE.md` | The tooling was mutating my own instruction file mid-session | `agentRules: false` in `next.config.ts` |

### 4. Two things I stopped for rather than let the AI work around

**The `.env` file changed on its own.** Mid-session the environment file contained a different port, database name, and password than it had previously, plus a malformed quote. The tempting move is to accept whatever is in the file and carry on. Instead I stopped, inspected the running container directly with `docker inspect`, found that the password in the file was simply **wrong**, and used the independently verified credentials. What wrote the file was never established.

**An unexplained booking appeared.** A stray `pending_payment` booking showed up against fixture data with no corresponding request in the browser's own network log and no attached payment operation or attempt. It violated no invariant — the audit queries stayed clean — so it was cosmetic pollution rather than a correctness bug. I recorded it as unexplained rather than quietly deleting it and moving on. It remains unexplained.

Neither of these produced a feature. Both are here because "the AI produced something plausible and I accepted it" is the failure mode this project was most exposed to.

---

## What I would change about my AI workflow

**1. Make every safety-critical test prove it can fail, before trusting it.**
The single highest-leverage change. For any test whose entire purpose is catching a race, a deadlock, or a constraint violation, I would remove the protection and confirm the test goes **red** before believing it when it goes green. Applied to AT-07, that check would have taken two minutes and caught the fake pass immediately, instead of forty minutes of investigation triggered by a hunch.

**2. Ask the AI to argue against its own test.**
"How could this test pass while proving nothing?" is a question worth asking every time, and one that AI answers well when prompted — it just does not volunteer it.

**3. Keep one source of truth for design decisions.**
Splitting documentation (Codex) from implementation (Claude Code) worked well for the initial thinking, but the documents drifted from the code. The technical spec still describes `price_idr` and a `currency = 'IDR'` constraint that were later changed to SGD, and still states that the demo reset "is not available as a browser endpoint" — which stopped being true when I added it. Either update the spec in the same change as the code, or accept that once implementation starts the code becomes the specification and let the older document go stale deliberately, in writing.

**4. Verify the documented setup path early, not at the end.**
Every command in this repository was developed against a pre-existing local database, not against the container that `npm run db:up` actually creates. That container did not exist until the very end of the project, when I created it from scratch and ran the whole documented sequence — migrate, seed, verify, full integration suite — to confirm the instructions were real. It worked, but it worked by luck. A reviewer's first five minutes is the setup path, and it should be tested on day one.

**5. Pin dependency versions in the first commit.**
A release candidate got installed silently. On a timeboxed project, an unstable major version is a risk with no upside.

**6. Give the AI constraints, not conclusions.**
The most valuable output in this project came from the structured interview format — one decision at a time, each surfaced explicitly and answered deliberately — rather than from open-ended "build me a booking system" prompting. The interview is also what made the disagreement in section 1 possible: I could only reject a recommendation because the tool put a specific recommendation in front of me instead of quietly choosing for me.

---

## How I verified the final implementation

Layered, and specifically designed not to rely on the AI's own report of its work.

**1. Automated checks, with real output.**

```bash
npm run typecheck         # clean
npm run lint              # clean
npm run build             # clean, 12 routes
npm test                  # 13 passed
npm run test:integration  # 21 passed
npm run verify:invariants # 4 queries, no violations
```

The results quoted in the README are actual terminal output from the final commit, not expectations.

**2. Independent database audits.**
`scripts/verify-invariants.ts` runs four SQL queries straight against Postgres and exits non-zero if any returns a row: no class over 4 confirmed; no duplicate child–class booking; `confirmed` status and successful-payment count always agreeing in both directions; operation receipts consistent with their attempts. It does not import the application's business logic, so a bug in the layer being audited cannot hide from it.

**3. Out-of-band inspection.**
Database state was checked with `docker exec … psql` rather than by reading it back through the application. When the application is the thing under test, asking it whether it did the right thing is circular.

**4. Genuine concurrency.**
The cross-process barrier described above, with wait times measured against the guard's hold duration to confirm the workers really blocked.

**5. Fresh-environment reproduction.**
Before writing the setup instructions: a brand-new container, a brand-new database, `prisma migrate deploy`, seed, invariant check, and the entire integration suite — all green — then the throwaway container was removed and the working environment restored.

**6. Manual browser walkthrough.**
All three pages, covering: profile and child selection, class availability display, booking creation, simulated success, simulated failure, retry from a failed state, duplicate submission returning the same booking, terminal states hiding the payment panel, roster contents and capacity, and status persistence across a refresh. Verified against the database after each step.

**7. Reset and re-verify after every round of manual testing**, so that no later check was run against data quietly polluted by an earlier one.

---

## What remains unverified

Stated plainly, because a verification section that only lists successes is not a verification section.

| Area | Status |
| ---- | ------ |
| **Supabase deployment** | The schema is portable and migrations are written for it, but the application has never been deployed or run against Supabase. Only the local Postgres path is proven |
| **The "Reset demo data" button's confirmation dialog** | The endpoint was verified directly (`POST /api/demo/reset` → 200, fixtures restored, invariants clean). The native `window.confirm` dialog is auto-dismissed by the automated browser, so the dialog itself was never clicked by a human |
| **Accessibility** | Form labels, keyboard order, and `aria-live` regions were built deliberately and checked by inspection — never with an actual screen reader |
| **Load behaviour** | Concurrency is proven at 2 simultaneous finalisations. Nothing here says how the class-row lock behaves at 50 |
| **The stray booking anomaly** | Never root-caused, as described above |
| **Real payment integration** | Entirely out of scope. The mock commits inside the same database transaction as the booking, which is exactly why a real gateway would need a different design |

---

## Summary

AI wrote most of the lines in this repository. The parts that make it trustworthy are the parts where I refused what it offered: keeping all 18 acceptance scenarios automated when the sensible timebox advice was to cut them, keeping the six-table model when five would have been simpler, and refusing to accept a green concurrency test that turned out to be measuring nothing.

The last one is the point. The AI produced a test that passed, and being handed a passing test is the most persuasive possible argument that the work is done. It was wrong, and finding out required disbelieving a green checkmark and spending forty minutes proving why.
