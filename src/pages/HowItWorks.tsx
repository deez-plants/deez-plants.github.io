import './HowItWorks.css';

/**
 * DESIGN_REFERENCE.md screen 22.
 *
 * **This screen is the design's conscience.** The reference's own words: "if a
 * feature would make it untrue, the feature is wrong." So it is written as a
 * set of promises about what the app will and will not do, not as a tour of
 * the buttons — a tour goes stale the moment a screen moves, while a promise
 * only changes when the design does.
 *
 * The three "what X decides" sections are the mock's own copy, kept close to
 * verbatim because they are the clearest statement of rule 1 anywhere in the
 * project. The AI round-trip steps were a placeholder in the mock
 * (`howRound`, four empty slots) and are written here from what the round trip
 * actually does.
 */

export interface HowItWorksProps {
  backLabel: string;
  onBack: () => void;
}

interface Section {
  title: string;
  body: string;
}

const DECIDES: Section[] = [
  {
    title: 'What the app decides',
    body:
      'Care adherence, due dates and how far past interval each plant is. All '
      + 'counting, all from your logged entries. It never rates health and never '
      + 'turns adherence into a health figure. What it can be is out of date, '
      + 'which is why you can override it.',
  },
  {
    title: 'What you decide',
    body:
      'Health is yours. The AI can propose one where a photo shows something the '
      + 'record cannot, but nothing sets it without your tap. Plus name, species, '
      + 'room and spot, pot, planter, acquired date, and an override on any '
      + 'field. Your value always wins.',
  },
  {
    title: 'What the AI decides',
    body:
      'Care spec — water interval, feed, light, soil — plus do next, status '
      + 'label, standing care instructions, the species-knowledge fields, and a '
      + 'health rating only where a photo or the transcript shows something the '
      + 'schedule cannot. Every one arrives as a proposal you approve '
      + 'individually.',
  },
];

const ROUND: string[] = [
  'Prepare review package builds one file: every plant, the entries since the '
  + 'last package, and a walk transcript if one is attached. It never repeats '
  + 'what a previous package already carried.',
  'You hand that file to Claude or GPT yourself. Nothing is sent automatically '
  + 'and the app has no account anywhere — the audio itself never leaves this '
  + 'device, which is why the transcript matters.',
  'Apply AI update takes what comes back and checks it before you see any of '
  + 'it: that it answers this package, that it changes only fields the AI is '
  + 'allowed to change, and that it never touches your own notes.',
  'You approve or reject each proposed change on its own row. There is no '
  + 'apply-all, deliberately — approving twenty things with one tap is not '
  + 'approving them.',
];

const NEVER: string[] = [
  'It never calculates a health score. No number here is derived from your '
  + 'watering history.',
  'It never scores adherence out of ten. It reports counts and days, because '
  + 'that is what it actually knows.',
  'It never tells you a plant needs water. An interval passing is a prompt to '
  + 'look, not a fact about the soil.',
  'It never edits or deletes an entry. A correction is a new entry on top, '
  + 'which is what keeps the history trustworthy and lets two devices merge.',
  'It never lets the AI touch your own notes, and never imports a change you '
  + 'did not approve by itself.',
];

export default function HowItWorks({ backLabel, onBack }: HowItWorksProps) {
  return (
    <main className="how">
      <button type="button" className="how-back" onClick={onBack}>‹ {backLabel}</button>
      <h1 className="how-title">How this app works</h1>
      <p className="how-dek">
        Three parties decide things here, and they are kept apart on purpose.
      </p>

      <div className="how-cards">
        {DECIDES.map((s) => (
          <section className="how-card" key={s.title}>
            <h2 className="how-card-title">{s.title}</h2>
            <p className="how-card-body">{s.body}</p>
          </section>
        ))}
      </div>

      {/* The reference quotes this paragraph in full and calls the screen the
          design's conscience. It is set apart rather than buried in a card,
          because everything else on this page is downstream of it. */}
      <h2 className="how-label">Health and adherence</h2>
      <blockquote className="how-quote">
        Your rating is what you saw when you looked at the plant. The schedule
        record is what you did. They answer different questions, and the app
        never turns one into the other — no number here is calculated from your
        watering history.
      </blockquote>

      <h2 className="how-label">The AI round-trip</h2>
      <ol className="how-steps">
        {ROUND.map((body, i) => (
          <li className="how-step" key={body}>
            <span className="how-step-n">{i + 1}</span>
            <span className="how-step-body">{body}</span>
          </li>
        ))}
      </ol>

      <h2 className="how-label">What it will never do</h2>
      <ul className="how-nevers">
        {NEVER.map((line) => (
          <li className="how-never" key={line}>{line}</li>
        ))}
      </ul>

      <h2 className="how-label">Where your record lives</h2>
      <p className="how-note">
        Everything is stored in this browser, on this device. Nothing syncs on
        its own and there is no server holding a copy — which also means no
        account, no subscription, and nothing to keep paying for.
      </p>
      <p className="how-note">
        The catch is that each web address keeps its own separate copy. Open the
        app somewhere new and it starts empty, however much you have entered
        elsewhere. <strong>Back up is the bridge</strong>: save a file on one
        device, restore it on the other. Restoring only ever adds what is
        missing, so doing it twice is harmless.
      </p>
    </main>
  );
}
