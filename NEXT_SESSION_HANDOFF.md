# Deez Plants — handoff to the next session

Written 2026-09-07, updated as work continues. The build has now reached
Care calendar/All months, Adherence history, Rooms and planters, More about
this plant/Info and settings (later made fully editable), Health history,
the Add-a-plant write flow, a direct Care-calendar link on Plant Detail,
export/import (Prepare review package + Apply AI update, the full
section-11 validation chain), and the whole of Capture — photo capture with
gallery and hero selection, both notes lanes, and walk recording with
markers, the screen log and both transcript tiers. **Read this file first,
before anything else.**

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

## Start here: what to do first

**The app is live at https://deez-plants.github.io.** Hosting is done — see
"Hosting, as built" below for what actually happened, including the manual
step that turned out not to be needed. The repo now has a remote and the
code is backed up off the laptop for the first time.

**What is left is the iPhone test, and it is the owner's to run.** It is
the last thing blocking the desk console and the remaining screens, because
if backgrounding kills a recording the fix belongs in `capture/recording.ts`
before anything else is built on top of it. The steps are written out under
"The iPhone test" below.

**The live site shows `Not rated · 22 not rated yet`, and that is correct.**
It is a new origin with an empty database. The owner's real record is still
only on the laptop's `localhost`. Moving it across is step 1 of the test —
**and the owner has never had their record in two places at once, so do not
treat the transfer as a formality.**

**Then show the owner backup.** It is the thing they have been blocked by without
knowing it, and it is now built. Their real record — 22 ratings and two
watering rounds they actually did — lives in **one** store: this laptop's
`localhost`. Their phone has none of it. Back up → *Save my record* produces
a ~60KB file; opening it on the phone through Back up → *Restore* brings the
lot across. That is the demonstration to lead with.

**Then read "The 2026-09-08 audit" below** before touching any screen. It
carries the drift found, the decisions the owner made (twice — a settled
decision list and an evening decision list, both marked do-not-relitigate),
and a work list of which items 1–10 are now done.

**Storage is per-origin, and this trips everyone.** `localhost:5173`, a LAN
address like `192.168.1.195:5173`, and any hosted URL are **three separate
databases with no server between them** — and two of those three are on the
same laptop, in the same browser. Data entered in one never appears in
another. The owner lost an evening to this; do not repeat it. Backup is the
only bridge.

### The root cause of the drift, so it does not happen again

`CLAUDE.md` says that where the built app differs from `DESIGN_REFERENCE.md`,
the app is right and the reference is stale. That rule was written about
**hand-tuned type sizes** — so nobody would shrink the owner's text back
down. It was over-applied as cover for structural drift: whole blocks the
reference specifies (`Do next`, `Your ratings over time`, the inline care
calendar, every icon) were simply never built, and the precedence rule was
allowed to excuse it. **The rule covers sizing only.** A missing section is
not a stale reference.

**And check citations.** The old plants-list code justified its deviation by
citing "a note in `DESIGN_REFERENCE.md` that the pill predates section 3b".
No such note exists; screen 02 specifies the pill outright. A comment in this
codebase that justifies itself by pointing at a document is worth verifying
against the document.

## Recording is built — hosting still needs the owner

**Capture is complete.** Recording landed in commit `dc397b4` (see "Walk
recording" below), which closes out the whole of Capture and, with it,
every phone-side feature in the build apart from the desk console.

**The next step is not more building. It is hosting the app on real HTTPS
and testing recording on the owner's iPhone.** Everything about recording
that a desktop browser can prove has been proved (see the bullet for what
was driven and checked); the three things that remain are the three a
laptop physically cannot answer:

1. **Does a recording survive backgrounding on iOS Safari?** The app assumes
   it might not, warns on screen that it might not, and writes audio chunks
   to storage every ten seconds so that a capture iOS kills is still
   recoverable in full up to the last chunk. Whether that assumption is
   pessimistic or optimistic is a fact about the owner's phone.
2. **Does it behave better installed to the home screen than in a Safari
   tab?** Section 6 says materially so. Untested here.
3. **Does moving a real walk's audio to the laptop and running Whisper on
   it produce a transcript the coverage gate accepts?** The gate itself is
   checked (20 assertions in `check/coverage.check.cjs`, plus a real
   pass and a real fail driven through the UI), but never against genuine
   Whisper output from genuine iPhone audio.

All three need the app hosted somewhere with real HTTPS — GitHub Pages or
Netlify, per `HANDOFF.md` section 1. That is a one-time account step and it
is the owner's to make, not something to assume or work around. **Raise it
plainly and wait**; do not start the desk console on the assumption that
recording is fine, because if backgrounding turns out to kill capture the
fix lives in `capture/recording.ts` and is better made before more is built
on top of it.

If the owner would rather keep building than test now, the desk console
(step 2 below) is the honest next thing.

## The 2026-09-08 audit

The owner reviewed the app on their phone against `screenshots/`. Findings
below, sorted into what was genuinely wrong and what only looked wrong.

### Decisions the owner made (these are settled — do not relitigate)

1. **The score block's label line is contextual.** `FIELD_DEFINITIONS.md`
   §3b says the block is three lines and line 1 is the `HEALTH` label,
   "wherever a health figure appears." But the owner's own mock omits that
   label on plant detail (the score sits beside the photo as `8 / 10` with a
   `ME` badge) and in the plants list (a compact coloured chip). **The spec
   and the mock contradicted each other and the build followed the spec.**
   The owner chose to amend §3b rather than leave the contradiction: the
   label is **required** where the score is one card among several (Home),
   and **dropped** where it is the page's hero beside the plant photo
   (detail) or a compact chip in a list. Rule 6 still holds — the block is
   still one component, it now has a documented labelled/unlabelled variant.
   §3b has been updated in place.
2. **Plant names stay as they are.** The owner refers to plants by the
   mock's names ("Left Coconut-Bowl Pothos Cutting", "Compact Snake Plant"),
   which differ from the app's. But `DESIGN_REFERENCE.md` §5 says the mock's
   sample data is invented, and `CLAUDE.md` names `SEED_PLANTS.json` as the
   source for the 22 real plants. **The app's names are the real ones.** No
   change. If a future session sees the owner use a mock name, translate,
   don't rename.
3. **Plants list rows match the reference exactly**: thumbnail · plant ID
   (small mono) · name · score chip · `Kept`/`Behind` · chevron. The room
   comes out — it was making the row heavy, and the plant page has it.
4. **Room is being split into room + spot** (see the work list). The picker
   currently offers seven rooms of which five are "Living room" something,
   which is why this is worth doing.
5. **`PLACEMENT` on plant detail is not in the reference** — it was added by
   the build. The owner likes it. It stays.

### Real drift, being fixed

- **Every icon in the app is missing.** The owner drew a full icon set; it
  lives in `Deez Plants.dc.html` as SVG path data (`icRoute`, `icBatch` and
  friends — a `{c, s, f, sw}` lookup per icon). `CLAUDE.md` says never port
  the mock's *code*; icon path data is treated here as an **asset**, which
  is the owner's own design, not the mock's implementation. Some icons were
  lost during commit `fd4c149`'s type-size pass, which correctly dropped
  filler sub-labels and incorrectly took icons with them.
- **Plant detail is the worst screen and needs a rebuild, not a patch.**
  Missing against `screenshots/04-plant-detail.png`: the photo in the score
  header, `DO NEXT` (the `do_next` field is real, wired, and AI-editable —
  it was simply never rendered), `YOUR RATINGS OVER TIME`, the `Record note`
  action, `Quick care` as icon cards, and the inline three-month care
  calendar with its colour legend. Button order is wrong and the photo is
  too small.
- **Home is missing most of its richness**: the health sparkline, the
  stacked bar and legend on both HEALTH and CARE ADHERENCE, the comparison
  line, Due's `22 water · 12 feed` breakdown, icons on the registry row, the
  `HANDOFF LOG` section — and **`1 session held on this device only · Back
  up now`**. That last one matters: **backup was always in the design and
  already has a home on screen.** It is not a new idea.

### Looked wrong, actually correct — leave alone

- **Empty health/adherence figures** — the collection was unrated, so there
  was nothing to draw. Fixed by the owner's ratings now being entered, not
  by code.
- **Care adherence wording** — rule 2 forbids a score out of ten; counts and
  days is the honest form.
- **Due wording** — rule 9 forbids presenting an elapsed interval as proof
  care is needed.
- **Health history's empty months** — correct by design; a month with no
  snapshot draws an empty bar rather than an invented number.
- **The record screen's fewer buttons** — the owner was on the READY state,
  which has nothing to pause or delete. Working as designed.
- **"Missing" Rooms and planters / Adherence history** — both are built and
  reachable from the More sheet. Not missing, just hard to find, which is
  its own finding (below).

### Was open here, now built

- ~~**The More sheet should become a real page.**~~ Built 2026-09-09; see item
  11 below. The reasoning is kept because it is the precedent: seventeen flat
  items do not fit a sheet at the owner's type sizes — the "All pages" header
  scrolling through them was the symptom — and **this is a legitimate
  size-driven divergence, the kind the precedence rule was actually for.**
- ~~**Five of its items are dead ends**~~ (History, More about this plant,
  Info and settings, Plant detail, Photos) because they are plant-scoped with
  no plant. They open a plant picker now.

### Decisions taken on the evening of 2026-09-08 (settled — do not relitigate)

Written **before** the work they describe, deliberately, so that a session
interrupted mid-flight still inherits every decision.

1. **The care calendar is left exactly as it is.** The owner asked whether
   each month could run backwards (last day at the top) with the newest month
   still first, so dates flow continuously down the page. It is a coherent
   idea for a *list* and wrong for a *grid*: reversing the days puts every
   date under the wrong weekday column, and fixing that means flipping the
   column headers too, so each week reads right-to-left. The grid's whole
   value is the weekday axis — "I always water at weekends" as a vertical
   stripe. `DESIGN_REFERENCE.md` section 6 already lists this under
   do-not-reintroduce. A flowing chronological *list* for the three-month
   preview was offered as an alternative and declined. **Leave it alone.**
2. **Rooms are a fixed list of five**: Living Room, Bedroom, 2nd Bedroom,
   Balcony, Kitchen. Everything after the comma in the old strings becomes a
   free-text `spot` the owner fills in by hand ("bookshelf", "by the window",
   "hutch", "on the dresser", "on the fireplace mantel", "shelf").
3. **`gpt-prompt.txt` is a real project asset and is now committed.** It is
   the prompt the owner wrote for the AI that reviews packages — the JSON
   shape it must return and the rule that it never guesses. It is the working
   version of section 14, "Notes for whoever prompts the AI". An earlier pass
   of this file called it clutter; that was wrong, and written without
   reading it.
4. **Seed photos are dated 2026-08-28**, because that is the day the owner
   actually took all 26 of them — the same day they watered everything. This
   replaces the install-date stamp, which had been chosen because dating them
   to `acquired` made `last_checked` read "Feb 2021" on a fresh install. The
   true date fixes both readings at once, so the trade-off disappears. Their
   EXIF dates are stripped, so the file itself could not have told us.
   `SEED_PLANTS.json` carries the date now, so a fresh install is right too.
   **Devices seeded before this change keep the old dates** and need a wipe or
   a restore to pick it up.
5. **Backup is two buttons**: a fast "save my record" (JSON only, the
   irreplaceable part) and an occasional "save everything" with photos and
   audio.
6. **The six new fields keep these names**: Environment · Repotting & roots ·
   Pruning & support · Pests & disease · Season & growth · Propagation.
7. **The ME / AI badge stays.** The owner asked whether it earns its place if
   only they can change a rating. It does, because the AI *can* — section 11
   rule 10 allows a `health` change carrying a visual observation, and Apply
   AI update writes those as `Rate` events with `source: 'ai'`. Approving a
   number is not the same as forming it, and rule 1 only means something if
   you can tell which readings are yours.
8. **Deferred by the owner, on purpose:** adding their two new plants, the
   Archive action (the dead Spider Plant stays in the active list for now),
   and any redesign of the two web guides beyond bringing them up to date.

### One number worth checking

After the ratings landed, Home's score block reads `6.2 /10` with a previous
value of `6.1` and an elapsed time of `0d`. Both are computed from the same
22 ratings on the same day — the snapshot `commitUpdate` takes of the state
it replaced came out 0.1 lower than the state that replaced it. It is
cosmetic and nobody has chased it, but a same-day delta of `+0.1 · 0d` is
exactly the kind of misleading movement §3b's "the delta always carries
elapsed time" rule exists to prevent. Worth a look: either a rounding
difference between the pre-fold and post-fold derivations, or `movement()`
should read `no change` when the elapsed time is zero.

### The hosting decisions (2026-09-09, settled — do not relitigate)

Taken across a long back-and-forth with the owner. The reasoning is kept
because the alternatives will look tempting again later.

1. **GitHub Pages, not Netlify.** Pages has run since 2008 and its free tier
   has never meaningfully moved; Netlify's has. The deciding argument was
   origins, though: on Pages the origin is the `*.github.io` host and the repo
   name is not part of it, so renaming the repo cannot strand the owner's
   data. On Netlify the site name *is* the subdomain, so a rename would.
2. **No custom domain.** `deezplants.com` was checked and is genuinely
   available (verified against Verisign's RDAP, not a reseller's search box),
   as are `.app`, `.net` and `.org`. The owner declined it: a domain is the
   only part of this project that costs money and the only part that can
   lapse, and letting it lapse strands the origin. **`.co` and `.io` were
   checked but the result is worthless** — those registries do not answer
   RDAP, so known-registered domains came back "available" too. If anyone
   revisits this, do not trust that check.
3. **A free GitHub organization, not the owner's personal account.** The
   owner's requirement was a URL with no username in it. An org is free,
   needs no second login, and gets its own `*.github.io` subdomain — which is
   also its own storage origin, unlike `604drw.github.io`, which would be
   shared with anything else they ever publish. Orgs are unlimited, so a
   future app gets its own org and its own origin rather than sharing this
   one.
4. **The org is `deez-plants`; the repo inside it is `deez-plants.github.io`.**
   Both names were checked available on 2026-09-09 (`deezplants`,
   `deez-plants-app` and `deezplantsapp` were too, if one is taken by the
   time this runs). A repo named exactly `<org>.github.io` serves at the
   root, so the URL is `https://deez-plants.github.io` with no sub-path —
   which is why item 16 no longer needs a Vite `base`.
5. **The repo will be public.** Free-tier Pages requires it. The owner was
   told plainly, twice, that this publishes `SEED_PLANTS.json` and the 26
   photos in `seed-photos/`, and accepts it — "useless info to anyone but
   me". Their ratings and care log are **not** in the repo and never leave
   the device.

### Hosting, as built (2026-09-10)

Live at **https://deez-plants.github.io**, deployed by
`.github/workflows/deploy.yml` on every push to `main`.

- **The org, repo and public setting all went in as decided.** Owner is the
  `deez-plants` organization, not `604drw`, so the URL carries no username.
- **The local branch was renamed `master` → `main`** to match the branch the
  repo was created with, rather than leaving the default branch empty.
- **The workflow runs `npm run check` before `npm run build`.** A deploy that
  ships a state the checks reject is worse than one that does not happen —
  and one of those checks had been failing silently for weeks before it was
  caught on 2026-09-09.
- **No Vite `base` is set, and none should be.** The repo name
  `deez-plants.github.io` serves at the root of the subdomain. Adding a
  `base` later would break every asset URL.
- **The "set Pages source to GitHub Actions" step turned out to be
  unnecessary** — `actions/configure-pages@v5` sets it itself on first run.
  The owner was told to expect a manual toggle and did not need it. GitHub's
  legacy Jekyll builder (`pages-build-deployment`) also fires on a repo named
  `*.github.io` and runs alongside; it is harmless and the Actions deploy
  wins. Do not try to disable it.
- **Verified live, not just deployed:** the page serves hashed Vite bundles
  rather than source, boots, seeds 22 plants, renders Home, and logs no
  console errors. Manifest and all four icons serve with correct content
  types.

### The iPhone test — the owner's, and the last real unknown

Everything a desktop browser can prove about recording has been proved. These
three cannot be, and all three need the phone:

1. Does a recording survive backgrounding on iOS Safari?
2. Is it materially better installed to the home screen than in a tab?
3. Does real iPhone audio through Whisper produce a transcript the coverage
   gate accepts?

The order to run it in:

1. On the laptop, Back up → *Save my record* (~60KB).
2. Get that file to the phone — AirDrop, email, anything.
3. On the phone, open https://deez-plants.github.io in Safari → Share →
   **Add to Home Screen**. The green plant icon and "Deez Plants" should
   appear.
4. Launch from the home screen. **No Safari address bar means the manifest
   is working.**
5. Back up → *Restore*, pick the file. This is the first time the owner's
   record exists in two places.
6. Start a walk, talk for a minute, switch apps for 30 seconds, come back.
   **That answer decides what gets built next.**

### What was found while checking, and still matters

- **The owner's GitHub account is `604drw`** — not `604dr`, which is what
  the local git config says and which is not a GitHub account at all. The
  account is real but was created 2026-09-10 and holds **no repos and no
  organizations**.
- ~~**This repository has no git remote.**~~ Fixed 2026-09-10: `origin` is
  `https://github.com/deez-plants/deez-plants.github.io.git` and the full
  history is pushed. Until then every commit existed only on the owner's
  laptop, which had restarted mid-session once already.
- **The owner authorised the first-party GitHub OAuth app** during that first
  push, via Git Credential Manager. That is the normal browser sign-in for
  pushing over HTTPS from this machine — not a new integration and not
  something this project asked for beyond the push. Later pushes reuse it and
  will not prompt again.

### The owner's real data, entered 2026-09-08

Ratings for all 22 plants, plus two watering rounds the owner actually did:
**all 22 on Fri 2026-08-28**, and **all except the four Star Wars planter
plants on Sun 2026-09-06**. This is real history, not test data — it is
append-only and must not be "cleaned up". It lives on the laptop copy only
until backup/transfer exists; see the storage note below.

**Storage is per-origin.** The laptop's `localhost`, the phone's dev-server
address, and any hosted URL are three separate stores with no server between
them. Data entered in one never appears in another. This is why backup moved
up the list: it is the migration path for the owner's setup work, not just
insurance.

## What's built and committed

As of commit `b2669fa` (`git log --oneline` will show newer ones by the time
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

- **Photo capture, gallery, and hero selection** (`src/capture/photos.ts`'s
  new `capturePhoto()`, `src/components/{PhotoCaptureButton,
  CapturePhotoSheet}.tsx`, `src/pages/PhotosPage.tsx`, screen 13) — the
  first piece of Capture. A file input with `capture="environment"` opens
  the camera directly on a phone (a plain picker on a laptop), then a
  one-tap label sheet (whole/leaf/soil/roots, section 6b: never a text
  field) saves immediately — no separate confirm step. The write mints a
  real `NNN-XXX_YYYY-MM-DD_HHMM_NN.jpg` media id, stores the full image and
  a thumbnail as Blobs (no synced folder exists yet, so section 6b's
  iOS-bytes fallback is what every device gets for now), and logs the
  `Photo` care event in the same call. Hero selection goes through the same
  `editPlantFields()` Info and settings uses, so it's a pending `Edit` like
  any other field, resolved on the next Update — but the gallery itself
  reads the raw event log directly (History/Entries' own pattern), not the
  pending-filtered `plant.photos`, so a photo you just took is visible
  immediately even before it's in the committed record. That split
  (immediate view, pending hero) is deliberate, not an inconsistency — see
  the comment at the top of `PhotosPage.tsx`. No `PlantChrome` on this
  screen: the mock's own screenshot shows a plain back button here, not the
  Prev/Next strip every other plant-scoped screen carries. Self-verified in
  a real browser tab with a real uploaded photo, through label → save →
  pending count → Update → hero badge switching on both the gallery and
  Plant Detail's header thumbnail.

- **Both notes lanes made real** (`src/notes/{careInstructions,notesUser}.ts`,
  rewritten `MoreAboutPlant.tsx`) — the last gap in that screen, closing out
  Capture apart from recording. `care_instructions` add/delete write plain
  `Edit` events with `op`/`instruction_id` that `derive.ts`'s
  `applyInstructionOp` already folded (built for import, unused by any UI
  until now); delete is user-only here by construction — the writer that
  could invoke `op: 'delete'` from an import file simply doesn't exist,
  enforced independently in `package/validate.ts`. `notes_user` reuses
  `editPlantFields()` behind a thin `setNotesUser()` wrapper and follows the
  exact InfoSettings save/pending baseline pattern: a local `baseline` state
  (not the live `plant` prop) is the "from" for the next diff, updated to
  the just-saved value on success, and resynced from `commitUpdate()`'s own
  return value on "Update now" rather than waiting on the prop. Both
  instruction writes and the notes edit are plain pending events — visible
  in the pending-change footer immediately, folded into the committed
  `plant.care_instructions`/`plant.notes_user` only after Update, same
  split as hero selection. Self-verified in a real browser tab: added an
  instruction (pending banner, correctly absent from the committed list
  until Update, then appeared with date/"You" attribution); edited notes
  (dirty→"Save note"→"saved and waiting"→Update, textarea never reverted to
  stale state); and deleted the instruction, including an accidental
  double-delete on the same `instruction_id` from a double-click, which
  `applyInstructionOp` resolved idempotently rather than erroring.

- **Walk recording** (`src/capture/{recording,liveSession,screenLog,coverage,
  sessions}.ts`, `src/pages/{RecordSession,Recordings}.tsx`, screens 03/15) —
  the last piece of Capture, and the end of the phone-side build.
  - **The recorder is a module singleton, not component state.** A walk has
    to survive navigating to a plant, logging care and taking a photo —
    that navigation is precisely what writes the markers — so
    `capture/recording.ts` owns the state and React subscribes to it through
    `useSyncExternalStore`. Leaving the Record screen does not end the walk.
  - **Durability was designed for iOS killing the capture, not against it.**
    `MediaRecorder` is asked for a chunk every ten seconds; each chunk is
    written to the `audio` store under `session_id#NNNN` as it arrives, and
    the `SessionRecord` is written when the walk *starts* and updated as it
    runs. So a walk that dies — backgrounded too long, a call, a reload — is
    already in the Recordings list with its audio and markers up to the last
    chunk. There is deliberately no crash-recovery path: there is nothing to
    recover, only a session whose `closed` never became true, which the
    Recordings screen labels ENDED UNEXPECTEDLY. On a clean end the chunks
    are assembled into one blob and replace themselves.
  - **`capture/liveSession.ts` exists to break a cycle.** `db/events.ts`
    stamps every event it writes with the live `session_id`/`offset_s`, and
    `capture/screenLog.ts` does the same for its entries; both reaching into
    the recorder directly would be circular, since the recorder imports the
    database and the event writer. That module imports nothing but types,
    the recorder registers itself there on start, and the dependency runs
    one way.
  - **Markers are recorded automatically, per section 6.** `appendEvents`
    emits `care_logged` (and `photo` for a `Photo` event's media) after the
    write succeeds, never before; the shell's one `enterScreen` call emits
    `plant_open`, deduped so the Prev/Next strip cannot mint a dozen of
    them. `Rate`/`Edit`/`Archive` have no marker type in the spec and get
    none. Screen 03's "tap one to correct it" retags a `plant_open` to a
    different plant, keeping its offset (the time is objective, only the
    attribution was a guess) and flipping AUTO to MANUAL — the sidecar keeps
    the distinction so the AI knows which is which.
  - **The screen log runs always**, not only while recording, and lives at
    exactly one call site (an effect in `App.tsx` keyed on the current
    screen). Under-five-second visits are dropped inside `enterScreen` and
    never reach storage; retention is 7 days or 500 entries; an entry inside
    a recording carries `session_id` and `offset_s`, one outside carries
    only its absolute `at`. It rides out in `markers.json` with section 6's
    "evidence, not fact" wording attached to it rather than in a fifth file
    section 7 does not name.
  - **Both transcript tiers are real.** Paste prose and it is accepted whole
    as `unverified` with no gate; paste Whisper JSON or SRT/VTT and it is
    `verified` and the four coverage assertions run, with failures listed
    inline at their own offsets. Replacing an unverified transcript with a
    verified one raises the tier and re-runs the gate, which falls out of it
    being a plain replace rather than a separate upgrade path.
  - **`Prepare review package` now carries walks for real** — the
    placeholder strings are gone. A walk with no transcript still ships,
    with `transcript.txt` saying so for that walk: the AI being told a
    recorded walk exists and holds no words yet is a fact about the package,
    not an absence to hide. `PackageRecord` gained `session_ids` so a walk
    goes out once, the same rule `event_ids` applies to events, and
    `verified` is true only when every walk in the package passed coverage
    (a package with no audio in it is not `verified` — there was nothing to
    verify, which is not the same as having verified something).
  - **Timestamps are local and zoneless** (`nowLocalStamp` in `lib/dates.ts`)
    for both `SessionRecord.started` and screen-log `at`, matching section
    6's own sidecar example and `ISODate`'s convention. `toISOString()` would
    stamp an evening walk with tomorrow's date west of Greenwich while every
    event logged during that same walk carried today's.
  - **Two deliberate deviations from the mock**, both explained at the top of
    their files: the tab bar's centre button turns red and shows the running
    timer but still *navigates* to the Record screen rather than pretending
    to pause (Rec is a root tab, and a button labelled Pause that does not
    pause is worse than one that says what it does); and there is a plain
    "End session" above the mock's "End session and prepare package", because
    without one the finished-session state the reference's own States line
    names would be unreachable, and ending straight into the package screen
    builds a package whose walk has no words in it yet.
  - **Self-verified in a real browser tab**, end to end: started a walk and
    watched the wake lock take; navigated to a plant and logged a watering,
    getting a `plant_open` at 00:17 and a `care_logged` at 00:46 with the
    plant-open dedupe holding across detail and Log care; retagged the first
    marker to another plant and confirmed the offset held while the badge
    became MANUAL; paused (timer froze, button became Resume) and resumed;
    ended and confirmed the saved summary; reloaded the page and confirmed
    1.3 MB of real audio had survived; attached prose (UNVERIFIED, no
    coverage badge), then a JSON with a deliberate 35-second hole (VERIFIED ·
    COVERAGE FAILED · 2, naming assertion 2's gap at 00:10 and assertion 3's
    uncovered marker at 00:17 by plant id), then a clean SRT (VERIFIED ·
    COVERAGE PASSED); built a package and unzipped it to confirm
    `transcript.txt` and `markers.json` hold the real sidecar shape and the
    screen log with its evidence note, with in-recording entries carrying
    `session_id`+`offset_s` and outside ones carrying neither; exported a
    walk and confirmed the zip holds a genuine ISOBMFF `.m4a` plus sidecar,
    screen log and Whisper instructions; deleted it and confirmed both the
    session record and its audio were gone; and discarded a walk mid-record
    and confirmed the same. Two real bugs were found and fixed this way: the
    Record screen went on summarising a session that had since been deleted
    from Recordings, and `previewReviewPackage` had no session counts so
    screen 19 still read "No recording sessions on this device yet".
  - `check/coverage.check.cjs` (20 assertions) pins the four coverage
    assertions and the transcript parsing — the one part of recording that
    is pure enough to check in node. It runs **before** `care.check.cjs` in
    the `check` chain, deliberately: the chain is `&&`-joined, so anything
    after the known pre-existing failure below would never run.

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

This list came out of the 2026-09-08 audit and supersedes the old ordering
until it is done. Items are ordered so that anything touching the data model
lands before real data accumulates.

Items 1–7 were done on 2026-09-08 and are struck through; they are kept here
so the reasoning stays attached to the work.

1. ~~**The owner's ratings and watering history.**~~ Done. Also removed nine
   test events left in the local store by earlier build verification (two
   care-round tests on 2026-09-03, and the photo/edit/water tests on
   2026-09-07), plus the test session, package and snapshots. The 26 seed
   Photo events with historic dates are real and were kept. **Nothing else in
   this database is test data — treat what is there as the owner's record.**
2. ~~**§3b amendment + the HEALTH label.**~~ Done; the amendment is written
   into `FIELD_DEFINITIONS.md` §3b, and it turned out to need a second,
   larger clause for the plants list (see below).
3. ~~**Icon extraction.**~~ Done — `src/components/Icon.tsx`, 22 icons.
   `careTypeStyle.ts` now carries an `icon` per care type so colour and shape
   stay independently editable.
4. ~~**Plants list rows.**~~ Done. Note what this turned up: the old code
   justified putting the full score block in every row by citing "a note in
   `DESIGN_REFERENCE.md` that the pill predates section 3b". **That note does
   not exist.** Screen 02 specifies the pill outright, and the reference's own
   "lessons already learned once" warns against exactly the tall rows the
   block produced. Be suspicious of comments in this codebase that justify a
   deviation by citing a document — check the citation.
5. ~~**Plant detail rebuilt.**~~ Done. The grids were extracted into
   `components/CareMonths.tsx` so the inline three-month preview and the full
   Care calendar screen draw the same component and cannot disagree.
6. ~~**Home.**~~ Done, apart from two things left on purpose. The adherence
   count headline and stacked bar, the registry-row icons, the health
   sparkline, the handoff log and the `Back up now` row are all in. **Still
   absent: the catch-up banner** (needs a stored "last opened", which nothing
   writes) **and Due's `22 water · 12 feed` split** (feed is free text on
   every plant, not an interval, so there is no feed due-count to show —
   the honest note on the card says so). Note the health *stacked bar and
   legend were already built* and only looked absent because nothing was
   rated — check before rebuilding anything here.
7. ~~**Housekeeping.**~~ Done; `*.zip` is ignored. `gpt-prompt.txt` left alone.
8. ~~**Room + spot.**~~ Done. `db/migrateRoomSpot.ts` catches up a store
   seeded before the split, writing `Edit` events rather than rewriting
   baselines, and is idempotent. Run against the owner's record: 44 events,
   21 plants to Living Room, 1 to Bedroom. **Any other device still holds the
   old strings** and needs either the migration run against it or a restore
   from a migrated device.
9. ~~**Six new "More about this plant" fields.**~~ Done. Kept for reference: — Environment, Repotting,
   Pruning & support, Pests & disease, Season/growth, Propagation. The owner
   wants these, is happy for them to sit empty, and specifically wants the
   AI able to fill the species-knowledge ones (how to propagate, when it
   flowers, what light it wants natively). Mark them `editable_by: both` so
   the AI proposes and the owner approves per row (rule 4). **Do this in the
   same spec pass as item 8** — one §4 change, not two.
10. ~~**Backup / export–import.**~~ Done — `src/sync/stateTransfer.ts` and
    the Back up screen, reachable from Home's own row and the More sheet.
    Two exports (record ~60KB, everything ~6.3MB with photos). Restore merges
    and never destroys; verified idempotent on both paths. **This is the
    unlock for everything else** — it is how the owner's record gets from the
    laptop onto the phone, and the first thing to demonstrate to them.
11. ~~**The More sheet becomes a page.**~~ Done — `src/nav/AllPages.tsx`,
    grouped under *This plant · The collection · AI round-trip · About*, with
    `src/nav/PlantPicker.tsx` replacing the five dead ends. The picker
    `replace`s itself with the destination rather than pushing, so backing out
    of the plant lands on All pages and not on the question again. `More`
    pushes rather than clearing the stack, so it still returns you where you
    were the way the sheet did, and `nav/screenTitle.ts` gives its back button
    the name of the screen underneath. Turned up one shell-wide bug on the
    way: **the window kept the previous screen's scroll offset across a
    navigation**, so a long screen opened from a scrolled-down one landed
    halfway through itself. Fixed in `App.tsx` for every screen, not just
    this one.
12. ~~**Web app manifest, icons, iOS meta tags.**~~ Done 2026-09-09. The
    owner's render is `Icons/App Icon 1 3D final png.png` — 1254x1254, fully
    opaque, square corners, artwork inset. Those four facts are why it needed
    no flattening, padding or un-rounding, and
    `Icons/generate-icons.ps1` records them so a replacement source gets
    checked rather than trusted. Manifest paths are relative and survive a
    sub-path base; index.html's are root-relative, which Vite rewrites with
    that base. **Not installable in Chrome** — that wants a service worker,
    which was deliberately dropped (see the note below the list). iOS's *Add
    to Home Screen* needs none, and iOS is the target. `CLAUDE.md`'s first sentence
    is "installed to an iPhone home screen" and §6 says recording is
    materially more stable installed — but none of it exists, so the iPhone
    test would not be testing what §6 describes. Also helps protect stored
    data, since installed apps are treated better than ordinary sites.
13. **Model switch — safe now.** Everything left is fast-model work. The two
    items that warranted care (the spec change and backup) are done.
14. Screens **22** (How this app works — static copy, trivial), **21**
    (Handoff log — reads `packages`/`applied_updates`, nearly a pure
    render), **17** (Since last time — reads `snapshots`), **18** (What
    works — real logic, no new data). Plus the **Archive action** (there is
    an archived *list* but seemingly no way to archive a plant, which is why
    009-SPD is still active), the **replay button** on coverage failures
    (§6 specifies it; it was not built), and **audio playback** in
    Recordings.
15. **Screen 16 (Reminders)** — the only one of the five with a real
    dependency: nowhere to store the toggles, and iOS web push needs an
    installed app. Do it after item 12.
16. **Hosting on GitHub Pages** — ~~done 2026-09-10~~, live at
    https://deez-plants.github.io; see "Hosting, as built" above. **Still
    open: the guides, and the iPhone test.** The two web guides both describe
    an app that only runs on a dev server and need the real URL written into
    them. The iPhone test is the owner's and is written out above.
    **Pick the host once** — storage is per-origin, so moving later strands
    the data.
17. The desk console (laptop-only, deliberately last).

**Offline / service worker was considered and deliberately dropped.** The
owner's reasoning: no internet means no AI round-trip anyway, so the app
being unusable offline costs little. The counter-argument (a service worker
also makes an installed app launch reliably on a flaky connection) was
raised and judged not worth the staleness cost. Do not revisit without
asking.
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
while Claude works, the four things that need them, and exact prompts for
each. It's mostly static — only touch it if the actual workflow changes,
not per build step.

Its 2026-09-08 rewrite corrected a section that had gone actively wrong: it
told the owner their ratings could only ever be typed in on the phone and
that Claude could not enter them. Backup changed that, and the page now says
so. It also leads with the per-origin storage rule, since that is what cost
the owner an evening.

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
