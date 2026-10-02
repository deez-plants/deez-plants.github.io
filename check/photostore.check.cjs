/**
 * Protecting photographs, and the storage figure — `capture/photoStore.ts`.
 *
 * The arithmetic is trivial; what is worth pinning is **what counts as
 * protected**. A bulk delete that quietly took a plant's hero, or one half of
 * a What works comparison, would break a screen the owner reads and leave no
 * trace of why. Three sources of protection, and a photograph needs only one.
 *
 * Run with `npm run check:photos`.
 */

const {
  protectedPhotos,
  summarisePhotos,
  formatBytes,
} = require('./build/capture/photoStore.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; }
  else { fail++; console.log(`FAIL ${name}\n  got  ${a}\n  want ${b}`); }
};
const ok = (name, cond) => eq(name, !!cond, true);

/* --------------------------------------------------------------- fixture -- */

const plant = (plant_id, over = {}) => ({ plant_id, name: plant_id, hero: null, compare: null, ...over });
const photo = (media_id, over = {}) => ({ media_id, keep: false, blob: { size: 400_000 }, thumb: { size: 12_000 }, ...over });

/* ----------------------------------------------------------- protection -- */

{
  const photos = [photo('M1'), photo('M2', { keep: true }), photo('M3')];
  const plants = [plant('001-MON', { hero: 'M1' })];
  const prot = protectedPhotos(plants, photos);

  ok('a hero is protected', prot.has('M1'));
  ok('a kept photo is protected', prot.has('M2'));
  ok('an ordinary photo is not', !prot.has('M3'));
}

{
  // Both halves of a comparison, not just the first: one survivor is an
  // argument about a plant pointing at nothing.
  const prot = protectedPhotos(
    [plant('001-MON', { compare: ['M4', 'M5'] })],
    [photo('M4'), photo('M5'), photo('M6')],
  );
  eq('both compare photos are protected', [prot.has('M4'), prot.has('M5'), prot.has('M6')],
    [true, true, false]);
}

{
  // Protection is per photograph, not per plant: a plant with a hero does not
  // shelter the rest of its gallery.
  const prot = protectedPhotos(
    [plant('001-MON', { hero: 'M1' })],
    [photo('M1'), photo('M2'), photo('M3')],
  );
  eq('a hero does not protect its neighbours', prot.size, 1);
}

{
  // One reason is enough, and two do not double-count.
  const prot = protectedPhotos(
    [plant('001-MON', { hero: 'M1', compare: ['M1', 'M2'] })],
    [photo('M1', { keep: true }), photo('M2')],
  );
  eq('a photo protected three ways is listed once', [...prot].sort(), ['M1', 'M2']);
}

eq('nothing is protected in an empty collection', protectedPhotos([], []).size, 0);

/* -------------------------------------------------------------- the sum -- */

{
  const photos = [photo('M1'), photo('M2', { keep: true }), photo('M3')];
  const s = summarisePhotos(photos, protectedPhotos([plant('001-MON', { hero: 'M1' })], photos));
  eq('every photo is counted', s.count, 3);
  // Thumbnails are stored too and are part of what the photographs cost.
  eq('the figure includes thumbnails', s.bytes, 3 * (400_000 + 12_000));
  eq('and says how many are protected', s.protected_count, 2);
}

eq('an empty collection costs nothing', summarisePhotos([], new Set()), { count: 0, bytes: 0, protected_count: 0 });

/* A record whose bytes have already gone must not make the figure NaN — the
   whole point of this screen is a number the owner can act on. */
eq('a photo with no bytes contributes nothing rather than NaN',
  summarisePhotos([{ media_id: 'M1' }], new Set()).bytes, 0);

/* ------------------------------------------------------------ the units -- */

eq('bytes', formatBytes(900), '900 B');
eq('kilobytes', formatBytes(150_000), '146 KB');
eq('megabytes to one place', formatBytes(12_600_000), '12.0 MB');
eq('and a year of photographs reads sensibly', formatBytes(40 * 1024 * 1024), '40.0 MB');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
