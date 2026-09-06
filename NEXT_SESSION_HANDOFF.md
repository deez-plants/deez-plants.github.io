# Deez Plants — handoff to the next session

Written 2026-09-06, end of the session that built ratings and reconciled the
design-package zip. This conversation is being closed deliberately; a fresh
one continues from here. **Read this file first, before anything else.**

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

As of commit `b63eb77` (`git log --oneline` will show newer ones by the time
you read this):

- The event log and the pure `derive()` recompute — adherence, due dates,
  needs-attention, health confirm/change dates, calendars. Fully tested
  (`npm run check`).
- Plants list, plant detail, the three-button Log care round with pending
  state and the Update commit.
- Plant ratings: the 1–10 sheet, single-tap confirm, the confirmation-line
  text beside the score block, ME/AI provenance.
- Documentation reconciled: a stale design-package zip was found, diffed
  file-by-file against the repo, and retired; two documents from it that
  had never been read (`DEEZ_PLANTS_VISUAL_DESIGN_HANDOFF.md`,
  `DEEZ_PLANTS_DESIGN_REVIEW_ASSESSMENT for code.md`) were read and their
  still-relevant facts folded into `DESIGN_REFERENCE.md` section 6.

One pre-existing, unrelated test failure remains and is not a regression:
`check/care.check.cjs`'s "groups: shared planter first, then rooms..."
assertion expects `careRound.ts`'s `selectionGroups` to also group by room,
which it doesn't currently do. Confirmed present before this session's work
started (checked via `git stash`). Not touched — flagging it here so it
isn't mistaken for new breakage.

## What's next, in order

Full detail and time estimates are in the published status page (see below)
and in this session's own summary, but in short:

1. **Navigation shell** — tab bar (Home/Plants/Rec/More), the back-stack with
   a named back button (`‹ Large Monstera`, not `‹ Back`), the All-pages
   sheet. Nothing else is built inside the shell the design actually calls
   for yet; every screen so far uses an ad-hoc back link.
2. **Home** — the biggest visible gap. Most of the data it needs already
   exists in `DerivedState`; this is UI composition, not new derivation.
3. **Plants list & plant detail, brought up to the reference** — filter
   chips, the grouping toggle, the Prev/Next strip, the `All plants ▾`
   picker. Do **not** give Plants list rows the mock's compact colour-pill
   health display — the built app's use of the full `ScoreBlock` there is
   correct per `FIELD_DEFINITIONS.md` section 3b's cross-screen consistency
   rule; the mock's pill predates that rule and is the known exception.
4. **Log care, rounded out** — the single-plant, nine-action detailed mode
   (screen 05's "ONE PLANT, WITH DETAIL") alongside the multi-select round
   that's already built.
5. Remaining phase-1-adjacent screens: health history, adherence history,
   care history/calendar, archived plants, rooms & planters, add-a-plant,
   info & settings.
6. Export/import + the full validation chain (section 11), the review
   table with per-row approval.
7. Capture: photos, both notes lanes, recording (mic + wake lock). This is
   where the owner's actual iPhone is required for testing — it cannot be
   verified from here.
8. The desk console (laptop-only, deliberately last).

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
own instructions), passing this URL, not by creating a new one.

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
