# Deez Plants — handoff to the next session

Written 2026-09-07, end of a session that built Care calendar/All months,
Adherence history, Rooms and planters, and More about this plant/Info and
settings. This conversation is being closed deliberately; a fresh one
continues from here. **Read this file first, before anything else.**

## Read in this order

1. `CLAUDE.md` — the stack, the file layout, the ten non-negotiable rules,
   and the "Current working agreement" section. That agreement governs how
   this project is built now: continuously, self-verified against
   `DESIGN_REFERENCE.md` and the check suite, minimal check-ins with the
   owner.
2. This file — where things actually stand and what's next.
3. `DESIGN_REFERENCE.md` — read a screen's own entry before building it.
   Section 6 carries facts from the original Claude Design brief that are
   easy to miss otherwise (the 20px readability floor, the locked Plant
   Detail Prev/Next strip, the still-open accordion question).
4. `FIELD_DEFINITIONS.md` — the data model and validation spec, by section
   number, only when a task needs it.

Do not re-read `HANDOFF.md` section 6 as live instruction — it's marked
superseded in place. The build order in its section 2 still roughly holds;
the phase-gated pacing and "live-test for weeks before continuing" does not.

## What's built and committed

As of commit `e7325d6` (`git log --oneline` will show newer ones by the time
you read this):

Everything the previous handoff listed (event log/derive, ratings, nav shell,
Home, Plants list, Plant detail with single-plant care mode, History/All
entries, Archived plants) — see git history if you need that detail — plus
this session's five screens:

- **Care calendar / All months** (`src/pages/PlantCalendar.tsx`, screens
  26/27) — one component handles both: three months with a "View all 12
  months" link, or all twelve with none. Month grids render newest month
  first, days within a month in normal order (a lesson already learned once,
  per `DESIGN_REFERENCE.md` section 6 — don't reverse the whole grid). Each
  care type gets a colour + single/double-letter mono abbreviation
  (`src/lib/careTypeStyle.ts`; three reuse the core accent/warn/amber, six
  are new `--cal-*` tokens in `index.css` since the mock's legend needs more
  hues than the three-colour system defines). The legend and the dots shown
  are both scoped to the displayed month window — an event from years
  outside it must never add a legend entry for a type invisible on screen
  (this was a real bug caught during self-verification and fixed same
  session). `dates.ts` gained the month-arithmetic this needed: `shiftMonths`,
  `monthStart`, `daysInMonth`, `weekdayOfMonthStart`, `monthAbbr`,
  `formatMonthFull`.
- **Adherence history** (`src/pages/AdherenceHistory.tsx`, screen 07) — the
  live on/slip/behind split and rated-count/average from `state.collection`
  and per-plant `adherence.state`, plus a six-month bar chart read from the
  `snapshots` store (Section 5's "last five", now surfaced through
  `boot.ts`'s `Booted.snapshots`, oldest first). A month with no snapshot in
  it renders an empty bar rather than inventing a number — on a fresh
  install with few Updates behind it, most of the six months will be empty,
  and that's correct, not a bug to paper over (`DESIGN_REFERENCE.md` section
  5, rule 4: derive, never hardcode). The bar-colour thresholds (≤2 good,
  3–4 holding, ≥5 struggling) are a reading of the mock's own colours, not a
  spec fact — flagged as such in a comment, same caveat as Home's health
  `band()`.
- **Rooms and planters** (`src/pages/RoomsPlanters.tsx`, screen 14) — reads
  `registry.rooms`/`registry.planters` for room plant-counts and each
  planter's shared/decorative mode and member chips. Unlike the other new
  screens this one **writes**: "Add a room" is real, via a new
  `addRoom()` in `boot.ts` that appends directly to the registry record (no
  event — `FIELD_DEFINITIONS.md` section 4 calls rooms/planters "a
  user-editable registry," not something events fold, and the AI can't
  propose changes here since it can't see the flat).
- **More about this plant** (`src/pages/MoreAboutPlant.tsx`) and **Info and
  settings** (`src/pages/InfoSettings.tsx`, screens 08/09/10), reached from
  two new link rows at the bottom of Plant Detail. Two real, deliberate
  deviations from the mock here, both explained in comments at the top of
  the files:
  - The mock's "More about this plant" has eight topics (Environment, Soil
    & medium, Repotting/roots, Pruning & support, Pests & disease,
    Season/growth, Notes, Propagation) with invented per-topic content
    (`DESIGN_REFERENCE.md` section 5: "sample data is invented"). Only two
    of the eight — Soil and Notes — correspond to a field the data model
    actually has. Rather than build six rows that always read "not
    tracked," this collapses the two screens into one real page: **Soil &
    medium** (`plant.soil`), **Care instructions** (the `care_instructions`
    stack per `FIELD_DEFINITIONS.md` section 6c — text, added date,
    AI/You), and **Notes** (`notes_user`, visually distinct — amber border
    and a "YOURS · never touched by import" badge, per section 6c's "two
    lanes, kept visually distinct" requirement).
  - Info and settings shows every field the mock has (name, species,
    acquired, room, pot, planter, water interval summer/winter, feed,
    light, soil) but **read-only** — the mock has all of it editable in
    place, which means an `Edit` event per field with the
    user/AI-editable split `FIELD_DEFINITIONS.md` section 4 draws. That's
    its own build step, not a corner cut here; the subtitle says so
    honestly ("view only for now") rather than the mock's "edit anything
    except the ID."

One pre-existing, unrelated test failure remains and is not a regression:
`check/care.check.cjs`'s "groups: shared planter first, then rooms..."
assertion expects `careRound.ts`'s `selectionGroups` to also group by room,
which it doesn't currently do. Confirmed present before this multi-session
thread's work started. Not touched — flagging it here so it isn't mistaken
for new breakage.

All five new screens were self-verified: ran the app in a real browser tab,
clicked through every new nav path (Home → Adherence history; Plant detail →
More about this plant / Info and settings; History → Care calendar → All 12
months; the All-pages sheet → Rooms and planters, including a live "Add a
room" write), and confirmed `npm run check` still shows only the one known
failure.

## What's next, in order

1. **Health history** (screen 06) — still not built. The six-month bar chart
   is a bigger lift than the ones this session did: `derive()` doesn't filter
   events by date against `as_of` (it applies the whole log regardless of
   date), so calling it with a past `as_of` does **not** give a true
   historical snapshot of health specifically. Adherence history sidestepped
   this by reading real saved `snapshots` instead of trying to replay
   history — Health history could do the same (a health-only figure isn't
   currently in `Snapshot`, so check what's cheaply derivable from
   `snapshot.state.plants[...].health` before deciding whether that's enough
   or whether `derive()` genuinely needs a date-filtering mode). This is the
   same underlying gap as Home's deferred sparkline.
2. **Add a new plant** (screen 11) — a real write flow, not just a screen:
   needs an ID-allocation scheme (check `FIELD_DEFINITIONS.md` section 2)
   and a new baseline record written to the `plants` store, closer in size
   to building export/import than to the read-only screens this session
   added. Consider doing this alongside or after export/import.
3. **In-place editing for Info and settings** — now that the read display
   exists, the natural follow-up is writing `Edit` events per field, per
   `FIELD_DEFINITIONS.md` section 4's user/AI-editable split (rule 4: no
   apply-all, per-field only anyway since these aren't import rows). Not
   urgent — the read display is a complete, honest screen on its own.
4. Export/import + the full validation chain (section 11), the review table
   with per-row approval.
5. Capture: photos, both notes lanes, recording (mic + wake lock). This is
   where the owner's actual iPhone is required for testing — it cannot be
   verified from here.
6. The desk console (laptop-only, deliberately last).

Work in long, self-contained stretches per step above. Self-verify each
piece — run the app in a real browser tab (`npm run dev`, drive it with
the browser tool, screenshot it, compare against `screenshots/`) and run
`npm run check` — before reporting it done. Commit at every stable,
checks-passing checkpoint.

## Published status page

A running status page for the owner (non-technical framing, the roadmap
table with time estimates and who does what) is published at:

**https://claude.ai/code/artifact/1e8d981a-2bef-4ab7-bc30-87f3f309f62d**

Update it as steps complete — redeploy by publishing the same source file
path from within a session that has read it first (see the Artifact tool's
own instructions), passing this URL, not by creating a new one. Updated this
session for Care calendar, Adherence history, Rooms and planters, and More
about/Info and settings.

A companion page, **the Deez Plants Playbook**
(https://claude.ai/code/artifact/0f4f7478-a690-45ce-a364-d62190747ea4), is a
step-by-step guide for the owner: how to start a session, what to expect
while Claude works, the three things that need them, and exact prompts for
each. It's mostly static — only touch it if the actual workflow changes,
not per build step.

## Other files worth knowing about

- `UPDATE_FOR_CLAUDE_DESIGN.md`, `UPDATE_FOR_CLAUDE_PLANNING.md` — point-in-
  time status snapshots the owner may paste into other conversations
  (Claude Design, the original spec-planning chat). They'll go stale as work
  continues; this file and `CLAUDE.md` are the live sources of truth.
- `Deez Plants.dc.html` — the raw design mock, for when a screenshot in
  `DESIGN_REFERENCE.md` is ambiguous. Reference only; never port its code
  or treat its sample data as real (it still shows the old `PLT-` ID
  scheme's successor issues resolved, but Spider Plant as active and a
  stale "22 plants" count — both explicitly called out as mock-only noise
  in `DESIGN_REFERENCE.md` section 5).
