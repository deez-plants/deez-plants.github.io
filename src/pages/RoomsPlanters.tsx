import { useMemo, useState } from 'react';
import type { DerivedState } from '../types/derived';
import type { Registry } from '../types/plant';
import { addRoom } from '../boot';
import './RoomsPlanters.css';

/**
 * DESIGN_REFERENCE.md screen 14: rooms with plant counts, then shared
 * planters with their mode. Read-only except adding a room — the registry is
 * user-editable (FIELD_DEFINITIONS.md section 4), unlike everything the AI
 * can propose, and the mock's own "Add a room" control is the only write this
 * screen makes.
 */

export interface RoomsPlantersProps {
  state: DerivedState;
  registry: Registry;
  backLabel: string;
  onBack: () => void;
  onChanged: () => Promise<void> | void;
}

export default function RoomsPlanters({ state, registry, backLabel, onBack, onChanged }: RoomsPlantersProps) {
  const [newRoom, setNewRoom] = useState('');
  const [busy, setBusy] = useState(false);

  const active = useMemo(
    () => state.order.map((id) => state.plants[id]).filter((p) => !p.archived),
    [state],
  );

  const roomCounts = registry.rooms.map((room) => ({
    room,
    count: active.filter((p) => p.room === room).length,
  }));

  const planterGroups = registry.planters.map((planter) => ({
    planter,
    members: active.filter((p) => p.planter === planter.name),
  }));

  const submitRoom = async () => {
    const trimmed = newRoom.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await addRoom(trimmed);
      setNewRoom('');
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="rooms">
      <button type="button" className="screen-back rooms-back" onClick={onBack}>‹ {backLabel}</button>

      <h1 className="rooms-title">Rooms and planters</h1>
      <p className="rooms-sub">
        Where things physically are. The AI never proposes changes here — it
        cannot see your flat.
      </p>

      <span className="rooms-label">ROOMS</span>
      <ul className="rooms-list">
        {roomCounts.map(({ room, count }) => (
          <li key={room} className="rooms-row">
            <span className="rooms-row-name">{room}</span>
            <span className="rooms-row-count">{count} plant{count === 1 ? '' : 's'}</span>
          </li>
        ))}
      </ul>

      <div className="rooms-add">
        <input
          type="text"
          className="rooms-add-input"
          placeholder="Add a room, e.g. Hallway"
          value={newRoom}
          onChange={(e) => setNewRoom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submitRoom(); }}
        />
        <button type="button" className="rooms-add-btn" disabled={!newRoom.trim() || busy} onClick={() => void submitRoom()}>
          Add
        </button>
      </div>

      <span className="rooms-label">SHARED PLANTERS</span>
      <div className="rooms-planters">
        {planterGroups.map(({ planter, members }) => (
          <section key={planter.name} className="rooms-planter">
            <div className="rooms-planter-head">
              <span className="rooms-planter-name">{planter.name}</span>
              <span className="rooms-row-count">{members.length} plant{members.length === 1 ? '' : 's'}</span>
            </div>
            <span className={planter.shared_water ? 'rooms-planter-mode shared' : 'rooms-planter-mode decorative'}>
              {planter.shared_water ? 'Shared soil · one soak serves all' : 'Decorative · separate pots, check each'}
            </span>
            <div className="rooms-planter-members">
              {members.map((p) => (
                <span key={p.plant_id} className="rooms-planter-chip">{p.name}</span>
              ))}
            </div>
          </section>
        ))}
        {planterGroups.length === 0 && <p className="rooms-empty">No shared planters yet.</p>}
      </div>

      <p className="rooms-note">
        Rooms set the walk order during an inspection and the grouping on the
        plants list. Tapping a planter on the batch page selects everything in
        it, either way. Where the plants share soil, one soak genuinely serves
        all of them. Where the planter is decorative — separate pots sitting
        together for display — the grouping is a convenience, and each plant
        still runs on its own interval, so check before you pour.
      </p>
    </main>
  );
}
