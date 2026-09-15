import { useState } from 'react';
import type { PlantId } from '../types/ids';
import './PlantChrome.css';

/**
 * The chrome every plant-scoped screen shares: a named back button, the
 * `All plants ▾` picker, and the `‹ Prev / ID / Next ›` strip. Locked in the
 * original design brief (DESIGN_REFERENCE.md section 6) — not just plant
 * detail's furniture, the mock shows this same header on History too, so any
 * screen bound to one plant reuses it rather than reinventing it.
 */

export interface PlantChromeProps {
  plant: { plant_id: PlantId; name: string };
  /** What the back button reads — the screen it returns to, never a bare
      "Back" (DESIGN_REFERENCE.md section 4 rule 3). */
  backLabel: string;
  onBack: () => void;
  /** Active plants, in list order — Prev/Next and the picker both walk this. */
  allPlants: readonly { plant_id: PlantId; name: string }[];
  /** Swaps which plant is showing without pushing a new back-stack entry —
      browsing 22 plants with Prev/Next should not take 22 taps to back out of. */
  onNavigate: (plant_id: PlantId) => void;
  /** Open the plant this strip names. Optional: on Plant Detail itself there
      is nowhere to go, so it is left off there. */
  onOpenPlant?: (plant_id: PlantId) => void;
}

export function PlantChrome({
  plant, backLabel, onBack, allPlants, onNavigate, onOpenPlant,
}: PlantChromeProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const index = allPlants.findIndex((p) => p.plant_id === plant.plant_id);
  const prev = index > 0 ? allPlants[index - 1] : null;
  const next = index >= 0 && index < allPlants.length - 1 ? allPlants[index + 1] : null;

  const goTo = (id: PlantId) => {
    setPickerOpen(false);
    onNavigate(id);
  };

  /* Both rows are pinned together — treatment F from Round 4 of the screens
     page, chosen by the owner over the tighter one-row version. It costs
     about 12% of the page against the one-row bar's 7%, and they took that
     trade knowingly to keep the back button and the strip on separate lines.

     The picker deliberately sits OUTSIDE the sticky element: a 22-row list
     pinned to the top of the screen would cover the plant you are choosing
     for. It scrolls, as a menu should. */
  return (
    <>
      <div className="chrome-sticky">
      <div className="chrome-row">
        <button type="button" className="chrome-back" onClick={onBack}>‹ {backLabel}</button>
        <button
          type="button"
          className="chrome-picker-toggle"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((o) => !o)}
        >
          All plants {pickerOpen ? '▴' : '▾'}
        </button>
      </div>

      <div className="chrome-nav-strip">
        <button
          type="button"
          className="chrome-nav-btn"
          disabled={!prev}
          onClick={() => prev && goTo(prev.plant_id)}
        >
          ‹ Prev
        </button>
        {/* The ID is the way to this plant's own page.
            Stepping sideways with Prev/Next deliberately does NOT move the
            back button — back means "where I came from", and having it drift
            would give one control two meanings. But that left no route from,
            say, Log care for 004 to 004's own page except going the long way
            round. The strip already names the plant; making it tappable is
            the short way, and it works the same on History, Photos and the
            calendar. */}
        {onOpenPlant ? (
          <button
            type="button"
            className="chrome-nav-id as-link"
            onClick={() => onOpenPlant(plant.plant_id)}
          >
            {plant.plant_id}
          </button>
        ) : (
          <span className="chrome-nav-id">{plant.plant_id}</span>
        )}
        <button
          type="button"
          className="chrome-nav-btn"
          disabled={!next}
          onClick={() => next && goTo(next.plant_id)}
        >
          Next ›
        </button>
      </div>
      </div>

      {pickerOpen && (
        <div className="chrome-picker">
          {allPlants.map((p) => (
            <button
              key={p.plant_id}
              type="button"
              className={p.plant_id === plant.plant_id ? 'chrome-picker-row on' : 'chrome-picker-row'}
              onClick={() => goTo(p.plant_id)}
            >
              <span className="chrome-picker-id">{p.plant_id}</span>
              <span className="chrome-picker-name">{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
