import type { CareEventType } from '../types/event';

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
}

export const CARE_TYPE_STYLE: Record<CareEventType, CareTypeStyle> = {
  Water: { label: 'Watered', abbr: 'W', colorVar: 'var(--cal-water)' },
  Feed: { label: 'Fed', abbr: 'F', colorVar: 'var(--accent)' },
  Prune: { label: 'Pruned', abbr: 'X', colorVar: 'var(--warn)' },
  Repot: { label: 'Repotted', abbr: 'R', colorVar: 'var(--cal-repot)' },
  Photo: { label: 'Photo', abbr: 'Ph', colorVar: 'var(--cal-photo)' },
  Inspect: { label: 'Inspected', abbr: 'I', colorVar: 'var(--amber)' },
  Support: { label: 'Support added', abbr: 'S', colorVar: 'var(--cal-support)' },
  'Pest treat': { label: 'Pest treated', abbr: 'Pt', colorVar: 'var(--cal-pest)' },
  Other: { label: 'Other', abbr: 'O', colorVar: 'var(--cal-other)' },
};

/** Canonical order the legend and stacked chips follow, so the same day never
    reorders its icons between renders. */
export const CARE_TYPE_ORDER: CareEventType[] = [
  'Water', 'Feed', 'Prune', 'Repot', 'Photo', 'Inspect', 'Support', 'Pest treat', 'Other',
];
