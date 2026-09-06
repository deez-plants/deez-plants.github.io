# Deez Plants — status update for Claude Design

Written 2026-09-06. For pasting into a Claude Design conversation, so it has
current context on this project without re-reading the whole build.

## What this project is

Deez Plants — a local-first plant care app (IndexedDB, no server), installed
to an iPhone home screen. You designed the visual mock (`Deez Plants.dc.html`,
25 screens) from a written brief. Claude Code has been building the real app
from that mock plus two spec documents (`FIELD_DEFINITIONS.md`, `HANDOFF.md`).

## Where the build stands

Built and working: the data layer (an append-only event log with a pure
recompute of all derived state), the plants list, plant detail, the weekly
care-logging round, and health ratings (including the confirm-vs-change
distinction from the spec). All of it has automated test coverage and has
been checked by hand in a browser.

Not yet built: the persistent tab bar and back-stack navigation your mock
specifies, Home, and most of the remaining screens (history views, photos,
notes, recording, export/import with the AI review step, the laptop desk
console). These are in progress now, following your mock and the reference
document written from it (`DESIGN_REFERENCE.md`) screen by screen.

## Deliberate departures from the mock — confirmed, not drift

**Base type sizes were increased beyond the mock's scale** — body text is
24px, labels 22px, page titles 44px, versus the mock's original scale (which
floors at 16px). This isn't a random deviation: your own original brief
specified "~20px minimum, not smaller... hard requirement, not a preference"
for readability without glasses, and the mock actually under-shot that brief.
The built app is correcting to the brief's intent, not away from your design.

Everything else — layout, navigation structure, colour, component shapes,
copy — is being followed as designed.

## One open question from your own brief, still open

Your original brief left one interaction pattern for exploration and it was
never resolved: whether the Quick Care fields on Plant Detail (water, light,
soil, feed) should be inline accordion/dropdown expanders, or the flat list
the mock ended up shipping with. Your framing was to test with real content
length rather than assume — and now that the app has real content (a
sentence or two per field, from the actual plant spec data), if you have a
recommendation either way, that would help settle it.

Nothing else is being asked of you right now — the visual design is
otherwise considered settled and is being implemented as specified.
