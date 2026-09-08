# Deez Plants — handoff to the next session

Written 2026-09-07, end of a long session that built Care calendar/All
months, Adherence history, Rooms and planters, More about this
plant/Info and settings (later made fully editable), Health history, the
Add-a-plant write flow, a direct Care-calendar link on Plant Detail, and —
the big one — export/import (Prepare review package + Apply AI update, the
full section-11 validation chain). This conversation is being closed
deliberately (session budget); a fresh one continues from here. **Read this
file first, before anything else.**

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

As of commit `0d889ca` (`git log --oneline` will show newer ones by the time
you read this):

Everything the previous handoff listed (event log/derive, ratings, nav shell,
Home, Plants list, Plant detail with single-plant care mode, History/All
entries, Archived plants) — see git history if you need that detail — plus
this session's screens:

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

- **Health history** (`src/pages/HealthHistory.tsx`, screen 06) — the gap the
  previous handoff flagged here (`derive()` can't replay a past `as_of`,
  so it can't give a true historical health figure) turned out to already
  be solved by the same trick Adherence history used: each saved `Snapshot`
  already carries `collection.average_health`, frozen at the moment Update
  was tapped, computed the honest way (rule 2's cousin for health — an
  unrated plant is never folded in as a middling value; `derive()` already
  enforces that, this screen just reads the result). No `derive()` changes
  needed. The `good`/`holding`/`struggling` band thresholds Home's HEALTH
  block already used got pulled out into `score.ts` as an exported
  `healthBand()`, so this screen and Home colour a given average identically
  rather than each keeping its own copy of the same magic numbers. Wired
  from Home's HEALTH block "History ›" in place of its placeholder.
  Self-verified past the empty-state screenshot: rated a plant, logged a
  care event, committed Update, and confirmed the new snapshot populated
  that month's bar with the right average and band colour.

- **Add a plant** (`src/pages/AddPlant.tsx`, `addPlant()` in `boot.ts`,
  screen 11) — a real write, not just a screen. The next `NNN` is one past
  the highest number any plant has ever held, active or archived
  (`FIELD_DEFINITIONS.md` section 2: IDs are permanent and never reused).
  The three-letter suffix auto-suggests from the species' genus (first
  three letters, uppercased — "Epipremnum aureum" suggests "EPI", matching
  the mock's own example exactly) and stays freely editable until save.
  Save is disabled until name, species and a three-letter suffix all exist,
  matching the mock's own validation copy. `addPlant()` writes with
  `db.add`, never `put` — a collision would mean the ID allocator itself is
  broken, and that should throw loudly, not silently overwrite a plant.
  Fields the mock's own Add screen doesn't ask for (`pot`, `feed`, `light`,
  `soil`, `acquired`) start empty and are filled in later from Info and
  settings, same as any other field. Wired from both Home's utility row and
  the All-pages sheet. Self-verified end to end: typed a name and species,
  watched the suffix auto-suggest, submitted, landed on the new plant's own
  detail page as `023-EPI` with the right water interval and room, and
  confirmed the Plants list now reads "23 active" for real.
- **Info and settings, made editable** (`src/care/editField.ts`, updated
  `InfoSettings.tsx`) — every field on the screen is `editable_by: user` or
  `both`, so the user can edit any of it directly with no review table (that
  machinery is only for import). Room is now a chip picker and Shared
  planter a select, matching Add-a-plant's own controls. Saving writes one
  `Edit` event per changed field via a new `editPlantFields()`. Those events
  are pending like any other — `derive.ts` only exempts `Rate` and
  `Archive` from the pending filter — so this screen surfaces the same
  pending/Update footer Log care uses. Self-verification past the happy
  path caught two real bugs, both fixed and re-verified: diffing every save
  against the still-uncommitted `plant` prop was writing a duplicate edit
  on a second save before the next Update (fixed with a local typed
  `baseline` that becomes the just-saved values); and "Update now" wasn't
  resyncing the form at all, leaving stale pre-Update numbers on screen
  (fixed by reading the fresh plant off `commitUpdate()`'s own return value
  instead of waiting on the prop to flow back down). `App.tsx`'s
  `<InfoSettings>` now carries `key={plant.plant_id}` so Prev/Next remounts
  cleanly instead of carrying stale form state to the next plant.

- **Care calendar link on Plant Detail** (`src/pages/PlantDetail.tsx`) — a
  plain link row (matching the More about/Info rows) so the calendar is
  reachable directly from Detail, not just via Detail → History → "Care
  calendar ›". The mock's fuller inline 3-month preview embedded on Detail
  itself is still not built — lower priority than this link, not on the
  near-term list.
- **Export/import** (`src/package/{export,validate,import}.ts`,
  `src/db/counters.ts`, `src/pages/{PrepareReviewPackage,ApplyAIUpdate}.tsx`,
  screens 19/20) — the other half of the AI review loop
  (`FIELD_DEFINITIONS.md` sections 7–11), and the biggest single build item
  this project had left.
  - **Prepare review package** builds the real review set: a manifest of
    every active plant's fields (`ManifestPlant` in the new
    `types/package.ts` — deliberately its own type, not a reuse of
    `DerivedPlant`, since the manifest must never carry bookkeeping like
    `pending_event_ids`), every event not already carried by a prior
    package (a union over past `PackageRecord.event_ids`, not a date
    cutoff — a backdated entry is never silently skipped), and honest
    `transcript.txt`/`markers.json` placeholders since recording isn't
    built yet. Zipped with `jszip`, downloaded via a real `<a download>`
    (this is the actual app, not a sandboxed artifact — that restriction
    doesn't apply here), and a `PackageRecord` is saved so validation can
    later check provenance and block double-apply. `PKG-YYYY-MM-DD-N` and
    (later) `INS-YYYY-MM-DD-N` ids are minted through a new shared
    `db/counters.ts`, reusing `AppMeta.package_counter` with a `PREFIX-date`
    key rather than a schema migration.
  - **Apply AI update** runs the full section-11 chain — provenance
    (package_id actually exported, not already applied), referential (plant
    exists and isn't archived, field is real and specifically AI-editable,
    `notes_user`/`collection_notes_user` rejected under any circumstances,
    `collection_care_instructions` explicitly punted this pass rather than
    half-supported), value (type/range per field via `fieldCodec.ts`'s
    `FIELD_KINDS`, health 1–10, water intervals 1–60), and completeness
    (every manifest plant addressed or listed as unaddressed) — **before
    showing anything**, matching the spec's own "rejected whole, with the
    reason named" framing exactly. A file that passes renders a review
    table: every row defaults to **unapproved** (no select-all control
    exists anywhere, rule 4), and a row whose field the user edited after
    the package's export date is flagged inline (rule 13) rather than
    silently overwritten. `health` changes become `Rate` events (`source:
    'ai'`) — live immediately, same exemption `Rate` already had — and
    `care_instructions` changes mint a real `instruction_id` through the
    same counter; every other field is a plain pending `Edit`, identical to
    a logged care round.
  - **Self-verified past the happy path, in a real browser tab**: built an
    actual package and got real plant/event counts back; pasted a file
    naming `notes_user` and watched it get rejected with that exact named
    reason; pasted a valid file and got a review table with correct
    current→proposed values pulled from live state; approved two rows and
    applied them, confirming the health change went live immediately with
    an `AI` provenance badge while the water-interval edit stayed pending
    until Update; and confirmed a second apply of the same package_id was
    rejected as already applied. One real bug found and fixed along the
    way: "Try another file" after a rejection didn't clear the pasted
    textarea, so retyping inserted into old text instead of replacing it.
  - **Important process note for future sessions**: `npm run check` only
    typechecks a short, explicit file list in `check/tsconfig.check.json`
    (`db/derive.ts`, `fieldCodec.ts`, `seed.ts`, `lib/dates.ts`,
    `care/careRound.ts`, `care/rate.ts`, `score/score.ts`) — it has **never**
    covered `App.tsx` or any page component, including every screen built
    earlier this session. `npm run build` (`tsc -b` against the real
    project tsconfig, then `vite build`) is the actual whole-app typecheck,
    and `npm run lint` (oxlint) is instant and clean. Both are clean as of
    this commit, but run `npm run build` alongside `npm run check` from now
    on — `npm run check` alone will not catch a broken page.

One pre-existing, unrelated test failure remains and is not a regression:
`check/care.check.cjs`'s "groups: shared planter first, then rooms..."
assertion expects `careRound.ts`'s `selectionGroups` to also group by room,
which it doesn't currently do. Confirmed present before this multi-session
thread's work started. Not touched — flagging it here so it isn't mistaken
for new breakage.

Every screen above was self-verified in a real browser tab, not just typechecked
— see each bullet for the specific paths clicked through and, for
export/import, the specific rejection/approval/double-apply scenarios
exercised. `npm run check`, `npm run build` and `npm run lint` are all clean
as of this commit (only the one known pre-existing failure noted above).

## What's next, in order

1. **Capture**: photos, both notes lanes, recording (mic + wake lock). This
   is where the owner's actual iPhone is required for testing — it cannot
   be verified from here. Note that `Prepare review package` already writes
   honest empty placeholders for `transcript.txt`/`markers.json`/session
   counts — once Capture exists, that's the file to come back to and wire
   real data through instead of the placeholder strings.
2. The desk console (laptop-only, deliberately last).
3. Smaller loose ends, whenever convenient rather than as their own steps:
   the mock's fuller inline Care-calendar preview on Plant Detail (the
   plain link there now is the interim version); the "AI proposes, both
   sides disagree" flagged-conflict UI could use a real screenshot-driven
   pass once there's a live update file to test it against; and
   `collection_care_instructions` in an update file is currently rejected
   outright (see the export/import bullet above) — worth a real look once
   there's a "collection notes" screen for it to attach to.

Work in long, self-contained stretches per step above. Self-verify each
piece — run the app in a real browser tab (`npm run dev`, drive it with
the browser tool, screenshot it, compare against `screenshots/`), run
`npm run check`, **and run `npm run build`** (see the process note above —
`check` alone does not typecheck pages) — before reporting it done. Commit
at every stable, checks-passing checkpoint.

## Published status page

A running status page for the owner (non-technical framing, the roadmap
table with time estimates and who does what) is published at:

**https://claude.ai/code/artifact/1e8d981a-2bef-4ab7-bc30-87f3f309f62d**

Update it as steps complete — redeploy by publishing the same source file
path from within a session that has read it first (see the Artifact tool's
own instructions), passing this URL, not by creating a new one. Updated this
session for Care calendar, Adherence history, Rooms and planters, More
about/Info and settings, and Health history.

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
