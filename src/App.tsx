import { useEffect, useState } from 'react';
import { boot, refresh, type Booted } from './boot';
import type { PlantId } from './types/ids';
import PlantsList from './pages/PlantsList';
import PlantDetail from './pages/PlantDetail';
import CareRoundPage from './pages/CareRoundPage';
import './App.css';

/**
 * Navigation between the three screens built so far: the plants list, plant
 * detail, and the existing Log care screen. No rating UI, no photo capture, no
 * export yet — those are later phases.
 */

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: Booted };

type Screen =
  | { kind: 'list' }
  | { kind: 'detail'; plant_id: PlantId }
  | { kind: 'care' };

export default function App() {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [screen, setScreen] = useState<Screen>({ kind: 'list' });

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

  const { state, events, registry, thumbs, as_of } = load.data;

  // Every write goes through this: re-read the store and rebuild from the log.
  // Nothing patches derived state in place (rule 10).
  const reload = async () => {
    setLoad({ status: 'ready', data: await refresh() });
  };

  if (screen.kind === 'care') {
    return (
      <CareRoundPage
        state={state}
        events={events}
        registry={registry}
        thumbs={thumbs}
        as_of={as_of}
        onChanged={reload}
        onBack={() => setScreen({ kind: 'list' })}
      />
    );
  }

  if (screen.kind === 'detail') {
    const plant = state.plants[screen.plant_id];
    if (!plant) {
      // The plant vanished from the store between navigating here and now —
      // fall back rather than rendering with nothing.
      setScreen({ kind: 'list' });
      return null;
    }
    return (
      <PlantDetail
        plant={plant}
        events={events}
        thumbs={thumbs}
        as_of={as_of}
        onChanged={reload}
        onBack={() => setScreen({ kind: 'list' })}
      />
    );
  }

  return (
    <PlantsList
      state={state}
      thumbs={thumbs}
      onOpen={(plant_id) => setScreen({ kind: 'detail', plant_id })}
      onCare={() => setScreen({ kind: 'care' })}
    />
  );
}
