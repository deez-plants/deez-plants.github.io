import { useEffect, useRef, useState } from 'react';
import { openDeezPlants, type AppliedUpdateRecord, type PackageRecord } from '../db/schema';
import {
  confirmPackageSent,
  discardBuiltPackage,
  registerRecoveredPackage,
  unsendPackage,
} from '../package/export';
import { isConfirmedSent, recoveryBlocker } from '../package/registry';
import { readPackageZip } from '../package/recoverZip';
import type { ISODate, PackageId } from '../types/ids';
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
 *
 * ## The third state, added 2026-09-21
 *
 * A package is now recorded when it is **built**, not when it is confirmed
 * sent, so a lost confirmation no longer erases the round. This screen is where
 * that becomes visible and repairable: **NOT CONFIRMED SENT**, with Confirm
 * sent and Discard beside it. Before this, a package whose "did it save?" answer
 * was never given simply did not exist — the owner had a ZIP in a chat, a
 * reviewed update file, and an app insisting it had never exported anything.
 *
 * Recover from ZIP, at the foot, is for the packages already lost that way.
 */

export interface HandoffLogProps {
  backLabel: string;
  as_of: ISODate;
  onBack: () => void;
}

interface Round {
  package_id: string;
  sent: PackageRecord;
  applied: AppliedUpdateRecord | null;
}

/** Which destructive-ish action is mid-confirmation, and on what. */
type Asking =
  | { kind: 'unsend'; package_id: string }
  | { kind: 'discard'; package_id: string }
  | null;

type Recovery =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'refused'; reason: string }
  | { kind: 'done'; package_id: string; entries: number; walks: number; missing: string[] };

export default function HandoffLog({ backLabel, as_of, onBack }: HandoffLogProps) {
  const [rounds, setRounds] = useState<Round[] | null>(null);
  const [orphans, setOrphans] = useState<AppliedUpdateRecord[]>([]);
  const [asking, setAsking] = useState<Asking>(null);
  const [recovery, setRecovery] = useState<Recovery>({ kind: 'idle' });
  const [reloadKey, setReloadKey] = useState(0);
  const filePicker = useRef<HTMLInputElement>(null);

  const reload = () => setReloadKey((k) => k + 1);

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
  }, [reloadKey]);

  /**
   * Forget that a package left the device, so its entries and its walk are
   * carried by the next one.
   *
   * The recovery for a package that never actually saved. Prepare asks "did it
   * save?" because nothing reports back from a Share sheet, and this is what
   * makes answering wrong cost nothing. Only offered on a round with no reply
   * applied: once an update has been applied against a package, un-sending it
   * would orphan that reply.
   */
  const unsend = async (package_id: string) => {
    const db = await openDeezPlants();
    await unsendPackage(db, package_id as PackageId);
    setAsking(null);
    reload();
  };

  /** Say yes, belatedly, to "did it save?". From here it consumes its entries
      and walks and the AI's reply can be applied against it. */
  const confirmSent = async (package_id: string) => {
    const db = await openDeezPlants();
    await confirmPackageSent(db, package_id as PackageId, as_of);
    setAsking(null);
    reload();
  };

  /** Throw away a build that never went anywhere. Its entries and walks go
      back into the next package; nothing about the plants is touched. */
  const discard = async (package_id: string) => {
    const db = await openDeezPlants();
    await discardBuiltPackage(db, package_id as PackageId);
    setAsking(null);
    reload();
  };

  /**
   * Rebuild a lost package's record from the ZIP that actually went to the AI.
   *
   * Everything written comes out of that file or out of the walks already on
   * this device — see `package/registry.ts`. It lands as NOT CONFIRMED SENT,
   * because recovery proves the package was built, and only the owner knows
   * whether it reached anyone.
   */
  const recoverFromZip = async (file: File) => {
    setRecovery({ kind: 'reading' });
    try {
      const db = await openDeezPlants();
      const read = await readPackageZip(db, file);
      if (!read.ok) { setRecovery({ kind: 'refused', reason: read.reason }); return; }

      const { record, missing_sessions } = read.value;
      const blocker = recoveryBlocker(record, await db.getAll('packages'));
      if (blocker) { setRecovery({ kind: 'refused', reason: blocker }); return; }

      await registerRecoveredPackage(db, record);
      setRecovery({
        kind: 'done',
        package_id: record.package_id,
        entries: record.event_ids.length,
        walks: (record.session_ids ?? []).length,
        missing: missing_sessions,
      });
      reload();
    } catch (e: unknown) {
      setRecovery({ kind: 'refused', reason: e instanceof Error ? e.message : String(e) });
    }
  };

  const openCount = rounds?.filter((r) => isConfirmedSent(r.sent) && !r.applied).length ?? 0;
  const unconfirmed = rounds?.filter((r) => !isConfirmedSent(r.sent)) ?? [];

  return (
    <main className="hand">
      <button type="button" className="screen-back hand-back" onClick={onBack}>‹ {backLabel}</button>
      <h1 className="hand-title">Handoff log</h1>
      <p className="hand-sub">
        {rounds === null
          ? 'Reading…'
          : rounds.length === 0
            ? 'No packages built yet. This fills in once you send one to the AI.'
            : `${rounds.length} round${rounds.length === 1 ? '' : 's'}`
              + (openCount > 0 ? ` · ${openCount} awaiting a reply` : '')
              + (unconfirmed.length > 0 ? ` · ${unconfirmed.length} not confirmed sent` : '')
              + (openCount === 0 && unconfirmed.length === 0 ? ' · all closed' : '')}
      </p>

      {/* Said once at the top, because it is the one state on this screen that
          needs an action rather than just reading. */}
      {unconfirmed.length > 0 && (
        <p className="hand-alert">
          {unconfirmed.length === 1 ? 'One package was' : `${unconfirmed.length} packages were`} built
          but never confirmed as saved, so {unconfirmed.length === 1 ? 'it counts' : 'they count'} as
          having gone nowhere: nothing in {unconfirmed.length === 1 ? 'it' : 'them'} has been used up,
          and the AI's reply cannot be applied until you confirm.
        </p>
      )}

      {rounds !== null && rounds.length === 0 && (
        <p className="hand-empty">
          Prepare review package builds the file you hand to Claude or GPT.
          Whatever you send, and whatever you approve when it comes back, is
          recorded here.
        </p>
      )}

      <div className="hand-rounds">
        {rounds?.map((r) => {
          const sent = isConfirmedSent(r.sent);
          return (
            <section className="hand-round" key={r.package_id}>
              <div className="hand-id-row">
                <span className="hand-id">{r.package_id}</span>
                <span className={`hand-state ${!sent ? 'unsent' : r.applied ? 'closed' : 'open'}`}>
                  {!sent ? 'NOT CONFIRMED SENT' : r.applied ? 'CLOSED' : 'AWAITING REPLY'}
                </span>
              </div>

              <div className="hand-leg">
                <span className={`hand-leg-icon ${sent ? 'sent' : 'unsent'}`}><Icon name="pkg" size={22} /></span>
                <span className="hand-leg-body">
                  <span className="hand-leg-what">
                    {sent ? 'Sent' : 'Built'} · {r.sent.plant_ids.length} plant{r.sent.plant_ids.length === 1 ? '' : 's'}
                    {' · '}{r.sent.event_ids.length} entr{r.sent.event_ids.length === 1 ? 'y' : 'ies'}
                  </span>
                  {r.sent.transcript_tier && (
                    <span className="hand-leg-note">
                      walk transcript, {r.sent.verified ? 'verified' : 'unverified'}
                    </span>
                  )}
                  {r.sent.recovered && (
                    <span className="hand-leg-note">
                      rebuilt from the package's own ZIP, not from the build that made it
                    </span>
                  )}
                </span>
                <span className="hand-leg-date">{formatDayMonth(r.sent.generated)}</span>
              </div>

              {/* Built and unconfirmed: the state that used not to exist. Two
                  ways out, and the screen does not guess which. */}
              {!sent && (
                <>
                  <p className="hand-pending">
                    This one was built but never confirmed as saved. Its entries and
                    its walks have not been used up — the next package still carries
                    them. Confirm it only if the file really did save and go to the AI.
                  </p>
                  {asking?.kind === 'discard' && asking.package_id === r.package_id ? (
                    <p className="hand-pending">
                      Throw this build away? Nothing about your plants changes.
                      <button type="button" className="hand-unsend go" onClick={() => void discard(r.package_id)}>
                        Yes, discard
                      </button>
                      <button type="button" className="hand-unsend" onClick={() => setAsking(null)}>
                        No
                      </button>
                    </p>
                  ) : (
                    <p className="hand-actions">
                      <button
                        type="button"
                        className="hand-unsend go"
                        onClick={() => void confirmSent(r.package_id)}
                      >
                        Confirm sent
                      </button>
                      <button
                        type="button"
                        className="hand-unsend"
                        onClick={() => setAsking({ kind: 'discard', package_id: r.package_id })}
                      >
                        Discard
                      </button>
                    </p>
                  )}
                </>
              )}

              {sent && (r.applied ? (
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
                <>
                  <p className="hand-pending">
                    No reply applied yet. The next package will not repeat what this
                    one carried, so nothing is lost by leaving it open.
                  </p>
                  {/* The recovery for a package that never saved. See `unsend`. */}
                  {asking?.kind === 'unsend' && asking.package_id === r.package_id ? (
                    <p className="hand-pending">
                      Send its entries again next time?
                      <button type="button" className="hand-unsend go" onClick={() => void unsend(r.package_id)}>
                        Yes
                      </button>
                      <button type="button" className="hand-unsend" onClick={() => setAsking(null)}>
                        No
                      </button>
                    </p>
                  ) : (
                    <button
                      type="button"
                      className="hand-unsend"
                      onClick={() => setAsking({ kind: 'unsend', package_id: r.package_id })}
                    >
                      This one never saved
                    </button>
                  )}
                </>
              ))}
            </section>
          );
        })}
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

      {/* For a package built before the app recorded builds — or one lost any
          other way. The ZIP is the evidence; nothing is invented from it. */}
      <h2 className="hand-label">Recover a package from its ZIP</h2>
      <p className="hand-note">
        If the AI is holding a package this log doesn't show, open its ZIP here.
        The package id, the plants, the entries and the walks are read back out
        of the file itself. It arrives as <strong>not confirmed sent</strong>,
        for you to confirm.
      </p>

      <input
        ref={filePicker}
        type="file"
        accept=".zip,application/zip"
        className="hand-file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void recoverFromZip(file);
        }}
      />
      <button
        type="button"
        className="hand-recover"
        disabled={recovery.kind === 'reading'}
        onClick={() => filePicker.current?.click()}
      >
        {recovery.kind === 'reading' ? 'Reading…' : 'Choose a package ZIP'}
      </button>

      {recovery.kind === 'refused' && <p className="hand-refused">{recovery.reason}</p>}

      {recovery.kind === 'done' && (
        <p className="hand-recovered">
          {recovery.package_id} is back in the log — {recovery.entries} entr
          {recovery.entries === 1 ? 'y' : 'ies'}
          {recovery.walks > 0 && `, ${recovery.walks} walk${recovery.walks === 1 ? '' : 's'}`}.
          Tap <strong>Confirm sent</strong> on it if that file really went to the AI.
          {recovery.missing.length > 0 && (
            <> The package named {recovery.missing.length} walk
              {recovery.missing.length === 1 ? '' : 's'} this device no longer holds
              ({recovery.missing.join(', ')}); {recovery.missing.length === 1 ? 'it is' : 'they are'} left
              out rather than claimed.
            </>
          )}
        </p>
      )}
    </main>
  );
}
