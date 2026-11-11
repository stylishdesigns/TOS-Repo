import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, Key, ReactNode } from 'react';

/* "One system, three portals" as a scroll-driven sequence: the section stage
   stays pinned (fixed dark background) while the three portal screens slide in
   from the right, one after another (admins -> tutors -> students). Each
   screen sits above its check list: the role title stays at the top, the
   portal screen is the centrepiece, and the check text sits below it. The
   tutor and student screens mirror the real portals' home screens. Honours
   prefers-reduced-motion by showing the same screens stacked with no pinning
   or sliding. */

const TICK = 'M5 12l5 5 9-10';
const AI_GLYPH = 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z';

function Bullet({ children }: { children: ReactNode; key?: Key }) {
  return (
    <div className="li">
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none', color: '#FDBA74' }}>
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

/* Bottom bars: the student portal has the five-item nav with the centre orb;
   the tutor portal has five flat items with no orb. */

const TUTOR_NAV = [
  { l: 'Home', d: 'M3 11l9-8 9 8v10H3z' },
  { l: 'Classes', d: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4' },
  { l: 'Roll call', d: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2M19 8v6M16 11h6' },
  { l: 'Assess', d: 'M4 5h16v11H4zM2 20h20' },
  { l: 'More', d: 'M5 12h14M12 5v14' },
];
const STUDENT_NAV = [
  { l: 'Home', d: 'M3 11l9-8 9 8v10H3z' },
  { l: 'Classes', d: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4' },
  { l: 'CBT', d: 'M4 5h16v11H4zM2 20h20' },
  { l: 'Results', d: 'M5 20V10M12 20V4M19 20v-7' },
];

function Bar({ kind, active }: { kind: 'tutor' | 'student'; active?: string }) {
  return (
    <div className="pbar">
      {kind === 'tutor' ? (
        <>
          {TUTOR_NAV.slice(0, 2).map((n) => (
            <span key={n.l} className={'pnav' + (active === n.l ? ' on' : '')}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={n.d} /></svg>{n.l}</span>
          ))}
          {TUTOR_NAV.slice(2).map((n) => (
            <span key={n.l} className={'pnav' + (active === n.l ? ' on' : '')}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={n.d} /></svg>{n.l}</span>
          ))}
        </>
      ) : (
        <>
          {STUDENT_NAV.slice(0, 2).map((n) => (
            <span key={n.l} className={'pnav' + (active === n.l ? ' on' : '')}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={n.d} /></svg>{n.l}</span>
          ))}
          <span className="porb"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={AI_GLYPH} /></svg></span>
          {STUDENT_NAV.slice(2).map((n) => (
            <span key={n.l} className={'pnav' + (active === n.l ? ' on' : '')}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={n.d} /></svg>{n.l}</span>
          ))}
        </>
      )}
    </div>
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
        <div style={{ flex: '1', padding: '16px', background: '#F8FAFC', minWidth: '0', minHeight: '440px' }}>
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
          <b style={{ font: '800 12px Inter,sans-serif', color: '#334155', display: 'block', margin: '14px 0 0', textTransform: 'uppercase', letterSpacing: '.06em' }}>Recent payments</b>
          <div style={{ display: 'grid', gap: '6px', marginTop: '8px' }}>
            <div className="prrow"><span>+ ₦25,000 · Ade B.</span><i>Today, 9:14 AM</i></div>
            <div className="prrow"><span>+ ₦40,000 · Fatima O.</span><i>Yesterday</i></div>
            <div className="prrow"><span>Fee reminder sent · Tunde K.</span><i>Yesterday</i></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Tutor portal home, matching the real screen: orange greeting card, stat
   grid, Today's Classes. */

function TutorScreen() {
  return (
    <div className="ph pphone">
      <div className="pbd2">
        <p className="pcentre">Bright Minds Tutorial</p>
        <div className="phero">
          <p className="pkick-o">Tutor portal</p>
          <p className="phi-o">Hello, Mr Kale!</p>
          <p className="pdate-o">Tuesday, 10 November</p>
        </div>
        <div className="pstatgrid">
          <div className="pstcard d"><b>24</b><span>Total students</span></div>
          <div className="pstcard w"><b>4.9</b><span>Tutor rating</span></div>
        </div>
        <div className="prow-h"><b>Today&apos;s Classes</b><span>Full timetable</span></div>
        <div className="prow">
          <b>Chemistry · SS2</b>
          <span>10:00 AM · Room 2</span>
        </div>
        <div className="prow">
          <b>Physics · SS2</b>
          <span>2:00 PM · Room 1</span>
        </div>
        <div className="aic">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Tag /></div>
          <p style={{ font: '600 13px/1.4 Inter,sans-serif', margin: '6px 0 0' }}>6 students are struggling with quadratic equations.</p>
          <button className="ab" type="button">Create practice questions</button>
        </div>
      </div>
      <Bar kind="tutor" active="Home" />
    </div>
  );
}

/* Student portal home, matching the real screen: dark greeting card with the
   avatar, orange continue-practice card, quick actions, and the five-item
   bottom nav with the centre orb. */

function StudentScreen() {
  return (
    <div className="ph pphone">
      <div className="pbd2">
        <p className="pcentre">Bright Minds Tutorial</p>
        <div className="pdhero">
          <span className="pdavatar">E</span>
          <div>
            <p className="pdhello">Good afternoon</p>
            <p className="pdbig">Welcome back</p>
          </div>
        </div>
        <div className="pdcta">
          <div><b>Continue practice</b><span>Chemistry · Mole calculations</span></div>
          <span className="pdctabar"><span style={{ width: '62%' }} /></span>
        </div>
        <div className="pdgrid">
          <div className="pdact"><b>Classes</b><span>Today: Chemistry</span></div>
          <div className="pdact"><b>CBT practice</b><span>Try a question</span></div>
        </div>
        <div className="pdresults">
          <b>Your results</b>
          {[['Maths', '78%', '#15803D'], ['Chemistry', '46%', '#C2410C'], ['English', '84%', '#15803D']].map((r) => (
            <div key={r[0]} className="pdrow">
              <span>{r[0]}</span>
              <span className="pdbar"><span style={{ width: r[1], background: r[2] }} /></span>
              <i>{r[1]}</i>
            </div>
          ))}
        </div>
      </div>
      <Bar kind="student" active="Home" />
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
  const film = useRef<HTMLDivElement>(null);
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
        const filmH = film.current ? film.current.clientHeight : 680;
        setFit(Math.min(1, (Math.min(vw, 1120) * (vw < 900 ? 0.96 : 0.94)) / 760, filmH / 680));
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
        <div className="pcaps">
        <div className="pcap" style={{ opacity: staticMode ? 1 : active === 0 ? 1 : 0 }}>
          <p className="pkick">{PANELS[0].kicker}</p>
          <h3 className="ptitle">{PANELS[0].title}</h3>
        </div>
        <div className="pcap" style={{ opacity: staticMode ? 0 : active === 1 ? 1 : 0 }}>
          <p className="pkick">{PANELS[1].kicker}</p>
          <h3 className="ptitle">{PANELS[1].title}</h3>
        </div>
        <div className="pcap" style={{ opacity: staticMode ? 0 : active === 2 ? 1 : 0 }}>
          <p className="pkick">{PANELS[2].kicker}</p>
          <h3 className="ptitle">{PANELS[2].title}</h3>
        </div>
        </div>
        <div className="pfilm" ref={film}>
          {PANELS.map((p, i) => {
            const d = staticMode ? 0 : i - t;
            const st: CSSProperties = staticMode
              ? { width: p.w === 760 ? 'min(760px,94vw)' : 'min(380px,88vw)' }
              : {
                  transform: `translate(calc(-50% + ${(d * 105).toFixed(2)}vw), -50%) rotate(${(d * -2.2).toFixed(2)}deg) scale(${(fit * (p.w === 760 ? 1 : Math.min(1, 1.02)) * (1 - Math.min(0.08, Math.abs(d) * 0.08))).toFixed(3)})`,
                  zIndex: String(10 - Math.round(Math.abs(d) * 10)),
                };
            return (
              <div key={p.k} className={'ppanel p' + p.k} style={st}>
                {p.screen}
                <div className={'pbl punder' + (staticMode || active === i ? ' show' : '')}>
                  {p.bullets.map((b) => <Bullet key={b}>{b}</Bullet>)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="pbottom">
          <div className="pdots" aria-hidden="true">
            {PANELS.map((p, i) => <span key={p.k} className={i === active ? 'on' : ''} />)}
          </div>
          {!staticMode && (
            <p className="phint">Keep scrolling · {active + 1} of 3
              <svg className="phchev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
