import type { RootTab } from './types';
import './TabBar.css';

export interface TabBarProps {
  active: RootTab | null;
  onTab: (tab: RootTab) => void;
  onMore: () => void;
}

/** Fixed, four items, Rec centred — DESIGN_REFERENCE.md section 4 rule 4. */
export function TabBar({ active, onTab, onMore }: TabBarProps) {
  return (
    <nav className="tabbar">
      <button
        type="button"
        className={active === 'home' ? 'tabbar-item on' : 'tabbar-item'}
        aria-current={active === 'home' ? 'page' : undefined}
        onClick={() => onTab('home')}
      >
        Home
      </button>
      <button
        type="button"
        className={active === 'plants' ? 'tabbar-item on' : 'tabbar-item'}
        aria-current={active === 'plants' ? 'page' : undefined}
        onClick={() => onTab('plants')}
      >
        Plants
      </button>
      <button type="button" className="tabbar-rec" onClick={() => onTab('record')}>
        <span className="tabbar-rec-dot" aria-hidden="true" />
        <span className="tabbar-rec-label">Rec</span>
      </button>
      <button type="button" className="tabbar-item" onClick={onMore}>
        More
      </button>
    </nav>
  );
}
