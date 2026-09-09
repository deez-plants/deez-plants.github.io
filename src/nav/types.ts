import type { PlantId } from '../types/ids';

/**
 * Every destination the shell knows how to render. Most of the 25 screens in
 * DESIGN_REFERENCE.md don't exist yet — those resolve to `placeholder` until
 * their own build step lands, so the All-pages sheet and the tab bar are
 * complete now and only need their `go` targets swapped out later.
 */
export type Screen =
  | { kind: 'home' }
  | { kind: 'plants' }
  | { kind: 'record' }
  /** `plant_id` set when reached from that plant's own "Log care" — the
      single-plant detailed mode then shows for it (careRound.ts's
      "ONE PLANT, WITH DETAIL"). Absent from every other entry point, which
      shows only the multi-select round, as before. */
  | { kind: 'care'; plant_id?: PlantId }
  | { kind: 'detail'; plant_id: PlantId }
  /** Screen 24: one plant's last 10 entries. */
  | { kind: 'history'; plant_id: PlantId }
  /** Screen 25: one plant's full log. */
  | { kind: 'entries'; plant_id: PlantId }
  /** Screens 26/27: month grids with a dot per care type. `all` selects
      twelve months (27) over the default three (26). */
  | { kind: 'calendar'; plant_id: PlantId; all?: boolean }
  /** Screens 08/09 collapsed into one: soil, care instructions, notes_user. */
  | { kind: 'more'; plant_id: PlantId }
  /** Screen 10: identity, placement, care spec. Read display only for now. */
  | { kind: 'info'; plant_id: PlantId }
  | { kind: 'archive' }
  /** Screen 07: the collection-wide factual record, off Home's CARE ADHERENCE
      block. Not plant-scoped, so no `PlantChrome`. */
  | { kind: 'adherence' }
  /** Screen 06: the collection's rating average over time, off Home's HEALTH
      block. Not plant-scoped, so no `PlantChrome`. */
  | { kind: 'health-history' }
  /** Screen 11: a new plant baseline. */
  | { kind: 'add-plant' }
  /** Screen 13: the photo gallery for one plant, hero selection. */
  | { kind: 'photos'; plant_id: PlantId }
  /** Screen 19: builds the export ZIP. */
  | { kind: 'prepare-package' }
  /** Screen 20: import an update file, review table, per-row approval. */
  | { kind: 'apply-update' }
  /** Screen 14: the physical registry — rooms and shared planters. */
  | { kind: 'rooms' }
  /** Screen 15: walks held on this device, and the Whisper hand-off. */
  | { kind: 'recordings' }
  /** Section 8's phone half: export the record, or restore one. */
  | { kind: 'backup' }
  | { kind: 'placeholder'; title: string; subtitle?: string };

export type RootTab = 'home' | 'plants' | 'record';

export interface StackEntry {
  screen: Screen;
  /** What the back button on the NEXT pushed screen should read, e.g. "Plants"
      or "All pages". Empty for root screens, which show no back button. */
  backLabel: string;
}
