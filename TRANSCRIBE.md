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

1. **On the phone**, in Recordings, open the walk and tap **Export for Whisper**.
   You get a single file, `deez-plants-<session>.zip`, holding the audio, a
   `markers.json` sidecar naming the plants on the route, and the screen log.
2. **Get that zip onto the laptop** — AirDrop, iCloud, email, whatever is
   easiest — and **unzip it**. The script wants the audio file and
   `markers.json` sitting loose in the same folder, not the zip.
3. In PowerShell, in that folder:

```
python transcribe_walk.py SES-2026-08-22-1.m4a
```

4. It writes `SES-2026-08-22-1.transcript.txt` beside them — timestamped
   segments, a coverage report, and each passage attributed to the plant whose
   page was open at that moment.
5. **Back on the phone**, in Recordings, open the same walk and tap
   **Add transcript**. Paste the contents of that file in. Coverage
   verification runs, and anything that fails gets a replay button at the
   offset.

A 20-minute walk takes two or three minutes to transcribe and about thirty
seconds of your attention.

### Step 5 has to happen on the phone, and this is the thing that catches people

**The transcript attaches to the walk, and the walk lives in one place.**
Storage is per-origin and there is no server: the app on the phone, the app at
`localhost:5173` on the laptop, and any other address are separate databases
with no connection between them. The walk you recorded exists on the phone
only, so that is the only device where a transcript can be attached to it.

The laptop's job is running Whisper, not holding the record. Move the text
back, not the walk.

(If you *have* restored a backup onto the laptop and the walk is genuinely
there too, you can do step 5 on either — but then remember the two copies
have diverged until you back up and restore again.)

### If a walk comes back shorter than it should

**The app now tells you.** A walk whose audio is meaningfully briefer than the
time it counted says so on its card in Recordings, in words: *"Only 0:07 of
this 0:35 walk was captured."*

That is not a corrupt file and nothing is recoverable from it — **the missing
part was never recorded.** iOS sometimes hands back a microphone that is not
actually live after an interruption, and until 2026-09-14 the app had no way
to tell that apart from working normally: the timer ran, the markers were
written, and the audio simply was not there.

Two things follow from it:

- **If it happens mid-walk**, the app now notices within about eight seconds
  and says *"the microphone stopped"* — that walk can be picked up again.
- **If it happens on a resume**, it says *"the microphone did not come back"*.
  That one means iOS has refused. **End the walk and start a new one** rather
  than carrying on: a second recording is fine, and Whisper reads both.

**The surest way to avoid all of it is to stay in the app while recording.**
Section 6 has always said so; this is why.

### How big a walk can be

Audio runs at roughly **1 MB per minute**. Most transcription services cap an
upload at 25 MB, which puts the ceiling near **27 minutes** if you ever use one
instead of the local script. `transcribe_walk.py` runs offline and has no such
limit, so this only matters if you go elsewhere.

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
