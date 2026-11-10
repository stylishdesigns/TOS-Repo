import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/* "One system, three portals" rebuilt as a scroll-driven sequence: the section
   stage stays pinned (fixed dark background) while the three portal screens
   slide in from the right, one after another (admins -> tutors -> students),
   each held in place as you scroll. Honours prefers-reduced-motion by showing
   the same screens stacked with no pinning or sliding. */

const TICK = 'M5 12l5 5 9-10';
const AI_GLYPH = 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z';

function Bullet({ children }: { children: ReactNode }) {
  return (
    <div className="li">
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none', color: '#15803D' }}>
        <path d={TICK} />
      </svg>
      {children}
    </div>
  );
}

function Tag() {
  return (
    <span className="tag">
      <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><path d={AI_GLYPH} /></svg>AI
    </span>
  );
}

function AdminScreen() {
  return (
    <div className="shot">
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 14px', background: '#F1F5F9', borderBottom: '1px solid #E2E8F0' }}>
        <i style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#CBD5E1' }} />
        <i style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#CBD5E1' }} />
        <i style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#CBD5E1' }} />
        <span style={{ marginLeft: '8px', flex: '1', background: '#fff', borderRadius: '8px', padding: '4px 10px', font: '500 12px Inter,sans-serif', color: '#475569' }}>Centre admin</span>
      </div>
      <div style={{ display: 'flex' }}>
        <div className="sd2" style={{ width: '148px', flex: 'none' }}>
          <span className="on">Dashboard</span>
          <span>Students</span>
          <span>Tutors</span>
          <span>Timetable</span>
          <span>Attendance</span>
          <span>Performance</span>
          <span>Fees &amp; Payments</span>
          <span>Chat</span>
        </div>
        <div style={{ flex: '1', padding: '16px', background: '#F8FAFC', minWidth: '0' }}>
          <b style={{ font: '800 17px Inter,sans-serif', color: '#0F172A', display: 'block' }}>Dashboard</b>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginTop: '10px' }}>
            <div className="stt"><b>248</b><span>Students</span></div>
            <div className="stt"><b>91%</b><span>Attendance</span></div>
            <div className="stt"><b>12</b><span>Applications</span></div>
          </div>
          <div className="aic">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Tag />
              <b style={{ font: '700 13px Inter,sans-serif', color: '#0F172A', display: 'block' }}>Top performers this month</b>
            </div>
            {[
              { n: 'AO', s: 'SS3 Chemistry', w: '92%' },
              { n: 'TB', s: 'SS2 Maths', w: '88%' },
              { n: 'CE', s: 'SS3 English', w: '81%' },
            ].map((r) => (
              <div key={r.n} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                <span className="ti" style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#FFEDD5', color: '#9A3412', font: '800 10px Inter,sans-serif' }}>{r.n}</span>
                <span style={{ font: '600 12px Inter,sans-serif', width: '92px' }}>{r.s}</span>
                <span style={{ flex: '1', height: '6px', borderRadius: '3px', background: '#FED7AA' }}>
                  <span style={{ display: 'block', width: r.w, height: '100%', borderRadius: '3px', background: '#C2410C' }} />
                </span>
              </div>
            ))}
            <button className="ab" type="button">Generate report sheet</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DarkBar() {
  return (
    <div style={{ height: '60px', background: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '0 14px', flex: 'none' }}>
      <span style={{ width: '18px', height: '3px', borderRadius: '2px', background: '#475569' }} />
      <span style={{ width: '18px', height: '3px', borderRadius: '2px', background: '#FB923C' }} />
      <span style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#C2410C', marginTop: '-20px', border: '4px solid #020617' }} />
      <span style={{ width: '18px', height: '3px', borderRadius: '2px', background: '#475569' }} />
      <span style={{ width: '18px', height: '3px', borderRadius: '2px', background: '#475569' }} />
    </div>
  );
}

function TutorScreen() {
  return (
    <div className="ph">
      <div style={{ padding: '18px 16px 14px' }}>
        <span style={{ font: '500 12px Inter,sans-serif', color: '#475569' }}>Tutor</span>
        <b style={{ font: '800 19px Inter,sans-serif', color: '#0F172A', display: 'block' }}>Today&apos;s classes</b>
        <div className="pr2">
          <span className="ti" style={{ background: '#DBEAFE', color: '#1E3A8A' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z" /></svg>
          </span>
          <span>
            <b style={{ font: '700 13px Inter,sans-serif', color: '#0F172A', display: 'block' }}>Chemistry, SS3</b>
            <span style={{ font: '500 12px Inter,sans-serif', color: '#475569' }}>10:00 AM</span>
          </span>
        </div>
        <div className="pr2">
          <span className="ti" style={{ background: '#FFEDD5', color: '#9A3412' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /></svg>
          </span>
          <span>
            <b style={{ font: '700 13px Inter,sans-serif', color: '#0F172A', display: 'block' }}>Physics, SS2</b>
            <span style={{ font: '500 12px Inter,sans-serif', color: '#475569' }}>2:00 PM</span>
          </span>
        </div>
        <div className="aic">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Tag /></div>
          <p style={{ font: '600 13px/1.4 Inter,sans-serif', margin: '6px 0 0' }}>6 students are struggling with quadratic equations.</p>
          <button className="ab" type="button">Create practice questions</button>
        </div>
      </div>
      <DarkBar />
    </div>
  );
}

function StudentScreen() {
  return (
    <div className="ph">
      <div style={{ padding: '18px 16px 14px' }}>
        <span style={{ font: '500 12px Inter,sans-serif', color: '#475569' }}>Your results</span>
        <b style={{ font: '800 19px Inter,sans-serif', color: '#0F172A', display: 'block' }}>How you are doing</b>
        <div className="pr2" style={{ display: 'block' }}>
          {[
            { s: 'Maths', w: '78%', c: '#15803D' },
            { s: 'Chemistry', w: '46%', c: '#C2410C' },
            { s: 'English', w: '84%', c: '#15803D' },
          ].map((r) => (
            <div key={r.s} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
              <span style={{ font: '600 12px Inter,sans-serif', width: '70px' }}>{r.s}</span>
              <span style={{ flex: '1', height: '8px', borderRadius: '4px', background: '#E2E8F0' }}>
                <span style={{ display: 'block', width: r.w, height: '100%', borderRadius: '4px', background: r.c }} />
              </span>
            </div>
          ))}
        </div>
        <div className="aic">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Tag />
            <span style={{ font: '800 11px Inter,sans-serif', color: '#9A3412' }}>Study coach</span>
          </div>
          <p style={{ font: '600 13px/1.4 Inter,sans-serif', margin: '6px 0 0' }}>Weak topic: mole calculations. Ready for a short practice set?</p>
          <button className="ab" type="button">Start practice</button>
        </div>
      </div>
      <DarkBar />
    </div>
  );
}

const PANELS: Array<{ k: string; kicker: string; title: string; bullets: string[]; screen: ReactNode; w: number }> = [
  {
    k: 'admin', kicker: 'Centre admins', title: 'Run the business', w: 760,
    bullets: [
      'Approve admissions and manage students',
      'Track fees, confirm payments and issue receipts',
      'Publish the timetable and set up chat groups',
      'Let AI spot your strongest students and prepare report sheets',
    ],
    screen: <AdminScreen />,
  },
  {
    k: 'tutor', kicker: 'Tutors', title: 'Teach and assess', w: 320,
    bullets: [
      'See your classes and mark attendance',
      'Create assessments, with AI to help write the questions',
      'Follow how your students are doing and who needs help',
      'Find extra learning materials for a topic',
    ],
    screen: <TutorScreen />,
  },
  {
    k: 'student', kicker: 'Students', title: 'Learn and compete', w: 320,
    bullets: [
      'See classes, results and resources on your phone',
      'Practise with CBT tests and join mock exams',
      'Chat with classmates and tutors in your centre',
      'Ask the AI study coach what to work on next',
    ],
    screen: <StudentScreen />,
  },
];

export function PortalsSlide() {
  const wrap = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(0);
  const [fit, setFit] = useState(1);
  const [staticMode, setStaticMode] = useState(false);

  useEffect(() => {
    const el = wrap.current;
    const rm = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    if (rm && rm.matches) { setStaticMode(true); return; }
    if (!el) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const vw = window.innerWidth;
        const r = el.getBoundingClientRect();
        const total = Math.max(1, r.height - window.innerHeight);
        const p = Math.min(1, Math.max(0, -r.top / total));
        setT(Math.min(2, Math.max(0, (p - 1 / 6) * 3)));
        setFit(Math.min(1, (Math.min(vw, 1120) * (vw < 900 ? 0.96 : 0.94)) / 760));
      });
    };
    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      cancelAnimationFrame(raf);
    };
  }, []);

  const active = Math.min(2, Math.max(0, Math.round(t)));

  return (
    <div className={'pwrap' + (staticMode ? ' pstatic' : '')} ref={wrap}>
      <div className="pstage">
        <div className="pglow" aria-hidden="true" />
        <div className="pcap" style={{ opacity: staticMode ? 1 : active === 0 ? 1 : 0 }}>
          <p className="pkick">{PANELS[0].kicker}</p>
          <h3 className="ptitle">{PANELS[0].title}</h3>
          <div className="pbl">{PANELS[0].bullets.map((b) => <Bullet>{b}</Bullet>)}</div>
        </div>
        <div className="pcap" style={{ opacity: staticMode ? 0 : active === 1 ? 1 : 0 }}>
          <p className="pkick">{PANELS[1].kicker}</p>
          <h3 className="ptitle">{PANELS[1].title}</h3>
          <div className="pbl">{PANELS[1].bullets.map((b) => <Bullet>{b}</Bullet>)}</div>
        </div>
        <div className="pcap" style={{ opacity: staticMode ? 0 : active === 2 ? 1 : 0 }}>
          <p className="pkick">{PANELS[2].kicker}</p>
          <h3 className="ptitle">{PANELS[2].title}</h3>
          <div className="pbl">{PANELS[2].bullets.map((b) => <Bullet>{b}</Bullet>)}</div>
        </div>
        <div className="pfilm">
          {PANELS.map((p, i) => {
            const d = staticMode ? 0 : i - t;
            const st: CSSProperties = staticMode
              ? { width: p.w === 760 ? 'min(760px,94vw)' : 'min(320px,86vw)' }
              : {
                  transform: `translate(calc(-50% + ${(d * 105).toFixed(2)}vw), -50%) rotate(${(d * -2.2).toFixed(2)}deg) scale(${(fit * (p.w === 760 ? 1 : Math.min(1, 1.02)) * (1 - Math.min(0.08, Math.abs(d) * 0.08))).toFixed(3)})`,
                  zIndex: String(10 - Math.round(Math.abs(d) * 10)),
                };
            return (
              <div key={p.k} className={'ppanel p' + p.k} style={st}>
                {p.screen}
                <p style={{ font: '500 12px Inter,sans-serif', color: '#94A3B8', margin: '12px 0 0', textAlign: 'center' }}>Sample data</p>
              </div>
            );
          })}
        </div>
        <div className="pdots" aria-hidden="true">
          {PANELS.map((p, i) => <span key={p.k} className={i === active ? 'on' : ''} />)}
        </div>
      </div>
    </div>
  );
}
