import { useEffect } from 'react';

/**
 * Swipe from the left edge to go back.
 *
 * The owner asked for a back that works everywhere: *"I know there may not be
 * room for this anywhere but I want its function, even though its function
 * would sometimes already exist in another way on some pages."* This is the
 * answer to the "no room" half — it is the gesture they already use in every
 * other iOS app and it costs no screen space at all.
 *
 * **Why it has to be edge-started.** The app is full of horizontal things a
 * finger might be doing instead: the photo strip, the care-type grid, the
 * calendar. Starting the gesture within `EDGE_PX` of the left edge is what
 * separates "go back" from "scroll that row", and it is the same rule iOS
 * itself uses.
 *
 * Deliberately not built:
 *
 * - **No animation.** A back that slides needs the outgoing screen kept alive
 *   and interruptible, which is a real amount of machinery for a gesture that
 *   is over in 200ms. It can be added later without changing this contract.
 * - **No forward swipe.** There is no forward in this nav model.
 * - **Nothing on the right edge**, which on iOS is where the system's own
 *   gestures live.
 */

/** How close to the left edge a swipe must start to count as "back". */
const EDGE_PX = 28;
/** How far it must travel. Short enough to feel free, long enough not to fire
    on a tap that wandered. */
const DISTANCE_PX = 70;
/** Beyond this much vertical movement it is a scroll, not a back. */
const SLOP_PX = 45;

export function useEdgeSwipeBack(canGoBack: boolean, onBack: () => void): void {
  useEffect(() => {
    if (!canGoBack) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { tracking = false; return; }
      const t = e.touches[0];
      tracking = t.clientX <= EDGE_PX;
      startX = t.clientX;
      startY = t.clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking || e.touches.length !== 1) return;
      const t = e.touches[0];
      // A finger that has wandered up or down is scrolling. Give up on the
      // gesture rather than competing with the page for it.
      if (Math.abs(t.clientY - startY) > SLOP_PX) { tracking = false; return; }
      if (t.clientX - startX >= DISTANCE_PX) {
        tracking = false;
        onBack();
      }
    };

    const stop = () => { tracking = false; };

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
  }, [canGoBack, onBack]);
}
