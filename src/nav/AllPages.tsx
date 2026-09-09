import './AllPages.css';

export interface AllPagesItem {
  label: string;
  subtitle: string;
  go: () => void;
}

export interface AllPagesGroup {
  /** The header this group sits under — `This plant`, `The collection`,
      `AI round-trip`, `About`. */
  heading: string;
  /** One line under the header saying what the group is for, so the headers
      are more than dividers. */
  note?: string;
  items: readonly AllPagesItem[];
}

export interface AllPagesProps {
  groups: readonly AllPagesGroup[];
  backLabel: string;
  onBack: () => void;
}

/**
 * The `More` tab's destination — a screen on the stack, not the bottom sheet
 * DESIGN_REFERENCE.md section 1 specifies.
 *
 * The sheet was capped at 74% of the viewport and held seventeen flat rows.
 * At this app's type sizes (the 20px floor is a hard requirement, section 6)
 * three of them fit, and the "ALL PAGES" header scrolled away with the rest,
 * so there was nothing on screen saying where you were. As a page it gets the
 * full height and can group its rows under headers, which is what makes
 * seventeen destinations findable rather than merely present. The divergence
 * is size-driven, which is the kind `CLAUDE.md`'s precedence rule exists for —
 * a missing block would not be.
 */
export default function AllPages({ groups, backLabel, onBack }: AllPagesProps) {
  return (
    <main className="pages">
      <button type="button" className="pages-back" onClick={onBack}>‹ {backLabel}</button>
      <h1 className="pages-title">All pages</h1>

      {groups.map((group) => (
        <section className="pages-group" key={group.heading}>
          <h2 className="pages-heading">{group.heading}</h2>
          {group.note && <p className="pages-note">{group.note}</p>}
          <div className="pages-items">
            {group.items.map((item) => (
              <button key={item.label} type="button" className="pages-row" onClick={item.go}>
                <span className="pages-row-body">
                  <span className="pages-row-label">{item.label}</span>
                  <span className="pages-row-sub">{item.subtitle}</span>
                </span>
                <span className="pages-row-chev" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
