import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/* The "What you get" section rebuilt as scroll-stacked cards (per the reference
   video): each card pins as you scroll and the next card slides up over it,
   leaving the earlier cards peeking above. Every card carries a portrait,
   self-playing ~5s demo of the feature inside the real portals, with a status
   caption and a progress line that restart with each loop. */

const BEATS = 5;

function useBeat() {
  const [b, setB] = useState(0);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setB((x) => (x + 1) % BEATS), 1000);
    return () => clearInterval(t);
  }, []);
  return b;
}

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

function Frame({ kind, head, status, beat, nav, children }: {
  kind: 'admin' | 'tutor' | 'student';
  head: string;
  status: string;
  beat: number;
  nav?: string;
  children: ReactNode;
}) {
  const tag = kind === 'admin' ? 'Admin' : kind === 'tutor' ? 'Tutor' : 'Student';
  return (
    <div className="dph">
      <div className="dprog" aria-hidden="true"><span /></div>
      <div className="dhead"><span className="dhd-t">Bright Minds Tutorial</span><span className="dhd-s">{tag} · {head}</span></div>
      <div className="dstat" role="status">{status}</div>
      <div className="dbd"><div className="dbeat" key={beat}>{children}</div></div>
      {kind === 'student' && <Nav active={nav} />}
    </div>
  );
}

const STATUS = {
  admissions: ['2 new applications', 'Reviewing an application', 'Application approved', 'Access code issued', 'New student joins the centre'],
  fees: ['Fees at a glance', 'Payment recorded', 'Payment confirmed', 'Receipt issued', 'Ledger up to date'],
  timetable: ['This week at a glance', 'Today: Chemistry, 10:00 AM', 'Taking attendance', '18 of 20 present', 'Attendance saved'],
  cbt: ['Practice bank', 'Question 3 of 10', 'Answer selected', 'Instant result', 'Leaderboard updated'],
  apps: ['Home', 'Classes', 'Quick practice', 'Your results', 'Back home'],
  chat: ['Your centre, one chat', 'Class group opened', 'Tutor posts an update', 'You reply', 'Message seen'],
};

function AdmissionsDemo() {
  const b = useBeat();
  return (
    <Frame kind="admin" head="Admissions" status={STATUS.admissions[b]} beat={b}>
      {b === 0 && (<>
        <Title>Applications</Title>
        <R>Ade B. · SS2 Science<C c="new">New</C></R>
        <R>Fatima O. · JAMB class<C c="new">New</C></R>
      </>)}
      {b === 1 && (<>
        <Title>Application</Title>
        <R c="hl blk">Ade B. · SS2 Science<span style={{ color: '#64748B', fontWeight: 600 }}>Applied yesterday · 2 subjects picked</span><button className="dbtn" type="button">Approve</button></R>
      </>)}
      {b === 2 && (<>
        <Title>Application</Title>
        <R c="ok blk">Ade B. · SS2 Science<C c="ok">Approved</C></R>
      </>)}
      {b === 3 && (<>
        <Title>Centre access code</Title>
        <div className="dbig">4 8 2 9 1 3</div>
        <R>Share this code so the student joins the right centre</R>
      </>)}
      {b === 4 && (<>
        <R c="hl blk"><b style={{ font: '800 13px Inter,sans-serif' }}>Welcome to Bright Minds</b><span style={{ color: '#64748B', fontWeight: 600 }}>SS2 Science · 6 subjects</span></R>
        <R>Chemistry · today, 10:00 AM<C>Up next</C></R>
      </>)}
    </Frame>
  );
}

function FeesDemo() {
  const b = useBeat();
  return (
    <Frame kind="admin" head="Fees" status={STATUS.fees[b]} beat={b}>
      {b === 0 && (<>
        <Title>Fees</Title>
        <R c="hl blk"><b style={{ font: '800 13px Inter,sans-serif' }}>Collected this term</b><span style={{ font: '800 15px Inter,sans-serif', color: '#9A3412' }}>₦480,000</span></R>
        <R>Ade B.<C c="warn">Due ₦25,000</C></R>
        <R>Fatima O.<C c="ok">Paid</C></R>
      </>)}
      {b === 1 && (<>
        <Title>Payments</Title>
        <R c="hl blk">+ ₦25,000<span style={{ color: '#64748B', fontWeight: 600 }}>Bank transfer · Ade B.</span><C c="new">New</C></R>
        <R>Ade B.<C c="warn">Due ₦25,000</C></R>
      </>)}
      {b === 2 && (<>
        <Title>Confirm payment</Title>
        <R c="ok blk">₦25,000 · Ade B.<C c="ok">Confirmed</C></R>
      </>)}
      {b === 3 && (<>
        <Title>Receipt</Title>
        <R c="ok blk"><b style={{ font: '800 13px Inter,sans-serif' }}>Receipt R-1042</b><span style={{ color: '#64748B', fontWeight: 600 }}>₦25,000 · Fees (October)</span><C c="ok">Paid</C></R>
      </>)}
      {b === 4 && (<>
        <Title>Ledger</Title>
        <R c="hl blk"><b style={{ font: '800 13px Inter,sans-serif' }}>Collected this term</b><span style={{ font: '800 15px Inter,sans-serif', color: '#9A3412' }}>₦505,000</span></R>
        <R>Ade B.<C c="ok">Paid</C></R>
        <R>Fatima O.<C c="ok">Paid</C></R>
      </>)}
    </Frame>
  );
}

function TimetableDemo() {
  const b = useBeat();
  return (
    <Frame kind="tutor" head="Classes" status={STATUS.timetable[b]} beat={b}>
      {b === 0 && (<>
        <Title>This week</Title>
        <R>Monday · Maths, 9:00 AM</R>
        <R>Tuesday · Chemistry, 10:00 AM</R>
        <R>Wednesday · English, 11:00 AM</R>
      </>)}
      {b === 1 && (<>
        <Title>Today</Title>
        <R c="hl blk"><b style={{ font: '800 13px Inter,sans-serif' }}>Chemistry · SS2</b><span style={{ color: '#64748B', fontWeight: 600 }}>10:00 AM · Room 2</span></R>
      </>)}
      {b === 2 && (<>
        <Title>Attendance</Title>
        <R>Ade B.<button className="dbtn" type="button">Present</button></R>
        <R>Fatima O.<button className="dbtn" type="button">Present</button></R>
        <R>Tunde K.<button className="dbtn" type="button">Present</button></R>
      </>)}
      {b === 3 && (<>
        <Title>Attendance</Title>
        <R c="ok">Ade B.<C c="ok">Present</C></R>
        <R c="ok">Fatima O.<C c="ok">Present</C></R>
        <R c="ok">Tunde K.<C c="ok">Present</C></R>
        <p className="dnote">18 of 20 students present</p>
      </>)}
      {b === 4 && (<>
        <R c="ok blk"><b style={{ font: '800 13px Inter,sans-serif' }}>Attendance saved</b><span style={{ color: '#64748B', fontWeight: 600 }}>Chemistry · SS2 · 18 present</span></R>
        <R>Next: English, 11:00 AM</R>
      </>)}
    </Frame>
  );
}

function CbtDemo() {
  const b = useBeat();
  return (
    <Frame kind="student" head="Practice" status={STATUS.cbt[b]} beat={b} nav={b === 0 ? 'classes' : 'cbt'}>
      {b === 0 && (<>
        <Title>Practice bank</Title>
        <R>Chemistry · Mole calculations<C c="new">Easy</C></R>
        <R>Physics · Motion<C>Hard</C></R>
        <R>English · Comprehension<C>Easy</C></R>
      </>)}
      {b === 1 && (<>
        <R c="hl blk"><span style={{ color: '#9A3412', fontWeight: 700 }}>Question 3 of 10 · 04:12</span><b style={{ font: '800 13px Inter,sans-serif' }}>What is the SI unit of force?</b></R>
        <R>A. Newton</R>
        <R>B. Joule</R>
        <R>C. Watt</R>
      </>)}
      {b === 2 && (<>
        <R c="ok blk">A. Newton<C c="ok">Correct</C></R>
        <R>B. Joule</R>
        <R>C. Watt</R>
      </>)}
      {b === 3 && (<>
        <R c="hl blk"><b style={{ font: '800 13px Inter,sans-serif' }}>8 of 10 correct</b><span style={{ color: '#64748B', fontWeight: 600 }}>Best streak: 3 questions</span></R>
        <R>Chemistry<C>78%</C></R>
      </>)}
      {b === 4 && (<>
        <Title>Leaderboard</Title>
        <R>1 · Emma<C c="ok">92%</C></R>
        <R>2 · Tunde<C>88%</C></R>
        <R>3 · Ade<C>84%</C></R>
      </>)}
    </Frame>
  );
}

function AppsDemo() {
  const b = useBeat();
  const nav = b === 0 || b === 4 ? 'home' : b === 1 ? 'classes' : b === 2 ? 'ai' : 'results';
  return (
    <Frame kind="student" head="Portal" status={STATUS.apps[b]} beat={b} nav={nav}>
      {(b === 0 || b === 4) && (<>
        <p className="dhello">Good morning</p>
        <p className="dbig-t">Welcome back</p>
        <R c="hl blk"><b style={{ font: '800 13px Inter,sans-serif' }}>Chemistry, 10:00 AM</b><span style={{ color: '#64748B', fontWeight: 600 }}>Next class, Room 2</span></R>
        {b === 4 && <R c="ok">Well done this week<C c="ok">+6%</C></R>}
      </>)}
      {b === 1 && (<>
        <p className="dbig-t">This week</p>
        <R>Mathematics · Monday, 9:00 AM</R>
        <R>Chemistry · Tuesday, 10:00 AM</R>
        <R>English · Wednesday, 11:00 AM</R>
      </>)}
      {b === 2 && (<>
        <p className="dhello">Quick practice</p>
        <p className="dbig-t">Try a CBT question</p>
        <R c="hl blk"><b style={{ font: '800 12px Inter,sans-serif' }}>What is the SI unit of force?</b></R>
        <R>A. Newton<C c="ok">Correct</C></R>
      </>)}
      {b === 3 && (<>
        <p className="dbig-t">Your results</p>
        <R>Maths<Bar w={78} /></R>
        <R>Chemistry<Bar w={46} warn /></R>
        <R>English<Bar w={84} /></R>
      </>)}
    </Frame>
  );
}

function ChatDemo() {
  const b = useBeat();
  return (
    <Frame kind="student" head="Chat" status={STATUS.chat[b]} beat={b} nav={b === 0 ? undefined : undefined}>
      {b === 0 && (<>
        <Title>Chats</Title>
        <R c="blk"><b style={{ font: '800 12px Inter,sans-serif' }}>Chemistry SS2</b><span style={{ color: '#64748B', fontWeight: 600 }}>Mock exam moves to Friday</span><span className="dtm">12:04</span></R>
        <R c="blk"><b style={{ font: '800 12px Inter,sans-serif' }}>Tutors</b><span style={{ color: '#64748B', fontWeight: 600 }}>Timetable is out</span><span className="dtm">09:41</span></R>
      </>)}
      {b > 0 && (<>
        <Title>Chemistry SS2 · 24 members</Title>
        {b >= 2 && <div className="dmsg"><span className="who">Mr Kale (Tutor)</span>Mock exam moves to Friday, 9 AM. Revise chapter 4.<span className="tm"><span className="dtick">✓✓</span> 12:04</span></div>}
        {b >= 3 && <div className="dmsg me"><span className="who">You</span>Noted, thank you sir.<span className="tm"><span className={'dtick' + (b >= 4 ? ' y' : '')}>✓{b >= 4 ? '✓' : ''}</span> 12:06</span></div>}
        {b === 1 && <div className="dmsg"><span className="who">Fatima</span>Is the mock still on Thursday?</div>}
      </>)}
    </Frame>
  );
}

type Feature = { icon: ReactNode; title: string; body: string; demo: ReactNode };

const FEATURES: Feature[] = [
  {
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M16 11h6" /></svg>,
    title: 'Admissions and onboarding',
    body: 'Take applications online, approve students, and give each centre a code so new students and tutors join the right place.',
    demo: <AdmissionsDemo />,
  },
  {
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></svg>,
    title: 'Fees, payments and receipts',
    body: 'Set programme fees, record payments, confirm what students submit, and issue a receipt for every confirmed payment.',
    demo: <FeesDemo />,
  },
  {
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>,
    title: 'Timetable and attendance',
    body: 'Publish a weekly timetable students can see, and mark attendance class by class.',
    demo: <TimetableDemo />,
  },
  {
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="4" y="5" width="16" height="11" rx="1" /><path d="M2 20h20" /></svg>,
    title: 'CBT practice and mock exams',
    body: 'Timed computer-based tests and scheduled mock exams for JAMB, WAEC and NECO, with results and a leaderboard.',
    demo: <CbtDemo />,
  },
  {
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></svg>,
    title: 'Apps for students and tutors',
    body: 'Open it on any phone and install it to the home screen. Students see classes, results and resources. Tutors manage their classes.',
    demo: <AppsDemo />,
  },
  {
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z" /></svg>,
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
            <div className="fdemo">{f.demo}</div>
            <div className="ftext">
              <div className="ic">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          </article>
        </div>
      ))}
    </div>
  );
}
