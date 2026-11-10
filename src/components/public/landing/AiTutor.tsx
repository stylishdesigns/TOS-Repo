import { useEffect, useState } from 'react';

/* The "AI built in" section demo: a portrait mock of the real Tutor AI screen
   (light mode) that plays itself. The question is sent by the animation, not
   typed into the composer: the composer stays still. It cycles through the
   three portals (centre admin -> tutor -> student), one personalized question
   and an instant reply each, and the check text below the phone always
   matches the portal on screen. Honours prefers-reduced-motion. */

const SPARK = 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z';
const BACK = 'M15 18l-6-6 6-6';
const PANEL = 'M4 5h16v14H4zM9 5v14';
const IMG = 'M4 5h16v14H4zM4 15l4-4 3 3 4-5 5 6';
const SEND = 'M4 12l16-8-6 8 6 8z';

type Phase = { kicker: string; q: string; a: string; points: string[] };

const PHASES: Phase[] = [
  {
    kicker: 'Centre admin',
    q: 'Which students are owing fees?',
    a: 'Three students are behind on fees this term, ₦75,000 in total. Ade B. and Fatima O. owe the most, ₦25,000 each. Want payment reminders drafted for their parents?',
    points: ['Answers from your centre\u2019s own data', 'Spots strong and struggling students', 'Prepares the report sheets you need'],
  },
  {
    kicker: 'Tutors',
    q: 'How did my SS2 Chemistry class do this week?',
    a: 'SS2 Chemistry averaged 64% on the last assessment. Mole calculations was the weakest topic for 6 students. I can draft a revision set for Friday.',
    points: ['Drafts questions in minutes', 'Reviews how each class performed', 'Flags students falling behind'],
  },
  {
    kicker: 'Students',
    q: 'Why did I lose marks in mole calculations?',
    a: 'In your last two Chemistry assessments you lost most marks on mole calculations. Your Maths is strong. Want a short practice set on moles?',
    points: ['Explains topics in simple terms', 'Practice questions for weak topics', 'Follows up after every assessment'],
  },
];

/* 8 ticks of 800ms per phase: the question lands, typing dots blink, the
   reply arrives, then the screen holds so everything can be read. */
const TICK_MS = 800;
const STEPS_PER_PHASE = 8;

function usePhase() {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setS((x) => x + 1), TICK_MS);
    return () => clearInterval(t);
  }, []);
  return s;
}

export function AiTutorDemo() {
  const s = usePhase();
  const reduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const step = reduced ? 3 : s;
  const pi = Math.floor(step / STEPS_PER_PHASE) % PHASES.length;
  const p = PHASES[pi];
  const inner = step % STEPS_PER_PHASE;
  const showQ = reduced ? true : inner >= 0;
  const showDots = reduced ? false : inner >= 1 && inner < 3;
  const showA = reduced ? true : inner >= 3;

  return (
    <div className="aiw">
      <div className="aiph" role="img" aria-label="Tutor AI conversation example">
        <div className="aihead">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={BACK} /></svg>
          <span className="aiava"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={SPARK} /></svg></span>
          <span className="aiht"><b>Tutor AI</b><i>Bright Minds Tutorial</i></span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={PANEL} /></svg>
        </div>
        <div className="aibody" key={pi}>
          {showQ && (
            <div className="airow u"><div className="aiub">{p.q}<i>Just now</i></div></div>
          )}
          {showDots && (
            <div className="airow"><span className="aiava sm"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={SPARK} /></svg></span><div className="aiab dots"><i /><i /><i /></div></div>
          )}
          {showA && (
            <div className="airow"><span className="aiava sm"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={SPARK} /></svg></span><div className="aiab">{p.a}<i>Just now</i></div></div>
          )}
        </div>
        <div className="aichiprow"><span className="aichip">Tell me more about mole calculations</span></div>
        <div className="aicomp">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={IMG} /></svg>
          <span className="aiin">Ask Tutor AI anything…</span>
          <span className="aisend"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={SEND} /></svg></span>
        </div>
      </div>
      <div className="airole" key={'r' + pi}>
        <p className="airole-k">{p.kicker}</p>
        <div className="pbl dark">
          {p.points.map((b) => (
            <div className="li" key={b}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none', color: '#FDBA74' }}><path d="M5 12l5 5 9-10" /></svg>
              {b}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
