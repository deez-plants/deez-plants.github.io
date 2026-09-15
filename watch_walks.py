#!/usr/bin/env python3
"""
Deez Plants - watch a folder and transcribe walks as they arrive.

Usage:   python watch_walks.py "C:\\Users\\604dr\\iCloudDrive\\Deez Plants"
         python watch_walks.py            (uses the folder remembered last time)

Leave it running. Drop an exported walk into the folder from your phone - it
appears there through iCloud Drive - and a transcript shows up beside it a few
minutes later. No commands, no unzipping, no remembering which folder.

WHY THIS EXISTS

Transcribing a walk by hand is: export, move the file, unzip, open PowerShell,
cd to the right place, run the script with the right filename, then paste the
result back. Seven steps, six of which are bookkeeping. This does all six.

It also removes a trap that is easy to hit and silent when you do: every
export contains a file called `markers.json`, so unzipping two walks into one
folder makes the second overwrite the first - and the script would then
attribute one walk's audio to the other walk's plants, with nothing to show
anything had gone wrong. Each walk gets its own folder here, always.

WHAT IT DOES NOT DO

It cannot put the transcript back into the app. Storage is per-origin and iOS
will not let a web page read a folder, so the last step stays yours: open the
transcript on your phone and paste it into that walk. One action.
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
DONE_DIR = "transcribed"


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
    print("  unzipped into %s\\" % name, flush=True)

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

    # The transcript goes back beside the zip, where the phone will see it.
    produced = [n for n in os.listdir(work) if n.endswith(".transcript.txt")]
    for n in produced:
        shutil.copy2(os.path.join(work, n), os.path.join(root, n))
        print("  wrote %s" % n, flush=True)

    # Move the zip out of the way so it is not picked up again, without
    # deleting anything the owner might still want.
    done = os.path.join(root, DONE_DIR)
    os.makedirs(done, exist_ok=True)
    shutil.move(zip_path, os.path.join(done, os.path.basename(zip_path)))

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

    print("Watching %s" % folder, flush=True)
    print("Drop an exported walk in from your phone. Ctrl+C to stop.\n", flush=True)
    print("Waiting...", flush=True)

    seen = set()
    try:
        while True:
            for n in sorted(os.listdir(folder)):
                path = os.path.join(folder, n)
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
