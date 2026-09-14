import { useEffect, useState } from 'react';
import { boot, refresh, type Booted } from './boot';
import { useNav } from './nav/useNav';
import type { PlantScopedKind, Screen } from './nav/types';
import type { PlantId } from './types/ids';
import { TabBar } from './nav/TabBar';
import AllPages, { type AllPagesGroup } from './nav/AllPages';
import PlantPicker from './nav/PlantPicker';
import { screenTitle } from './nav/screenTitle';
import { useEdgeSwipeBack } from './nav/useEdgeSwipeBack';
import Placeholder from './nav/Placeholder';
import Home from './pages/Home';
import PlantsList from './pages/PlantsList';
import PlantDetail from './pages/PlantDetail';
import PlantHistory from './pages/PlantHistory';
import PlantEntries from './pages/PlantEntries';
import PlantCalendar from './pages/PlantCalendar';
import ArchivedPlants from './pages/ArchivedPlants';
import AdherenceHistory from './pages/AdherenceHistory';
import HealthHistory from './pages/HealthHistory';
import AddPlant from './pages/AddPlant';
import PhotosPage from './pages/PhotosPage';
import PrepareReviewPackage from './pages/PrepareReviewPackage';
import ApplyAIUpdate from './pages/ApplyAIUpdate';
import RoomsPlanters from './pages/RoomsPlanters';
import MoreAboutPlant from './pages/MoreAboutPlant';
import InfoSettings from './pages/InfoSettings';
import CareRoundPage from './pages/CareRoundPage';
import RecordSession from './pages/RecordSession';
import Recordings from './pages/Recordings';
import Backup from './pages/Backup';
import HowItWorks from './pages/HowItWorks';
import HandoffLog from './pages/HandoffLog';
import SinceLastTime from './pages/SinceLastTime';
import WhatWorks from './pages/WhatWorks';
import { enterScreen } from './capture/screenLog';
import './App.css';

/**
 * The nav shell: one stack and a fixed four-item tab bar (Home/Plants/Rec/
 * More), per DESIGN_REFERENCE.md section 1. `More` pushes the All-pages
 * screen rather than opening the sheet the reference specifies — see the
 * comment on `nav/AllPages.tsx` for why. The handful of All-pages rows whose
 * screens aren't built yet still resolve to a named placeholder, so the nav
 * map is navigable end to end.
 */

/** What each plant-scoped All-pages row opens, for the picker's own subtitle:
    "Opens this plant's photo gallery." rather than a bare list of plants. */
const PICKER_DESTINATION: Record<PlantScopedKind, string> = {
  detail: "that plant's page",
  history: "that plant's history",
  photos: "that plant's photo gallery",
  more: 'more about that plant',
  info: "that plant's info and settings",
  works: "what you have changed about that plant",
};

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

  // The screen log (FIELD_DEFINITIONS.md section 6) runs always, not only while
  // recording — this is its one call site. Visits under five seconds are
  // dropped inside `enterScreen`, so navigating through a screen writes
  // nothing; opening a plant's page also places a `plant_open` marker when a
  // walk happens to be running.
  const current = nav.current;
  const screenKind = current.kind;
  const screenPlant = 'plant_id' in current ? current.plant_id : undefined;
  useEffect(() => {
    enterScreen(screenKind, screenPlant);
  }, [screenKind, screenPlant]);

  // Changing screens starts at the top of the new one. Without this the window
  // keeps whatever scroll offset the previous screen had, so a long screen
  // opened from a scrolled-down one lands halfway through itself — All pages
  // opening at "Info and settings" with its own title off screen is how this
  // was noticed. Filter and search state inside a screen doesn't move it,
  // because neither of these two values changes.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screenKind, screenPlant]);

  // Swipe from the left edge to go back, on every screen that has something
  // behind it. The owner asked for a back that works everywhere and noted
  // there may be no room for one — this costs no space at all.
  useEdgeSwipeBack(nav.canGoBack, nav.back);

  if (load.status === 'loading') return <main className="shell"><p className="dim">Opening…</p></main>;
  if (load.status === 'error') {
    return (
      <main className="shell">
        <h1>Boot failed</h1>
        <pre className="error">{load.message}</pre>
      </main>
    );
  }

  const { state, events, registry, snapshots, thumbs, as_of } = load.data;

  // Every write goes through this: re-read the store and rebuild from the log.
  // Nothing patches derived state in place (rule 10).
  const reload = async () => {
    setLoad({ status: 'ready', data: await refresh() });
  };

  const placeholder = (title: string, subtitle: string | undefined, backLabel: string) =>
    nav.push({ kind: 'placeholder', title, subtitle }, backLabel);

  // More pushes rather than clearing the stack, so its back button has to name
  // whatever you were looking at (section 4 rule 3). For a plant-scoped screen
  // that is the plant's own name, which is what the back button on every other
  // screen pushed from there reads too.
  const openAllPages = () => {
    if (current.kind === 'all-pages') return;
    const on = 'plant_id' in current && current.plant_id
      ? state.plants[current.plant_id]
      : undefined;
    const label = on?.name ?? screenTitle(current);
    nav.push({ kind: 'all-pages' }, label);
  };

  // Active plants, in list order — the Prev/Next strip and the All-plants
  // picker on plant detail both walk this (DESIGN_REFERENCE.md screen 04,
  // locked per the original brief, section 6).
  const activePlants = state.order
    .map((id) => state.plants[id])
    .filter((p) => !p.archived)
    .map((p) => ({ plant_id: p.plant_id, name: p.name }));

  // DESIGN_REFERENCE.md section 1 lists these as 17 flat rows. They are the
  // same rows in the same reading order, grouped under four headers — see
  // `nav/AllPages.tsx` for why the flat sheet did not survive this app's type
  // sizes. `Back up` is an eighteenth, added with section 8's phone half.
  const fromPages = (screen: Screen) => nav.push(screen, 'All pages');
  const pick = (target: PlantScopedKind) => fromPages({ kind: 'plant-picker', target });

  const menuGroups: AllPagesGroup[] = [
    {
      heading: 'This plant',
      note: 'Each one asks which plant first.',
      items: [
        // The mock labels this "Photos" but points at plant detail — a known
        // flaw (DESIGN_REFERENCE.md section 5.1). Renamed per its own fix note.
        { label: 'Plant detail', subtitle: 'Score, care, photo, calendar', go: () => pick('detail') },
        { label: 'What works', subtitle: 'What you changed, and your ratings either side', go: () => pick('works') },
        { label: 'History', subtitle: 'Entry log and care calendar', go: () => pick('history') },
        { label: 'Photos', subtitle: 'Gallery and main photo', go: () => pick('photos') },
        { label: 'More about this plant', subtitle: 'Soil, care instructions, notes', go: () => pick('more') },
        { label: 'Info and settings', subtitle: 'Identity, placement, care spec', go: () => pick('info') },
      ],
    },
    {
      heading: 'The collection',
      items: [
        { label: 'Log care', subtitle: 'Water, feed, prune — logs as you tap', go: () => fromPages({ kind: 'care' }) },
        { label: 'Add new plant', subtitle: 'New record with ID and suffix', go: () => fromPages({ kind: 'add-plant' }) },
        { label: 'Archived plants', subtitle: 'Kept out of the active list', go: () => fromPages({ kind: 'archive' }) },
        { label: 'Rooms and planters', subtitle: 'Rooms and shared planters', go: () => fromPages({ kind: 'rooms' }) },
        { label: 'Recordings', subtitle: 'Sessions held on this device', go: () => fromPages({ kind: 'recordings' }) },
        { label: 'Since last time', subtitle: 'Saved states stacked for comparison', go: () => fromPages({ kind: 'since' }) },
      ],
    },
    {
      heading: 'AI round-trip',
      note: 'Out to the AI, back again, and the record of both.',
      items: [
        { label: 'Prepare review package', subtitle: 'Bundle for Claude or GPT', go: () => fromPages({ kind: 'prepare-package' }) },
        { label: 'Apply AI update', subtitle: 'Paste the returned changes', go: () => fromPages({ kind: 'apply-update' }) },
        { label: 'Handoff log', subtitle: 'Every package sent and update applied', go: () => fromPages({ kind: 'handoff' }) },
      ],
    },
    {
      heading: 'About',
      items: [
        { label: 'Back up', subtitle: 'Save your record, or restore one', go: () => fromPages({ kind: 'backup' }) },
        { label: 'Reminders', subtitle: 'What the app tells you about', go: () => placeholder('Reminders', undefined, 'All pages') },
        { label: 'How this app works', subtitle: 'What the app, you and the AI each decide', go: () => fromPages({ kind: 'how' }) },
      ],
    },
  ];

  const screen = current;
  let body: React.ReactNode;

  if (screen.kind === 'home') {
    body = (
      <Home
        state={state}
        snapshots={snapshots}
        onOpenPlant={(plant_id) => nav.push({ kind: 'detail', plant_id }, 'Home')}
        onPlaceholder={(title, subtitle) => placeholder(title, subtitle, 'Home')}
        onArchived={() => nav.push({ kind: 'archive' }, 'Home')}
        onAdherenceHistory={() => nav.push({ kind: 'adherence' }, 'Home')}
        onHealthHistory={() => nav.push({ kind: 'health-history' }, 'Home')}
        onAddPlant={() => nav.push({ kind: 'add-plant' }, 'Home')}
        onPreparePackage={() => nav.push({ kind: 'prepare-package' }, 'Home')}
        onApplyUpdate={() => nav.push({ kind: 'apply-update' }, 'Home')}
        onBackup={() => nav.push({ kind: 'backup' }, 'Home')}
      />
    );
  } else if (screen.kind === 'record') {
    body = (
      <RecordSession
        state={state}
        as_of={as_of}
        backLabel={nav.backLabel}
        onBack={nav.back}
        onPreparePackage={() => nav.push({ kind: 'prepare-package' }, 'Record')}
        onRecordings={() => nav.push({ kind: 'recordings' }, 'Record')}
      />
    );
  } else if (screen.kind === 'recordings') {
    body = <Recordings backLabel={nav.backLabel ?? 'Record'} onBack={nav.back} />;
  } else if (screen.kind === 'backup') {
    body = (
      <Backup
        as_of={as_of}
        backLabel={nav.backLabel ?? 'Home'}
        onBack={nav.back}
        onChanged={reload}
      />
    );
  } else if (screen.kind === 'plants') {
    body = (
      <PlantsList
        state={state}
        thumbs={thumbs}
        onOpen={(plant_id) => nav.push({ kind: 'detail', plant_id }, 'Plants')}
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
        allPlants={activePlants}
        onNavigate={(plant_id) => nav.replace({ kind: 'care', plant_id })}
        onOpenPlant={(plant_id) => nav.push({ kind: 'care', plant_id }, 'Log care')}
        onAllPlants={() => nav.push({ kind: 'care' }, screenTitle(screen))}
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
          onHistory={() => nav.push({ kind: 'history', plant_id: plant.plant_id }, plant.name)}
          // One recorder for the whole app (capture/recording.ts is a module
          // singleton), so "Record note" opens the same Record screen the tab
          // bar does — and the walk's markers then attribute what you say to
          // whichever plant page you are on, which is the point of section 6.
          onRecordNote={() => nav.push({ kind: 'record' }, plant.name)}
          onCareCalendar={() => nav.push({ kind: 'calendar', plant_id: plant.plant_id }, plant.name)}
          onMoreAbout={() => nav.push({ kind: 'more', plant_id: plant.plant_id }, plant.name)}
          onInfo={() => nav.push({ kind: 'info', plant_id: plant.plant_id }, plant.name)}
          onWhatWorks={() => nav.push({ kind: 'works', plant_id: plant.plant_id }, plant.name)}
          onPhotos={() => nav.push({ kind: 'photos', plant_id: plant.plant_id }, plant.name)}
        />
      );
    }
  } else if (screen.kind === 'history') {
    const plant = state.plants[screen.plant_id];
    if (!plant) {
      nav.goRoot('plants');
      body = null;
    } else {
      body = (
        <PlantHistory
          plant={plant}
          events={events}
          as_of={as_of}
          backLabel={nav.backLabel ?? 'Plants'}
          onBack={nav.back}
          allPlants={activePlants}
          onNavigate={(plant_id) => nav.replace({ kind: 'history', plant_id })}
          onViewAll={() => nav.push({ kind: 'entries', plant_id: plant.plant_id }, 'History')}
          onCareCalendar={() => nav.push({ kind: 'calendar', plant_id: plant.plant_id }, 'History')}
        />
      );
    }
  } else if (screen.kind === 'entries') {
    const plant = state.plants[screen.plant_id];
    if (!plant) {
      nav.goRoot('plants');
      body = null;
    } else {
      body = (
        <PlantEntries
          plant={plant}
          events={events}
          as_of={as_of}
          backLabel={nav.backLabel ?? 'History'}
          onBack={nav.back}
          allPlants={activePlants}
          onNavigate={(plant_id) => nav.replace({ kind: 'entries', plant_id })}
        />
      );
    }
  } else if (screen.kind === 'calendar') {
    const plant = state.plants[screen.plant_id];
    if (!plant) {
      nav.goRoot('plants');
      body = null;
    } else {
      body = (
        <PlantCalendar
          plant={plant}
          events={events}
          as_of={as_of}
          all={screen.all ?? false}
          backLabel={nav.backLabel ?? 'History'}
          onBack={nav.back}
          allPlants={activePlants}
          onNavigate={(plant_id) => nav.replace({ kind: 'calendar', plant_id, all: screen.all })}
          onViewAll={screen.all ? undefined : () => nav.push({ kind: 'calendar', plant_id: plant.plant_id, all: true }, 'Care calendar')}
        />
      );
    }
  } else if (screen.kind === 'more') {
    const plant = state.plants[screen.plant_id];
    if (!plant) {
      nav.goRoot('plants');
      body = null;
    } else {
      body = (
        <MoreAboutPlant
          key={plant.plant_id}
          plant={plant}
          as_of={as_of}
          backLabel={nav.backLabel ?? 'Plants'}
          onBack={nav.back}
          allPlants={activePlants}
          onNavigate={(plant_id) => nav.replace({ kind: 'more', plant_id })}
          onChanged={reload}
        />
      );
    }
  } else if (screen.kind === 'info') {
    const plant = state.plants[screen.plant_id];
    if (!plant) {
      nav.goRoot('plants');
      body = null;
    } else {
      body = (
        <InfoSettings
          key={plant.plant_id}
          plant={plant}
          registry={registry}
          as_of={as_of}
          backLabel={nav.backLabel ?? 'Plants'}
          onBack={nav.back}
          allPlants={activePlants}
          onNavigate={(plant_id) => nav.replace({ kind: 'info', plant_id })}
          onChanged={reload}
        />
      );
    }
  } else if (screen.kind === 'archive') {
    body = (
      <ArchivedPlants
        state={state}
        backLabel={nav.backLabel ?? 'Home'}
        onBack={nav.back}
      />
    );
  } else if (screen.kind === 'adherence') {
    body = (
      <AdherenceHistory
        state={state}
        snapshots={snapshots}
        backLabel={nav.backLabel ?? 'Home'}
        onBack={nav.back}
      />
    );
  } else if (screen.kind === 'health-history') {
    body = (
      <HealthHistory
        state={state}
        snapshots={snapshots}
        backLabel={nav.backLabel ?? 'Home'}
        onBack={nav.back}
      />
    );
  } else if (screen.kind === 'add-plant') {
    body = (
      <AddPlant
        state={state}
        registry={registry}
        as_of={as_of}
        backLabel={nav.backLabel ?? 'Home'}
        onBack={nav.back}
        onChanged={reload}
        onAdded={(plant_id) => nav.replace({ kind: 'detail', plant_id })}
      />
    );
  } else if (screen.kind === 'photos') {
    const plant = state.plants[screen.plant_id];
    if (!plant) {
      nav.goRoot('plants');
      body = null;
    } else {
      body = (
        <PhotosPage
          plant={plant}
          events={events}
          thumbs={thumbs}
          as_of={as_of}
          backLabel={nav.backLabel ?? 'Plants'}
          onBack={nav.back}
          onChanged={reload}
          allPlants={activePlants}
          onNavigate={(plant_id) => nav.replace({ kind: 'photos', plant_id })}
        />
      );
    }
  } else if (screen.kind === 'prepare-package') {
    body = (
      <PrepareReviewPackage
        state={state}
        as_of={as_of}
        backLabel={nav.backLabel ?? 'Home'}
        onBack={nav.back}
      />
    );
  } else if (screen.kind === 'apply-update') {
    body = (
      <ApplyAIUpdate
        state={state}
        as_of={as_of}
        backLabel={nav.backLabel ?? 'Home'}
        onBack={nav.back}
        onChanged={reload}
      />
    );
  } else if (screen.kind === 'since') {
    body = (
      <SinceLastTime
        state={state}
        snapshots={snapshots}
        backLabel={nav.backLabel ?? 'All pages'}
        onBack={nav.back}
        onOpenPlant={(plant_id) => nav.push({ kind: 'detail', plant_id }, 'Since last time')}
      />
    );
  } else if (screen.kind === 'works') {
    body = (
      <WhatWorks
        state={state}
        events={events}
        plant_id={screen.plant_id}
        thumbs={thumbs}
        backLabel={nav.backLabel ?? 'All pages'}
        onBack={nav.back}
        onOpenPlant={(plant_id) => nav.push({ kind: 'detail', plant_id }, 'What works')}
        onSeeAll={screen.plant_id ? () => nav.push({ kind: 'works' }, 'What works') : undefined}
        onPhotos={screen.plant_id
          ? () => nav.push({ kind: 'photos', plant_id: screen.plant_id as PlantId }, 'What works')
          : undefined}
        allPlants={activePlants}
        onNavigate={(plant_id) => nav.replace({ kind: 'works', plant_id })}
      />
    );
  } else if (screen.kind === 'how') {
    body = <HowItWorks backLabel={nav.backLabel ?? 'All pages'} onBack={nav.back} />;
  } else if (screen.kind === 'handoff') {
    body = <HandoffLog backLabel={nav.backLabel ?? 'All pages'} onBack={nav.back} />;
  } else if (screen.kind === 'all-pages') {
    body = (
      <AllPages
        groups={menuGroups}
        backLabel={nav.backLabel ?? 'Home'}
        onBack={nav.back}
      />
    );
  } else if (screen.kind === 'plant-picker') {
    // `replace`, not `push`: the picker asked a question, and once it is
    // answered it should not sit in the back stack for the owner to walk back
    // through. Backing out of the plant lands on All pages, where they were.
    body = (
      <PlantPicker
        state={state}
        thumbs={thumbs}
        destination={PICKER_DESTINATION[screen.target]}
        backLabel={nav.backLabel ?? 'All pages'}
        onBack={nav.back}
        onPick={(plant_id) => nav.replace({ kind: screen.target, plant_id })}
      />
    );
  } else if (screen.kind === 'rooms') {
    body = (
      <RoomsPlanters
        state={state}
        registry={registry}
        backLabel={nav.backLabel ?? 'All pages'}
        onBack={nav.back}
        onChanged={reload}
      />
    );
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
      <TabBar
        active={nav.activeTab}
        onTab={nav.goRoot}
        onLog={() => nav.push({ kind: 'care' }, screenTitle(current))}
        onMore={openAllPages}
      />
    </>
  );
}
