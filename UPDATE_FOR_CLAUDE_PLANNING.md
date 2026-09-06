# Deez Plants — status and process update

Written 2026-09-06. For pasting into the Claude conversation where
`FIELD_DEFINITIONS.md` and `HANDOFF.md` were originally drafted, so it has
current context without re-reading the whole build.

## Where the build stands

Working and tested (automated checks plus manual browser verification):
the IndexedDB schema, the append-only event log, the pure recompute of all
derived state (adherence, due dates, needs-attention, health confirm/change
dates), the plants list, plant detail, the three-button care round with
pending state and the Update commit, and health ratings with the
confirm-vs-change distinction from `FIELD_DEFINITIONS.md` section 4. Roughly
250 automated assertions pass across the data layer and the care/rating
write paths.

Not yet built: the persistent nav shell (tab bar, back-stack with a named
back button, the All-pages sheet), Home, most of the remaining screens, and
Phases 2–4 in full (export/import with the validation chain, capture —
recording/photos/notes, the desk console).

## A process change worth knowing about

`HANDOFF.md` section 6 and `START_HERE.md` (found bundled in a design-package
zip, not previously read by Claude Code this session) assumed the project
owner would drive Claude Code by hand — one short conversation per phase,
switching models manually, `/exit`ing between them — build a minimal Phase 1,
then live-test it for three or four weeks before more got built.

That's been superseded. The owner wants the full app built out — matching
`DESIGN_REFERENCE.md` visually and functionally — before being asked to live
-test it day to day, with minimal check-ins along the way. `CLAUDE.md` now
records this as "Current working agreement": Claude Code builds continuously,
self-verifies (screenshots the running app against the reference images,
runs the check suite) before calling something done, and only involves the
owner for device-only testing (iOS mic/wake lock/install), hosting/account
steps, or a genuine judgment call. `HANDOFF.md` section 6 is marked
superseded in place rather than deleted, since its two open product
questions (does the pending/Update two-step earn its tap, does the forward
calendar earn its place) are still worth answering from real use later.

## Documentation cleanup done alongside this

The design-package zip also contained the original brief given to Claude
Design (`DEEZ_PLANTS_VISUAL_DESIGN_HANDOFF.md`) and a pre-build QA pass
(`DEEZ_PLANTS_DESIGN_REVIEW_ASSESSMENT for code.md`). The QA pass is fully
closed out — every item it flagged (plant ID format, the planter
`shared_water` field, the `Archive` event type, "water overdue" copy, the
health/adherence conflation) is already correctly reflected in both
`FIELD_DEFINITIONS.md` and the mock. The brief had two facts never captured
anywhere else — the 20px readability floor is a hard requirement (not a
preference, and the mock itself under-shot it), and the Plant Detail
Prev/Next strip is locked, not optional — both now folded into
`DESIGN_REFERENCE.md` section 6. The stale zip, its outdated duplicate
`SEED_PLANTS.json`, and Claude Design's internal tooling files have been
discarded; nothing in the actual data model or rules changed.

## Where it's going next

Nav shell and Home first (the biggest visible gaps), then the remaining
phase-1-adjacent screens (history views, calendars, archived plants, rooms &
planters, add-a-plant, info & settings), then export/import with the full
validation chain, then capture (recording/photos/notes), then the desk
console — same order `HANDOFF.md` section 2 already lays out, just without
the multi-week pause between phases.
