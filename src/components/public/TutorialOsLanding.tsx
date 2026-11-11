import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { FeaturesStacked } from './landing/FeatureStack';
import { PortalsSlide } from './landing/PortalsSlide';
import { AiTutorDemo } from './landing/AiTutor';

const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT Abuja', 'Gombe',
  'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos',
  'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto',
  'Taraba', 'Yobe', 'Zamfara',
];

const LEAD_BANNERS: Record<string, { tone: 'good' | 'warn'; title: string; text: string }> = {
  'lead-welcome': {
    tone: 'good',
    title: 'You are all set!',
    text: 'Your centre is being set up. Your login details and access code are on their way to your email right now.',
  },
  'lead-pending': {
    tone: 'good',
    title: 'Email confirmed',
    text: 'Your request is confirmed. Our team will reach out shortly with your login details.',
  },
  'lead-duplicate': {
    tone: 'warn',
    title: 'You already have a centre with us',
    text: 'These details match an existing centre. Sign in instead, or contact us if you need help getting back in.',
  },
  'lead-expired': {
    tone: 'warn',
    title: 'That confirmation link expired',
    text: 'Confirmation links last 48 hours. Submit the form again below and we will send a fresh link.',
  },
  'lead-invalid': {
    tone: 'warn',
    title: 'That confirmation link is not valid',
    text: 'Submit the form again below and we will send a fresh confirmation link.',
  },
};


type HeroState = {
  role: 'student' | 'tutor' | 'admin';
  ss: string; ts: string; as: string;
  qi: number; pick: number; score: number; quizDone: boolean;
  aiq: 'weak' | 'next' | 'hard';
  att: boolean[];
  gen: 'idle' | 'busy' | 'done';
  adm: boolean[];
  fee: boolean[];
  toast: string;
};

export const TutorialOsLanding: React.FC<{
  onAdminSignIn: () => void;
  onStudentAccess: () => void;
  onExplorePortals: () => void;
}> = ({ onAdminSignIn, onStudentAccess, onExplorePortals }) => {
  const openSignIn = onAdminSignIn;

  // Lead form state (design field names; mapped to the API payload on submit)
  const [banner, setBanner] = useState('');
  const [f, setF] = useState({ fullName: '', centre: '', email: '', phone: '', state: '', city: '', students: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ex, setEx] = useState({ jamb: true, waec: true, neco: false, post: false });
  const [skip, setSkip] = useState(false);
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [leadDone, setLeadDone] = useState(false);
  const [formError, setFormError] = useState('');

  // Page sections state
  const [hero, setHeroState] = useState<HeroState>({
    role: 'student', ss: 'home', ts: 'classes', as: 'dash',
    qi: 0, pick: -1, score: 0, quizDone: false, aiq: 'weak',
    att: [true, true, false, true], gen: 'idle',
    adm: [false, false, false], fee: [false, false], toast: '',
  });
    const [brand, setBrandState] = useState({ name: 'Bright Minds Tutorial', color: 'orange' as 'orange' | 'blue' | 'green' | 'purple' });

  useEffect(() => {
    const hash = window.location.hash || '';
    if (hash.startsWith('#lead-')) {
      const key = hash.slice(1);
      if (LEAD_BANNERS[key]) setBanner(key);
      window.history.replaceState('', '', window.location.pathname + window.location.search);
    }
  }, []);

  const hp = (p: Partial<HeroState>) => setHeroState((h) => ({ ...h, ...p }));

  const hrole = {
    student: 'hb' + (hero.role === 'student' ? ' on' : ''),
    tutor: 'hb' + (hero.role === 'tutor' ? ' on' : ''),
    admin: 'hb' + (hero.role === 'admin' ? ' on' : ''),
  };
  const hsel = {
    student: String(hero.role === 'student'),
    tutor: String(hero.role === 'tutor'),
    admin: String(hero.role === 'admin'),
  };
  const hpick = {
    student: () => hp({ role: 'student', toast: '' }),
    tutor: () => hp({ role: 'tutor', toast: '' }),
    admin: () => hp({ role: 'admin', toast: '' }),
  };
  const toast = hero.toast;
  const isHS = hero.role === 'student';
  const isHT = hero.role === 'tutor';
  const isHA = hero.role === 'admin';

  const sv = {
    home: hero.ss === 'home', classes: hero.ss === 'classes', ai: hero.ss === 'ai',
    cbt: hero.ss === 'cbt', results: hero.ss === 'results',
  };
  const sb = {
    home: 'pb' + (hero.ss === 'home' ? ' on' : ''),
    classes: 'pb' + (hero.ss === 'classes' ? ' on' : ''),
    ai: 'pb',
    cbt: 'pb' + (hero.ss === 'cbt' ? ' on' : ''),
    results: 'pb' + (hero.ss === 'results' ? ' on' : ''),
  };
  const sgo = {
    home: () => hp({ ss: 'home' }),
    classes: () => hp({ ss: 'classes' }),
    ai: () => hp({ ss: 'ai' }),
    cbt: () => hp({ ss: 'cbt' }),
    results: () => hp({ ss: 'results' }),
  };

  const QS = [
    { q: 'What is the SI unit of force?', o: ['Newton', 'Joule', 'Pascal'], a: 0 },
    { q: 'Solve 2x + 6 = 14. What is x?', o: ['3', '4', '5'], a: 1 },
    { q: 'Which gas do plants take in for photosynthesis?', o: ['Oxygen', 'Nitrogen', 'Carbon dioxide'], a: 2 },
  ];
  const cb = (() => {
    const cur = QS[Math.min(hero.qi, 2)];
    const answered = hero.pick >= 0;
    return {
      showQ: !hero.quizDone,
      showScore: hero.quizDone,
      answered,
      num: Math.min(hero.qi, 2) + 1,
      q: cur.q,
      opts: cur.o.map((label, i) => ({
        label,
        cls: 'op' + (answered ? (i === cur.a ? ' ok' : i === hero.pick ? ' bad' : '') : ''),
        pick: () => {
          if (hero.pick >= 0) return;
          hp({ pick: i, score: hero.score + (i === cur.a ? 1 : 0) });
        },
      })),
      fb: answered ? (hero.pick === cur.a ? 'Correct!' : 'Not quite. The answer is ' + cur.o[cur.a] + '.') : '',
      nextLabel: hero.qi >= 2 ? 'See my score' : 'Next question',
      next: () => {
        if (hero.qi >= 2) hp({ quizDone: true, pick: -1 });
        else hp({ qi: hero.qi + 1, pick: -1 });
      },
      score: 'You scored ' + hero.score + ' out of 3',
      retry: () => hp({ qi: 0, pick: -1, score: 0, quizDone: false }),
    };
  })();

  const aq = {
    weak: 'mb' + (hero.aiq === 'weak' ? ' pr' : ''),
    next: 'mb' + (hero.aiq === 'next' ? ' pr' : ''),
    hard: 'mb' + (hero.aiq === 'hard' ? ' pr' : ''),
  };
  const aask = {
    weak: () => hp({ aiq: 'weak' }),
    next: () => hp({ aiq: 'next' }),
    hard: () => hp({ aiq: 'hard' }),
  };
  const aiQ = { weak: 'What am I weak at?', next: 'What should I study next?', hard: 'Challenge me' }[hero.aiq];
  const aiA = {
    weak: 'You lost most marks on mole calculations in Chemistry. Your Maths is strong. Want a short practice set?',
    next: 'Revise mole calculations on Friday, then start organic chemistry basics.',
    hard: 'You are doing very well in algebra. Try a harder set: simultaneous equations with one quadratic.',
  }[hero.aiq];

  const tv = { classes: hero.ts === 'classes', assess: hero.ts === 'assess', perf: hero.ts === 'perf' };
  const tb = {
    classes: 'pb' + (hero.ts === 'classes' ? ' on' : ''),
    assess: 'pb' + (hero.ts === 'assess' ? ' on' : ''),
    perf: 'pb' + (hero.ts === 'perf' ? ' on' : ''),
  };
  const tgo = {
    classes: () => hp({ ts: 'classes' }),
    assess: () => hp({ ts: 'assess' }),
    perf: () => hp({ ts: 'perf' }),
  };
  const att = ['Ada O.', 'Tunde B.', 'Chioma E.', 'Ibrahim S.'].map((name, i) => ({
    name,
    on: String(hero.att[i]),
    cls: 'mb' + (hero.att[i] ? ' ok' : ''),
    label: hero.att[i] ? 'Present' : 'Absent',
    tog: () => hp({ att: hero.att.map((v, j) => (j === i ? !v : v)) }),
  }));
  const attCount = hero.att.filter(Boolean).length + ' of 4 present';
  const gn = {
    idle: hero.gen === 'idle',
    busy: hero.gen === 'busy',
    done: hero.gen === 'done',
    go: () => {
      hp({ gen: 'busy' });
      setTimeout(() => hp({ gen: 'done' }), 900);
    },
    reset: () => hp({ gen: 'idle' }),
    qs: [
      '1. Solve x squared minus 5x plus 6 equals 0.',
      '2. Find the roots of 2x squared plus 3x minus 2 equals 0.',
      '3. A rectangle has area 24 and length x plus 2 more than its width x. Find x.',
    ],
  };
  const av = { dash: hero.as === 'dash', adm: hero.as === 'adm', fees: hero.as === 'fees' };
  const ab = {
    dash: hero.as === 'dash' ? 'on' : '',
    adm: hero.as === 'adm' ? 'on' : '',
    fees: hero.as === 'fees' ? 'on' : '',
  };
  const ago = { dash: () => hp({ as: 'dash' }), adm: () => hp({ as: 'adm' }), fees: () => hp({ as: 'fees' }) };
  const rep = () => hp({ toast: 'Sample report sheet ready. Your real ones use your own data.' });
  const admRows = [['Ada Okafor', 'JAMB class'], ['Tunde Bello', 'WAEC class'], ['Chioma Eze', 'JAMB class']].map((r0, i) => ({
    name: r0[0],
    prog: r0[1],
    cls: 'mb' + (hero.adm[i] ? ' ok' : ' pr'),
    label: hero.adm[i] ? 'Approved' : 'Approve',
    tog: () => hp({ adm: hero.adm.map((v, j) => (j === i ? true : v)) }),
  }));
  const feeRows = [['Ibrahim Sani', 'Bank transfer, awaiting check'], ['Ngozi Okafor', 'Cash, awaiting check']].map((r0, i) => ({
    name: r0[0],
    note: hero.fee[i] ? 'Confirmed. Receipt issued.' : r0[1],
    cls: 'mb' + (hero.fee[i] ? ' ok' : ' pr'),
    label: hero.fee[i] ? 'Confirmed' : 'Confirm',
    tog: () => hp({ fee: hero.fee.map((v, j) => (j === i ? true : v)) }),
  }));



  const brandName = String(brand.name || '').trim() || 'Your Centre';
  const brandInit = ((String(brand.name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('')) || 'YC').toUpperCase();
  const brandClass = 'bm t-' + brand.color;
  const dot = {
    orange: 'dot' + (brand.color === 'orange' ? ' on' : ''),
    blue: 'dot' + (brand.color === 'blue' ? ' on' : ''),
    green: 'dot' + (brand.color === 'green' ? ' on' : ''),
    purple: 'dot' + (brand.color === 'purple' ? ' on' : ''),
  };
  const colour = {
    orange: () => setBrandState((b) => ({ ...b, color: 'orange' })),
    blue: () => setBrandState((b) => ({ ...b, color: 'blue' })),
    green: () => setBrandState((b) => ({ ...b, color: 'green' })),
    purple: () => setBrandState((b) => ({ ...b, color: 'purple' })),
  };
  const setBrand = (ev: React.ChangeEvent<HTMLInputElement>) => setBrandState((b) => ({ ...b, name: ev.target.value }));


  const on = {
    fullName: (ev: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, fullName: ev.target.value })),
    centre: (ev: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, centre: ev.target.value })),
    email: (ev: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, email: ev.target.value })),
    phone: (ev: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, phone: ev.target.value })),
    state: (ev: React.ChangeEvent<HTMLSelectElement>) => setF((p) => ({ ...p, state: ev.target.value })),
    city: (ev: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, city: ev.target.value })),
    students: (ev: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, students: ev.target.value })),
  };
  const inv = {
    fullName: errors.fullName ? 'true' : 'false',
    centre: errors.centre ? 'true' : 'false',
    email: errors.email ? 'true' : 'false',
    phone: errors.phone ? 'true' : 'false',
    state: errors.state ? 'true' : 'false',
    city: errors.city ? 'true' : 'false',
    students: errors.students ? 'true' : 'false',
  };
  const er = errors;
  const tog = {
    jamb: () => setEx((e) => ({ ...e, jamb: !e.jamb })),
    waec: () => setEx((e) => ({ ...e, waec: !e.waec })),
    neco: () => setEx((e) => ({ ...e, neco: !e.neco })),
    post: () => setEx((e) => ({ ...e, post: !e.post })),
  };
  const toggleSkip = () => setSkip((s) => !s);
  const toggleConsent = () => {
    setConsent((c) => !c);
    setErrors((e) => ({ ...e, consent: '' }));
  };
  const invConsent = errors.consent ? 'true' : 'false';

  const validate = () => {
    const t = (x: unknown) => String(x || '').trim();
    const e2: Record<string, string> = {};
    if (t(f.fullName).length < 2 || t(f.fullName).length > 100) e2.fullName = 'Please give your full name.';
    if (t(f.centre).length < 2 || t(f.centre).length > 120) e2.centre = 'Please give your centre name.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t(f.email))) e2.email = 'That email address does not look right.';
    const d = String(f.phone || '').replace(/\D/g, '');
    if (d.length < 7 || d.length > 15) e2.phone = 'That phone number does not look right.';
    if (!f.state) e2.state = 'Please choose a state.';
    if (!t(f.city) || t(f.city).length > 60) e2.city = 'Please tell us your city.';
    const c = Number(f.students);
    if (!Number.isInteger(c) || c < 1 || c > 10000) e2.students = 'How many students do you teach?';
    if (!consent) e2.consent = 'Consent is required.';
    return e2;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setFormError('');
    const e2 = validate();
    if (Object.keys(e2).length) {
      setErrors(e2);
      return;
    }
    setErrors({});
    setSending(true);
    try {
      const hpEl = document.getElementById('hp-website') as HTMLInputElement | null;
      const res = await fetch('/api/public/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: f.fullName,
          businessName: f.centre,
          email: f.email,
          phone: f.phone,
          studentCount: Number(f.students),
          state: f.state,
          city: f.city,
          examTypes: [
            ex.jamb ? 'JAMB' : '',
            ex.waec ? 'WAEC' : '',
            ex.neco ? 'NECO' : '',
            ex.post ? 'Post-UTME' : '',
          ].filter(Boolean),
          skipTrial: skip,
          consent: true,
          website: hpEl ? hpEl.value : '', // honeypot: real visitors leave it empty
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not submit your request. Please try again.');
      setLeadDone(true);
    } catch (err: unknown) {
      setFormError((err as Error)?.message || 'Could not submit your request. Please try again.');
    } finally {
      setSending(false);
    }
  };
  const submitLabel = sending ? 'Starting...' : 'Start my free trial';
  const done = leadDone;
  const notDone = !leadDone;
  const emailShown = String(f.email || '').trim();
  const reset = () => setLeadDone(false);

  return (
    <>
<div className="pg">{banner && LEAD_BANNERS[banner] && (
        <div className="relative z-10 max-w-2xl mx-auto px-5 mt-3" style={{ position: 'relative' }}>
          <div
            className={`flex items-start gap-3 rounded-2xl border p-4 ${
              LEAD_BANNERS[banner].tone === 'good'
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-amber-500/10 border-amber-500/30'
            }`}
          >
            {LEAD_BANNERS[banner].tone === 'good' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
            )}
            <div>
              <p className="font-bold text-sm">{LEAD_BANNERS[banner].title}</p>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">{LEAD_BANNERS[banner].text}</p>
            </div>
            <button onClick={() => setBanner('')} className="ml-auto text-slate-400 hover:text-white font-bold px-1" aria-label="Dismiss">
              &times;
            </button>
          </div>
        </div>
      )}<div className="dk"><div className="w"><div className="bar"><a className="brand" href="#top"><span className="bx"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg></span>Tutorial OS</a><nav className="lk" aria-label="Main"><a href="#features">Features</a><a href="#ai">AI</a><a href="#brand">Your brand</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a><a className="btn pr" href="#trial" style={{minHeight:'44px'}}>Start free trial</a></nav></div></div><section className="hero" id="top"><div className="w"><div className="hg"><div><p className="kick">For tutorial centres and independent tutors in Nigeria</p><h1 className="hx">Run your whole tutorial centre from one place.</h1><p className="sub">Admissions, fees, timetables, attendance, CBT practice and mock exams, your own website and a student app, in one system with AI built in and your own name on everything. Made for JAMB, WAEC and NECO preparation.</p><div style={{display:'flex',flexWrap:'wrap',gap:'12px',marginTop:'28px'}}><a className="btn pr" href="#trial">Start your 14-day free trial</a><a className="btn" href="#how">See how it works</a></div><div style={{display:'flex',flexWrap:'wrap',gap:'10px',marginTop:'26px'}}><span className="pill">JAMB, WAEC and NECO</span><span className="pill">AI for students, tutors and admins</span><span className="pill">14-day free trial</span><span className="pill">From ₦2,000 per student per month</span></div></div><div className="hp"><div className="hr" role="tablist" aria-label="Try it as"><span className="hl">Try it live as</span><button className={hrole.student} role="tab" aria-selected={hsel.student} type="button" onClick={hpick.student}>Student</button><button className={hrole.tutor} role="tab" aria-selected={hsel.tutor} type="button" onClick={hpick.tutor}>Tutor</button><button className={hrole.admin} role="tab" aria-selected={hsel.admin} type="button" onClick={hpick.admin}>Admin</button></div><div style={{display:'flex',justifyContent:'center'}}>{(isHS) && (<><div className="ph"><div className="pbd">{(sv.home) && (<><p className="t3">Good morning</p><p className="t1">Welcome back</p><div className="rw"><div className="g"><b className="t2">Chemistry, 10:00 AM</b><span className="t3">Next class, Room 2</span></div></div><div className="rw" style={{display:'block'}}><b className="t2">Your results</b><div style={{display:'flex',alignItems:'center',gap:'8px',marginTop:'8px'}}><span className="t3" style={{width:'64px',color:'#0F172A',fontWeight:'600'}}>Maths</span><span style={{flex:'1',height:'8px',borderRadius:'4px',background:'#E2E8F0'}}><span style={{display:'block',width:'78%',height:'100%',borderRadius:'4px',background:'#15803D'}}></span></span></div><div style={{display:'flex',alignItems:'center',gap:'8px',marginTop:'8px'}}><span className="t3" style={{width:'64px',color:'#0F172A',fontWeight:'600'}}>Chemistry</span><span style={{flex:'1',height:'8px',borderRadius:'4px',background:'#E2E8F0'}}><span style={{display:'block',width:'46%',height:'100%',borderRadius:'4px',background:'#C2410C'}}></span></span></div><div style={{display:'flex',alignItems:'center',gap:'8px',marginTop:'8px'}}><span className="t3" style={{width:'64px',color:'#0F172A',fontWeight:'600'}}>English</span><span style={{flex:'1',height:'8px',borderRadius:'4px',background:'#E2E8F0'}}><span style={{display:'block',width:'84%',height:'100%',borderRadius:'4px',background:'#15803D'}}></span></span></div></div></>)}{(sv.classes) && (<><p className="t1">This week</p><div className="rw"><div className="g"><b className="t2">Mathematics</b><span className="t3">Monday, 9:00 AM</span></div></div><div className="rw"><div className="g"><b className="t2">Chemistry</b><span className="t3">Tuesday, 10:00 AM</span></div></div><div className="rw"><div className="g"><b className="t2">English</b><span className="t3">Wednesday, 11:00 AM</span></div></div><div className="rw"><div className="g"><b className="t2">Physics</b><span className="t3">Thursday, 2:00 PM</span></div></div></>)}{(sv.results) && (<><p className="t1">Results</p><div className="rw" style={{display:'block'}}><div style={{display:'flex',alignItems:'center',gap:'8px',marginTop:'8px'}}><span className="t3" style={{width:'64px',color:'#0F172A',fontWeight:'600'}}>Maths</span><span style={{flex:'1',height:'8px',borderRadius:'4px',background:'#E2E8F0'}}><span style={{display:'block',width:'78%',height:'100%',borderRadius:'4px',background:'#15803D'}}></span></span></div><div style={{display:'flex',alignItems:'center',gap:'8px',marginTop:'8px'}}><span className="t3" style={{width:'64px',color:'#0F172A',fontWeight:'600'}}>Chemistry</span><span style={{flex:'1',height:'8px',borderRadius:'4px',background:'#E2E8F0'}}><span style={{display:'block',width:'46%',height:'100%',borderRadius:'4px',background:'#C2410C'}}></span></span></div><div style={{display:'flex',alignItems:'center',gap:'8px',marginTop:'8px'}}><span className="t3" style={{width:'64px',color:'#0F172A',fontWeight:'600'}}>English</span><span style={{flex:'1',height:'8px',borderRadius:'4px',background:'#E2E8F0'}}><span style={{display:'block',width:'84%',height:'100%',borderRadius:'4px',background:'#15803D'}}></span></span></div></div><div className="rw" style={{display:'block',background:'#FFF7ED',borderColor:'#FDBA74'}}><b className="t2">Weakest topic</b><span className="t3">Mole calculations in Chemistry. Tap the glowing button to ask the study coach.</span></div></>)}{(sv.cbt) && (<><p className="t3">Quick practice</p><p className="t1">Try a CBT question</p>{(cb.showQ) && (<><div className="rw" style={{display:'block'}}><span className="t3">Question {cb.num} of 3</span><b className="t2" style={{marginTop:'4px'}}>{cb.q}</b></div>{(cb.opts).map((o) => (<><button className={o.cls} type="button" onClick={o.pick}>{o.label}</button></>))}{(cb.answered) && (<><p className="t2" style={{marginTop:'10px'}} role="status">{cb.fb}</p><button className="mb pr" type="button" onClick={cb.next} style={{marginTop:'8px'}}>{cb.nextLabel}</button></>)}</>)}{(cb.showScore) && (<><div className="rw" style={{display:'block',textAlign:'center'}}><b className="t1">{cb.score}</b><p className="t3" style={{margin:'4px 0 10px'}}>Your centre can set exams like this for every class.</p><a className="btn pr" href="#trial" style={{minHeight:'44px',fontSize:'13px',padding:'0 14px'}}>Start your free trial</a><br /><button className="mb" type="button" onClick={cb.retry} style={{marginTop:'10px'}}>Try again</button></div></>)}</>)}{(sv.ai) && (<><p className="t3">AI study coach</p><p className="t1">Ask me anything</p><div style={{display:'flex',flexWrap:'wrap',gap:'6px',marginTop:'8px'}}><button className={aq.weak} type="button" onClick={aask.weak}>My weak topics</button><button className={aq.next} type="button" onClick={aask.next}>Study next</button><button className={aq.hard} type="button" onClick={aask.hard}>Challenge me</button></div><div className="rw" style={{display:'block',background:'#fff',marginTop:'12px'}}><span className="t3">{aiQ}</span></div><div className="rw" style={{display:'block',background:'#FFF7ED',borderColor:'#FDBA74'}}><b className="t2">Coach</b><span className="t3" style={{color:'#0F172A'}}>{aiA}</span></div></>)}</div><div className="pn"><button className={sb.home} type="button" onClick={sgo.home}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-8 9 8v10H3z" /></svg>Home</button><button className={sb.classes} type="button" onClick={sgo.classes}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>Classes</button><button className={sb.ai} type="button" aria-label="Ask the AI study coach" onClick={sgo.ai}><span className="po"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg></span></button><button className={sb.cbt} type="button" onClick={sgo.cbt}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="11" rx="1" /><path d="M2 20h20" /></svg>CBT</button><button className={sb.results} type="button" onClick={sgo.results}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V10M12 20V4M19 20v-7" /></svg>Results</button></div></div></>)}{(isHT) && (<><div className="ph"><div className="pbd">{(tv.classes) && (<><p className="t3">Chemistry, SS3</p><p className="t1">Take attendance</p>{(att).map((a) => (<><div className="rw"><div className="g"><b className="t2">{a.name}</b></div><button className={a.cls} type="button" aria-pressed={a.on} onClick={a.tog}>{a.label}</button></div></>))}<p className="t3" style={{marginTop:'10px'}} role="status">{attCount}</p></>)}{(tv.assess) && (<><p className="t3">New assessment</p><p className="t1">Create with AI</p><div className="rw" style={{display:'block'}}><span className="t3">Topic</span><b className="t2">Quadratic equations, SS2</b></div>{(gn.idle) && (<><button className="mb pr" type="button" onClick={gn.go} style={{marginTop:'10px'}}>Draft 3 questions</button></>)}{(gn.busy) && (<><p className="t3" style={{marginTop:'10px'}} role="status">Drafting questions...</p></>)}{(gn.done) && (<><p className="t2" style={{marginTop:'10px'}} role="status">3 questions drafted. Review and edit before use.</p>{(gn.qs).map((g) => (<><div className="rw"><span className="t3" style={{color:'#0F172A'}}>{g}</span></div></>))}<button className="mb" type="button" onClick={gn.reset} style={{marginTop:'8px'}}>Start over</button></>)}</>)}{(tv.perf) && (<><p className="t3">SS2 Mathematics</p><p className="t1">Class progress</p><div className="rw" style={{display:'block',background:'#FFF7ED',borderColor:'#FDBA74'}}><b className="t2">Needs help</b><span className="t3">6 students are struggling with quadratic equations.</span></div><div className="rw" style={{display:'block'}}><div style={{display:'flex',alignItems:'center',gap:'8px',marginTop:'8px'}}><span className="t3" style={{width:'64px',color:'#0F172A',fontWeight:'600'}}>Maths</span><span style={{flex:'1',height:'8px',borderRadius:'4px',background:'#E2E8F0'}}><span style={{display:'block',width:'78%',height:'100%',borderRadius:'4px',background:'#15803D'}}></span></span></div><div style={{display:'flex',alignItems:'center',gap:'8px',marginTop:'8px'}}><span className="t3" style={{width:'64px',color:'#0F172A',fontWeight:'600'}}>Chemistry</span><span style={{flex:'1',height:'8px',borderRadius:'4px',background:'#E2E8F0'}}><span style={{display:'block',width:'46%',height:'100%',borderRadius:'4px',background:'#C2410C'}}></span></span></div><div style={{display:'flex',alignItems:'center',gap:'8px',marginTop:'8px'}}><span className="t3" style={{width:'64px',color:'#0F172A',fontWeight:'600'}}>English</span><span style={{flex:'1',height:'8px',borderRadius:'4px',background:'#E2E8F0'}}><span style={{display:'block',width:'84%',height:'100%',borderRadius:'4px',background:'#15803D'}}></span></span></div></div></>)}</div><div className="pn"><button className={tb.classes} type="button" onClick={tgo.classes}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>Classes</button><button className={tb.assess} type="button" onClick={tgo.assess}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="11" rx="1" /><path d="M2 20h20" /></svg>Assess</button><button className={tb.perf} type="button" onClick={tgo.perf}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V10M12 20V4M19 20v-7" /></svg>Progress</button></div></div></>)}{(isHA) && (<><div className="shot" style={{width:'100%',maxWidth:'470px'}}><div className="as"><div className="hs"><button className={ab.dash} type="button" onClick={ago.dash}>Dashboard</button><button className={ab.adm} type="button" onClick={ago.adm}>Admissions</button><button className={ab.fees} type="button" onClick={ago.fees}>Fees</button></div><div style={{flex:'1',minWidth:'0',padding:'14px',background:'#F8FAFC',color:'#0F172A'}}>{(av.dash) && (<><p className="t1">Dashboard</p><div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'8px',marginTop:'10px'}}><div className="rw" style={{display:'block',margin:'0'}}><b className="t1">248</b><span className="t3">Students</span></div><div className="rw" style={{display:'block',margin:'0'}}><b className="t1">91%</b><span className="t3">Attendance</span></div><div className="rw" style={{display:'block',margin:'0'}}><b className="t1">12</b><span className="t3">Applications</span></div></div><div className="rw" style={{display:'block',background:'#FFF7ED',borderColor:'#FDBA74'}}><b className="t2">Top performers this month</b><div style={{display:'flex',alignItems:'center',gap:'8px',marginTop:'8px'}}><span className="t3" style={{width:'64px',color:'#0F172A',fontWeight:'600'}}>Maths</span><span style={{flex:'1',height:'8px',borderRadius:'4px',background:'#E2E8F0'}}><span style={{display:'block',width:'78%',height:'100%',borderRadius:'4px',background:'#15803D'}}></span></span></div><div style={{display:'flex',alignItems:'center',gap:'8px',marginTop:'8px'}}><span className="t3" style={{width:'64px',color:'#0F172A',fontWeight:'600'}}>Chemistry</span><span style={{flex:'1',height:'8px',borderRadius:'4px',background:'#E2E8F0'}}><span style={{display:'block',width:'46%',height:'100%',borderRadius:'4px',background:'#C2410C'}}></span></span></div><div style={{display:'flex',alignItems:'center',gap:'8px',marginTop:'8px'}}><span className="t3" style={{width:'64px',color:'#0F172A',fontWeight:'600'}}>English</span><span style={{flex:'1',height:'8px',borderRadius:'4px',background:'#E2E8F0'}}><span style={{display:'block',width:'84%',height:'100%',borderRadius:'4px',background:'#15803D'}}></span></span></div><button className="mb pr" type="button" onClick={rep} style={{marginTop:'10px'}}>Generate report sheet</button></div></>)}{(av.adm) && (<><p className="t1">Admissions</p>{(admRows).map((r) => (<><div className="rw"><div className="g"><b className="t2">{r.name}</b><span className="t3">{r.prog}</span></div><button className={r.cls} type="button" onClick={r.tog}>{r.label}</button></div></>))}</>)}{(av.fees) && (<><p className="t1">Fees and payments</p>{(feeRows).map((r) => (<><div className="rw"><div className="g"><b className="t2">{r.name}</b><span className="t3">{r.note}</span></div><button className={r.cls} type="button" onClick={r.tog}>{r.label}</button></div></>))}</>)}</div></div></div></>)}</div>{(toast) && (<><p className="pill" style={{marginTop:'12px'}} role="status">{toast}</p></>)}<p style={{font:'500 13px Inter,sans-serif',color:'#94A3B8',margin:'14px 0 0',textAlign:'center'}}>Sample data. Click around: this is how it works.</p></div></div></div></section></div><section className="sec" id="features"><div className="w"><p className="kick" style={{color:'#9A3412'}}>What you get</p><h2 className="sx" style={{marginTop:'8px'}}>Everything a centre does, in one system.</h2><p className="lead">Replace the notebooks, spreadsheets and scattered group chats with one place your admins, tutors and students all use.</p><FeaturesStacked /></div></section><section className="sec" id="portals" style={{background:'#fff',padding:'72px 0'}}><div className="w"><h2 className="sx">One system, three portals.</h2><p className="lead">Each person sees what they need and nothing more. Take a look inside.</p></div><PortalsSlide /></section><section className="dk sec" id="ai"><div className="w"><p className="kick">AI built in</p><h2 className="sx" style={{color:'#fff',marginTop:'8px'}}>Tutor AI</h2><p className="sub" style={{marginTop:'14px'}}>Built into every portal. It learns from your centre’s own assessments and results, so the help is about your students, not just anyone.</p><AiTutorDemo /><div style={{display:'flex',alignItems:'center',gap:'14px',flexWrap:'wrap',marginTop:'34px'}}><a className="btn pr" href="#pricing">See plans with AI</a><p style={{font:'500 14px Inter,sans-serif',color:'#94A3B8',margin:'0'}}>AI features are part of Centre Plus.</p></div></div></section><section className="sec" id="brand"><div className="w"><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:'48px',alignItems:'center'}}><div><p className="kick" style={{color:'#9A3412'}}>White label</p><h2 className="sx" style={{marginTop:'8px'}}>Your name on everything.</h2><p className="lead">Tutorial OS runs quietly in the background. Your students see your centre, never ours.</p><div style={{marginTop:'18px'}}><div className="li"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{flex:'none',color:'#15803D'}}><path d="M5 12l5 5 9-10" /></svg>A branded landing page for your centre, ready when you join</div><div className="li"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{flex:'none',color:'#15803D'}}><path d="M5 12l5 5 9-10" /></svg>Use it to promote your centre and run your ads</div><div className="li"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{flex:'none',color:'#15803D'}}><path d="M5 12l5 5 9-10" /></svg>Connect your Facebook, Instagram and TikTok</div><div className="li"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{flex:'none',color:'#15803D'}}><path d="M5 12l5 5 9-10" /></svg>Enrol new students straight from the page, with nothing extra to pay</div><div className="li"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{flex:'none',color:'#15803D'}}><path d="M5 12l5 5 9-10" /></svg>Your name, logo and colours on the app, the portals and the page</div></div><div style={{marginTop:'26px'}}><label className="lb" htmlFor="bn">Try it: type your centre name</label><input className="in" id="bn" maxLength="40" value={brandName} onChange={setBrand} style={{marginTop:'6px',maxWidth:'360px'}} /><div style={{display:'flex',gap:'10px',marginTop:'14px'}} role="group" aria-label="Brand colour"><button className={dot.orange} type="button" aria-label="Orange" onClick={colour.orange} style={{background:'#C2410C'}}></button><button className={dot.blue} type="button" aria-label="Blue" onClick={colour.blue} style={{background:'#1D4ED8'}}></button><button className={dot.green} type="button" aria-label="Green" onClick={colour.green} style={{background:'#047857'}}></button><button className={dot.purple} type="button" aria-label="Purple" onClick={colour.purple} style={{background:'#6D28D9'}}></button></div></div></div><div className={brandClass}><div className="shot"><div style={{display:'flex',alignItems:'center',gap:'6px',padding:'10px 14px',background:'#F1F5F9',borderBottom:'1px solid #E2E8F0'}}><i style={{width:'10px',height:'10px',borderRadius:'50%',background:'#CBD5E1'}}></i><i style={{width:'10px',height:'10px',borderRadius:'50%',background:'#CBD5E1'}}></i><i style={{width:'10px',height:'10px',borderRadius:'50%',background:'#CBD5E1'}}></i><span style={{marginLeft:'8px',flex:'1',background:'#fff',borderRadius:'8px',padding:'4px 10px',font:'500 12px Inter,sans-serif',color:'#475569'}}>[your centre address]</span></div><div style={{display:'flex',alignItems:'center',gap:'10px',padding:'14px 18px',borderBottom:'1px solid #E2E8F0'}}><span className="ti" style={{background:'var(--a)',color:'#fff',width:'38px',height:'38px',borderRadius:'50%',font:'900 13px Inter,sans-serif'}}>{brandInit}</span><b style={{font:'800 15px Inter,sans-serif',flex:'1'}}>{brandName}</b><span style={{font:'600 12px Inter,sans-serif',color:'#475569'}}>Programmes</span><span style={{background:'var(--a)',color:'#fff',borderRadius:'10px',padding:'7px 12px',font:'800 12px Inter,sans-serif'}}>Enrol now</span></div><div style={{background:'var(--a)',color:'#fff',padding:'34px 22px'}}><p style={{font:'800 11px Inter,sans-serif',letterSpacing:'.12em',textTransform:'uppercase',opacity:'.9',margin:'0'}}>Exam preparation</p><p style={{font:'900 26px/1.1 Inter,sans-serif',margin:'8px 0 14px',letterSpacing:'-.02em'}}>JAMB, WAEC and NECO classes for serious students.</p><span style={{display:'inline-block',background:'#fff',color:'#0F172A',borderRadius:'10px',padding:'10px 16px',font:'800 13px Inter,sans-serif'}}>Enrol your child</span></div><div style={{padding:'16px 18px',display:'flex',flexWrap:'wrap',gap:'8px',alignItems:'center'}}><span style={{font:'700 12px Inter,sans-serif',color:'#475569'}}>Follow us</span><span className="src">Facebook</span><span className="src">Instagram</span><span className="src">TikTok</span></div></div><p style={{font:'500 12px Inter,sans-serif',color:'#475569',margin:'12px 0 0',textAlign:'center'}}>Example. Your page shows your own name, colours and content.</p></div></div></div></section><section className="sec" id="how"><div className="w"><h2 className="sx">Live in three steps.</h2><p className="lead">Fill the short form, check your email, and you are in. No waiting on anyone.</p><div className="g3"><div className="cd"><div className="n">1</div><h3>Start your free trial</h3><p>Fill in the short form with your centre details and click Start my free trial. Your centre is created straight away.</p></div><div className="cd"><div className="n">2</div><h3>Check your email</h3><p>Your access code, login email and temporary password arrive at once, with a link straight to your centre&#39;s own sign-in page.</p></div><div className="cd"><div className="n">3</div><h3>Set up and invite</h3><p>Find your centre with the access code, change the temporary password to your own, then share your centre code so tutors and students join.</p></div></div></div></section><section className="sec" id="pricing" style={{background:'#fff'}}><div className="w"><h2 className="sx">Simple pricing, in naira.</h2><p className="lead">You pay for each student seat, each month. Every centre starts with a 14-day free trial for up to 10 students.</p><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:'40px',marginTop:'36px'}}><div className="pl"><p style={{font:'800 13px Inter,sans-serif',letterSpacing:'.1em',textTransform:'uppercase',color:'#9A3412'}}>Centre Standard</p><p className="pr" style={{marginTop:'8px',color:'#0F172A'}}>₦2,000<span style={{font:'600 15px Inter,sans-serif',color:'#475569'}}> per student per month</span></p><p style={{font:'500 14px Inter,sans-serif',color:'#475569',marginTop:'6px'}}>Everything you need to run a centre.</p><div style={{marginTop:'14px'}}><div className="li" style={{color:'#0F172A'}}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{flex:'none',color:'#15803D'}}><path d="M5 12l5 5 9-10" /></svg>Admissions, fees and receipts</div><div className="li" style={{color:'#0F172A'}}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{flex:'none',color:'#15803D'}}><path d="M5 12l5 5 9-10" /></svg>Timetable and attendance</div><div className="li" style={{color:'#0F172A'}}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{flex:'none',color:'#15803D'}}><path d="M5 12l5 5 9-10" /></svg>CBT practice and mock exams</div><div className="li" style={{color:'#0F172A'}}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{flex:'none',color:'#15803D'}}><path d="M5 12l5 5 9-10" /></svg>Student and tutor apps</div><div className="li" style={{color:'#0F172A'}}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{flex:'none',color:'#15803D'}}><path d="M5 12l5 5 9-10" /></svg>Student chat</div><div className="li" style={{color:'#0F172A'}}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{flex:'none',color:'#15803D'}}><path d="M5 12l5 5 9-10" /></svg>Your branded landing page</div><a className="btn lt" href="#trial" style={{marginTop:'22px',width:'100%'}}>Start free trial</a></div><div className="pl hi"><p style={{font:'800 13px Inter,sans-serif',letterSpacing:'.1em',textTransform:'uppercase',color:'#FDBA74'}}>Centre Plus</p><p className="pr" style={{marginTop:'8px',color:'#fff'}}>₦3,500<span style={{font:'600 15px Inter,sans-serif',color:'#CBD5E1'}}> per student per month</span></p><p style={{font:'500 14px Inter,sans-serif',color:'#CBD5E1',marginTop:'6px'}}>Everything in Standard, plus more ways to reach and help students.</p><div style={{marginTop:'14px'}}><div className="li" style={{color:'#E2E8F0'}}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{flex:'none',color:'#FDBA74'}}><path d="M5 12l5 5 9-10" /></svg>WhatsApp notices for parents</div><div className="li" style={{color:'#E2E8F0'}}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{flex:'none',color:'#FDBA74'}}><path d="M5 12l5 5 9-10" /></svg>AI question generation</div><div className="li" style={{color:'#E2E8F0'}}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{flex:'none',color:'#FDBA74'}}><path d="M5 12l5 5 9-10" /></svg>AI performance analysis</div><div className="li" style={{color:'#E2E8F0'}}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{flex:'none',color:'#FDBA74'}}><path d="M5 12l5 5 9-10" /></svg>Everything in Centre Standard</div><a className="btn pr" href="#trial" style={{marginTop:'22px',width:'100%'}}>Start free trial</a></div></div></div></div></div></section><section className="dk sec" id="trial"><div className="w"><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:'48px',alignItems:'start'}}><div><p className="kick">Free for 14 days</p><h2 className="sx" style={{color:'#fff',marginTop:'8px'}}>Start your free trial.</h2><p className="sub" style={{marginTop:'14px'}}>Tell us about your centre. Your centre is created straight away and your login details arrive by email.</p><div className="li" style={{color:'#E2E8F0'}}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{flex:'none',color:'#FDBA74'}}><path d="M5 12l5 5 9-10" /></svg>No setup work on your side</div><div className="li" style={{color:'#E2E8F0'}}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{flex:'none',color:'#FDBA74'}}><path d="M5 12l5 5 9-10" /></svg>Up to 10 students during the trial</div><div className="li" style={{color:'#E2E8F0'}}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{flex:'none',color:'#FDBA74'}}><path d="M5 12l5 5 9-10" /></svg>Your details are used only to set up your centre</div></div>{(notDone) && (<><form className="fm" noValidate onSubmit={submit} aria-label="Request a free trial"><div className="fl"><label htmlFor="a1">Full name</label><input className="in" id="a1" type="text" autoComplete="name" value={f.fullName} onChange={on.fullName} aria-invalid={inv.fullName} />{(er.fullName) && (<><span className="er" role="alert">{er.fullName}</span></>)}</div><div className="fl"><label htmlFor="a2">Centre name</label><input className="in" id="a2" type="text" value={f.centre} onChange={on.centre} aria-invalid={inv.centre} />{(er.centre) && (<><span className="er" role="alert">{er.centre}</span></>)}</div><div className="fl"><label htmlFor="a3">Email</label><input className="in" id="a3" type="email" autoComplete="email" value={f.email} onChange={on.email} aria-invalid={inv.email} />{(er.email) && (<><span className="er" role="alert">{er.email}</span></>)}</div><div className="fl"><label htmlFor="a4">Phone</label><input className="in" id="a4" type="tel" autoComplete="tel" value={f.phone} onChange={on.phone} aria-invalid={inv.phone} />{(er.phone) && (<><span className="er" role="alert">{er.phone}</span></>)}</div><div className="fl"><label htmlFor="a5">State</label><select className="in" id="a5" value={f.state} onChange={on.state} aria-invalid={inv.state}><option value="">Choose a state</option><option value="Abia">Abia</option><option value="Adamawa">Adamawa</option><option value="Akwa Ibom">Akwa Ibom</option><option value="Anambra">Anambra</option><option value="Bauchi">Bauchi</option><option value="Bayelsa">Bayelsa</option><option value="Benue">Benue</option><option value="Borno">Borno</option><option value="Cross River">Cross River</option><option value="Delta">Delta</option><option value="Ebonyi">Ebonyi</option><option value="Edo">Edo</option><option value="Ekiti">Ekiti</option><option value="Enugu">Enugu</option><option value="Gombe">Gombe</option><option value="Imo">Imo</option><option value="Jigawa">Jigawa</option><option value="Kaduna">Kaduna</option><option value="Kano">Kano</option><option value="Katsina">Katsina</option><option value="Kebbi">Kebbi</option><option value="Kogi">Kogi</option><option value="Kwara">Kwara</option><option value="Lagos">Lagos</option><option value="Nasarawa">Nasarawa</option><option value="Niger">Niger</option><option value="Ogun">Ogun</option><option value="Ondo">Ondo</option><option value="Osun">Osun</option><option value="Oyo">Oyo</option><option value="Plateau">Plateau</option><option value="Rivers">Rivers</option><option value="Sokoto">Sokoto</option><option value="Taraba">Taraba</option><option value="Yobe">Yobe</option><option value="Zamfara">Zamfara</option><option value="FCT Abuja">FCT Abuja</option></select>{(er.state) && (<><span className="er" role="alert">{er.state}</span></>)}</div><div className="fl"><label htmlFor="a6">City</label><input className="in" id="a6" type="text" value={f.city} onChange={on.city} aria-invalid={inv.city} />{(er.city) && (<><span className="er" role="alert">{er.city}</span></>)}</div><div className="fl"><label htmlFor="a7">How many students do you teach?</label><input className="in" id="a7" type="number" min="1" value={f.students} onChange={on.students} aria-invalid={inv.students} />{(er.students) && (<><span className="er" role="alert">{er.students}</span></>)}</div><div className="fl" style={{gridColumn:'1/-1'}}><span className="lb">Exams you prepare students for</span><div style={{display:'flex',flexWrap:'wrap',gap:'8px'}}><label className="cb"><input type="checkbox" checked={ex.jamb} onChange={tog.jamb} />JAMB</label><label className="cb"><input type="checkbox" checked={ex.waec} onChange={tog.waec} />WAEC</label><label className="cb"><input type="checkbox" checked={ex.neco} onChange={tog.neco} />NECO</label><label className="cb"><input type="checkbox" checked={ex.post} onChange={tog.post} />Post-UTME</label></div></div><label className="cb" style={{gridColumn:'1/-1',borderRadius:'14px'}}><input type="checkbox" checked={skip} onChange={toggleSkip} />Request a 20% discount</label>{(skip) && (<><p style={{gridColumn:'1/-1',font:'600 13px Inter,sans-serif',color:'#9A3412'}}>The 20% discount applies when you pay upfront for a minimum number of students in one payment, and you enjoy it from day one. We will confirm the exact minimum for your centre.</p></>)}<div style={{gridColumn:'1/-1'}}><label style={{display:'flex',gap:'10px',alignItems:'flex-start',font:'500 14px/1.45 Inter,sans-serif',color:'#334155',minHeight:'44px'}}><input type="checkbox" checked={consent} onChange={toggleConsent} aria-invalid={invConsent} style={{width:'20px',height:'20px',marginTop:'2px',flex:'none'}} />I agree to be contacted about my request and to the Privacy policy and Terms.</label>{(er.consent) && (<><span className="er" role="alert">{er.consent}</span></>)}</div><input type="text" name="website" id="hp-website" tabIndex={-1} autoComplete="off" aria-hidden="true" defaultValue="" style={{display:'none'}} />{formError ? <p className="er" style={{gridColumn:'1/-1',margin:0}} role="alert">{formError}</p> : null}<button className="btn pr" type="submit" disabled={sending} style={{gridColumn:'1/-1',fontSize:'16px'}}>{submitLabel}</button><p style={{gridColumn:'1/-1',font:'500 13px Inter,sans-serif',color:'#475569'}}>Your access code, login email and temporary password arrive by email right after you start.</p></form></>)}{(done) && (<><div className="fm" style={{display:'block'}} role="status"><div style={{width:'52px',height:'52px',borderRadius:'50%',background:'#DCFCE7',color:'#166534',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:'16px'}}><svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg></div><h3 style={{font:'800 24px Inter,sans-serif',margin:'0 0 8px'}}>Check your email</h3><p style={{font:'500 16px/1.55 Inter,sans-serif',color:'#334155',margin:'0'}}>We sent a link to <b>{emailShown}</b>. Open it to confirm your address. The link expires after two days.</p><p className="lb" style={{margin:'22px 0 4px'}}>What happens next</p><div className="li"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{flex:'none',color:'#15803D'}}><path d="M5 12l5 5 9-10" /></svg>You confirm your email address</div><div className="li"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{flex:'none',color:'#15803D'}}><path d="M5 12l5 5 9-10" /></svg>Our team reviews your request and sets up your centre</div><div className="li"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{flex:'none',color:'#15803D'}}><path d="M5 12l5 5 9-10" /></svg>You get your centre code and sign in as the owner</div><button className="btn lt" type="button" onClick={reset} style={{marginTop:'22px'}}>Edit my details</button><p style={{font:'500 12px Inter,sans-serif',color:'#475569',margin:'14px 0 0'}}>Design preview: nothing was sent.</p></div></>)}</div></div></section><section className="sec" id="faq"><div className="w" style={{maxWidth:'860px'}}><h2 className="sx">Questions, answered.</h2><div style={{marginTop:'28px'}}><details className="fq" open=""><summary>Do students and tutors need to install anything?</summary><p>No app store needed. Tutorial OS runs in the browser, and anyone can add it to their phone home screen to use it like an app.</p></details><details className="fq"><summary>How does pricing work?</summary><p>You pay per student seat, per month: ₦2,000 on Centre Standard or ₦3,500 on Centre Plus.</p></details><details className="fq"><summary>Which exams does it support?</summary><p>Practice tests and mock exams are built around JAMB, WAEC and NECO.</p></details><details className="fq"><summary>What happens after I start my free trial?</summary><p>Your centre is created right away. Your access code, login email and temporary password arrive by email, and you are in.</p></details><details className="fq"><summary>Will my students see Tutorial OS branding?</summary><p>No. Your centre's name, logo and colours appear on your app, your portals and your landing page.</p></details></div></div></section><section className="dk" style={{padding:'72px 0'}}><div className="w" style={{textAlign:'center'}}><h2 className="sx" style={{color:'#fff'}}>Ready to run your centre on one system?</h2><p className="sub" style={{margin:'14px auto 0'}}>Start free for 14 days. Setup is instant.</p><a className="btn pr" href="#trial" style={{marginTop:'28px'}}>Start your free trial</a></div></section><footer className="dk" id="signin" style={{borderTop:'1px solid #1E293B',padding:'36px 0'}}><div className="w"><div className="bar" style={{padding:'0'}}><a className="brand" href="#top"><span className="bx"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg></span>Tutorial OS</a><nav className="lk" aria-label="Footer"><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#trial">Free trial</a><button className="lkb" type="button" onClick={onExplorePortals} style={{color:'#CBD5E1'}}>Student &amp; tutor portals</button></nav><a className="btt" href="#top" aria-label="Back to top" title="Back to top"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg></a></div><p style={{font:'500 13px Inter,sans-serif',color:'#94A3B8',marginTop:'18px'}}>© Tutorial OS. Built for tutorial centres in Nigeria.</p></div></footer></div>
    </>
  );
};
