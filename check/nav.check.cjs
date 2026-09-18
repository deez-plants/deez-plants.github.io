/**
 * The navigation stack — `nav/stack.ts`.
 *
 * These rules get quietly broken by later changes and show up weeks afterwards
 * as "Back went somewhere odd". The one real bug in here was found exactly
 * that way, by the owner, not by anything automatic. Pinned now.
 *
 * Run with `npm run check:nav`.
 */

const N = require('./build/nav/stack.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; }
  else { fail++; console.log(`FAIL ${name}\n  got  ${a}\n  want ${b}`); }
};

const start = (kind = 'plants') => ({ stack: [{ screen: { kind }, backLabel: '' }], ahead: [] });
/** What the stack reads as, top last: "kind" or "kind:plant". */
const shape = (s) => s.stack.map((e) => {
  const p = 'plant_id' in e.screen ? e.screen.plant_id : null;
  return p ? `${e.screen.kind}:${p}` : e.screen.kind;
});
const labels = (s) => s.stack.map((e) => e.backLabel);

/* ------------------------------------------------------------- the basics -- */

{
  let s = start();
  s = N.push(s, { kind: 'detail', plant_id: '001-MON' }, 'Plants');
  eq('push stacks', shape(s), ['plants', 'detail:001-MON']);
  eq('and carries the label of where it came from', labels(s), ['', 'Plants']);

  s = N.back(s);
  eq('back pops', shape(s), ['plants']);

  s = N.goRoot(s, { kind: 'home' });
  eq('a root tab clears everything', shape(s), ['home']);
  eq('and it clears the forward list too', s.ahead.length, 0);

  eq('back at a root does nothing', shape(N.back(start())), ['plants']);
}

/* ---------------------------------------------------- back and forward ----- */

/**
 * The owner's ask: "add the go forward if I go too far." Their worry, in the
 * same breath: "are you saying if I go back then go forward I can't go back
 * again?" No — they are a pair, and these cases are that promise.
 */
{
  let s = start();
  s = N.push(s, { kind: 'detail', plant_id: '001-MON' }, 'Plants');
  s = N.push(s, { kind: 'history', plant_id: '001-MON' }, 'Large Monstera');
  s = N.push(s, { kind: 'photos', plant_id: '001-MON' }, 'Large Monstera');

  s = N.back(s);
  s = N.back(s);
  eq('two backs', shape(s), ['plants', 'detail:001-MON']);
  eq('and two screens are waiting ahead', s.ahead.length, 2);

  s = N.forward(s);
  eq('forward returns the first', shape(s), ['plants', 'detail:001-MON', 'history:001-MON']);
  eq('and back is still available', s.stack.length > 1, true);

  s = N.back(s);
  eq('back again, straight after a forward', shape(s), ['plants', 'detail:001-MON']);
  eq('bouncing does not lose the others', s.ahead.length, 2);

  s = N.forward(s);
  s = N.forward(s);
  eq('forward all the way returns everything',
    shape(s), ['plants', 'detail:001-MON', 'history:001-MON', 'photos:001-MON']);
  eq('and there is nothing left ahead', s.ahead.length, 0);
  eq('forward with nothing ahead does nothing', shape(N.forward(s)), shape(s));
}

{
  // Going somewhere NEW discards the branch. Not a limitation — after a
  // different turn those screens do not exist to go forward to.
  let s = start();
  s = N.push(s, { kind: 'detail', plant_id: '001-MON' }, 'Plants');
  s = N.push(s, { kind: 'history', plant_id: '001-MON' }, 'Large Monstera');
  s = N.back(s);
  eq('something is ahead', s.ahead.length, 1);
  s = N.push(s, { kind: 'calendar', plant_id: '001-MON' }, 'Large Monstera');
  eq('a new turn clears the forward branch', s.ahead.length, 0);
}

/* ------------------------------------------ the bug the owner reported ----- */

/**
 * "When I was in the OXA more info page, which I got to from the Large
 * Monstera info page, the top-left back showed the Large Monstera as the back
 * button, not the OXA plant page."
 */
{
  let s = start();
  s = N.push(s, { kind: 'detail', plant_id: '001-MON' }, 'Plants');
  s = N.push(s, { kind: 'more', plant_id: '001-MON' }, 'Large Monstera');
  s = N.swapPlant(s, { kind: 'more', plant_id: '013-OXA' }, 'Purple Shamrock');

  eq('the page behind follows you to the new plant',
    shape(s), ['plants', 'detail:013-OXA', 'more:013-OXA']);
  eq('and the back button names it', labels(s), ['', 'Plants', 'Purple Shamrock']);

  s = N.back(s);
  eq('so back lands on the plant you were actually reading about',
    shape(s), ['plants', 'detail:013-OXA']);
  eq('and that page still backs out where it always did',
    labels(s), ['', 'Plants']);
}

/* ------------------------------------- and nothing else behaves differently */

{
  // Same plant: a straight replace, nothing rewritten.
  let s = start();
  s = N.push(s, { kind: 'detail', plant_id: '001-MON' }, 'Plants');
  s = N.push(s, { kind: 'more', plant_id: '001-MON' }, 'Large Monstera');
  s = N.swapPlant(s, { kind: 'more', plant_id: '001-MON' }, 'Large Monstera');
  eq('swapping to the same plant changes nothing',
    shape(s), ['plants', 'detail:001-MON', 'more:001-MON']);
}

{
  // Reached through All pages rather than from a plant's own page. The page
  // behind is not a detail page, so it is left exactly alone.
  let s = start('home');
  s = N.push(s, { kind: 'all-pages' }, 'Home');
  s = N.push(s, { kind: 'more', plant_id: '001-MON' }, 'All pages');
  s = N.swapPlant(s, { kind: 'more', plant_id: '013-OXA' }, 'Purple Shamrock');
  eq('a sub-page opened from All pages still backs out to All pages',
    shape(s), ['home', 'all-pages', 'more:013-OXA']);
  eq('and keeps the label it had', labels(s), ['', 'Home', 'All pages']);
}

{
  // Prev/Next on Plant Detail itself. The page behind is the list you came
  // from and must stay that way — this is `replace`, not `swapPlant`.
  let s = start();
  s = N.push(s, { kind: 'detail', plant_id: '001-MON' }, 'Plants');
  s = N.replace(s, { kind: 'detail', plant_id: '002-SNK' });
  eq('Prev/Next browses without deepening the stack',
    shape(s), ['plants', 'detail:002-SNK']);
  eq('and still backs out to the list', labels(s), ['', 'Plants']);
}

{
  // A sub-page with nothing beneath it cannot rewrite anything, and must not
  // throw trying.
  const lone = { stack: [{ screen: { kind: 'more', plant_id: '001-MON' }, backLabel: '' }], ahead: [] };
  eq('a sub-page at the root swaps in place',
    shape(N.swapPlant(lone, { kind: 'more', plant_id: '013-OXA' }, 'Purple Shamrock')),
    ['more:013-OXA']);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
