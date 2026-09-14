import type { CareEventType } from '../types/event';
import type { IconName } from '../components/Icon';

/**
 * Per-care-type colour and a short mono abbreviation, for the calendar
 * (DESIGN_REFERENCE.md screens 26/27) where a full label doesn't fit inside a
 * day cell. Three of the nine reuse existing signal colours (Feed = accent,
 * Prune = warn, Inspect = amber); the other six are new, calendar-only tokens
 * (`--cal-*` in index.css) since the mock's legend uses more hues than the
 * core three-colour system defines.
 */
export interface CareTypeStyle {
  label: string;
  abbr: string;
  colorVar: string;
  /** Which of the owner's icons draws this care type (`components/Icon.tsx`). */
  icon: IconName;
}

export const CARE_TYPE_STYLE: Record<CareEventType, CareTypeStyle> = {
  Water: { label: 'Watered', abbr: 'W', colorVar: 'var(--cal-water)' , icon: 'water' },
  Feed: { label: 'Fed', abbr: 'F', colorVar: 'var(--accent)' , icon: 'feed' },
  Prune: { label: 'Pruned', abbr: 'X', colorVar: 'var(--warn)' , icon: 'prune' },
  Repot: { label: 'Repotted', abbr: 'R', colorVar: 'var(--cal-repot)' , icon: 'repot' },
  Photo: { label: 'Photo', abbr: 'Ph', colorVar: 'var(--cal-photo)' , icon: 'photo' },
  Inspect: { label: 'Inspected', abbr: 'I', colorVar: 'var(--amber)' , icon: 'inspect' },
  Support: { label: 'Support added', abbr: 'S', colorVar: 'var(--cal-support)' , icon: 'support' },
  'Pest treat': { label: 'Pest treated', abbr: 'Pt', colorVar: 'var(--cal-pest)' , icon: 'pest' },
  Other: { label: 'Other', abbr: 'O', colorVar: 'var(--cal-other)' , icon: 'other' },

  /* --- added 2026-09-13 --- *
   *
   * Colours reuse the existing `--cal-*` tokens wherever the meaning is close,
   * rather than inventing nine more hues for a legend that already carries
   * nine. Soil work borrows the repot brown, water work borrows the water
   * blue, and everything routine takes the neutral grey — which is the point:
   * routine should read as background on the calendar, because that is
   * exactly what it is.
   *
   * The three pruning types share the `prune` icon and the warn colour, and
   * are told apart by abbreviation alone. Three near-identical pairs of
   * scissors in a day cell would be worse than one plus a letter.
   */
  'Top-dress': { label: 'Top-dressed', abbr: 'Td', colorVar: 'var(--cal-repot)', icon: 'topdress' },
  'Soil flush': { label: 'Soil flushed', abbr: 'Sf', colorVar: 'var(--cal-water)', icon: 'flush' },
  'Took cuttings': { label: 'Took cuttings', abbr: 'Ct', colorVar: 'var(--accent)', icon: 'cutting' },
  'Hard prune': { label: 'Hard pruned', abbr: 'Hp', colorVar: 'var(--warn)', icon: 'prune' },
  'Dead leaves': { label: 'Dead leaves off', abbr: 'Dl', colorVar: 'var(--cal-other)', icon: 'prune' },
  'Trim back': { label: 'Trimmed back', abbr: 'Tb', colorVar: 'var(--cal-other)', icon: 'prune' },
  Rotate: { label: 'Rotated', abbr: 'Rt', colorVar: 'var(--cal-other)', icon: 'rotate' },
  'Wipe leaves': { label: 'Leaves wiped', abbr: 'Wl', colorVar: 'var(--cal-other)', icon: 'wipe' },
  Mist: { label: 'Misted', abbr: 'M', colorVar: 'var(--cal-other)', icon: 'mist' },
};

/** Canonical order the legend and stacked chips follow, so the same day never
    reorders its icons between renders. */
export const CARE_TYPE_ORDER: CareEventType[] = [
  'Water', 'Feed', 'Prune', 'Hard prune', 'Repot', 'Top-dress', 'Soil flush',
  'Took cuttings', 'Photo', 'Inspect', 'Support', 'Pest treat',
  // Routine last, together: on a calendar legend they should read as one
  // quiet group rather than interleaved with the interventions.
  'Dead leaves', 'Trim back', 'Rotate', 'Wipe leaves', 'Mist',
  'Other',
];
