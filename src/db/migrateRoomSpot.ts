import type { DeezDB } from './schema';
import { REGISTRY_KEY } from './schema';
import { appendEvents, deviceId, mintEventId } from './events';
import type { EditEvent } from '../types/event';
import type { ISODate, PlantId } from '../types/ids';

/**
 * The room/spot split, applied to a store that was seeded before it existed.
 *
 * Section 4, Placement: `room` used to carry the whole description, which gave
 * a registry of seven "rooms" — five of them variants of *Living room*. The
 * split is the fix, and this is how an existing device catches up.
 *
 * It is written as ordinary `Edit` events, not as a rewrite of the baselines.
 * That matters: baselines are write-once, every change is an event, and the
 * log has to explain how a plant got to where it is. A silent rewrite would
 * leave a device that synced later disagreeing with one that migrated, with
 * nothing in the log to reconcile them. Two events per plant is the honest
 * cost of doing it properly (rule 5).
 *
 * Idempotent by construction: a plant whose `room` already matches a known
 * room exactly, with nothing left over, is already split and is skipped.
 */

/** The owner's five rooms, given 2026-09-08. Longest first, so that
    "2nd Bedroom" is never matched as "Bedroom" with "…" left over. */
export const ROOMS = ['2nd Bedroom', 'Living Room', 'Bedroom', 'Balcony', 'Kitchen'];

export interface RoomSpot {
  room: string;
  spot: string;
}

/**
 * "Living room bookshelf" -> { room: 'Living Room', spot: 'bookshelf' }.
 * "Bedroom, on the dresser" -> { room: 'Bedroom', spot: 'on the dresser' }.
 *
 * Case-insensitive, because the old strings used "Living room" and the room
 * list uses "Living Room". A string matching no known room is left whole as
 * the room with an empty spot — better an unsplit plant than one filed under
 * a room the owner never named.
 */
export function splitRoom(value: string): RoomSpot {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  for (const room of ROOMS) {
    if (lower.startsWith(room.toLowerCase())) {
      const rest = trimmed.slice(room.length).replace(/^[,\s]+/, '').trim();
      return { room, spot: rest };
    }
  }
  return { room: trimmed, spot: '' };
}

export interface MigrationResult {
  /** Plants that needed splitting, and what they became. */
  changed: { plant_id: PlantId; from: string; room: string; spot: string }[];
  /** Already split, or in a room the list doesn't name. */
  skipped: PlantId[];
  events_written: number;
}

export async function migrateRoomSpot(db: DeezDB, as_of: ISODate): Promise<MigrationResult> {
  const baselines = await db.getAll('plants');
  const events = await db.getAll('events');

  // What each plant's room and spot currently fold to — a plant already
  // migrated has `room` Edit events in the log, and re-running must not
  // stack a second pair on top of them.
  const currentRoom = new Map<string, string>();
  const hasSpot = new Set<string>();
  for (const b of baselines) currentRoom.set(b.plant_id, b.room);
  for (const e of events) {
    if (e.type !== 'Edit' || !e.plant_id) continue;
    if (e.field === 'room' && e.to !== null) currentRoom.set(e.plant_id, e.to);
    if (e.field === 'spot') hasSpot.add(e.plant_id);
  }

  const device_id = await deviceId(db);
  const changed: MigrationResult['changed'] = [];
  const skipped: PlantId[] = [];
  const writes: EditEvent[] = [];

  for (const b of baselines) {
    const from = currentRoom.get(b.plant_id) ?? b.room;
    const { room, spot } = splitRoom(from);
    // Already a bare room name with nothing to split off, or already done.
    if ((room === from && spot === '') || hasSpot.has(b.plant_id)) {
      skipped.push(b.plant_id);
      continue;
    }

    const time = '00:00' as EditEvent['time'];
    writes.push({
      event_id: mintEventId(device_id, as_of, time),
      plant_id: b.plant_id,
      type: 'Edit',
      field: 'room',
      from,
      to: room,
      date: as_of,
      time,
      source: 'user',
      device_id,
    });
    writes.push({
      event_id: mintEventId(device_id, as_of, time),
      plant_id: b.plant_id,
      type: 'Edit',
      field: 'spot',
      from: '',
      to: spot,
      date: as_of,
      time,
      source: 'user',
      device_id,
    });
    changed.push({ plant_id: b.plant_id, from, room, spot });
  }

  if (writes.length) await appendEvents(db, writes);

  // The registry's room list is replaced wholesale rather than appended to:
  // the old entries were never rooms, they were rooms-plus-spots, and leaving
  // them in the picker would let a plant be filed under one again.
  const stored = await db.get('registry', REGISTRY_KEY);
  if (stored) {
    const rooms = ['Living Room', 'Bedroom', '2nd Bedroom', 'Balcony', 'Kitchen'];
    await db.put('registry', { ...stored, rooms, updated: as_of }, REGISTRY_KEY);
  }

  return { changed, skipped, events_written: writes.length };
}
