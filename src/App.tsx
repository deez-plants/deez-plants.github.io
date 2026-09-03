import { useEffect, useState } from 'react';
import { boot, refresh, reseed, wipe, type Booted } from './boot';
import { formatDayMonth } from './lib/dates';
import { ScoreBlock } from './score/ScoreBlock';
import { collectionScore, plantScore } from './score/score';
import CareRoundPage from './pages/CareRoundPage';
import type { SeedOutcome } from './db/seedRun';
import './App.css';

/**
 * A first-run check screen plus Log care, not the app. The check screen exists
 * to make the seed visible: what landed, what the log derives to, and that
 * running the seed again changes nothing. The real Home / Plants / plant detail
 * screens replace it.
 */

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: Booted };

type Screen = 'check' | 'care';

function seedLine(o: SeedOutcome): string {
  if (o.already_seeded) return 'Already seeded — this run did nothing.';
  if (o.missing.length) {
    return `Seeded ${o.plants} plants and ${o.photos} photos · ${o.missing.length} could not be read, `
      + 'so the run is not stamped complete and the next open retries them.';
  }
  return `Seeded ${o.plants} plants, ${o.events} photo events, ${o.photos} images with thumbnails.`;
}

export default function App() {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [note, setNote] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('check');

  useEffect(() => {
    let live = true;
    boot()
      .then((data) => live && setLoad({ status: 'ready', data }))
      .catch((e: unknown) => live && setLoad({
        status: 'error',
        message: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      }));
    return () => { live = false; };
  }, []);

  if (load.status === 'loading') return <main className="shell"><p className="dim">Opening…</p></main>;
  if (load.status === 'error') {
    return (
      <main className="shell">
        <h1>Boot failed</h1>
        <pre className="error">{load.message}</pre>
      </main>
    );
  }

  const { state, outcome, thumbs, as_of, events, registry } = load.data;
  const plants = state.order.map((id) => state.plants[id]);

  // Every write goes through this: re-read the store and rebuild from the log.
  // Nothing patches derived state in place (rule 10).
  const reload = async () => {
    setLoad({ status: 'ready', data: await refresh() });
  };

  if (screen === 'care') {
    return (
      <CareRoundPage
        state={state}
        events={events}
        registry={registry}
        thumbs={thumbs}
        as_of={as_of}
        onChanged={reload}
        onBack={() => setScreen('check')}
      />
    );
  }

  const runAgain = async () => {
    setNote('Running the seed again…');
    const again = await reseed();
    const next = await refresh();
    setLoad({ status: 'ready', data: next });
    setNote(
      `Second run: ${again.already_seeded ? 'already_seeded, nothing written' : `ran again, ${again.photos} photos`}. `
      + `Still ${next.state.collection.active_count} plants and `
      + `${Object.values(next.state.plants).reduce((n, p) => n + p.photos.length, 0)} photos.`,
    );
  };

  const clear = async () => {
    if (!confirm('Delete the local database and reload as a genuine first run?')) return;
    await wipe();
    location.reload();
  };

  return (
    <main className="shell">
      <header>
        <h1>Deez Plants</h1>
        <p className="dim">First-run check · derived as of {formatDayMonth(as_of)}</p>
      </header>

      <section className="panel">
        <button className="go-care" onClick={() => setScreen('care')}>
          Log care
          {state.pending_count > 0 && <span className="tag pending">{state.pending_count} pending</span>}
        </button>
      </section>

      <section className="panel">
        <p>{seedLine(outcome)}</p>
        {outcome.missing.length > 0 && (
          <ul className="missing">{outcome.missing.map((m) => <li key={m}>{m}</li>)}</ul>
        )}
        <div className="actions">
          <button onClick={() => void runAgain()}>Run seed again</button>
          <button onClick={() => void reload()}>Recompute</button>
          <button className="danger" onClick={() => void clear()}>Clear database</button>
        </div>
        {note && <p className="note">{note}</p>}
      </section>

      <section className="panel">
        {/* The collection average, in the one score block. */}
        <ScoreBlock {...collectionScore(state)} />
        <dl className="summary">
          <div><dt>Active</dt><dd>{state.collection.active_count}</dd></div>
          <div><dt>Archived</dt><dd>{state.collection.archived_count}</dd></div>
          <div><dt>Rated</dt><dd>{state.collection.rated_count}</dd></div>
          <div><dt>Photos</dt><dd>{plants.reduce((n, p) => n + p.photos.length, 0)}</dd></div>
          <div>
            <dt>Needs attention</dt>
            <dd>{state.collection.needs_attention.length || <span className="dim">nothing</span>}</dd>
          </div>
        </dl>
        {state.orphan_event_ids.length > 0 && (
          <p className="warn">{state.orphan_event_ids.length} events name a plant with no record.</p>
        )}
      </section>

      <ul className="plants">
        {plants.map((p) => {
          const hero = p.hero ?? p.photos[0];
          const url = hero ? thumbs.get(hero) : undefined;
          return (
            <li key={p.plant_id} className="plant">
              {url
                ? <img src={url} alt="" width={64} height={64} />
                : <div className="noimg" />}
              <div className="body">
                <p className="name">
                  {p.name} <span className="dim">{p.plant_id}</span>
                </p>
                <p className="species">{p.species}</p>
                <p className="meta">
                  {p.room} · {p.pot}
                  {p.planter && (
                    <> · {p.planter}{' '}
                      <span className={p.planter_shared_water ? 'tag shared' : 'tag'}>
                        {p.planter_shared_water ? 'shared soil' : 'separate pots'}
                      </span>
                    </>
                  )}
                </p>
                <p className="meta">
                  water every {p.water_interval_days}d
                  {p.water_interval_days_winter !== null && <> · {p.water_interval_days_winter}d in winter</>}
                  {' · '}{p.photos.length} photo{p.photos.length === 1 ? '' : 's'}
                  {p.last_checked && <> · last event {formatDayMonth(p.last_checked)}</>}
                </p>
                {/* Rule 6: the same block here as on Home and plant detail. */}
                <div className="plant-score"><ScoreBlock {...plantScore(p)} /></div>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
