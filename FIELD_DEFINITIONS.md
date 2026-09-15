# Deez Plants — Master Reference

Version 1.6 · Sep 2 2026

This document defines every field the app stores, who is allowed to change it,
the exact shape of the package the app exports, the exact shape of the update
file it will accept back, how audio and transcripts are verified, and how two
devices stay in sync. It is the app's validation spec, the instruction set for
the reviewing AI, and the build specification. **If a field or rule is not in
this document, it does not exist.**

Read section 3 first. The split between health and adherence is the single most
important decision in the project and everything else follows from it.

---

## 1. How the round-trip works

1. The app exports a **package**: a manifest of all plants, the events since the
   last package, the media, and a transcript. The package carries a
   `package_id`.
2. The AI reads the package and returns an **update file**: a flat list of
   proposed changes. Each change names one plant, one field, and one new value.
   The AI never returns a manifest and never invents structure.
3. The app validates every proposed change before showing any of them, then
   presents them for individual approval. Nothing is written until approved.

The AI's output is a list of changes, not a new state. This is what makes the
app's job mechanical rather than interpretive.

---

## 2. Identifiers

| Field | Type | Rule |
|---|---|---|
| `plant_id` | string | Format `NNN-XXX`. Assigned once, permanent, never reused — not even after archiving. The AI may reference it but never propose changing it. |
| `package_id` | string | Format `PKG-YYYY-MM-DD-N`. Every update file must cite the package it was generated from. |
| `session_id` | string | Format `SES-YYYY-MM-DD-N`. One recording session. |
| `event_id` | string | Unique across devices. Used as the merge key during sync. |

---

## 3. Health and adherence are two different things

This supersedes the score model in versions 1.0–1.2, which let the app compute a
number and call it health. That was wrong. It is recorded here so the mistake is
not repeated.

**`health` is a human judgement. The app never sets it.** A plant's health is
what you see when you look at it: colour, posture, new growth, rot, pests. Only
you or an approved AI change can write it. It has no value until somebody rates
it, and "not rated" is a legitimate, permanent state.

**`adherence` is a factual record of what you did.** It counts care events
against each plant's own interval. It is derived, never overridden, and it is
**never expressed as a score out of ten** — scoring it would recreate the exact
confusion this split exists to remove. It is stated plainly:

> On time 14 of 18 waterings · average 2 days late

Adherence has three states, and they drive the app's mechanics — Due, Needs
attention, calendars:

| State | Condition |
|---|---|
| `on` | not past the interval |
| `slip` | 1–3 days past |
| `behind` | more than 3 days past |

**Why both.** Health alone is an opinion with no context. Adherence alone says
nothing about whether the plant is thriving. Put side by side over months they
answer the only question the app exists to answer: *did what I changed help?*
That comparison lives on the **What works** page — every care-spec change with
your rating in the 30 days before and after, and how well you kept the schedule
in that window. A change you did not keep to was never tested, and the page says
so rather than pretending otherwise.

**Precision.** Roughly twelve ratings a year per plant supports direction, not
proof. The app must never render a trend line, a percentage, or a computed
"improvement" over ratings. Direction only.

---

## 3b. The score block

Wherever a health figure appears — Home, plant detail, health history, the
plants list, the review table — it renders as **the same block**, in the same
order, with the same type sizes. A score read on one screen must be readable
without re-learning it on the next.

The block is three lines, top to bottom:

```
HEALTH
7.4 /10        Aug 14
6.9   Jun 28   +0.5 · 7wk
```

| Line | Contents |
|---|---|
| 1 | the label, mono caps, dim |
| 2 | current value, large · `/10` · the date it was confirmed |
| 3 | previous value, dim · its date · the delta · elapsed time between the two readings |

**Line 1 is contextual (amended 2026-09-08).** As first written, this section
required the label wherever a health figure appears. The design it describes
does not do that: on plant detail the score sits beside the plant's photo as
`8 / 10` with no label, and in the plants list it is a compact chip carrying
the number alone. The spec and the design contradicted each other and the
build followed the spec, which put the word `HEALTH` in two places the owner
never intended it.

The rule is now: **carry the label where the block is one card among several
and would otherwise be an unidentifiable number — Home, health history, the
review table. Drop it where the surrounding screen already says what the
number is — beside the plant's own photo on plant detail.**

Lines 2 and 3 are unchanged in both cases and remain identical on every
screen that shows the block. That is what rule 6 protects: a score is read
the same way everywhere. A heading that repeats what the page already says is
not part of reading the score.

**The plants list is a separate, larger exception.** `DESIGN_REFERENCE.md`
screen 02 specifies its rows as "thumbnail, ID in mono, name, the health
figure in a **coloured pill**, and a state word beneath it" — not this block
at all. The build previously put the full three-line block in every row,
which made rows tall enough to trip the reference's own "lessons already
learned once — plant list cards were previously too tall… prefer compact
rows." Twenty-two of those do not fit a phone.

So a plants-list row shows the **pill**: the integer alone, coloured by band,
with the adherence state word beneath. No `/10`, no date, no line 3. This is
a genuine departure from "one block everywhere" and is recorded here as a
decision rather than left to drift. It is safe because a pill cannot be
mistaken for the full reading — it is a way to *find* a plant, not to *read*
its score. The moment you open the plant, the real block is there. A rating
with no value shows an empty pill, never a computed stand-in (rule 1).

**The delta always carries elapsed time.** `+0.3` over six weeks and `+0.3` over
six days are different news, and a delta without its interval is misleading.
Format is the shortest honest unit: `6d`, `3wk`, `4mo`. Written as `+0.5 · 7wk`.

**On plant detail, "previous" means your previous rating of that plant** —
whenever that was, even four months ago. On Home it means the previous
collection average. Same block, different subject.

**Delta colours:** positive `#9BE39B`, negative `#E88A6A`, no movement dim. A
movement under 0.05 reads `no change`, not `+0.0`. With no previous reading,
line 3 reads `first record` and nothing else.

**Per-plant `health` is an integer.** The collection average on Home is a
decimal computed from the current ratings (`7.1`), and that is the only place a
fractional health figure legitimately appears. A decimal on a single plant is a
bug.

Line 3 is omitted entirely when there is no previous value. Line 2 is omitted
when the plant is unrated — the block then shows `Not rated` and a rate button.

---

## 4. Plant fields

`editable_by` values: **user** = you only · **both** = you and the AI ·
**derived** = neither, the app computes it.

### Identity

| Field | Type | Allowed values | editable_by |
|---|---|---|---|
| `name` | string | 1–60 chars, required | user |
| `species` | string | 1–80 chars, required | both |
| `acquired` | string | `MMM YYYY`, e.g. `Mar 2024` | user |
| `archived` | boolean | **derived** — true when an `Archive` event exists for this plant | derived |
| `archived_date` | string | `MMM DD YYYY` — the `Archive` event's date | derived |
| `archived_reason` | string | the `Archive` event's `note`, ≤ 120 chars | derived |

**Archiving is an event, not a state patch.** Retiring a plant writes an
`Archive` event whose `note` carries the reason; the three fields above are
recomputed from it like everything else derived. This keeps the model
append-only with no mutation exceptions, and it means the log can always answer
when a plant was retired and why without a separate record.

`archived` covers both outcomes — a plant that died and a plant that was rehomed
or given away. The `note` says which: "Died — root rot, Nov 2025" or "Rehomed to
Sam". The ID stays permanently reserved either way; slot numbers are never
reused.

### Placement

| Field | Type | Allowed values | editable_by |
|---|---|---|---|
| `room` | string | a room name from the registry | user |
| `spot` | string | free text, ≤ 60 chars, e.g. `bookshelf` | user |
| `pot` | string | free text, e.g. `12" terracotta` | user |
| `planter` | string | a planter name, or `None — own pot` | user |

Placement is yours. The AI may comment on it in a change `reason` but may not
propose a value — it cannot see where things physically are. Rooms and planters
are a user-editable registry, not a fixed enum.

**`room` and `spot` were one field until 2026-09-08.** The seed put the whole
description in `room`, which gave a registry of seven "rooms" of which five
were *Living room, by the window*, *Living room hutch*, *Living room shelf*,
*Living room bookshelf* and *Living room, on the fireplace mantel*. Nothing
could then answer "how are the living room plants doing", because the app did
not know they were the same room.

`room` is now the room — one of a short list — and `spot` is where in it, in
the owner's own words. The 22 seeded plants were split by taking everything
after the room name as the spot, written as ordinary `Edit` events so the
history is intact and nothing was overwritten.

**The planter registry carries `shared_water: boolean.**

- `true` — the plants share soil. One soak genuinely serves all of them, and a
  watering event against the group is one real act of care.
- `false` — the planter is decorative: separate pots sitting together for
  display. The plants stay grouped on the plants list and in the walk route, and
  tapping the planter still selects all of them, because that is the gesture the
  user wants. But they are not one watering: each runs on its own interval, and
  the group is a selection convenience, not a claim that one pour served
  everything.

The distinction is shown wherever the planter is named, so a group selection is
never silently mistaken for a shared soak. Current values: **Glass Planter
`true`** (015-PTH and 016-SYN share soil), **Star Wars Decorative Planter
`false`** (a snake plant, two haworthias and a cactus, separately potted, with
different water needs).

### Care spec

These are the fields an AI update exists to refine.

| Field | Type | Allowed values | editable_by |
|---|---|---|---|
| `water_interval_days` | integer | 1–60 | both |
| `water_interval_days_winter` | integer | 1–60, optional | both |
| `feed` | string | free text, ≤ 120 chars | both |
| `light` | string | free text, ≤ 120 chars | both |
| `soil` | string | free text, ≤ 120 chars | both |

Two intervals because the same soak takes far longer to dry out in winter. The
summer figure is in force from March to October, the winter figure from November
to February. The app shows which is active and why.

### Reference (added 2026-09-08)

Six longer free-text fields behind "More about this plant". They exist because
the mock's own version of that screen had eight topics and only two of them —
soil and notes — corresponded to a field that existed. Rather than six rows
permanently reading "not tracked", the screen was collapsed to what was real.
The owner then asked for the other six for real.

| Field | Type | Allowed values | editable_by |
|---|---|---|---|
| `environment` | string | free text, ≤ 600 chars | both |
| `repotting` | string | free text, ≤ 600 chars | both |
| `pruning` | string | free text, ≤ 600 chars | both |
| `pests` | string | free text, ≤ 600 chars | both |
| `season` | string | free text, ≤ 600 chars | both |
| `propagation` | string | free text, ≤ 600 chars | both |

**These are the one place the AI is asked for knowledge rather than
judgement.** Most of what belongs here is true of the species, not of your
plant: how a Monstera propagates, when a Thanksgiving cactus flowers, what
light a Haworthia wants natively, where it comes from. That is stable
reference material, the AI is good at it, and writing it breaks none of the
rules — rule 1 forbids the app computing *health*, not the AI knowing botany.

Observations about *your* plant — when yours actually flowered, how it
responded to being moved — belong here too, and only you can write those.

`editable_by: both`, so the AI proposes and you approve row by row like any
other change (rule 4). Empty is a normal, permanent state: a field nobody has
filled reads as empty, never as invented content.

### Status

| Field | Type | Allowed values | editable_by |
|---|---|---|---|
| `health` | integer | 1–10, or null when unrated — **integer only, never stored as a decimal** | both |
| `health_source` | enum | `Me`, `AI` | derived |
| `health_confirmed` | string | `MMM DD` — when the rating was last confirmed | derived |
| `health_changed` | string | `MMM DD` — when the value last actually moved | derived |
| `health_stale` | boolean | true when `health_confirmed` is over 90 days old | derived |
| `adherence` | enum | `on`, `slip`, `behind` | derived |
| `on_time_count` / `care_count` | integer | the on-time record | derived |
| `avg_days_late` | number | average lateness | derived |
| `status_label` | enum | `Stable`, `Improving`, `Declining`, `Needs attention` | both |
| `do_next` | string | one instruction, ≤ 160 chars | both |
| `last_checked` | string | `MMM DD` | derived |

`health_source` is derived from who last wrote the number, and the app shows it
as a small tag beside the rating (ME / AI) so provenance is visible without
opening anything. There is no `App` source — the app cannot rate a plant.

An AI `health` change must carry a `reason` naming the visual evidence for it. A
health change with no observation behind it belongs in `unaddressed`.

### Confirming a rating is not a no-op

"I looked at it today and it is still a 7" is different information from "I rated
it 7 four months ago and have not looked since." The first says the plant is
confirmed fine; the second says the number is stale and nobody actually knows.

So a rating carries two dates. Saving the same value writes a `Rate` event and
refreshes `health_confirmed` without moving `health_changed`. Both are shown
wherever a rating appears, and the gap between them is the signal:

> **7** · confirmed Aug 14 · unchanged since Jun 2

A plant whose `health_confirmed` is over 90 days old is marked `health_stale`
and carries a quiet marker in the app — visible, never an alarm. It tells you
where your attention has lapsed rather than passing judgement on the plant.

Save must be a single tap when the value is unchanged. Confirming twenty plants
on a walk cannot be twenty deliberate decisions.

The AI owns `status_label` and `do_next` — the judgements arithmetic cannot
make. `do_next` holds exactly one action; if several things are needed, the AI
sends the most urgent and leaves the rest to `reason` text or a `note` event.

**You can override anything.** Every field in this document is manually editable
by you except the derived ones, which are recomputed from events by definition.
A manual override is written as an `Edit` event and holds until you change it.

---

## 5. Events

Every care action and every manual field edit is an event. Events are
append-only, which is what makes multi-device sync safe (section 8).

| Field | Type | Allowed values |
|---|---|---|
| `event_id` | string | unique across devices |
| `plant_id` | string | must exist and not be archived |
| `type` | enum | `Water`, `Feed`, `Prune`, `Repot`, `Photo`, `Inspect`, `Support`, `Pest treat`, `Rate`, `Other`, `Edit`, `Archive` |
| `date` | string | `YYYY-MM-DD` |
| `time` | string | `HH:MM`, 24h |
| `note` | string | ≤ 400 chars, optional |
| `media` | array | filenames present in the package, optional |
| `media_labels` | array | one of `whole`, `leaf`, `soil`, `roots` per media item, optional |
| `source` | enum | `user`, `ai`, `round` |
| `session_id` | string | when logged during a recording, optional |
| `offset_s` | integer | seconds into that session, optional |
| `field` | string | for `Edit` events only — the field changed |
| `from` / `to` | string | for `Edit` events only — old and new values |

`Rate` events carry the health rating in `to`. Because manual edits are events,
provenance needs no separate system: the last event touching a field is who set
it and when.

**Care rounds.** The common case is one action across many plants — a weekly
watering. The app writes one event per plant with `source: round`, never a single
grouped event. History stays per-plant and accurate.

### Pending and folded in

Logging is instant and local. Events are marked pending until you tap **Update**,
which recomputes adherence, due dates, needs-attention, calendars and history in
one pass, and saves a snapshot of the state it replaced. Ratings are never
touched by Update. The app keeps the last five snapshots; the **Since last time**
page stacks them for comparison with a six-month chart at the top.

---

## 6. Recording, markers and transcript verification

**The phone records; the laptop transcribes.** A browser cannot do reliable
long-form speech recognition — it needs the network, drops out, and does not
survive a screen lock. Whisper on a laptop is free, offline, faster than real
time, and identical in quality every run. This split is deliberate, not a
compromise, and it means audio never leaves your control.

### The screen log

**The screen log runs always, not only while recording.** Every screen you open
is recorded with its timestamp and, when recording, its offset into the session.
It costs kilobytes — a 20-minute walk is 20 to 40 entries — and it is the only
objective evidence in the whole export. Everything else is your judgement.

Two rules keep it from becoming noise:

- **Pass-through visits are dropped.** Anything on screen under 5 seconds was
  navigation, not looking.
- **It is labelled as evidence, not fact.** The export calls it "screen open at
  this time", never "plant discussed". Presented as truth it would occasionally
  override your own words, which is worse than not having it.

Retention: the last 7 days or 500 entries, whichever comes first.

**Ambiguous segments attach to the previous plant.** When a passage spans a
transition, or you were between plants, it goes to the plant whose page was open
last. Not to an unassigned pile — that is more honest and more work, and the AI
sorts it out from the words anyway.

The app owns the recording, so it knows things the transcript cannot tell it.
Written as a **sidecar file**, not stamped into the audio — audio chapter markers
are fragile, tool-dependent, and stripped by anything that re-encodes.

```json
{
  "session_id": "SES-2026-08-14-1",
  "started": "2026-08-14T18:22:04",
  "duration_s": 724,
  "markers": [
    { "offset_s": 0,   "type": "session_start" },
    { "offset_s": 12,  "type": "plant_open",  "plant_id": "001-MON" },
    { "offset_s": 48,  "type": "care_logged", "plant_id": "001-MON", "event_id": "EV-8841" },
    { "offset_s": 61,  "type": "photo",       "plant_id": "001-MON", "media": "001-MON_2026-08-14_1823_01.jpg" },
    { "offset_s": 96,  "type": "plant_open",  "plant_id": "004-MNY" },
    { "offset_s": 724, "type": "session_end" }
  ]
}
```

Entries outside a recording carry an absolute `at` timestamp and no `offset_s`;
entries inside one carry both.

**Markers solve attribution, which the transcript is bad at.** Spoken plant names
get mangled and half the collection sounds alike. But the app knows the Monstera
page was open from 0:12 to 1:36, so everything said in that window belongs to the
Monstera regardless of what the transcript heard. Every marker type above is
recorded automatically: page opens, care logged, photos taken.

### Coverage verification

Perfect transcription is not achievable. **Auditable** transcription is, and the
app measures against a duration it recorded itself.

The transcript arrives with per-segment timestamps. The app asserts:

1. The last segment ends within **20 seconds** of `duration_s` when it stops
   short, and within 5 when it runs past.

   **Amended 2026-09-14, after the first real walk failed on it.** The
   allowance was 5 seconds each way. The owner stopped talking, lowered the
   phone and found the stop button — six seconds — and the gate called an
   otherwise perfect transcript a failure. Nobody presses stop mid-syllable,
   so five seconds fails nearly every real walk, and **a gate that cries wolf
   is worse than no gate**: the one time it matters, it has already been
   learned as noise.

   The asymmetry is the point. Stopping short is quiet, which is normal.
   Running *past* the audio is not quiet — it is a transcript that does not
   belong to this recording — so that direction keeps the narrow allowance.
2. No gap between segments exceeds 20 seconds **of audio that had sound in
   it**, or where a seam explains it.

   **Amended 2026-09-14.** The rule was written as "without a silence
   marker", and nothing ever wrote one — so in practice every silence counted
   against a transcript. That is backwards: **silence is a fact about a walk,
   not a fault in a transcript.** Watering a plant properly is a minute of
   quiet; standing looking at one is longer.

   The measurement is made **on the laptop**, by `transcribe_walk.py`, which
   has the decoder open anyway — the phone never analyses audio for this. The
   script writes a `quiet:` line of ranges into the transcript and the app
   discounts them from any gap. It is measured from the **audio**, never from
   the gaps between segments, because deriving it from the transcript would be
   circular and would make the assertion unfailable.

   Where no measurement is present — a pasted transcript, an older script —
   gaps are judged as before rather than wrongly forgiven.
3. Every marker `offset_s` falls inside a transcribed segment.
4. Segment timestamps are monotonic and none exceeds `duration_s`.

Any failure is flagged with a replay button at that offset. **A package is not
marked `verified` until coverage passes** — an incomplete transcript means the AI
is reviewing a partial account of the walk. Raw audio and photos are saved as
captured regardless of whether transcription ever runs.

### Two tiers, because not every transcript has timestamps

The four assertions above require Whisper output. A transcript that was typed,
pasted, or dictated has no timestamps at all, and rejecting it would mean
rejecting the fastest way to get words into the app.

| Tier | `transcript_tier` | Source | Coverage gate | Attribution |
|---|---|---|---|---|
| Verified | `verified` | Whisper, timestamped | all four assertions | screen log, precise |
| Unverified | `unverified` | typed, pasted, iOS dictation | none | spoken names and inference, screen log as a hint |

An unverified transcript is accepted whole, stored against the session, and
marked in the manifest so the AI knows what it is holding. The screen log is
still attached — on a walk where you happened to open a few plants that evidence
exists; where you did not, nothing is lost.

A session may hold both: an unverified paste now, replaced by verified Whisper
output later. Replacing raises the tier and re-runs the gate.

### Recording constraints (iPhone)

- **Format:** `audio/mp4` (AAC) via `MediaRecorder`. Roughly 1 MB per minute — a
  20-minute walk is a 20 MB file.
- **One long recording per walk.** Pauses are free: silence costs nothing and the
  screen log keeps running through it.
- **Wake lock held while recording**, and the app must stay in the foreground.
  Switching apps mid-walk can end the capture. The recording screen says so.
- **Install to the home screen.** Recording is materially more stable as an
  installed web app than in a Safari tab.
- **Audio moves by hand.** iOS Safari cannot hand a file to Whisper. The walk's
  audio and its sidecar are exported to Files, carried to the laptop, and the
  transcript comes back the same way.
- **No live transcription on iOS.** Safari's speech recognition is not dependable
  enough to build on; this is why the laptop transcribes.

---

## 6b. Photos

**Photos live in the shared folder, not in the app.** The app stores filenames,
dates and labels — kilobytes even for thousands of photos — and generates
thumbnails on demand for whatever is on screen.

**One photo per plant is kept permanently: the hero.** You choose it manually
from the plant's photos page, and it is usually not the newest — a close-up of a
leaf underside is useless for identifying a plant in a list. The hero shows in
the plants list, the care checklist, the plant page header and the review
package.

**A second per-plant choice: the compared pair.** `compare_media` names the two
photographs the What-works screen puts side by side — `editable_by: user`, a
plant field written as an `Edit` event, stored as two media ids separated by a
comma, or absent.

Absent is the normal case and means *use the rule*: **the last two whole-plant
photographs**. Comparing like with like is the point — a whole plant beside a
leaf close-up looks like change without being it, and a screen whose job is
judging change must not manufacture any. Fewer than two whole-plant shots means
no pair at all, stated plainly rather than padded with a close-up.

It is a field rather than a local preference for one reason: it has to survive
a backup and restore. A choice that vanished when the owner moved to a new
phone would be worse than one that travels with the record. A chosen photo that
is later deleted falls back to the rule rather than stranding the pair, and the
pair always renders oldest first, so it reads then and now.

**Everything else is transient.** Opening a plant's photos page caches that
plant's set while you are on it and drops it when you leave. First open of a long
history takes a few hundred milliseconds and fills in progressively as you
scroll; after that it is instant. The cache is a convenience, never a store.

Per-plant only. A collection-wide photo archive is a laptop view where scanning
across plants is the point.

**Labels.** Most photos are of leaves, soil or roots rather than whole plants, so
each carries an optional one-tap label at capture — `whole`, `leaf`, `soil`,
`roots`. Never a text field. It makes the archive scannable and tells the AI what
it is looking at.

### Reference photos at first run

Photos supplied at build time are **seed data entering through the normal door**,
not bundled assets. On first open the app inserts one `Photo` event per plant:

```json
{ "type": "Photo", "plant_id": "001-MON", "source": "seed",
  "media_labels": ["whole"], "date": "<the plant's acquired date>" }
```

They land in IndexedDB as Blobs exactly like captured photos, so they appear in
the gallery, can be labelled, can be chosen as the hero, and travel in review
packages. Bundling them as static assets instead would create a second media
path that none of that machinery knows about.

Source files are named `NNN-XXX__Full-Plant-Name.jpeg` (double underscore, as the
master reference list uses). Once imported they follow the app convention:
`NNN-XXX_YYYY-MM-DD_HHMM_NN.jpg`. Thumbnails are generated at import, same as at
capture.

---

## 6c. Notes and care instructions — two lanes

One field shared between you and the AI is not survivable: an import either
destroys what you typed, or you stop trusting imports. So there are two, kept
visually distinct on plant detail, below the timeline.

| Field | Type | Rule | editable_by |
|---|---|---|---|
| `notes_user` | string | ≤ 2000 chars, free text | **user** |
| `care_instructions` | array | discrete items, see below | both |

**`notes_user` — yours.** What you learn by looking: "west window burns the
leaves after 2pm", "pot has no drainage hole". Editable inline, never touched by
any import, never proposed by the AI, and validation rejects any update file
that names it (section 11, rule 6a).

**`care_instructions` — a list, not a blob.** Each item stands alone:

```json
{
  "instruction_id": "INS-2026-08-12-3",
  "text": "Feed monthly at half strength during active growth",
  "added": "2026-08-12",
  "source": "ai",
  "package_id": "PKG-2026-08-12-1",
  "replaces": null
}
```

- `text` ≤ 200 chars. `source` is `ai` or `user` — you can add your own items
  here too, and they are marked as yours.
- Rendered as a stack, each line showing its text and `added` date, each
  individually deletable.
- An AI item arrives in the same review table as care-spec changes and is
  accepted or rejected on its own row. **Accepting never overwrites** — it adds
  an item, or replaces exactly the one named in `replaces`, which you see beside
  it before approving.
- Items are proposed with `field: "care_instructions"` and an `op` of `add` or
  `replace`. No other op exists; deletion is yours alone.

**Collection level.** One general-notes page carries the same two lanes for
things that are not about a single plant — feeding regimes, seasonal routines,
whatever comes out of the general-care chats. Fields `collection_notes_user` and
`collection_care_instructions`, identical rules.

---

## 7. Package contents

```
deez-plants-YYYY-MM-DD.zip
├── manifest.json      package_id, export date, every plant with all fields above
├── events.json        every event since the previous package
├── transcript.txt     timestamped, with a coverage report
├── markers.json       one marker track per session
├── sessions/          audio, one file per recording session
└── media/             photos, named NNN-XXX_YYYY-MM-DD_HHMM_NN.jpg
```

The manifest is the schema. Whatever fields it contains are the only fields that
exist, and the AI should treat any field absent from it as out of scope.

**Practical size limit.** A full ZIP with photos and audio is too large for a
chat window. In normal use the app exports a **review set** — `manifest.json`,
`events.json`, `transcript.txt` and `markers.json`, all small text files — plus
only the photos you flag for a look. The full ZIP stays on the device as the
archive.

**Audio never leaves the device.** Chat interfaces will not take it. The
transcript is what the AI reads, which is why coverage is a hard gate.

---

## 8. Two devices, one shared folder

Browser storage is per-device. A refresh will never move data between phone and
laptop on its own — something has to carry it. That something is a folder you
already sync (iCloud, Dropbox, Drive), holding the state file and its subfolders:

```
Deez Plants/
├── state.json     the merged record — both devices read this on open
├── media/         every photo, named NNN-XXX_YYYY-MM-DD_HHMM_NN.jpg
├── sessions/      audio and its marker sidecar, one pair per session
├── outbox/        review sets the app built, ready to drag into a chat
└── inbox/         update files returned by the AI, ready to import
```

Media and audio live here rather than inside the app, which is what lets photos
from a real camera land somewhere both devices can see.

Two folders for isolation: nothing ambiguous about which direction a file is
travelling.

### What each device can actually do with that folder

A hard platform limit, not a design choice. Version 1.4 promised more than the
phone can deliver.

**Laptop (Windows, Chrome or Edge).** Real folder access. You grant the app a
directory handle once; it reads `state.json` on open and writes on Update, with
no file dialogs after the first grant. This is where the folder model works as
originally described.

**iPhone (Safari).** No folder access at all. It cannot read or write a synced
directory on its own. What it can do:

- **Export** — write a file to Files, which can be the iCloud folder. Two taps.
- **Import** — read a file you choose through the picker. Two taps.

So on the phone, sync is deliberate: **Export state** at the end of a session,
**Import state** when you sit down having changed things at the desk. The Sync
button on the phone opens those two actions and reports how far behind this
device is; it never claims to have synced by itself.

**Why the data survives this.** Events are append-only and merging is a union by
`event_id`, so it does not matter which device is ahead, how late a file arrives,
or in what order. A missed export costs a round trip, never a record.

**The phone's own store is authoritative between exports.** IndexedDB holds
everything; the folder is a transfer medium, not the source of truth. Nothing is
ever only in the folder.

**Merging is safe because events are append-only.** Take the union of events by
`event_id`, then recompute adherence, due dates and calendars from scratch.
Nothing is clobbered, and order of arrival does not matter.

The one field that genuinely conflicts is `health` — two devices rating the same
plant differently. Last write wins, by `health_confirmed` plus event time, and
the app shows which device set it. No silent merge of a judgement.

**Reads happen on open; the Sync button is for writing and for status.** It
reports last synced, how many events are waiting, and whether this device is
ahead. **Update** is already the commit point, so writing on Update is the
natural trigger.

---

## 9. What each device is for

Not a mirror. Different tools on one record.

**Phone — capture.** It is the thing that walks. Recording, photos, route
markers, care rounds, rating plants while looking at them. Everything in
section 6 originates here.

**Laptop — review, edit and transcription.** Three things it can do that the
phone cannot:

- **Transcription.** Whisper locally, plus the coverage flags and transcript
  correction from section 6.
- **See all 22 at once.** A wide table, one row per plant — adherence, last
  rating, days since water, next due, care spec — sortable and editable in
  place. Fix eight water intervals in a minute instead of eight page visits.
  Same for reviewing an update: every proposed change beside its reason and the
  current value.
- **File work.** Build the outbound review set, drag the returned file in.
  Drag-and-drop is native here and awkward on a phone.

**Retained on both:** logging care, photo attach (photos from a real camera
arrive on the laptop), package prepare and update apply. Capture-only features
stay phone-first but are never removed from the laptop — you will water the
plants nearest your desk and log it from the chair.

---

## 10. Update file

One file. One array. Nothing else.

```json
{
  "package_id": "PKG-2026-08-15-1",
  "generated": "2026-08-16",
  "changes": [
    {
      "plant_id": "006-FER",
      "field": "water_interval_days",
      "value": 6,
      "reason": "Crispy tips and dry soil at two consecutive checks through summer."
    },
    {
      "plant_id": "004-MNY",
      "field": "health",
      "value": 5,
      "reason": "Yellowing on two lower leaves in the Aug 6 photo, consistent with overwatering rather than schedule."
    }
  ],
  "unaddressed": ["011-HOL", "022-CAC"],
  "notes": "Two plants had no new evidence this cycle."
}
```

`unaddressed` lists plants the AI deliberately made no change to. It is required
— it is how the app distinguishes "nothing to change" from "the AI forgot."

---

## 11. Validation

The app runs these before showing you anything. A file failing any check is
rejected whole, with the reason named.

**Provenance**
1. `package_id` matches a package this app actually exported.
2. No previously applied update cites the same `package_id`. (blocks double-apply)

**Referential**
3. Every `plant_id` exists in the registry.
4. No `plant_id` refers to an archived plant.
4a. No change targets `archived`, `archived_date` or `archived_reason` — these
    are derived from the `Archive` event, and retiring a plant is the user's act
    alone.
5. Every `field` is a field named in section 4.
6. No change targets a `user`-only or `derived` field.
6a. No change targets `notes_user` or `collection_notes_user` under any
    circumstances. These are yours; a file naming them is rejected whole.
6b. A `care_instructions` change carries `op` of `add` or `replace`, `text`
    within 200 chars, and — for `replace` — an `instruction_id` that exists on
    that plant. `op: delete` does not exist. `health` is not derived —
   see section 3 — but `health_source`, `health_confirmed`, `health_changed`,
   `health_stale`, `adherence`, `last_checked` and the adherence counters are.

**Value**
7. Every value matches its type and allowed range.
8. Enums match exactly, including case.
9. `water_interval_days` is an integer between 1 and 60.
10. A `health` change is an integer 1–10 and carries a `reason` naming a visual
    observation. No change targets `adherence`, `health_source` or any derived
    counter.

**Completeness**
11. Every plant in the manifest appears in either `changes` or `unaddressed`.
12. Every change carries a non-empty `reason`.

**Conflict**
13. For any field with a user `Edit` event dated after the package export, the
    change is flagged rather than shown normally: it names the field, your
    value, the AI's value, and that you were the last to set it. You choose
    before it can be approved.

---

## 12. Running this without API costs

Nothing in this design requires an API. The app runs locally in a browser; the
files move by hand:

1. App builds the review set into `outbox/`. You download or open it.
2. You drop those files into a Claude or GPT chat on your existing subscription.
3. The AI replies with the update JSON. You save it to `inbox/`.
4. You drop that file into the app and approve changes one by one.

Total cost is the subscription you already pay for. Two manual file moves per
cycle. The one decision that could introduce cost is transcription — local
Whisper on the laptop is free and offline; anything cloud-based is not.

---

## 13. Expected rhythm

The app must be cheap in the common case and capable in the rare one.

- **Weekly, most often:** water a set of plants, log it. Two taps — pick Water,
  select the plants, log. This is 90% of use and must never require per-plant
  navigation.
- **Monthly-ish:** feed round. Same shape.
- **Every month or two, becoming rarer:** a recorded walk with photos, sent for
  AI review, changes applied. This is where the value accumulates, but it is not
  the daily path and must not set the shape of the whole app.
- **Occasionally:** rate a plant, prune, repot, add or archive a plant.

---

## 14. Notes for whoever prompts the AI

- Return the update file and nothing else. No commentary outside `reason`.
- One change per field per plant. Do not bundle.
- If evidence is thin, say so in `unaddressed` rather than guessing.
- Smaller, more frequent updates are better than large ones — a rejected file
  costs a whole cycle.
- Do not propose changes to `room`, `pot`, `planter`, `name`, or `acquired`.
- Propose `health` only when a photo or the transcript shows something the
  schedule record cannot — colour, posture, rot, pests — and say what it was in
  `reason`. Never propose `adherence`, `health_source`, `health_confirmed`,
  `health_changed`, `last_checked` or any derived counter.
- Photo labels (`whole`, `leaf`, `soil`, `roots`) tell you what each image shows.
  Use them rather than guessing from the filename.
- The marker track tells you which plant was on screen at any offset. Trust it
  over a spoken name in the transcript.
- Do not invent plants, IDs, or fields.
- **Never write to `notes_user` or `collection_notes_user`.** Read them — they
  are the best evidence in the package — but they are the user's lane, and a file
  naming them is rejected in full.
- Put standing guidance in `care_instructions` as discrete items, one thought
  each, `op: add` unless you are explicitly superseding an item by its
  `instruction_id`.
- Check `transcript_tier`. On `unverified`, treat the screen log as a weak hint
  and the spoken words as primary; there are no reliable timestamps to align to.
- When a passage is ambiguous, it has already been attributed to the previously
  opened plant. Correct that from the words if the words are clear.

---

## 15. Decisions closed in v1.5

Recorded so they are not reopened.

- **The pending/Update two-step stays.** Logging is instant, Update is the commit
  point. Revisit only if real use shows most rounds are one or two plants — the
  fallback is an immediate write plus an undo toast, not a redesign.
- **Both calendars stay.** Forward for what is due, backward for what happened.
- **The empty state is deliberately not designed.** It fills itself in three
  weeks of weekly logging.
- **Health is never computed.** Any future feature that produces a number from
  care events must call it adherence.
- **The score block is one component.** Changing it changes every surface.
- **Plant IDs are `NNN-XXX`.** No prefix, and the display name is never part of
  the ID — names change, IDs do not.
- **A planter group is a selection gesture, not a care claim.** Tapping one
  selects everything in it regardless of `shared_water`; the flag governs whether
  that counts as one watering or several.
- **Elapsed interval is never rendered as proof of need.** "N days past
  interval", "check soil" — never "overdue" as a directive.
- **Transcription is Whisper on the laptop.** No cloud service, no API cost, no
  browser speech recognition.
