import { useEffect, useState } from 'react';
import { boot, refresh, type Booted } from './boot';
import { useNav } from './nav/useNav';
import { TabBar } from './nav/TabBar';
import { AllPagesSheet, type AllPagesItem } from './nav/AllPagesSheet';
import Placeholder from './nav/Placeholder';
import Home from './pages/Home';
import PlantsList from './pages/PlantsList';
import PlantDetail from './pages/PlantDetail';
import CareRoundPage from './pages/CareRoundPage';
import './App.css';

/**
 * The nav shell: one stack, a fixed four-item tab bar (Home/Plants/Rec/More),
 * and the All-pages sheet, per DESIGN_REFERENCE.md section 1. Rec and every
 * All-pages item other than Log care and plant detail resolve to a named
 * placeholder until their own build steps land, so the full nav map is
 * navigable end to end even though most of its destinations aren't built yet.
 */

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: Booted };

export default function App() {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const nav = useNav('home');

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

  const placeholder = (title: string, subtitle: string | undefined, backLabel: string) =>
    nav.push({ kind: 'placeholder', title, subtitle }, backLabel);

  // Active plants, in list order — the Prev/Next strip and the All-plants
  // picker on plant detail both walk this (DESIGN_REFERENCE.md screen 04,
  // locked per the original brief, section 6).
  const activePlants = state.order
    .map((id) => state.plants[id])
    .filter((p) => !p.archived)
    .map((p) => ({ plant_id: p.plant_id, name: p.name }));

  // DESIGN_REFERENCE.md section 1's 17 All-pages items, in order. Most targets
  // aren't built — those go to a named placeholder rather than the generic
  // build-target string, so the sheet reads the same before and after the
  // screen behind it exists.
  const menuItems: AllPagesItem[] = [
    { label: 'Log care', subtitle: 'Water, feed, prune — logs as you tap', go: () => nav.push({ kind: 'care' }, 'All pages') },
    { label: 'History', subtitle: 'Entry log and care calendar', go: () => placeholder('History', 'Per-plant entry log.', 'All pages') },
    { label: 'More about this plant', subtitle: 'Species, soil, pests, season', go: () => placeholder('More about this plant', undefined, 'All pages') },
    { label: 'Info and settings', subtitle: 'Identity, placement, care spec', go: () => placeholder('Info and settings', undefined, 'All pages') },
    // The mock labels this "Photos" but points at the plant detail screen —
    // a known flaw (DESIGN_REFERENCE.md section 5.1). Renamed per its own fix note.
    { label: 'Plant detail', subtitle: 'Pick a plant from Plants for now.', go: () => placeholder('Plant detail', 'Open a plant from the Plants tab — this menu has no plant of its own to open yet.', 'All pages') },
    { label: 'Add new plant', subtitle: 'New record with ID and suffix', go: () => placeholder('Add a new plant', undefined, 'All pages') },
    { label: 'Archived plants', subtitle: 'Kept out of the active list', go: () => placeholder('Archived plants', undefined, 'All pages') },
    { label: 'Photos', subtitle: 'Gallery and main photo', go: () => placeholder('Photos', undefined, 'All pages') },
    { label: 'Rooms and planters', subtitle: 'Rooms and shared planters', go: () => placeholder('Rooms and planters', undefined, 'All pages') },
    { label: 'Recordings', subtitle: 'Sessions held on this device', go: () => placeholder('Recordings', undefined, 'All pages') },
    { label: 'Reminders', subtitle: 'What the app tells you about', go: () => placeholder('Reminders', undefined, 'All pages') },
    { label: 'Since last time', subtitle: 'Saved states stacked for comparison', go: () => placeholder('Since last time', undefined, 'All pages') },
    { label: 'What works', subtitle: 'Care changes with your ratings either side', go: () => placeholder('What works', undefined, 'All pages') },
    { label: 'Prepare review package', subtitle: 'Bundle for Claude or GPT', go: () => placeholder('Prepare review package', undefined, 'All pages') },
    { label: 'Apply AI update', subtitle: 'Paste the returned changes', go: () => placeholder('Apply AI update', undefined, 'All pages') },
    { label: 'Handoff log', subtitle: 'Every package sent and update applied', go: () => placeholder('Handoff log', undefined, 'All pages') },
    { label: 'How this app works', subtitle: 'What the app, you and the AI each decide', go: () => placeholder('How this app works', undefined, 'All pages') },
  ];

  const screen = nav.current;
  let body: React.ReactNode;

  if (screen.kind === 'home') {
    body = (
      <Home
        state={state}
        onOpenPlant={(plant_id) => nav.push({ kind: 'detail', plant_id }, 'Home')}
        onCare={() => nav.push({ kind: 'care' }, 'Home')}
        onPlaceholder={(title, subtitle) => placeholder(title, subtitle, 'Home')}
      />
    );
  } else if (screen.kind === 'record') {
    body = <Placeholder title="Record" subtitle="Start or resume a walk recording." onBack={nav.back} />;
  } else if (screen.kind === 'plants') {
    body = (
      <PlantsList
        state={state}
        thumbs={thumbs}
        onOpen={(plant_id) => nav.push({ kind: 'detail', plant_id }, 'Plants')}
        onCare={() => nav.push({ kind: 'care' }, 'Plants')}
      />
    );
  } else if (screen.kind === 'care') {
    body = (
      <CareRoundPage
        state={state}
        events={events}
        registry={registry}
        thumbs={thumbs}
        as_of={as_of}
        onChanged={reload}
        backLabel={nav.backLabel ?? 'Plants'}
        onBack={nav.back}
        detailPlantId={screen.plant_id}
      />
    );
  } else if (screen.kind === 'detail') {
    const plant = state.plants[screen.plant_id];
    if (!plant) {
      // The plant vanished from the store between navigating here and now —
      // fall back rather than rendering with nothing.
      nav.goRoot('plants');
      body = null;
    } else {
      body = (
        <PlantDetail
          plant={plant}
          events={events}
          thumbs={thumbs}
          as_of={as_of}
          onChanged={reload}
          backLabel={nav.backLabel ?? 'Plants'}
          onBack={nav.back}
          allPlants={activePlants}
          onNavigate={(plant_id) => nav.replace({ kind: 'detail', plant_id })}
          onLogCare={() => nav.push({ kind: 'care', plant_id: plant.plant_id }, plant.name)}
        />
      );
    }
  } else {
    body = (
      <Placeholder
        title={screen.title}
        subtitle={screen.subtitle}
        backLabel={nav.backLabel ?? 'Home'}
        onBack={nav.back}
      />
    );
  }

  return (
    <>
      <div className="app-content">{body}</div>
      <TabBar active={nav.activeTab} onTab={nav.goRoot} onMore={nav.openSheet} />
      {nav.sheetOpen && <AllPagesSheet items={menuItems} onClose={nav.closeSheet} />}
    </>
  );
}
