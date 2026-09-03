# Deez Plants — CLAUDE.md

This file is read automatically at the start of every conversation in this repo.
The full spec lives in `FIELD_DEFINITIONS.md` (data model, validation, the build
spec) and `HANDOFF.md` (build order, model-usage guidance). Read those by
section number when a task needs them — don't re-read them whole every turn.

## What this is

A local-first web app, installed to an iPhone home screen, that logs plant
care, holds health ratings, records walks, and exchanges review files with an
AI chat. No server, no accounts, no build step to think about. 22 real plants,
seeded from `SEED_PLANTS.json`.

## Stack

- **Vite + React + TypeScript**
- **IndexedDB** for storage, via `idb`
- **Plain CSS or CSS modules** — no CSS framework
- **`jszip`** for building/reading packages (the zipped export/import files)
- Deployed as a static site (GitHub Pages or Netlify) — must be HTTPS for
  microphone and wake lock to work
- Capability-detected, one codebase: phone (Safari, installed to home screen)
  and laptop (Chrome/Edge, where the File System Access API gives real folder
  sync)

## Intended file layout

Nothing below exists yet except the Vite scaffold (`src/main.tsx`,
`src/App.tsx`). This is the target shape, filled in phase by phase per
`HANDOFF.md` section 2 — data layer first, then export/import, then capture,
then the desk console.

```
src/
  types/
    plant.ts          Plant fields (FIELD_DEFINITIONS.md section 4)
    event.ts           Event shape (section 5)
    package.ts          Manifest / update file / review-set shapes (sections 7, 10)
  db/
    schema.ts            IndexedDB schema and open/migration (via idb)
    events.ts             Event append — the only way state changes
    derive.ts              Pure function: full event log -> derived state
                            (adherence, due dates, needs-attention, calendars,
                            health_stale, etc.). Rebuilt from scratch, never patched.
    seed.ts                 First-run import of SEED_PLANTS.json + seed-photos/
                            as Photo events (section 6b)
  care/
    careRound.ts          Multi-select care round logging, pending state, Update commit
  score/
    ScoreBlock.tsx          The one health score component (section 3b) — used
                            everywhere a score appears, never reimplemented
  package/
    export.ts              Build the review set (manifest/events/transcript/markers, zipped)
    validate.ts              The full validation chain (section 11)
    import.ts                 Apply an approved update file, per-row approval only
  capture/
    recording.ts            MediaRecorder (audio/mp4), wake lock, foreground handling
    screenLog.ts             Always-on screen log, 5s pass-through filter, 7-day/500-entry retention
    photos.ts                 Capture, four labels, hero selection, transient per-plant cache
  notes/
    notesUser.ts             notes_user / collection_notes_user — user lane, never imported
    careInstructions.ts       care_instructions list — add/replace only, no delete via import
  sync/
    fileSystemSync.ts        Laptop: File System Access API, folder grant, read-on-open
    stateTransfer.ts          Phone: manual export/import of full state.json
  pages/
    Home.tsx, PlantsList.tsx, PlantDetail.tsx, CareRoundPage.tsx,
    Calendars.tsx, ReviewImport.tsx, Recording.tsx, PhotosPage.tsx,
    NotesPage.tsx, DeskTable.tsx (Phase 4 only)
  components/
    (shared presentational pieces other than ScoreBlock)
main.tsx, App.tsx
```

Reference/tooling at the repo root, not app code: `FIELD_DEFINITIONS.md`,
`HANDOFF.md`, `TRANSCRIBE.md`, `SEED_PLANTS.json`, `seed-photos/`,
`transcribe_walk.py`.

## The non-negotiable rules (HANDOFF.md section 3)

Reasonable-looking shortcuts against these destroy the design. Section 3 is
titled "eight non-negotiable rules" but currently enumerates ten — all ten are
binding; treat the "eight" as a stale label in the source doc, not a cue to
drop any of them.

1. **The app never computes health.** No derived number is ever labelled
   health. Health is a human judgement only (section 3).
2. **Adherence is never a score out of ten.** It is counts and days
   ("on time 14 of 18 · average 2 days late"), never a number out of 10.
3. **`notes_user` is untouchable by import.** Validation rejects any update
   file naming `notes_user` or `collection_notes_user`, whole.
4. **Approval is per row.** No apply-all button, ever — every proposed change
   is accepted or rejected individually.
5. **Events are append-only.** Nothing is edited in place; a correction is a
   new event. This is what makes two-device merging safe.
6. **The score block is one component.** If it renders differently on any
   screen, that's a bug — same three lines, same order, same type sizes
   everywhere (section 3b).
7. **Confirming a rating without changing it is a real action.** It writes a
   `Rate` event and refreshes `health_confirmed` without moving
   `health_changed`. Must be a single tap.
8. **Archiving is an `Archive` event, not a state patch.** `archived`,
   `archived_date` and `archived_reason` are always derived from that event —
   no mutation exceptions anywhere in the model.
9. **Never render elapsed interval as proof a plant needs care.** "4 days past
   interval", "check soil" — never "water overdue" as an instruction. The
   interval passing is a prompt to look, not a fact about the soil.
10. **Rebuild derived state from events, never patch it.** The Update commit
    recomputes everything from scratch. It's 22 plants — performance is not a
    concern here.
