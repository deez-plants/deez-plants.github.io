# Deez Plants — handoff to the next session

Written 2026-09-07, end of the session that built the navigation shell and
the Home screen. This conversation is being closed deliberately; a fresh one
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

As of commit `1ac19d1` (`git log --oneline` will show newer ones by the time
you read this):

- The event log and the pure `derive()` recompute — adherence, due dates,
  needs-attention, health confirm/change dates, calendars. Fully tested
  (`npm run check`).
- Plant ratings: the 1–10 sheet, single-tap confirm, the confirmation-line
  text beside the score block, ME/AI provenance.
- **The navigation shell** (`src/nav/`) — `useNav.ts` (one stack, three
  tab-bar roots, one sheet), `TabBar.tsx` (Home/Plants/Rec/More, Rec
  centred), `AllPagesSheet.tsx` (all 17 items from DESIGN_REFERENCE.md
  section 1), `Placeholder.tsx` (stands in for every screen not built yet).
  Tapping Home or Plants clears the stack; everything else pushes and
  carries the label its own back button should show — plant detail's back
  button reads `‹ Plants` (or `‹ Home`, or `‹ All pages`, depending on
  where it was opened from), never a bare "Back". `PlantDetail` and
  `CareRoundPage` both take a `backLabel` prop now instead of hardcoding
  "Back".
- **Home** (`src/pages/Home.tsx`) — the app's default landing tab. Title
  with a derived TRACKED count, the collection `ScoreBlock` with
  good/holding/struggling bands, care adherence as counts, a DUE block,
  Needs attention, a Most-urgent water list, Log care, and utility rows.
  Deliberately left out and why (all still open, see the memory
  `project_home_screen_needed` for detail): the catch-up banner (needs a
  stored "last opened" timestamp, doesn't exist), the health sparkline
  (needs a history of collection-average snapshots, `DerivedState` only
  keeps one), the handoff log / session-backup notice (belong to
  export/import and capture, neither built), and feed due-tracking in DUE
  and Most urgent (`feed` is free text, not a scheduled interval —
  water-only is the honest current answer, not an oversight).
- Plants list, plant detail, the three-button Log care round with pending
  state and the Update commit — all now reached through the nav shell
  rather than an ad-hoc back link.

One pre-existing, unrelated test failure remains and is not a regression:
`check/care.check.cjs`'s "groups: shared planter first, then rooms..."
assertion expects `careRound.ts`'s `selectionGroups` to also group by room,
which it doesn't currently do. Confirmed present before the previous
session's work started (checked via `git stash`). Not touched — flagging it
here so it isn't mistaken for new breakage.

## What's next, in order

1. **Plants list & plant detail, brought up to the reference** — filter
   chips, the grouping toggle, the Prev/Next strip, the `All plants ▾`
   picker. Do **not** give Plants list rows the mock's compact colour-pill
   health display — the built app's use of the full `ScoreBlock` there is
   correct per `FIELD_DEFINITIONS.md` section 3b's cross-screen consistency
   rule; the mock's pill predates that rule and is the known exception.
2. **Log care, rounded out** — the single-plant, nine-action detailed mode
   (screen 05's "ONE PLANT, WITH DETAIL") alongside the multi-select round
   that's already built.
3. Remaining phase-1-adjacent screens, each currently a placeholder reached
   from Home or the All-pages sheet: health history, adherence history,
   care history/calendar, archived plants, rooms & planters, add-a-plant,
   info & settings. Building one of these is: replace its `placeholder(...)`
   call site in `App.tsx` (there are two — one in `menuItems`, sometimes
   also one in `Home.tsx`) with a real push, same pattern as `care` and
   `detail` already follow.
4. Export/import + the full validation chain (section 11), the review
   table with per-row approval.
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
session to reflect the nav shell and Home landing.

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
