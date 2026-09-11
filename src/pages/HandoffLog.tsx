import { useEffect, useState } from 'react';
import { openDeezPlants, type AppliedUpdateRecord, type PackageRecord } from '../db/schema';
import { Icon } from '../components/Icon';
import { formatDayMonth } from '../lib/dates';
import './HandoffLog.css';

/**
 * DESIGN_REFERENCE.md screen 21 — every package sent and every update applied,
 * with dates and what changed. The audit trail for the AI loop.
 *
 * It reads `packages` and `applied_updates` directly, because neither is part
 * of derived state: they are bookkeeping about the round trip, not facts about
 * plants, and rule 10 rebuilds plants from events alone.
 *
 * Sent and applied are paired where they share a `package_id`, which is what
 * makes this an audit trail rather than two lists. A package with no reply is
 * the interesting row — it is a round trip that was started and never closed —
 * so it says so rather than being silently indistinguishable.
 */

export interface HandoffLogProps {
  backLabel: string;
  onBack: () => void;
}

interface Round {
  package_id: string;
  sent: PackageRecord;
  applied: AppliedUpdateRecord | null;
}

export default function HandoffLog({ backLabel, onBack }: HandoffLogProps) {
  const [rounds, setRounds] = useState<Round[] | null>(null);
  const [orphans, setOrphans] = useState<AppliedUpdateRecord[]>([]);

  useEffect(() => {
    let live = true;
    (async () => {
      const db = await openDeezPlants();
      const [packages, applied] = await Promise.all([
        db.getAll('packages'),
        db.getAll('applied_updates'),
      ]);
      if (!live) return;

      const byPackage = new Map(applied.map((a) => [a.package_id, a]));
      const paired = packages
        .map((sent): Round => ({
          package_id: sent.package_id,
          sent,
          applied: byPackage.get(sent.package_id) ?? null,
        }))
        .sort((a, b) => (a.sent.generated < b.sent.generated ? 1 : -1));

      setRounds(paired);
      // An applied update whose package is gone. It should not happen, and
      // hiding it would make this screen lie about being the audit trail.
      setOrphans(applied.filter((a) => !packages.some((p) => p.package_id === a.package_id)));
    })();
    return () => { live = false; };
  }, []);

  const openCount = rounds?.filter((r) => !r.applied).length ?? 0;

  return (
    <main className="hand">
      <button type="button" className="hand-back" onClick={onBack}>‹ {backLabel}</button>
      <h1 className="hand-title">Handoff log</h1>
      <p className="hand-sub">
        {rounds === null
          ? 'Reading…'
          : rounds.length === 0
            ? 'No packages built yet. This fills in once you send one to the AI.'
            : `${rounds.length} round${rounds.length === 1 ? '' : 's'}`
              + (openCount > 0 ? ` · ${openCount} still open` : ' · all closed')}
      </p>

      {rounds !== null && rounds.length === 0 && (
        <p className="hand-empty">
          Prepare review package builds the file you hand to Claude or GPT.
          Whatever you send, and whatever you approve when it comes back, is
          recorded here.
        </p>
      )}

      <div className="hand-rounds">
        {rounds?.map((r) => (
          <section className="hand-round" key={r.package_id}>
            <div className="hand-id-row">
              <span className="hand-id">{r.package_id}</span>
              <span className={r.applied ? 'hand-state closed' : 'hand-state open'}>
                {r.applied ? 'CLOSED' : 'AWAITING REPLY'}
              </span>
            </div>

            <div className="hand-leg">
              <span className="hand-leg-icon sent"><Icon name="pkg" size={22} /></span>
              <span className="hand-leg-body">
                <span className="hand-leg-what">
                  Sent · {r.sent.plant_ids.length} plant{r.sent.plant_ids.length === 1 ? '' : 's'}
                  {' · '}{r.sent.event_ids.length} entr{r.sent.event_ids.length === 1 ? 'y' : 'ies'}
                </span>
                {r.sent.transcript_tier && (
                  <span className="hand-leg-note">
                    walk transcript, {r.sent.verified ? 'verified' : 'unverified'}
                  </span>
                )}
              </span>
              <span className="hand-leg-date">{formatDayMonth(r.sent.generated)}</span>
            </div>

            {r.applied ? (
              <div className="hand-leg">
                <span className="hand-leg-icon back"><Icon name="apply" size={22} /></span>
                <span className="hand-leg-body">
                  <span className="hand-leg-what">
                    Applied · {r.applied.accepted_count} accepted
                    {' · '}{r.applied.rejected_count} rejected
                  </span>
                  {/* Rule 4 in the record: rejections are as much a decision as
                      acceptances, so they are shown, never netted off. */}
                  {r.applied.accepted_count === 0 && (
                    <span className="hand-leg-note">nothing was taken from this reply</span>
                  )}
                </span>
                <span className="hand-leg-date">{formatDayMonth(r.applied.applied)}</span>
              </div>
            ) : (
              <p className="hand-pending">
                No reply applied yet. The next package will not repeat what this
                one carried, so nothing is lost by leaving it open.
              </p>
            )}
          </section>
        ))}
      </div>

      {orphans.length > 0 && (
        <>
          <h2 className="hand-label">Applied without a package on record</h2>
          <p className="hand-note">
            These updates were applied, but the package they answer is no longer
            stored — most likely from a device whose record was restored here.
          </p>
          <div className="hand-rounds">
            {orphans.map((a) => (
              <section className="hand-round" key={a.package_id}>
                <div className="hand-id-row">
                  <span className="hand-id">{a.package_id}</span>
                  <span className="hand-state orphan">NO PACKAGE</span>
                </div>
                <div className="hand-leg">
                  <span className="hand-leg-icon back"><Icon name="apply" size={22} /></span>
                  <span className="hand-leg-body">
                    <span className="hand-leg-what">
                      Applied · {a.accepted_count} accepted · {a.rejected_count} rejected
                    </span>
                  </span>
                  <span className="hand-leg-date">{formatDayMonth(a.applied)}</span>
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
