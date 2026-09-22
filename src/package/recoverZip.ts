import JSZip from 'jszip';
import type { DeezDB } from '../db/schema';
import { reconstructFromZip, type Reconstructed, type ZipEvidence } from './registry';

/**
 * Read a review-package ZIP back off the disk, so a package the app failed to
 * register can be recovered from the only complete evidence there is: the file
 * that actually went to the AI.
 *
 * The parsing lives here rather than in `registry.ts` because that file is
 * pure and checked in node; this one needs JSZip and the `sessions` store. The
 * split is the same one `clock.ts` has from `recording.ts`.
 *
 * `markers.json` is optional. A package built before recording existed has
 * none, and its absence means no walks travelled — not a broken file.
 */
export async function readPackageZip(db: DeezDB, file: Blob): Promise<
  { ok: true; value: Reconstructed } | { ok: false; reason: string }
> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    return { ok: false, reason: 'That file is not a readable ZIP.' };
  }

  const text = async (name: string): Promise<string | null> => {
    const entry = zip.file(name);
    return entry ? entry.async('string') : null;
  };

  const manifestRaw = await text('manifest.json');
  if (manifestRaw === null) {
    return { ok: false, reason: 'No manifest.json in that ZIP — this does not look like a review package.' };
  }
  const eventsRaw = await text('events.json');
  if (eventsRaw === null) {
    return { ok: false, reason: 'No events.json in that ZIP — this does not look like a review package.' };
  }
  const markersRaw = await text('markers.json');

  let evidence: ZipEvidence;
  try {
    evidence = {
      manifest: JSON.parse(manifestRaw) as ZipEvidence['manifest'],
      events: JSON.parse(eventsRaw),
      markers: markersRaw === null ? null : JSON.parse(markersRaw) as ZipEvidence['markers'],
    };
  } catch {
    return { ok: false, reason: 'A file inside that ZIP is not valid JSON.' };
  }

  if (typeof evidence.manifest !== 'object' || evidence.manifest === null) {
    return { ok: false, reason: 'manifest.json does not hold an object.' };
  }

  return reconstructFromZip(evidence, await db.getAll('sessions'));
}
