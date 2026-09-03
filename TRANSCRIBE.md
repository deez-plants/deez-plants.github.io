# Transcription — Whisper on the Windows laptop

One-time setup, then one command per walk. Free, offline, no account, and the
audio never leaves the laptop.

---

## Setup, once

1. Install Python 3.11 or later from python.org. **Tick "Add Python to PATH"** on
   the first screen — easy to miss, annoying to fix.
2. In PowerShell:

```
pip install faster-whisper
```

That is it. `faster-whisper` runs several times quicker than the original on a
CPU and needs no separate ffmpeg install. First run downloads the model
(`small.en`, about 500 MB) and caches it.

**Which model.** `small.en` is the right trade — noticeably better than `base` on
plant names, and roughly real-time on a normal laptop. Go to `medium.en` only if
you find yourself correcting a lot; it is about three times slower.

---

## Per walk

1. On the phone, after the walk: **Export session**. You get the `.m4a` and its
   `markers.json` into your iCloud folder.
2. On the laptop, in the folder holding those two files:

```
python transcribe_walk.py SES-2026-08-22-1.m4a
```

3. It writes `SES-2026-08-22-1.transcript.txt` beside them — timestamped
   segments, a coverage report, and each passage attributed to the plant whose
   page was open at that moment.
4. In the app on the laptop: **Import transcript**, pick that file. Coverage
   verification runs, and anything that fails gets a replay button at the offset.

A 20-minute walk takes two or three minutes to transcribe and about thirty
seconds of your attention.

---

## Building the marker names into it

The script reads `markers.json` if it sits beside the audio, and uses it for
attribution. If it is missing you still get a plain transcript, marked
`unverified` — the app accepts that, it just cannot align it.

---

## Corrections

Whisper will mangle Sansevieria the first few times. Keep a `corrections.txt` in
the same folder, one substitution per line:

```
Monster Aid=Monstera
sans of area=Sansevieria
callus ee ah=Calathea
```

The script applies these before writing the transcript. Two walks in, the list is
doing the work.
