import type { CareEventType, StoredEvent } from '../types/event';

/** Past-tense row labels for the care types — the raw `type` string
    ("Water", "Pest treat") reads as an imperative, not a record of what
    happened.

    This is a total `Record`, so adding a care type without a label here is a
    compile error rather than a row that silently reads "Top-dress". That is
    deliberate: it is how the nine added on 2026-09-13 were caught. */
const CARE_LABELS: Record<CareEventType, string> = {
  Water: 'Watered',
  Feed: 'Fed',
  Prune: 'Pruned',
  Repot: 'Repotted',
  Photo: 'Photo',
  Inspect: 'Inspected',
  Support: 'Support added',
  'Pest treat': 'Pest treated',
  Other: 'Other',
  'Top-dress': 'Top-dressed',
  'Soil flush': 'Soil flushed',
  'Took cuttings': 'Took cuttings',
  'Hard prune': 'Hard pruned',
  'Dead leaves': 'Dead leaves off',
  'Trim back': 'Trimmed back',
  Rotate: 'Rotated',
  'Wipe leaves': 'Leaves wiped',
  Mist: 'Misted',
};

/** What a History row's tag reads, for any event type that can name a
    plant — care actions, a rating, an edit, or the archive event itself. */
export function eventLabel(e: StoredEvent): string {
  switch (e.type) {
    case 'Rate': return `Rated ${e.to}/10`;
    case 'Archive': return 'Archived';
    case 'Edit': return `Edited ${e.field.replace(/_/g, ' ')}`;
    default: return CARE_LABELS[e.type];
  }
}
