# Deez Plants — build handoff

Sep 2 2026 · for Claude Code on Windows · spec v1.6

Design is finished. `FIELD_DEFINITIONS.md` v1.5 is the build spec and the
validation spec. `Deez Plants.dc.html` is the visual reference — a design mock,
not the app. Do not port its code; read it for layout, type, colour and copy.

## Companion document

`DESIGN_REFERENCE.md` describes every screen with a screenshot, how the screens
connect, what each control does, and the type and colour system. Use it as a
**drift check**: read a screen's entry before building it, and check against it
after. It is explicitly subordinate to the code — where the built app differs, the
app is right and the reference is stale. Never revert hand-tuned sizes to match it.

## Read this before you read the mock

**The mock's sample data is not the data model and not the seed data.** It is 22
invented plants with invented events, written to make screens look real. Take the
data model from `FIELD_DEFINITIONS.md` section 2, 4 and 5, and the seed data from
the authoritative master plant list. From the mock take only layout, type scale,
colour, spacing and copy.

Two specifics that will otherwise mislead you:

- **Counts are derived, never literals.** The mock hardcodes "Search 22 plants…"
  because a mock has no store to count. The real app counts active plants —
  archived ones are excluded from that number and from the search list.
- **The mock's health scores and trends are invented arrays.** Health comes from
  `Rate` events only. If you find yourself writing a function that produces a
  health number from care events, stop — that is rule 1 below.

---

## 1. What you are building

A local-first web app, installed to an iPhone home screen, that logs plant care,
holds your health ratings, records walks, and exchanges files with an AI chat.
No server, no API, no accounts, no build step you have to think about.

**Stack.** Vite + React + TypeScript, IndexedDB for storage (via `idb`),
plain CSS or CSS modules. That is the whole dependency list, plus `jszip` for
packages. Deploy as a static site.

**Where it runs.** Phone: Safari, installed to home screen. Laptop: Chrome or
Edge, where the File System Access API gives real folder sync. Same codebase,
capability-detected.

**Hosting.** GitHub Pages or Netlify, free. It must be HTTPS for the microphone
and the wake lock to work — that rules out opening the file locally on the phone.

---

## 2. Build order

Each phase ends with something usable. Do not start the next until the previous
one runs on the phone.

**Phase 1 — the record.** Data layer and the weekly loop. IndexedDB schema from
sections 2, 4, 5 of the spec. Event append. The three-button care round with
multi-select. Pending state and the Update commit that recomputes adherence, due
dates and needs-attention. Plants list, plant detail, ratings with the two dates.
The score block as a single component (section 3b) used everywhere from the start.

*Done when:* you can log a watering round on the phone and see adherence move.

**Phase 2 — get data out and back.** Export the review set: `manifest.json`,
`events.json`, `transcript.txt`, `markers.json`, zipped. Import an update file
with the full validation chain from section 11 — reject whole on any failure, name
the reason. The review table: proposed value beside current value, one row at a
time, accept or reject each. Nothing writes without approval. Also export/import
of full state for phone-laptop transfer (section 8).

*Done when:* you can export, paste into a chat, and apply what comes back.

**Phase 3 — capture.** Audio recording (`audio/mp4`, wake lock, foreground
warning). The always-on screen log with the 5-second pass-through filter and
7-day retention. Photos: capture, the four labels, hero selection, transient
cache. Both notes lanes (section 6c) on plant detail and at collection level.

*Done when:* you can walk the collection, talk, take photos, and export the lot.

**Phase 4 — the desk.** Transcript import, both tiers. Coverage verification and
its flags. The laptop folder grant and automatic read on open. Then the wide
table — one row per plant, sortable, editable in place. Leave this until you know
from real use what needs width.

---

## 3. Rules that are not negotiable

Everything in the spec matters, but these are the ones where a reasonable-looking
shortcut destroys the design:

1. **The app never computes health.** No derived number is ever labelled health.
2. **Adherence is never a score out of ten.** It is counts and days.
3. **`notes_user` is untouchable by import.** Validation rejects any file naming
   it, whole.
4. **Approval is per row.** No apply-all button, ever.
5. **Events are append-only.** Nothing is edited in place; a correction is a new
   event. This is what makes two-device merging safe.
6. **The score block is one component.** If it renders differently anywhere, it
   is a bug.
7. **Confirming a rating without changing it is a real action** — it writes a
   `Rate` event and refreshes `health_confirmed` without moving `health_changed`.
   One tap.
8. **Archiving is an `Archive` event, not a state patch.** `archived`,
   `archived_date` and `archived_reason` are derived from it. No mutation
   exceptions anywhere in the model.
9. **Never render elapsed interval as proof a plant needs care.** "4 days past
   interval", "check soil" — never "water overdue" as an instruction. The
   interval passing is a prompt to look, not a fact about the soil.
10. **Rebuild derived state from events, never patch it.** Update recomputes from
   scratch. It is 22 plants; performance is irrelevant.

---

## 4. Model and usage

You are building a whole app on a subscription, so spend the strong model where
it pays and the fast one everywhere else.

**Use the strongest model available (Opus-class), with extended thinking on, for:**
- the IndexedDB schema and the event-to-derived-state recompute — get this wrong
  and everything above it is wrong
- the full validation chain in section 11
- the merge logic in section 8
- the recording lifecycle on iOS: wake lock, backgrounding, MediaRecorder chunks

That is maybe four conversations. Do them first, separately, one concern each.

**Use the fast model (Sonnet-class), thinking off, for:** screens, layout, CSS,
copy, wiring buttons, the plants list, the calendars, small fixes. This is most
of the work and it does not need the expensive model.

**Stretching a day's usage:**
- One concern per conversation, then start a new one. Long conversations re-read
  their whole history on every turn and burn budget fastest.
- Have Claude Code write `CLAUDE.md` at the repo root on day one — stack, file
  layout, the eight rules above. It gets read automatically and saves you
  re-explaining.
- Point it at the spec by section number: "implement section 11 validation",
  not "add validation". Precise scope is cheaper than a broad brief.
- Let it read `FIELD_DEFINITIONS.md` once per conversation, not per message.
- Skip screenshots of the mock unless layout is genuinely unclear from the code.
- If you hit a limit mid-phase, the phase boundaries above are safe stopping
  points — nothing is half-migrated.

**Realistic scope for one day:** Phase 1 complete and Phase 2 started, if the
schema conversation goes well. Do not try to finish all four phases in a day; the
point is to be using it next weekend, not to be done.

---

## 5. Exactly what to do

**Set up (15 minutes, once).**

1. Install Node from nodejs.org, and Git from git-scm.com. Accept defaults.
2. Install Claude Code: open PowerShell and run `npm install -g @anthropic-ai/claude-code`
3. Make a folder, e.g. `C:\Users\you\deez-plants`
4. Copy `FIELD_DEFINITIONS.md`, `Deez Plants.dc.html` and this file into it.
5. In PowerShell: `cd C:\Users\you\deez-plants` then `claude`
6. It asks you to sign in — a browser opens, you approve, it comes back.

**What you will see.** A prompt in the terminal. You type in plain English. It
proposes file changes and asks permission before writing each one; you approve
with Enter. It will also ask before running commands. Approve the ones that are
obviously `npm` and `git`; read anything else.

**First message, paste this verbatim:**

> Read FIELD_DEFINITIONS.md and HANDOFF.md in this folder. Do not write any code
> yet. Set up a Vite + React + TypeScript project, install idb and jszip, and
> write CLAUDE.md at the root capturing the stack, the intended file layout, and
> the eight non-negotiable rules from HANDOFF.md section 3. Then stop and show me
> CLAUDE.md.

**Second message (new conversation, strong model, thinking on):**

> Read FIELD_DEFINITIONS.md sections 2, 4 and 5 and CLAUDE.md. Design the
> IndexedDB schema and the pure function that recomputes all derived state from
> the event log. Nothing else — no UI. Show me the types first and wait for me
> before implementing.

Then work down the phases. One conversation per concern.

**To see it on your phone:** run `npm run dev -- --host`, and it prints an
address like `http://192.168.1.40:5173`. Open that in Safari on the same wifi.
Microphone and wake lock will not work over plain http — for those, deploy to
Netlify (drag the `dist` folder onto their site, it is free) and use the https
address. Then Share → Add to Home Screen.

---

## 6. Then what

**Superseded — see `CLAUDE.md`, "Current working agreement."** This section
assumed a minimal Phase 1 build followed by weeks of live use before more got
built. That's no longer the plan: the app is being built out fully (all
screens, matching `DESIGN_REFERENCE.md`) before asking for weeks of daily use.
The two open questions below are still genuinely open and still worth
answering from real use once the app is ready for it — just not as the gate
before the rest gets built.

Use it. Log the Saturday round for three or four weeks. Then:

- **Transcription:** set up Whisper on the laptop once (`TRANSCRIBE.md` in this
  folder). Record a walk, run one command, import the transcript.
- **First AI cycle:** export the review set, drop it into a chat with sections 10
  and 14 of the spec as the instructions, save what comes back, import it,
  approve row by row.
- **Then design the laptop console** — by then you will know from real data which
  eight fields you keep wanting to fix at once, and that decides the table.

**Report back on two things,** because they were left open deliberately:
whether the pending/Update two-step earns its extra tap, and whether the forward
calendar gets used at all or the Home due-count is enough.
