#!/usr/bin/env python3
"""
Deez Plants - watch a folder and transcribe walks as they arrive.

Usage:   python watch_walks.py "C:/Users/604dr/OneDrive/Deez Plants"
         python watch_walks.py            (uses the folder remembered last time)
         or just double-click start-watching.bat

Leave it running. Export a walk from the phone into "1 walks in" - it arrives
through OneDrive - and a transcript appears in "2 transcripts" a few minutes
later. No commands, no unzipping, no filenames.

THE FOLDER SHAPE, which this creates and maintains:

    1 walks in      you drop exported walks here
    2 transcripts   the file you import into the app. Only these live here.
    3 ai            review packages out, update files back
    4 backups       Save my record / Save everything
    archive         markers, screen log, the walk's own account. NEVER audio.

Numbered because alphabetical order is useless: sorted by name you get ai,
archive, backups, transcripts, walks - the reverse of how they are used.

THE GOLDEN RULE (the owner's, 14 Sep 2026)

A walk's audio has done its job once the words are in. Audio runs about 1MB a
minute; one interrupted walk came to 18.6MB in its folder and the same again
in its zip. So once a transcript is written AND ITS COVERAGE PASSED, the audio
and the zip are deleted here.

The coverage condition is not a hedge and it earned itself the same day: walk
4's first transcript failed coverage because the app had the duration wrong,
and it had to be regenerated FROM THE AUDIO twice. Deleting unconditionally
would have lost seven minutes of that walk permanently, and silently. A
failing transcript is exactly when the recording is still needed, so a walk
that fails keeps everything.

WHAT IT DOES NOT DO

It cannot put the transcript into the app. The transcript attaches to a walk,
the walk lives on the phone that recorded it, and iOS will not let a web page
reach into a folder. That last step is two taps in the app's own file picker.
"""

import json
import os
import shutil
import subprocess
import sys
import time
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
SETTINGS = os.path.join(HERE, ".watch_walks.json")
POLL_SECONDS = 10

# The shape of the shared folder. Numbered because alphabetical order is
# useless here - sorted by name you get ai, archive, backups, transcripts,
# walks, which is the reverse of how they are used. Numbers put them in the
# order the owner actually touches them, on the phone as well as the laptop.
IN_DIR = "1 walks in"
TRANSCRIPTS_DIR = "2 transcripts"
AI_DIR = "3 ai"
BACKUPS_DIR = "4 backups"
# Unnumbered on purpose: it sorts to the bottom and reads as "not part of the
# flow". Holds the markers, the screen log and the walk's own account - never
# audio. See THE GOLDEN RULE below.
ARCHIVE_DIR = "archive"

# Audio extensions, for THE GOLDEN RULE.
AUDIO_EXT = (".m4a", ".webm", ".ogg", ".mp3", ".audio")


def remember(folder):
    try:
        with open(SETTINGS, "w", encoding="utf-8") as f:
            json.dump({"folder": folder}, f)
    except OSError:
        pass


def recall():
    try:
        with open(SETTINGS, encoding="utf-8") as f:
            return json.load(f).get("folder")
    except (OSError, ValueError):
        return None


def settled(path, checks=2, gap=2.0):
    """True once a file has stopped growing.

    iCloud drops a file in while it is still downloading, and a half-arrived
    zip looks exactly like a complete one until you try to open it.
    """
    last = -1
    for _ in range(checks + 1):
        try:
            size = os.path.getsize(path)
        except OSError:
            return False
        if size == last and size > 0:
            return True
        last = size
        time.sleep(gap)
    return False


def audio_in(folder):
    """The file to hand the transcriber: part1 if the walk was interrupted."""
    names = sorted(os.listdir(folder))
    audio = [n for n in names if os.path.splitext(n)[1].lower()
             in (".m4a", ".webm", ".ogg", ".mp3", ".audio")]
    if not audio:
        return None
    first = [n for n in audio if "-part1." in n]
    return os.path.join(folder, first[0] if first else audio[0])


def transcript_passed(path):
    """Did the coverage gate pass on this transcript?

    The transcriber writes `coverage: pass` or `coverage: FAIL` into the
    header. That verdict is what THE GOLDEN RULE turns on, so it is read from
    the file rather than re-derived here - two places computing the same thing
    is how they come to disagree.

    Unreadable means NO. Deleting audio on a guess is the one outcome this
    whole guard exists to prevent.
    """
    try:
        with open(path, encoding="utf-8") as f:
            for _ in range(40):
                line = f.readline()
                if not line:
                    break
                if line.lower().startswith("coverage:"):
                    return line.split(":", 1)[1].strip().lower() == "pass"
    except OSError:
        pass
    return False


def walk_label(folder, fallback):
    """A human name for the walk, from its own sidecar.

    `2026-09-14 1907 walk 4` - date, 24-hour time, which walk that day. Sorts
    into the order things happened, which is the only sort a phone gives you
    for free. Falls back to the zip's own name if the sidecar is unreadable.
    """
    for candidate in ("markers.json",):
        path = os.path.join(folder, candidate)
        if not os.path.exists(path):
            continue
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            started = data.get("started", "")
            date, _, time = started.partition("T")
            hhmm = time.replace(":", "")[:4]
            number = str(data.get("session_id", "")).split("-")[-1]
            label = date
            if hhmm:
                label += " " + hhmm
            if number:
                label += " walk " + number
            if date:
                return label
        except (OSError, ValueError):
            pass
    return fallback


def handle(zip_path, root):
    name = os.path.splitext(os.path.basename(zip_path))[0]
    work = os.path.join(root, name)

    print("\n%s" % ("-" * 60), flush=True)
    print("Found %s" % os.path.basename(zip_path), flush=True)

    if not settled(zip_path):
        print("  still arriving - will look again next time round", flush=True)
        return False

    # Its own folder, always. See the note about markers.json above.
    os.makedirs(work, exist_ok=True)
    try:
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(work)
    except zipfile.BadZipFile:
        print("  not a readable zip - leaving it alone", flush=True)
        return False
    # Rename the folder to something readable now that the sidecar is
    # available to read it from.
    label = walk_label(work, name)
    if label != name:
        target = os.path.join(root, label)
        if not os.path.exists(target):
            os.rename(work, target)
            work = target
    print("  unzipped into %s\\" % os.path.basename(work), flush=True)

    audio = audio_in(work)
    if not audio:
        print("  no audio inside - leaving it alone", flush=True)
        return False

    parts = len([n for n in os.listdir(work) if "-part" in n and n.endswith(os.path.splitext(audio)[1])])
    if parts > 1:
        print("  %d recordings in this walk - transcribed in order" % parts, flush=True)

    print("  transcribing... (the very first run downloads the model, ~500MB)", flush=True)
    result = subprocess.run(
        [sys.executable, os.path.join(HERE, "transcribe_walk.py"), os.path.basename(audio)],
        cwd=work,
    )
    if result.returncode != 0:
        print("  transcription failed - the zip is left where it is so you can retry", flush=True)
        return False

    # The transcript goes to its own folder, where it is the only kind of
    # thing present and cannot be confused with anything else.
    # One obviously-named copy at the top level. TRANSCRIPT in capitals
    # because in a folder of eight files, the one you import should be
    # unmistakable - and the owner was opening the wrong things.
    #
    # The "-part1" the script produces is dropped: it transcribes the WHOLE
    # walk, so calling the result part 1 is actively misleading.
    transcripts = os.path.join(root, TRANSCRIPTS_DIR)
    os.makedirs(transcripts, exist_ok=True)
    produced = [n for n in os.listdir(work) if n.endswith(".transcript.txt")]
    passed = any(transcript_passed(os.path.join(work, n)) for n in produced)
    for n in produced:
        nice = "%s - TRANSCRIPT.txt" % os.path.basename(work)
        shutil.copy2(os.path.join(work, n), os.path.join(transcripts, nice))
        print("  wrote %s / %s" % (TRANSCRIPTS_DIR, nice), flush=True)

    # THE GOLDEN RULE (the owner's, 14 Sep 2026): a walk's audio has done its
    # job once the words are in. Audio runs about 1MB a minute and one
    # interrupted walk came to 18.6MB in the folder and the same again in its
    # zip - 37MB for two minutes of speech, synced to every device.
    #
    # THE GUARD IS NOT A HEDGE and it earned itself the same day: the audio
    # goes only when COVERAGE PASSED, which is the transcriber's own statement
    # that the words account for the whole recording. Walk 4's first
    # transcript failed coverage and had to be regenerated FROM THE AUDIO
    # twice. Deleting unconditionally would have lost seven minutes of that
    # walk permanently, and silently.
    archive = os.path.join(root, ARCHIVE_DIR, os.path.basename(work))
    os.makedirs(archive, exist_ok=True)
    dropped = 0
    for n in sorted(os.listdir(work)):
        src = os.path.join(work, n)
        if not os.path.isfile(src):
            continue
        if n.lower().endswith(AUDIO_EXT):
            if passed:
                dropped += os.path.getsize(src)
                os.remove(src)
                continue
            shutil.move(src, os.path.join(archive, n))
            continue
        shutil.move(src, os.path.join(archive, n))
    try:
        os.rmdir(work)
    except OSError:
        pass

    if dropped:
        print("  released %.1f MB of audio - the words are the record now"
              % (dropped / 1048576.0), flush=True)
    elif not passed:
        print("  KEEPING the audio: coverage did not pass, so the words do "
              "not account for all of it yet", flush=True)

    # The zip holds another whole copy of the audio. Once the words are
    # proven it is the largest useless thing in the folder; when they are not,
    # it is a second chance and is kept.
    if passed:
        os.remove(zip_path)
    else:
        shutil.move(zip_path, os.path.join(archive, os.path.basename(zip_path)))

    print("  done. Open the transcript on your phone and paste it into that walk.", flush=True)
    return True


def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else recall()
    if not folder:
        sys.exit(
            "Which folder? Run it once with the path, and it will remember:\n"
            '  python watch_walks.py "C:\\Users\\604dr\\iCloudDrive\\Deez Plants"'
        )
    folder = os.path.abspath(folder)
    if not os.path.isdir(folder):
        sys.exit("No such folder: %s" % folder)
    remember(folder)

    # Everything the flow needs, made once. Empty folders cost nothing and
    # save the owner creating them by hand on two devices.
    for sub in (IN_DIR, TRANSCRIPTS_DIR, AI_DIR, BACKUPS_DIR, ARCHIVE_DIR):
        os.makedirs(os.path.join(folder, sub), exist_ok=True)

    inbox = os.path.join(folder, IN_DIR)
    print("Watching %s" % inbox, flush=True)
    print("Drop an exported walk in from your phone. Ctrl+C to stop.\n", flush=True)
    print("Waiting...", flush=True)

    seen = set()
    try:
        while True:
            for n in sorted(os.listdir(inbox)):
                path = os.path.join(inbox, n)
                if not n.lower().endswith(".zip") or not os.path.isfile(path):
                    continue
                if path in seen:
                    continue
                if handle(path, folder):
                    seen.add(path)
                print("\nWaiting...", flush=True)
            time.sleep(POLL_SECONDS)
    except KeyboardInterrupt:
        print("\nStopped.", flush=True)


if __name__ == "__main__":
    main()
