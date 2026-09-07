# Deez Plants — handoff to the next session

Written 2026-09-07, end of a session that built the nav shell, Home, the
Plants/detail refresh, and the single-plant detailed care mode. This
conversation is being closed deliberately; a fresh one continues from here.
**Read this file first, before anything else.**

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

As of commit `4dd37c7` (`git log --oneline` will show newer ones by the time
you read this):

- The event log and the pure `derive()` recompute — adherence, due dates,
  needs-attention, health confirm/change dates, calendars. Fully tested
  (`npm run check`).
- Plant ratings: the 1–10 sheet, single-tap confirm, the confirmation-line
  text beside the score block, ME/AI provenance.
- **The navigation shell** (`src/nav/`) — one stack, a fixed tab bar
  (Home/Plants/Rec/More), the All-pages sheet with all 17 spec'd items. Back
  buttons name their origin (`‹ Plants`, `‹ Large Monstera`, `‹ All pages`),
  never a bare "Back". `nav.replace()` swaps the current screen in place —
  used by Prev/Next and the plant picker — without pushing a new
  back-stack entry.
- **Home** (`src/pages/Home.tsx`) — the app's default landing tab, built
  from real `DerivedState`: health with good/holding/struggling bands, care
  adherence as counts, a water-only DUE block (see below), Needs attention,
  Most urgent, Log care, utility rows. Four pieces deliberately deferred —
  catch-up banner, health sparkline, handoff log/session-backup notice, feed
  due-tracking — see the memory `project_home_screen_needed` for exactly why
  each one.
- **Plants list** — filter chips (All / Needs attention / Due / Not on
  schedule) and a grouping toggle (All N / By planter, with every plant
  visible via a "No planter" catch-all). Rows still use the full
  `ScoreBlock`, not the mock's compact pill — that's the known, correct
  exception (section 3b).
- **Plant detail** — the `‹ Prev / All plants ▾ / Next ›` strip, locked in
  the original brief. The picker is an inline scrollable list, matching the
  mock's actual interaction, not a modal sheet. A "Log care" button opens
  the single-plant detailed mode below, scoped to that plant.
- **Log care, single-plant detailed mode** (`careRound.ts`'s
  `CARE_TYPES`/`buildDetailEvent`/`logDetailEvent`, rendered in
  `CareRoundPage.tsx` as "ONE PLANT, WITH DETAIL") — the nine-button grid
  (Water/Feed/Prune/Repot/Photo/Inspect/Support/Pest treat/Other), editable
  date and time, a notes field, and a save that shares the same pending/
  Update footer as the multi-select round above it. Photo attachment is a
  disabled note, not a working control — real capture isn't built. This
  section only renders when reached from a specific plant's own "Log care"
  button; every other entry point (Plants list, Home, the sheet) shows just
  the multi-select round, as before.
- The event log, multi-select Log care round with pending state and the
  Update commit — unchanged this session, all still working.

One pre-existing, unrelated test failure remains and is not a regression:
`check/care.check.cjs`'s "groups: shared planter first, then rooms..."
assertion expects `careRound.ts`'s `selectionGroups` to also group by room,
which it doesn't currently do. Confirmed present before this multi-session
thread's work started (checked via `git stash`). Not touched — flagging it
here so it isn't mistaken for new breakage.

## What's next, in order

1. Remaining phase-1-adjacent screens, each currently a placeholder reached
   from Home, plant detail, or the All-pages sheet: history (entry log +
   care calendar), health history, adherence history, archived plants,
   rooms & planters, add-a-plant, info & settings, "more about this plant".
   Building one is: replace its `placeholder(...)` call site in `App.tsx`
   (there's one in `menuItems`, sometimes also one in `Home.tsx`) with a
   real push, same pattern `care` and `detail` already follow. Once History
   exists, plant detail should probably also get a link to it (held back
   for the same reason Log care was, now resolved) — check DESIGN_REFERENCE
   screen 04's route-row list for what else plant detail is still missing
   (More about this plant, Info and settings, Photos, "your ratings against
   what you changed", Take photo, Record note, Archive this plant — none of
   these exist yet).
2. Export/import + the full validation chain (section 11), the review
   table with per-row approval.
3. Capture: photos, both notes lanes, recording (mic + wake lock). This is
   where the owner's actual iPhone is required for testing — it cannot be
   verified from here.
4. The desk console (laptop-only, deliberately last).

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
own instructions), passing this URL, not by creating a new one. Last
updated after the nav shell + Home landed this session — **not yet updated**
for the Plants/detail refresh or the single-plant care mode; do that early
next session before starting new work.

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
