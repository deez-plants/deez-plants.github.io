import { useEffect } from 'react';

/**
 * Swipe from an edge to go back, or forward.
 *
 * The owner asked for a back that works everywhere: *"I know there may not be
 * room for this anywhere but I want its function, even though its function
 * would sometimes already exist in another way on some pages."* This is the
 * answer to the "no room" half — it is the gesture they already use in every
 * other iOS app and it costs no screen space at all.
 *
 * **Forward was added 2026-09-18**, on the same reasoning and their own
 * request: *"add the go forward if I go too far."* Back and forward are a
 * pair, exactly as a browser's arrows are — using either leaves the other
 * available, so one swipe too many costs one swipe back rather than a retraced
 * route. See `forward` in `useNav.ts` for when it stops being offered.
 *
 * **Why it has to be edge-started.** The app is full of horizontal things a
 * finger might be doing instead: the photo strip, the care-type grid, the
 * calendar. Starting the gesture within `EDGE_PX` of the edge is what
 * separates "go back" from "scroll that row", and it is the same rule iOS
 * itself uses.
 *
 * Deliberately not built:
 *
 * - **No animation.** A back that slides needs the outgoing screen kept alive
 *   and interruptible, which is a real amount of machinery for a gesture that
 *   is over in 200ms. It can be added later without changing this contract.
 */

/** How close to an edge a swipe must start to count. */
const EDGE_PX = 28;
/** How far it must travel. Short enough to feel free, long enough not to fire
    on a tap that wandered. */
const DISTANCE_PX = 70;
/** Beyond this much vertical movement it is a scroll, not a navigation. */
const SLOP_PX = 45;

export interface EdgeSwipeOptions {
  canGoBack: boolean;
  onBack: () => void;
  canGoForward: boolean;
  onForward: () => void;
}

export function useEdgeSwipe({
  canGoBack, onBack, canGoForward, onForward,
}: EdgeSwipeOptions): void {
  useEffect(() => {
    if (!canGoBack && !canGoForward) return;

    let startX = 0;
    let startY = 0;
    /** Which edge this gesture began at, or null if it began in open page. */
    let from: 'left' | 'right' | null = null;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { from = null; return; }
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      if (canGoBack && t.clientX <= EDGE_PX) from = 'left';
      else if (canGoForward && t.clientX >= window.innerWidth - EDGE_PX) from = 'right';
      else from = null;
    };

    const onMove = (e: TouchEvent) => {
      if (!from || e.touches.length !== 1) return;
      const t = e.touches[0];
      // A finger that has wandered up or down is scrolling. Give up on the
      // gesture rather than competing with the page for it.
      if (Math.abs(t.clientY - startY) > SLOP_PX) { from = null; return; }

      // Each edge only accepts movement away from itself. A left-edge swipe
      // that travels left is a finger changing its mind, not a forward.
      const travelled = from === 'left' ? t.clientX - startX : startX - t.clientX;
      if (travelled < DISTANCE_PX) return;

      const go = from === 'left' ? onBack : onForward;
      from = null;
      go();
    };

    const stop = () => { from = null; };

    // Passive: this never calls preventDefault, so it cannot make scrolling
    // feel heavy — it only watches.
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', stop, { passive: true });
    document.addEventListener('touchcancel', stop, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', stop);
      document.removeEventListener('touchcancel', stop);
    };
  }, [canGoBack, onBack, canGoForward, onForward]);
}
