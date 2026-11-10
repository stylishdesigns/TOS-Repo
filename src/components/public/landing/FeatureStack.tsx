import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/* The "What you get" section as scroll-stacked cards: each card pins as you
   scroll and the next card slides up over it. Each card shows the feature
   title and copy first, with the self-playing demo screen below it. Every
   demo is a portrait screen in the real portals' design language, with a
   status caption and a progress line that restart with each loop. */

function useBeats(count: number, ms: number) {
  const [b, setB] = useState(0);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setB((x) => (x + 1) % count), ms);
    return () => clearInterval(t);
  }, [count, ms]);
  return b;
}

const STEP_MS = 2600;

function R({ c, children, style }: { c?: string; children: ReactNode; style?: CSSProperties }) {
  return <div className={'dr' + (c ? ' ' + c : '')} style={style}>{children}</div>;
}
function C({ c, children }: { c?: string; children: ReactNode }) {
  return <span className={'dc' + (c ? ' ' + c : '')}>{children}</span>;
}
function Title({ children }: { children: ReactNode }) {
  return <p className="dtitle">{children}</p>;
}
const Bar = ({ w, warn }: { w: number; warn?: boolean }) => (
  <span className="dbar"><span style={{ width: w + '%' }} className={warn ? 'warn' : ''} /></span>
);

const NAV_ITEMS: Array<{ k: string; label: string; d: string }> = [
  { k: 'home', label: 'Home', d: 'M3 11l9-8 9 8v10H3z' },
  { k: 'classes', label: 'Classes', d: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4' },
  { k: 'cbt', label: 'CBT', d: 'M4 5h16v11H4zM2 20h20' },
  { k: 'results', label: 'Results', d: 'M5 20V10M12 20V4M19 20v-7' },
];

function Nav({ active }: { active?: string }) {
  return (
    <div className="dnav">
      {NAV_ITEMS.slice(0, 2).map((n) => (
        <span key={n.k} className={'dnv' + (active === n.k ? ' on' : '')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={n.d} /></svg>
          {n.label}
        </span>
      ))}
      <span className={'dnv' + (active === 'ai' ? ' on' : '')}><span className="do"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg></span></span>
      {NAV_ITEMS.slice(2).map((n) => (
        <span key={n.k} className={'dnv' + (active === n.k ? ' on' : '')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={n.d} /></svg>
          {n.label}
        </span>
      ))}
    </div>
  );
}

function Frame({ kind, head, status, beat, loop, nav, children }: {
  kind: 'admin' | 'tutor' | 'student';
  head: string;
  status: string;
  beat: number;
  loop: number;
  nav?: string;
  children: ReactNode;
}) {
  const tag = kind === 'admin' ? 'Admin' : kind === 'tutor' ? 'Tutor' : 'Student';
  return (
    <div className="dph">
      <div className="dprog" aria-hidden="true"><span style={{ animationDuration: loop + 's' }} /></div>
      <div className="dhead"><span className="dhd-t">Bright Minds Tutorial</span><span className="dhd-s">{tag} · {head}</span></div>
      <div className="dstat" role="status">{status}</div>
      <div className="dbd"><div className="dbeat" key={beat}>{children}</div></div>
      {kind === 'student' && <Nav active={nav} />}
    </div>
  );
}

/* Real-portals building blocks used inside the demos. */

const OrangeCard = ({ children }: { children: ReactNode }) => (
  <div className="dhero-o">{children}</div>
);
const DarkGreeting = ({ hi }: { hi: string }) => (
  <div className="dhero-d">
    <span className="davatar">E</span>
    <div>
      <p className="dhello">{hi}</p>
      <p className="dbig-t">Welcome back</p>
    </div>
  </div>
);
const StatGrid = ({ a, b }: { a: [string, string]; b: [string, string] }) => (
  <div className="dstatgrid">
    <div className="dstcard d"><b>{a[0]}</b><span>{a[1]}</span></div>
    <div className="dstcard w"><b>{b[0]}</b><span>{b[1]}</span></div>
  </div>
);
const OrangeAction = ({ t, s, w }: { t: string; s: string; w: number }) => (
  <div className="dcta">
    <div><b>{t}</b><span>{s}</span></div>
    <span className="dctabar"><span style={{ width: w + '%' }} /></span>
  </div>
);

const STATUS = {
  admissions: ['2 new applications', 'Reviewing an application', 'Application approved', 'Access code issued', 'New student joins the centre'],
  fees: ['Fees at a glance', 'Payment recorded', 'Payment confirmed', 'Receipt issued', 'Ledger up to date'],
  tutor: ['Tutor home', "Today's classes", 'Taking attendance', '18 of 20 present', 'Attendance saved'],
  cbt: ['Student home', 'Question 3 of 10', 'Answer selected', 'Instant result', 'Leaderboard updated'],
  apps: ['Student home', 'Classes', 'Your results', 'On any phone'],
  chat: ['Your centre, one chat', 'Class group opened', 'Tutor posts an update', 'You reply', 'Message seen'],
};

function AdmissionsDemo() {
  const b = useBeats(5, STEP_MS);
  return (
    <Frame kind="admin" head="Admissions" status={STATUS.admissions[b]} beat={b} loop={5}>
      {b === 0 && (
        <>
          <Title>Applications</Title>
          <R>Ade B. · SS2 Science<C c="new">New</C></R>
          <R>Fatima O. · JAMB class<C c="new">New</C></R>
        </>
      )}
      {b === 1 && (
        <>
          <Title>Application</Title>
          <R c="hl blk">Ade B. · SS2 Science<span style={{ color: '#64748B', fontWeight: 600 }}>Applied yesterday · 2 subjects picked</span><button className="dbtn" type="button">Approve</button></R>
        </>
      )}
      {b === 2 && (
        <>
          <Title>Application</Title>
          <R c="ok blk">Ade B. · SS2 Science<C c="ok">Approved</C></R>
        </>
      )}
      {b === 3 && (
        <>
          <Title>Centre access code</Title>
          <div className="dbig">4 8 2 9 1 3</div>
          <R>Share this code so the student joins the right centre</R>
        </>
      )}
      {b === 4 && (
        <>
          <R c="hl blk"><b style={{ font: '800 13px Inter,sans-serif' }}>Welcome to Bright Minds</b><span style={{ color: '#64748B', fontWeight: 600 }}>SS2 Science · 6 subjects</span></R>
          <R>Chemistry · today, 10:00 AM<C>Up next</C></R>
        </>
      )}
    </Frame>
  );
}

function FeesDemo() {
  const b = useBeats(5, STEP_MS);
  return (
    <Frame kind="admin" head="Fees" status={STATUS.fees[b]} beat={b} loop={5}>
      {b === 0 && (
        <>
          <Title>Fees</Title>
          <R c="hl blk"><b style={{ font: '800 13px Inter,sans-serif' }}>Collected this term</b><span style={{ font: '800 15px Inter,sans-serif', color: '#9A3412' }}>₦480,000</span></R>
          <R>Ade B.<C c="warn">Due ₦25,000</C></R>
          <R>Fatima O.<C c="ok">Paid</C></R>
        </>
      )}
      {b === 1 && (
        <>
          <Title>Payments</Title>
          <R c="hl blk">+ ₦25,000<span style={{ color: '#64748B', fontWeight: 600 }}>Bank transfer · Ade B.</span><C c="new">New</C></R>
          <R>Ade B.<C c="warn">Due ₦25,000</C></R>
        </>
      )}
      {b === 2 && (
        <>
          <Title>Confirm payment</Title>
          <R c="ok blk">₦25,000 · Ade B.<C c="ok">Confirmed</C></R>
        </>
      )}
      {b === 3 && (
        <>
          <Title>Receipt</Title>
          <R c="ok blk"><b style={{ font: '800 13px Inter,sans-serif' }}>Receipt R-1042</b><span style={{ color: '#64748B', fontWeight: 600 }}>₦25,000 · Fees (October)</span><C c="ok">Paid</C></R>
        </>
      )}
      {b === 4 && (
        <>
          <Title>Ledger</Title>
          <R c="hl blk"><b style={{ font: '800 13px Inter,sans-serif' }}>Collected this term</b><span style={{ font: '800 15px Inter,sans-serif', color: '#9A3412' }}>₦505,000</span></R>
          <R>Ade B.<C c="ok">Paid</C></R>
          <R>Fatima O.<C c="ok">Paid</C></R>
        </>
      )}
    </Frame>
  );
}

function TutorDemo() {
  const b = useBeats(5, STEP_MS);
  return (
    <Frame kind="tutor" head="Classes" status={STATUS.tutor[b]} beat={b} loop={5}>
      {b === 0 && (
        <>
          <OrangeCard>
            <p className="dkick-o">Tutor portal</p>
            <p className="dhi-o">Hello, Mr Kale!</p>
            <p className="ddate-o">Tuesday, 10 November</p>
          </OrangeCard>
          <StatGrid a={['24', 'Total students']} b={['4.9', 'Tutor rating']} />
        </>
      )}
      {b === 1 && (
        <>
          <Title>Today&apos;s Classes</Title>
          <R c="hl blk"><b style={{ font: '800 13px Inter,sans-serif' }}>Chemistry · SS2</b><span style={{ color: '#64748B', fontWeight: 600 }}>10:00 AM · Room 2</span></R>
          <R c="hl blk"><b style={{ font: '800 13px Inter,sans-serif' }}>Physics · SS2</b><span style={{ color: '#64748B', fontWeight: 600 }}>2:00 PM · Room 1</span></R>
        </>
      )}
      {b === 2 && (
        <>
          <Title>Attendance</Title>
          <R>Ade B.<button className="dbtn" type="button">Present</button></R>
          <R>Fatima O.<button className="dbtn" type="button">Present</button></R>
          <R>Tunde K.<button className="dbtn" type="button">Present</button></R>
        </>
      )}
      {b === 3 && (
        <>
          <Title>Attendance</Title>
          <R c="ok">Ade B.<C c="ok">Present</C></R>
          <R c="ok">Fatima O.<C c="ok">Present</C></R>
          <R c="ok">Tunde K.<C c="ok">Present</C></R>
          <p className="dnote">18 of 20 students present</p>
        </>
      )}
      {b === 4 && (
        <>
          <R c="ok blk"><b style={{ font: '800 13px Inter,sans-serif' }}>Attendance saved</b><span style={{ color: '#64748B', fontWeight: 600 }}>Chemistry · SS2 · 18 present</span></R>
          <R>Next: Physics, 2:00 PM</R>
        </>
      )}
    </Frame>
  );
}

function CbtDemo() {
  const b = useBeats(5, STEP_MS);
  return (
    <Frame kind="student" head="Practice" status={STATUS.cbt[b]} beat={b} loop={5} nav={b === 0 ? 'home' : 'cbt'}>
      {b === 0 && (
        <>
          <DarkGreeting hi="Good afternoon" />
          <OrangeAction t="Continue practice" s="Chemistry · Mole calculations" w={62} />
        </>
      )}
      {b === 1 && (
        <>
          <R c="hl blk"><span style={{ color: '#9A3412', fontWeight: 700 }}>Question 3 of 10 · 04:12</span><b style={{ font: '800 13px Inter,sans-serif' }}>What is the SI unit of force?</b></R>
          <R>A. Newton</R>
          <R>B. Joule</R>
          <R>C. Watt</R>
        </>
      )}
      {b === 2 && (
        <>
          <R c="ok blk">A. Newton<C c="ok">Correct</C></R>
          <R>B. Joule</R>
          <R>C. Watt</R>
        </>
      )}
      {b === 3 && (
        <>
          <R c="hl blk"><b style={{ font: '800 13px Inter,sans-serif' }}>8 of 10 correct</b><span style={{ color: '#64748B', fontWeight: 600 }}>Best streak: 3 questions</span></R>
          <R>Chemistry<C>78%</C></R>
        </>
      )}
      {b === 4 && (
        <>
          <Title>Leaderboard</Title>
          <R>1 · Emma<C c="ok">92%</C></R>
          <R>2 · Tunde<C>88%</C></R>
          <R>3 · Ade<C>84%</C></R>
        </>
      )}
    </Frame>
  );
}

function AppsDemo() {
  const b = useBeats(4, STEP_MS);
  const nav = b === 0 ? 'home' : b === 1 ? 'classes' : b === 2 ? 'results' : undefined;
  return (
    <Frame kind="student" head="Portal" status={STATUS.apps[b]} beat={b} loop={4} nav={nav}>
      {b === 0 && (
        <>
          <DarkGreeting hi="Good morning" />
          <R c="hl blk"><b style={{ font: '800 13px Inter,sans-serif' }}>Chemistry, 10:00 AM</b><span style={{ color: '#64748B', fontWeight: 600 }}>Next class, Room 2</span></R>
        </>
      )}
      {b === 1 && (
        <>
          <Title>This week</Title>
          <R>Mathematics · Monday, 9:00 AM</R>
          <R>Chemistry · Tuesday, 10:00 AM</R>
          <R>English · Wednesday, 11:00 AM</R>
        </>
      )}
      {b === 2 && (
        <>
          <p className="dbig-t">Your results</p>
          <R>Maths<Bar w={78} /></R>
          <R>Chemistry<Bar w={46} warn /></R>
          <R>English<Bar w={84} /></R>
        </>
      )}
      {b === 3 && (
        <>
          <R c="hl blk"><b style={{ font: '800 13px Inter,sans-serif' }}>Install to home screen</b><span style={{ color: '#64748B', fontWeight: 600 }}>Works on any phone, online or off</span></R>
          <R c="ok">Well done this week<C c="ok">+6%</C></R>
        </>
      )}
    </Frame>
  );
}

function ChatDemo() {
  const b = useBeats(5, STEP_MS);
  return (
    <Frame kind="student" head="Chat" status={STATUS.chat[b]} beat={b} loop={5}>
      {b === 0 && (
        <>
          <Title>Chats</Title>
          <R c="blk"><b style={{ font: '800 12px Inter,sans-serif' }}>Chemistry SS2</b><span style={{ color: '#64748B', fontWeight: 600 }}>Mock exam moves to Friday</span><span className="dtm">12:04</span></R>
          <R c="blk"><b style={{ font: '800 12px Inter,sans-serif' }}>Tutors</b><span style={{ color: '#64748B', fontWeight: 600 }}>Timetable is out</span><span className="dtm">09:41</span></R>
        </>
      )}
      {b > 0 && (
        <>
          <Title>Chemistry SS2 · 24 members</Title>
          {b >= 2 && <div className="dmsg"><span className="who">Mr Kale (Tutor)</span>Mock exam moves to Friday, 9 AM. Revise chapter 4.<span className="tm"><span className="dtick">✓✓</span> 12:04</span></div>}
          {b >= 3 && <div className="dmsg me"><span className="who">You</span>Noted, thank you sir.<span className="tm"><span className={'dtick' + (b >= 4 ? ' y' : '')}>✓{b >= 4 ? '✓' : ''}</span> 12:06</span></div>}
          {b === 1 && <div className="dmsg"><span className="who">Fatima</span>Is the mock still on Thursday?</div>}
        </>
      )}
    </Frame>
  );
}

type Feature = { title: string; body: string; demo: ReactNode };

const FEATURES: Feature[] = [
  {
    title: 'Admissions and onboarding',
    body: 'Take applications online, approve students, and give each centre a code so new students and tutors join the right place.',
    demo: <AdmissionsDemo />,
  },
  {
    title: 'Fees, payments and receipts',
    body: 'Set programme fees, record payments, confirm what students submit, and issue a receipt for every confirmed payment.',
    demo: <FeesDemo />,
  },
  {
    title: 'Timetable and attendance',
    body: 'Publish a weekly timetable students can see, and mark attendance class by class.',
    demo: <TutorDemo />,
  },
  {
    title: 'CBT practice and mock exams',
    body: 'Timed computer-based tests and scheduled mock exams for JAMB, WAEC and NECO, with results and a leaderboard.',
    demo: <CbtDemo />,
  },
  {
    title: 'Apps for students and tutors',
    body: 'Open it on any phone and install it to the home screen. Students see classes, results and resources. Tutors manage their classes.',
    demo: <AppsDemo />,
  },
  {
    title: 'Chat for your whole centre',
    body: 'A chat window where admins, tutors and students talk to each other, with groups for every class.',
    demo: <ChatDemo />,
  },
];

export function FeaturesStacked() {
  return (
    <div className="fwrap">
      {FEATURES.map((f, i) => (
        <div className="fitem" key={f.title} style={{ top: `calc(18px + ${i * 14}px)`, zIndex: 10 + i }}>
          <article className="fcard">
            <div className="ftext">
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
            <div className="fdemo">{f.demo}</div>
          </article>
        </div>
      ))}
    </div>
  );
}
