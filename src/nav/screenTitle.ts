import type { Screen } from './types';

/**
 * What a screen is called when something pushed on top of it needs to name it
 * (DESIGN_REFERENCE.md section 4 rule 3: the back button names where it came
 * from, never a bare "Back").
 *
 * Plant-scoped screens are the exception and are not resolved here — their
 * back button reads the plant's own name, which this function has no plant to
 * look up. Callers with a plant in hand pass that instead.
 */
export function screenTitle(screen: Screen): string {
  switch (screen.kind) {
    case 'home': return 'Home';
    case 'plants': return 'Plants';
    case 'record': return 'Record';
    case 'care': return 'Log care';
    case 'detail': return 'Plant';
    case 'history': return 'History';
    case 'entries': return 'Entries';
    case 'calendar': return 'Care calendar';
    case 'more': return 'More about';
    case 'info': return 'Info and settings';
    case 'archive': return 'Archived plants';
    case 'adherence': return 'Adherence history';
    case 'health-history': return 'Health history';
    case 'add-plant': return 'Add new plant';
    case 'photos': return 'Photos';
    case 'prepare-package': return 'Review package';
    case 'apply-update': return 'Apply AI update';
    case 'rooms': return 'Rooms and planters';
    case 'recordings': return 'Recordings';
    case 'backup': return 'Back up';
    case 'all-pages': return 'All pages';
    case 'plant-picker': return 'Pick a plant';
    case 'placeholder': return screen.title;
  }
}
