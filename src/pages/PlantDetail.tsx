import type { ISODate } from '../types/ids';
import type { StoredEvent } from '../types/event';
import type { DerivedAdherence, DerivedPlant } from '../types/derived';
import { formatDayMonth } from '../lib/dates';
import { rowStatus } from '../care/careRound';
import { ScoreBlock } from '../score/ScoreBlock';
import { plantScore } from '../score/score';
import './PlantDetail.css';

/**
 * Plant detail: hero, the one score block, adherence as counts and days, care
 * spec, placement, last checked. No rating UI, no photo capture, no export —
 * those are later phases.
 */

export interface PlantDetailProps {
  plant: DerivedPlant;
  /** The raw log — `rowStatus` reads it for the interval line. */
  events: readonly StoredEvent[];
  /** media_id -> object URL. */
  thumbs: Map<string, string>;
  as_of: ISODate;
  onBack: () => void;
}

/** Section 3: counts and days, never a score out of ten. */
function formatDaysLate(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  const value = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${value} day${rounded === 1 ? '' : 's'}`;
}

function adherenceLine(a: DerivedAdherence): string {
  if (a.care_count === 0) return 'No completed waterings yet.';
  const base = `On time ${a.on_time_count} of ${a.care_count} watering${a.care_count === 1 ? '' : 's'}`;
  return a.avg_days_late === null ? `${base}.` : `${base} · average ${formatDaysLate(a.avg_days_late)} late`;
}

function adherenceBadge(a: DerivedAdherence): { text: string; tone: 'on' | 'slip' | 'behind' | 'quiet' } {
  if (!a.last_water) return { text: 'Not watered yet', tone: 'quiet' };
  if (a.state === 'behind') return { text: 'Behind', tone: 'behind' };
  if (a.state === 'slip') return { text: 'Slipping', tone: 'slip' };
  return { text: 'On track', tone: 'on' };
}

/** Care spec is a quick reference, not the full record — drop the trailing
    seasonal clause so the line reads shorter. */
function trimSeasonNote(text: string): string {
  return text.replace(/,?\s*active season\.?$/i, '').trim();
}

export default function PlantDetail({ plant, events, thumbs, as_of, onBack }: PlantDetailProps) {
  const hero = plant.hero ?? plant.photos[0];
  const heroUrl = hero ? thumbs.get(hero) : undefined;
  const badge = adherenceBadge(plant.adherence);
  // Rule 9: a fact about the calendar, never an instruction — "needs water" may
  // not appear here, only the interval and how far past it the date is.
  const interval = rowStatus('Water', plant, events, as_of);

  return (
    <main className="detail">
      <button type="button" className="detail-back" onClick={onBack}>‹ Back</button>

      <h1 className="detail-title">{plant.name}</h1>

      <div className="detail-top">
        {heroUrl
          ? <img className="detail-hero" src={heroUrl} alt="" width={118} height={118} />
          : <div className="detail-hero detail-hero-empty" />}
        <div className="detail-score"><ScoreBlock {...plantScore(plant)} /></div>
      </div>

      <p className="detail-checked">
        {plant.last_checked
          ? <>Last checked <span className="detail-checked-date">{formatDayMonth(plant.last_checked)}</span></>
          : 'No events logged yet'}
      </p>

      <section className="detail-card">
        <div className="detail-card-head">
          <span className="detail-card-label">CARE ADHERENCE</span>
          <span className={`detail-badge detail-badge-${badge.tone}`}>{badge.text}</span>
        </div>
        <p className="detail-card-line">{adherenceLine(plant.adherence)}</p>
        <p className="detail-card-sub">{interval.text}</p>
      </section>

      <section className="detail-card">
        <span className="detail-card-label">CARE SPEC</span>
        <dl className="detail-spec">
          <div>
            <dt>Water</dt>
            <dd>
              every {plant.water_interval_days}d
              {plant.water_interval_days_winter !== null && <> · {plant.water_interval_days_winter}d winter</>}
            </dd>
          </div>
          <div>
            <dt>Feed</dt>
            <dd>{plant.feed ? trimSeasonNote(plant.feed) : <span className="detail-unset">Not set</span>}</dd>
          </div>
          <div><dt>Light</dt><dd>{plant.light || <span className="detail-unset">Not set</span>}</dd></div>
          <div><dt>Soil</dt><dd>{plant.soil || <span className="detail-unset">Not set</span>}</dd></div>
        </dl>
      </section>

      <section className="detail-card">
        <span className="detail-card-label">PLACEMENT</span>
        <dl className="detail-spec">
          <div><dt>Room</dt><dd>{plant.room}</dd></div>
          <div><dt>Pot</dt><dd>{plant.pot}</dd></div>
          {plant.planter && (
            <div>
              <dt>Planter</dt>
              <dd>
                {plant.planter}{' '}
                <span className={plant.planter_shared_water ? 'detail-tag shared' : 'detail-tag'}>
                  {plant.planter_shared_water ? 'shared soil' : 'separate pots'}
                </span>
              </dd>
            </div>
          )}
        </dl>
      </section>
    </main>
  );
}
