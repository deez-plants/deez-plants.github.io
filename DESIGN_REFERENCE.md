# Deez Plants — Design Reference

**Supplemental reference. Sep 5 2026.**

---

## How to use this document

This is a **drift check, not an instruction set.** It describes the design mock
in `Deez Plants.dc.html` — every screen, how they connect, what each control
does, and the type and colour system underneath.

**Your code is authoritative. This document is not.**

Where the built app differs from what is described here, the app is right and
this document is out of date. Those differences were deliberate — buttons
resized, text scaled, photos repositioned, behaviour adjusted while building.
Do not "fix" the app to match this file.

What this document is good for:

1. **Before building a screen** — read its entry to see what was intended, what
   it contains, and what its controls do, so the screen arrives roughly right the
   first time.
2. **After building a screen** — check nothing was missed: a control that exists
   in the design and not in the build, a route that leads somewhere else, a state
   that was never handled.
3. **When two screens should agree** — the score block, the back button, the tab
   bar. Section 4 lists what must be consistent.

What it must not be used for: reverting hand-tuned sizes, or overriding a
decision already made in code.

**Precedence, highest first:** the built app → `FIELD_DEFINITIONS.md` (data,
validation, rules) → `HANDOFF.md` (build order) → this file (appearance and
interaction) → the mock itself.

---

## 1. The screen map

25 screens. All of them one component tree with a `screen` string in state —
there is no router, and the design does not need one.

### Reachable from the tab bar (always visible, 4 items)

```
Home ......... the daily surface
Plants ....... the collection
Rec .......... start or resume a walk recording
More ......... opens the All pages sheet (an overlay, not a screen)
```

### The All pages sheet

A bottom sheet over the current screen, max 74% height, scrollable, with a
Close button. 17 items, in this order:

| Item | Goes to | Notes |
|---|---|---|
| Log care | `care` | |
| History | `history` | per-plant entry log |
| More about this plant | `more` | |
| Info and settings | `info` | |
| Photos | `detail` | **the plant detail screen** — labelled Photos in the sheet |
| Add new plant | `add` | |
| Archived plants | `archive` | subtitle counts records |
| Photos | `photos` | the gallery. Second item with this label |
| Rooms and planters | `rooms` | |
| Recordings | `sessions` | |
| Reminders | `reminders` | |
| Since last time | `since` | |
| What works | `works` | |
| Prepare review package | `pkg` | |
| Apply AI update | `upload` | |
| Handoff log | `handoff` | |
| How this app works | `how` | |

**Two items are labelled "Photos" and they go to different screens.** That is a
flaw in the mock, not an intention. Rename the first to something like "Plant
detail" when you build it.

### Nested routes

```
home ──► healthlog            HEALTH block, "History ›"
home ──► adherence history    CARE ADHERENCE block, "History ›"
home ──► care                 any needs-attention row, or a due row
home ──► detail               a needs-attention row on a plant
plants ──► detail             any plant row
plants ──► care               "Log care all"
detail ──► care               "Log care"
detail ──► history            "History"
detail ──► more               "More about this plant ›"
detail ──► info               "Info and settings ›"
detail ──► photos             "Photos main is #1 ›" / "View all ›"
detail ──► works              "Your ratings against what you changed ›"
detail ──► archive            "Archive this plant" (confirm first)
more ──► moreItem             any of the 8 topic rows
history ──► entries           "View all entries ›"
history ──► calendars         "Care calendar ›"
calendars ──► allMonths       "All 12 months"
```

### The back stack

Screens reached through `nav()` push onto a stack. The back button reads the
stack and **names where it came from** rather than saying "Back":

| You came from | The button reads |
|---|---|
| plant detail | `‹ Large Monstera` (the plant's name) |
| All pages sheet | `‹ All pages` |
| plants list | `‹ Plants` |
| health history | `‹ Health history` |
| nothing on the stack | `‹ Home` |

**Tapping Home or Plants in the tab bar clears the stack.** They are roots, not
destinations you come back from. This is worth getting right: it is the single
most-used interaction in the app and the thing most likely to be rebuilt as a
generic "go back".

---

## 2. The screens, one by one

Each entry: the reference image, what it holds top to bottom, its controls, and
its states.

---

### 01 · Home — `screenshots/01-home.png`

The daily surface. Everything else is reachable from here in one or two taps.

Top to bottom:

1. **Status bar** — 9:41, signal, wifi, battery. Mock furniture; the real app
   shows the system bar.
2. **Title** `Deez Plants` in Instrument Serif, with `22 TRACKED` right-aligned
   in mono caps. **The count is derived from active plants — never a literal.**
3. **Catch-up banner** — "Caught up after N days away", how many plants moved
   into due, how many are behind. An `OK` button dismisses it. Appears only after
   a gap; the gap is measured from the last open, floor of 3 days in the mock.
4. **HEALTH block** — the score block (section 4). Current average, `/10`, the
   confirmation date, then the previous average with its date, the delta and
   elapsed time. A six-bar sparkline to the right. Below it a three-band bar
   (doing well / holding / struggling) with counts, then the unrated line: "14
   not rated yet · 1 not looked at in three months". `History ›` goes to health
   history.
5. **CARE ADHERENCE block** — counts, never a score. `History ›` goes to
   adherence history.
6. **DUE block** — the total, split by water and feed, then three figures: Past
   interval / Today / This week.
7. **Needs attention** — a count badge, an `Up to date` / fold-in state line, and
   rows: plant name plus the reason ("Check soil — 5 days past interval"). Each
   row opens either the plant or the care screen. `See all N ›` at the end.
8. **Do next** — WATER/FEED rows with the plant and how far past interval.
9. **Utility rows** — Add a new plant (with the next ID), Prepare review package,
   Apply AI update, the session-backup notice, Archived plants.
10. **Tab bar** — fixed, 4 items, Rec as a centre button.

**States:** with and without the catch-up banner; pending events not yet folded
in (the state line changes and an Update affordance appears); everything folded
in; nothing due.

---

### 02 · Plants — `screenshots/02-plants.png`

The collection.

1. Title `Plants`.
2. `Log care all ›` — straight to a batch round.
3. Search field — "Search 22 plants…". **Count derived.**
4. Filter chips: All · Needs attention · Due · Not on schedule.
5. Grouping toggle: `All 22` / `By planter`.
6. Rows — thumbnail, ID in mono, name, the health figure in a coloured pill, and
   a state word beneath it (`Kept` etc). Chevron. Tapping opens plant detail.

**States:** flat and grouped; each filter; a search with no matches; a plant with
no rating (the pill shows no number).

---

### 03 · Record — `screenshots/03-record.png`

The walk recorder. One long recording, pauses free.

Timer, a state word (`READY` / `RECORDING` / `PAUSED`), the record control, and
a running list of markers as you move between plants — each marker is a timestamp
and a plant name, newest first.

**This screen is where the phone constraints bite.** Wake lock held, app must
stay in the foreground, m4a via MediaRecorder. See `FIELD_DEFINITIONS.md`
section 6, "Recording constraints".

**States:** ready, recording, paused, and a finished session with a marker count.

---

### 04 · Plant detail — `screenshots/04-plant-detail.png`

The screen you land on from a plant row anywhere.

1. **Chrome** — back button naming the origin, an `All plants ▾` picker, and a
   `‹ Prev / 001-MON / Next ›` strip.
2. **Name** in serif.
3. **Hero row** — half-size photo on the left, the rating beside it: the figure,
   `ME` tag, `Change` link, the confirmation date, and how long since it changed.
4. **State line** — `On schedule` / past-interval, plus when it was last checked.
5. **DO NEXT card** — the open task and its count.
6. **Care spec** — WATER and FEED intervals, LIGHT.
7. **Route rows** — More about this plant, Info and settings, Photos, Log care,
   History, "Your ratings against what you changed".
8. **Actions** — Take photo, Record note, Archive this plant.

**Note for the build:** the mock renders the rating here in an older inline
format (`8 / 10 · ME · Change` on one line). `FIELD_DEFINITIONS.md` section 3b
specifies the stacked score block with delta and elapsed time, and **the spec
wins** — this is one of the few places the mock is known to be behind.

**States:** rated / unrated; on schedule / past interval; a Do Next open or none;
hero photo present or a placeholder.

---

### 05 · Log care — `screenshots/05-log-care.png`

The weekly round. Two taps for a whole watering.

1. Title and the line "Pick what you did, then who you did it to."
2. **Three big buttons — Water, Feed, Prune** — each showing how many are due.
   These are the primary target and must stay large.
3. **ONE PLANT, WITH DETAIL** — a nine-button grid (Water, Feed, Prune, Repot,
   Photo, Inspect, Support, Pest treat, Other) with the selected one filled
   green.
4. Date and time fields, prefilled to now.
5. Notes textarea.
6. Optional photo slot with the line about it travelling in the review package.
7. **Save** — disabled until something is selected.
8. The pending line: "Nothing waiting. Scores and due dates match the log below."
   With pending events it says how many are waiting and that Update folds them in.

**The two-step is deliberate.** Logging is instant; Update is the commit. See
`FIELD_DEFINITIONS.md` section 15.

**States:** nothing selected (Save disabled); one action selected; multi-select
across plants; saved with pending events; everything folded in.

---

### 06 · Health history — `screenshots/06-health-history.png`

Reached from Home's HEALTH block.

Title `Health history` and the line "Your judgement of the collection over time.
Nothing here is calculated from care." A six-month bar chart with the average
above each bar and the month below, bars coloured by band. Then the explanation
that each figure is the mean of the plants rated **at the time** — unrated plants
are left out, not counted as average.

**That last point is a real rule, not copy.** An unrated plant must never be
folded into an average as a middling value.

---

### 07 · Adherence history — `screenshots/07-adherence-history.png`

Reached from Home's CARE ADHERENCE block. The factual record: what was due, what
was done, how late. **Never a score out of ten, never called health.**

---

### 08 · More about this plant — `screenshots/08-more-about.png`

Eight topic rows, each with an icon, a title and a one-line preview:
Environment · Soil & medium · Repotting / roots · Pruning & support ·
Pests & disease · Season / growth · Notes · Propagation.

Each opens the topic detail (screen 23).

---

### 09 · Topic detail — `screenshots/23-more-item.png`

One topic. A mono caps heading, a summary line, a small facts table (label and
value), and a paragraph of standing guidance.

**This is where `care_instructions` items surface, and where `notes_user` lives
under Notes.** Two lanes, kept visually distinct — see `FIELD_DEFINITIONS.md`
section 6c. Nothing an import proposes may touch the user's lane.

---

### 10 · Info and settings — `screenshots/10-info-settings.png`

Identity and placement, editable in place: name, species, ID and suffix, room,
pot, planter, acquired date, and the care spec (water interval summer and winter,
feed). Room and planter are pickers from the registry.

**The ID is not editable after save.** Names change; IDs do not.

---

### 11 · Add a new plant — `screenshots/11-add-plant.png`

Name, species, and a three-letter suffix **suggested from the species as you
type** and editable until save, at which point it locks. The next number is
assigned automatically and shown before you commit (`Next ID: 023`). A photo
slot. Save is disabled until name, species and a three-letter suffix all exist.

---

### 12 · Archived plants — `screenshots/12-archived.png`

Rows of retired plants with the reason and date, each with a Restore action. Empty
when nothing is archived — which is the current state, and correct.

**Archiving is an `Archive` event, not a state patch** (`FIELD_DEFINITIONS.md`
section 4). `archived` is derived from it.

---

### 13 · Photos — `screenshots/13-photos.png`

The gallery for one plant, grouped by date with a count per session. Each tile
carries its label (`Whole plant`, `Leaf`, `Soil`) and either a `HERO` badge or a
`SET HERO` button.

The line at the bottom states the model plainly: "Held in memory while you are on
this page, then dropped. The hero is the one image kept for good — it is what
shows in lists and on the plant page."

**That is the transient cache, and it is deliberate.** One image per plant is
persisted; the rest are session-scoped.

---

### 14 · Rooms and planters — `screenshots/14-rooms-planters.png`

Rooms with their plant chips, then planters. **Each planter shows its mode:**

- `Shared soil · one soak serves all` — green
- `Decorative · separate pots, check each` — amber

Tapping a planter selects everything in it either way. The flag governs whether
that counts as one watering or several. Glass Planter is shared; the Star Wars
planter is decorative.

---

### 15 · Recordings — `screenshots/15-recordings.png`

Sessions held on this device: date, duration, marker count, and whether a
transcript exists. Export moves the audio and its sidecar out for Whisper.

Two tiers — `verified` (Whisper, timestamped, coverage-gated) and `unverified`
(typed or pasted, no gate). See `FIELD_DEFINITIONS.md` section 6.

---

### 16 · Reminders — `screenshots/16-reminders.png`

What the app tells you about, and the honest caveat: "Reminders are local to this
device. Nothing is scheduled on a server, so nothing fires while the app is
closed — that is what the catch-up banner on Home is for."

---

### 17 · Since last time — `screenshots/17-since-last-time.png`

Saved states stacked for comparison. What changed since a chosen earlier point.

---

### 18 · What works — `screenshots/18-what-works.png`

The most interesting screen in the app: each care change you made, with your
ratings either side of it. Not a claim of causation — the ratings are shown, the
inference is yours.

---

### 19 · Prepare review package — `screenshots/19-review-package.png`

Bundles sessions, photos and events for a chat. Shows what is going in and flags
gaps (a session with no transcript, a plant not rated in months). Produces the
zip described in `FIELD_DEFINITIONS.md` section 7.

---

### 20 · Apply AI update — `screenshots/20-apply-update.png`

A drop zone: "Drop the update file / Or tap to browse", under the line "Import
one structured update file. Nothing changes until you approve it."

After a valid file loads, this becomes **the review table** — proposed value
beside current value, with the reason, one row at a time, each accepted or
rejected on its own. **There is no apply-all, and there must never be one.**
Validation is section 11; any failure rejects the file whole and names the
reason.

---

### 21 · Handoff log — `screenshots/21-handoff-log.png`

Every package sent and every update applied, with dates and what changed. The
audit trail for the AI loop.

---

### 22 · How this app works — `screenshots/22-how-it-works.png`

The explainer. Three sections: what the app decides, what you decide, what the AI
can propose. Then the health-and-adherence panel:

> Your rating is what you saw when you looked at the plant. The schedule record is
> what you did. They answer different questions, and the app never turns one into
> the other — no number here is calculated from your watering history.

**This screen is the design's conscience.** If a feature would make it untrue,
the feature is wrong.

---

### 24 · History — `screenshots/24-history.png`

One plant's last 10 entries: an icon in a coloured chip, the event name, a note,
and both a relative and an absolute date ("5 days ago / Aug 10"). Then
`View all entries ›` and `Care calendar ›`.

---

### 25 · All entries — `screenshots/25-all-entries.png`

The full log, newest first, with a count ("N entries since Mar 2026").

---

### 26 · Care calendar — `screenshots/26-care-calendar.png`

Month grids with dots on the days something happened. Three months, then
`All 12 months`.

---

### 27 · All months — `screenshots/27-all-months.png`

Twelve months of the same grid.

**On the two calendar surfaces:** this backward-looking calendar and the
forward-looking due view on Home are both kept deliberately. Whether the forward
one earns its place is an open question that only real use answers.

---

## 3. Type, colour and spacing

Pulled from the mock. **Treat as the original intent, not as a target to revert
to** — sizes tuned by hand in the build supersede these.

### Fonts

| Role | Family | Used for |
|---|---|---|
| Display | **Instrument Serif** | screen titles, plant names |
| Body / UI | **Instrument Sans** | everything else |
| Mono | **JetBrains Mono** | IDs, dates, section labels, numeric readouts |

Loaded from Google Fonts: Instrument Sans (400–700, italic), Instrument Serif,
JetBrains Mono (400, 600).

### Type scale (mock values)

| Use | Size / weight | Family |
|---|---|---|
| Screen title | 38–44px | serif |
| Plant name, detail | 32px | serif |
| Section heading | 22px / 600 | sans |
| Score, large | 38px / 600 | sans |
| Body | 17px / 400, line-height 1.45 | sans |
| Row title | 18–19px / 600 | sans |
| Row subtitle | 16–17px / 400, dimmed | sans |
| Section label | 14px / 600, caps, letter-spacing .08em | mono |
| Date, ID, readout | 16px / 400 | mono |

**Floor: 16px.** Nothing smaller anywhere. Touch targets never below 44px.

### Colour

| Token | Hex | Use |
|---|---|---|
| Page | `#0e130d` | app background |
| Card | `#161c14` | panels |
| Raised | `#1a2218` | rows, buttons on cards |
| Ink | `#EDF2E9` | primary text |
| Ink dim | `rgba(237,242,233,.55)` | body secondary |
| Ink faint | `rgba(237,242,233,.4–.5)` | dates, labels |
| Accent | `#9BE39B` | actions, positive, active nav |
| Accent ink | `#122a13` | text on accent fills |
| Amber | `#E9D25C` | holding, caution, decorative planter |
| Warm red | `#E88A6A` | struggling, negative delta, past interval |
| Hairline | `rgba(255,255,255,.07–.16)` | borders |

Two background colours, one accent. Bands are the only place three signal colours
appear together.

### Shape and spacing

- Radii: 11px small controls · 14px rows · 16–18px cards · 22px sheets ·
  40px device frame.
- Page padding 16–20px horizontal.
- Gaps: 7px between rows in a group, 14px between groups, 26px between sections.
- Borders are 1px hairlines, not shadows. **The design has no drop shadows.**
- Layout is flex and grid with `gap` throughout.

---

## 4. What must be consistent across screens

If any of these renders differently in two places, it is a bug.

1. **The score block.** Same three lines, same order, same sizes, everywhere a
   health figure appears — Home, plant detail, health history, plants list, the
   review table. Spec section 3b. One component.
2. **The delta always carries elapsed time.** `+0.5 · 7wk`. Never a bare delta.
3. **The back button names its origin.** Never a generic "Back". Tab-bar roots
   clear the stack.
4. **The tab bar** is fixed, four items, Rec centred, active item in accent.
5. **Interval language.** "N days past interval", "Check soil". Never "overdue"
   as an instruction, anywhere. The exception is the adherence record, which
   legitimately says "average 3 days late" — that describes what you did, not
   what the plant needs.
6. **Counts are derived.** Every "22 plants", every badge, every total.
7. **Dates.** Relative and absolute together where both fit ("5 days ago /
   Aug 10"); `MMM DD` in mono alone where they do not.
8. **Two notes lanes** stay visually distinct wherever they appear.
9. **Approval is per row.** No apply-all, on any screen, ever.

---

## 5. Known problems in the mock

Do not reproduce these.

1. **Two All-pages items are both labelled "Photos"** and go to different screens
   (plant detail and the gallery). Rename the first.
2. **Plant detail renders the rating in the old inline format.** Spec section 3b
   specifies the stacked block with delta and elapsed time. The spec wins.
3. **Sample data is invented** — 22 fictional plants, invented health arrays,
   invented events. The registry is `SEED_PLANTS.json`; health comes only from
   `Rate` events.
4. **Counts are hardcoded** in the mock because a mock has no store. Derive them.
5. **The status bar is furniture.** Not to be rebuilt.

---

## 6. Screenshot index

All at 390px wide, dark theme, full screen height, in `screenshots/`.

```
01-home.png                   06-health-history.png     13-photos.png
02-plants.png                 07-adherence-history.png  14-rooms-planters.png
03-record.png                 08-more-about.png         15-recordings.png
04-plant-detail.png           10-info-settings.png      16-reminders.png
05-log-care.png               11-add-plant.png          17-since-last-time.png
                              12-archived.png           18-what-works.png

19-review-package.png         23-more-item.png          26-care-calendar.png
20-apply-update.png           24-history.png            27-all-months.png
21-handoff-log.png            25-all-entries.png
22-how-it-works.png
```

Captured from the mock at 520px slices and stitched, so a horizontal seam may
appear every 520px. It is an artefact of capture, not a design element.
