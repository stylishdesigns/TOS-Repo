import React, { useEffect, useRef, useState } from 'react';

/**
 * SignupFlow (2026-11-13): the trial signup as separate pages instead of the
 * old popup. The landing form collects the owner's details and hands them to
 * /start, which collects the education facility's details and provisions the
 * account. /start/confirm congratulates the owner, reviews everything they
 * entered, shows their facility's URL and plan, and hands them to the app.
 * /start/app carries the install guide with the login-details notice and the
 * WhatsApp community line beneath it (no separate community page any more).
 */

const OWNER_KEY = 'tos:signup-owner';
const FACILITY_KEY = 'tos:signup-facility';
const RESULT_KEY = 'tos:signup-result';

const WHATSAPP_URL = 'https://chat.whatsapp.com/CfaN0Rt2J9IFZLsBkUUS2N?s=cl&p=a&iam=2';

export interface FlowOwner { fullName: string; email: string; phone: string; state: string; }
export interface FlowFacility { name: string; logoUrl: string; logoName: string; teachers: string; address: string; exams: string[]; students: string; consent: boolean; }
export interface FlowResult { startedAt: number; domain: string; }

// Same rule the server applies when it mints the subdomain (extendedRoutes
// slugifyName): the whole name with every space and symbol removed, nothing
// shortened apart from the 63-character DNS label limit.
export const slugForName = (raw: string) =>
  String(raw || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 63);

const readJSON = <T,>(key: string): T | null => {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const t = (x: unknown) => String(x || '').trim();

// Flow page typography: headings in Plus Jakarta Sans (already loaded in
// index.html), body in Inter, a calmer scale and more air than the popup had.
const HF = "'Plus Jakarta Sans', Inter, sans-serif";
const h1Style = { fontFamily: HF, fontWeight: 800, fontSize: 30, lineHeight: 1.15, letterSpacing: '-0.02em', color: '#0F172A', margin: '0' } as const;
const h2Style = { fontFamily: HF, fontWeight: 800, fontSize: 19, lineHeight: 1.2, color: '#0F172A', margin: '0 0 8px' } as const;
const L = { display: 'block', font: '600 13px Inter, sans-serif', color: '#334155', marginBottom: '7px' } as const;
const IN = (err?: boolean) =>
  ({ width: '100%', minHeight: '48px', borderRadius: '12px', border: err ? '1px solid #DC2626' : '1px solid #CBD5E1', padding: '10px 14px', font: '500 15px Inter, sans-serif', color: '#0F172A', background: '#fff' } as const);
const CARD = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '20px', padding: '24px 22px', marginTop: '16px' } as const;
const NOTE = '400 13px/1.55 Inter, sans-serif';

const ERR = (msg?: string) =>
  msg ? <span role="alert" style={{ display: 'block', marginTop: '6px', font: '500 13px Inter, sans-serif', color: '#DC2626' }}>{msg}</span> : null;

const NIGERIAN_STATES = ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT Abuja','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara'];

const STEPS = ['Owner details', 'Facility information', 'Confirm & plan', 'Get the app'];

const FlowHeader: React.FC = () => (
  <header className="dk">
    <div className="w bar">
      <a className="brand" href="/">
        <span className="bx" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg>
        </span>
        Tutorial OS
      </a>
      <span style={{ font: '600 13px Inter, sans-serif', color: '#94A3B8' }}>Free 14-day trial</span>
    </div>
  </header>
);

const StepStrip: React.FC<{ current: number }> = ({ current }) => (
  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '26px 0 6px' }}>
    {STEPS.map((s, i) => {
      const n = i + 1;
      const done = n < current;
      const on = n === current;
      return (
        <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', font: '700 12.5px Inter, sans-serif', color: on ? '#C2410C' : done ? '#15803D' : '#94A3B8', background: on ? '#FFF7ED' : 'transparent', border: on ? '1px solid #FDBA74' : '1px solid transparent', borderRadius: '99px', padding: '7px 12px', whiteSpace: 'nowrap' }}>
          <span style={{ width: '20px', height: '20px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#fff', background: on ? '#EA580C' : done ? '#15803D' : '#CBD5E1', flex: 'none' }}>{done ? '✓' : n}</span>
          {s}
        </span>
      );
    })}
  </div>
);

// One-shot celebration: a short confetti fall when the confirm page opens.
const CONFETTI_COLORS = ['#EA580C', '#FDBA74', '#16A34A', '#2563EB', '#F59E0B', '#7C3AED'];
const Confetti: React.FC = () => {
  const pieces = useRef(
    Array.from({ length: 34 }, (_, i) => ({
      left: (i * 29 + 7) % 100,
      delay: (i % 11) * 0.11,
      dur: 2.1 + (i % 5) * 0.28,
      size: 8 + (i % 4) * 3,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    })),
  );
  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 40 }}>
      {pieces.current.map((p, i) => (
        <span key={i} className="confetti" style={{ left: `${p.left}%`, background: p.color, width: p.size, height: Math.round(p.size * 0.45), animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }} />
      ))}
    </div>
  );
};

type NameState = { status: 'idle' | 'checking' | 'available' | 'taken'; domain: string };

// ---------------------------------------------------------------------------
// Page 1: the education facility's details. Replaces the old popup's stage 1.
// ---------------------------------------------------------------------------
export const SignupStartPage: React.FC = () => {
  const [owner] = useState<FlowOwner | null>(() => readJSON<FlowOwner>(OWNER_KEY));
  const draft = readJSON<FlowFacility>(FACILITY_KEY);
  const [name, setName] = useState(draft?.name || '');
  const [logoUrl, setLogoUrl] = useState(draft?.logoUrl || '');
  const [logoName, setLogoName] = useState(draft?.logoName || '');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [teachers, setTeachers] = useState(draft?.teachers || '');
  const [address, setAddress] = useState(draft?.address || '');
  const [ex, setEx] = useState(() => {
    const saved = draft?.exams || [];
    return { jamb: saved.includes('JAMB'), waec: saved.includes('WAEC'), neco: saved.includes('NECO'), post: saved.includes('Post-UTME'), custom: saved.some((x) => !['JAMB', 'WAEC', 'NECO', 'Post-UTME'].includes(x)) };
  });
  const [customExam, setCustomExam] = useState(() => {
    const saved = draft?.exams || [];
    return saved.filter((x) => !['JAMB', 'WAEC', 'NECO', 'Post-UTME'].includes(x)).join(', ');
  });
  const [students, setStudents] = useState(draft?.students || '');
  const [consent, setConsent] = useState(draft?.consent || false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [sending, setSending] = useState(false);

  const [nameState, setNameState] = useState<NameState>({ status: 'idle', domain: '' });
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const raw = t(name);
    if (raw.length < 2) {
      setNameState({ status: 'idle', domain: '' });
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      setNameState((p) => ({ ...p, status: 'checking' }));
      try {
        const res = await fetch(`/api/public/name-check?name=${encodeURIComponent(raw)}`);
        const data = await res.json().catch(() => ({}));
        if (data && data.ok) setNameState({ status: data.taken ? 'taken' : 'available', domain: String(data.domain || '') });
        else setNameState({ status: 'idle', domain: '' });
      } catch {
        setNameState({ status: 'idle', domain: '' });
      }
    }, 400);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [name]);

  const examTypes = () => [
    ex.jamb ? 'JAMB' : '',
    ex.waec ? 'WAEC' : '',
    ex.neco ? 'NECO' : '',
    ex.post ? 'Post-UTME' : '',
    t(customExam),
  ].filter(Boolean);

  // Keep the draft on the device so a refresh on this page loses nothing.
  useEffect(() => {
    try {
      sessionStorage.setItem(FACILITY_KEY, JSON.stringify({ name, logoUrl, logoName, teachers, address, exams: examTypes(), students, consent }));
    } catch { /* storage unavailable: the form still works, it just will not survive a refresh. */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, logoUrl, logoName, teachers, address, ex, customExam, students, consent]);

  const pickLogo = async (file: File | null) => {
    setFormError('');
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setErrors((e) => ({ ...e, logo: 'The logo can be up to 2 MB.' }));
      return;
    }
    setErrors((e) => ({ ...e, logo: '' }));
    setUploadingLogo(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('read'));
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/public/logo-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: dataUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || 'The logo could not be uploaded. Please try again.');
      setLogoUrl(String(data.url)); // one image only: a new pick replaces the old one
      setLogoName(file.name);
    } catch (err: unknown) {
      setErrors((e) => ({ ...e, logo: (err as Error)?.message || 'The logo could not be uploaded. Please try again.' }));
    } finally {
      setUploadingLogo(false);
    }
  };

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (t(name).length < 2 || t(name).length > 120) e.name = 'Please give your facility name.';
    if (!logoUrl) e.logo = 'Please upload your facility logo.';
    if (!teachers) e.teachers = 'Please choose how many teachers you have.';
    if (!t(owner?.state)) e.state = 'Please choose a state on the first step.';
    if (!t(address) || t(address).length > 200) e.address = 'Please give your facility address.';
    if (!students) e.students = 'Please choose how many students your facility has.';
    if (ex.custom && !t(customExam)) e.customExam = 'Please type the exams you prepare students for.';
    if (!ex.jamb && !ex.waec && !ex.neco && !ex.post && !ex.custom) e.exams = 'Choose at least one exam.';
    if (!consent) e.consent = 'Consent is required.';
    return e;
  };

  const submit = async () => {
    setFormError('');
    const e = validate();
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    setErrors({});
    setSending(true);
    try {
      const res = await fetch('/api/public/trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: owner?.fullName,
          businessName: name,
          email: owner?.email,
          phone: owner?.phone,
          studentCount: students,
          state: owner?.state,
          city: '',
          address,
          logoUrl,
          teacherCount: teachers,
          examTypes: examTypes(),
          consent: true,
          website: '', // honeypot: real visitors leave it empty
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not start your trial. Please try again.');
      try {
        sessionStorage.setItem(RESULT_KEY, JSON.stringify({ startedAt: Date.now(), domain: nameState.domain || `${slugForName(name)}.tutorialos.com` }));
      } catch { /* ignore */ }
      window.location.assign('/start/confirm');
    } catch (err: unknown) {
      setFormError((err as Error)?.message || 'Could not start your trial. Please try again.');
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (!owner) window.location.replace('/');
  }, [owner]);
  if (!owner) return null;

  const chip = (key: keyof typeof ex, label: string) => (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', border: ex[key] ? '1.5px solid #EA580C' : '1px solid #CBD5E1', borderRadius: '12px', padding: '10px 14px', font: '600 14px Inter, sans-serif', color: ex[key] ? '#9A3412' : '#334155', background: ex[key] ? '#FFF7ED' : '#fff', minHeight: '46px', cursor: 'pointer' }}>
      <input type="checkbox" checked={ex[key]} onChange={() => { setEx((p) => ({ ...p, [key]: !p[key] })); setErrors((e2) => ({ ...e2, exams: '' })); }} style={{ width: '18px', height: '18px' }} />
      {label}
    </label>
  );

  return (
    <div className="pg">
      <FlowHeader />
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '0 20px 72px' }}>
        <StepStrip current={2} />
        <p style={{ margin: '0 0 16px' }}><a href="/#trial" style={{ font: '600 14px Inter, sans-serif', color: '#C2410C', textDecoration: 'underline' }}>&larr; Back</a></p>
        <h1 style={h1Style}>About your education facility</h1>
        <p style={{ font: '500 15px/1.6 Inter, sans-serif', color: '#475569', margin: '10px 0 0' }}>
          Signing up as <b>{owner.fullName}</b> ({owner.email}). Not you? <a href="/" style={{ textDecoration: 'underline', color: '#C2410C' }}>Go back</a>.
        </p>

        <div style={CARD}>
          <div style={{ display: 'grid', gap: '16px' }}>
            <div>
              <label htmlFor="w1-name" style={L}>Name of your education facility</label>
              <input id="w1-name" type="text" value={name} onChange={(ev) => setName(ev.target.value)} aria-invalid={errors.name ? true : false} style={IN(!!errors.name)} />
              {nameState.status !== 'idle' && nameState.domain && (
                <p style={{ margin: '8px 0 0', font: '600 13.5px Inter, sans-serif', color: nameState.status === 'available' ? '#15803D' : nameState.status === 'taken' ? '#DC2626' : '#64748B' }}>
                  {nameState.status === 'checking' && `Checking ${nameState.domain}...`}
                  {nameState.status === 'available' && `${nameState.domain} is available for your facility.`}
                  {nameState.status === 'taken' && `${nameState.domain} has been taken. Try a different name.`}
                </p>
              )}
              {ERR(errors.name)}
            </div>

            <div>
              <span style={L}>Facility logo</span>
              <label htmlFor="w1-logo" style={{ display: 'block', border: logoUrl ? '1.5px solid #BBF7D0' : '2px dashed #CBD5E1', borderRadius: '16px', padding: logoUrl ? '14px' : '26px 18px', textAlign: 'center', cursor: 'pointer', background: logoUrl ? '#F0FDF4' : '#F8FAFC' }}>
                {logoUrl ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'left' }}>
                    <img src={logoUrl} alt="Facility logo preview" style={{ width: '72px', height: '72px', objectFit: 'contain', borderRadius: '12px', background: '#fff', border: '1px solid #E2E8F0', padding: '6px', flex: 'none' }} />
                    <span>
                      <b style={{ display: 'block', font: '700 15px Inter, sans-serif', color: '#166534' }}>Logo added</b>
                      <span style={{ display: 'block', font: '500 13px/1.5 Inter, sans-serif', color: '#475569', marginTop: '3px' }}>{logoName || 'Your image'} · click to replace it</span>
                    </span>
                  </span>
                ) : (
                  <>
                    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" style={{ color: '#94A3B8', marginBottom: '8px' }}><path d="M12 5v14M5 12h14" /></svg>
                    <b style={{ display: 'block', font: '700 15px Inter, sans-serif', color: '#334155' }}>Click to upload your logo</b>
                    <span style={{ display: 'block', font: '500 13px/1.5 Inter, sans-serif', color: '#64748B', marginTop: '4px' }}>PNG, JPG or WebP, up to 2 MB. One image. It becomes your app icon and splash screen.</span>
                  </>
                )}
              </label>
              <input id="w1-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={(ev) => { const file = ev.target.files && ev.target.files[0] ? ev.target.files[0] : null; ev.target.value = ''; pickLogo(file); }} style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }} />
              {uploadingLogo && <p style={{ margin: '8px 0 0', font: '600 13px Inter, sans-serif', color: '#C2410C' }}>Uploading your logo...</p>}
              {ERR(errors.logo)}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              <div>
                <label htmlFor="w1-teachers" style={L}>Number of teachers</label>
                <select id="w1-teachers" value={teachers} onChange={(ev) => setTeachers(ev.target.value)} aria-invalid={errors.teachers ? true : false} style={{ ...IN(!!errors.teachers), background: '#fff' }}>
                  <option value="">Choose one</option>
                  <option value="1-5">1 to 5 teachers</option>
                  <option value="6-10">6 to 10 teachers</option>
                  <option value="11-20">11 to 20 teachers</option>
                  <option value="21-50">21 to 50 teachers</option>
                  <option value="50+">More than 50 teachers</option>
                </select>
                {ERR(errors.teachers)}
              </div>

              <div>
                <label htmlFor="w1-state" style={L}>State</label>
                <select id="w1-state" value={owner.state} disabled aria-readonly="true" style={{ width: '100%', minHeight: '48px', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '10px 14px', font: '500 15px Inter, sans-serif', color: '#475569', background: '#F1F5F9' }}>
                  <option value={owner.state}>{owner.state || 'Chosen on the first step'}</option>
                </select>
                <p style={{ margin: '6px 0 0', font: '400 12px Inter, sans-serif', color: '#64748B' }}>You chose your state on the first step.</p>
              </div>
            </div>

            <div>
              <label htmlFor="w1-address" style={L}>Facility address</label>
              <input id="w1-address" type="text" value={address} onChange={(ev) => setAddress(ev.target.value)} aria-invalid={errors.address ? true : false} style={IN(!!errors.address)} />
              {ERR(errors.address)}
            </div>

            <div>
              <span style={L}>Exams you prepare students for</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {chip('jamb', 'JAMB')}
                {chip('waec', 'WAEC')}
                {chip('neco', 'NECO')}
                {chip('post', 'Post-UTME')}
                {chip('custom', 'Custom')}
              </div>
              {ex.custom && (
                <div style={{ marginTop: '10px' }}>
                  <input type="text" placeholder="Type the exams you prepare students for, e.g. IGCSE, A-Level" value={customExam} onChange={(ev) => setCustomExam(ev.target.value)} aria-invalid={errors.customExam ? true : false} style={IN(!!errors.customExam)} />
                  {ERR(errors.customExam)}
                </div>
              )}
              {ERR(errors.exams)}
            </div>

            <div>
              <label htmlFor="w1-students" style={L}>How many students does your facility have?</label>
              <select id="w1-students" value={students} onChange={(ev) => setStudents(ev.target.value)} aria-invalid={errors.students ? true : false} style={{ ...IN(!!errors.students), background: '#fff' }}>
                <option value="">Choose one</option>
                <option value="1 to 10">1 to 10 students</option>
                <option value="11 to 20">11 to 20 students</option>
                <option value="21 to 30">21 to 30 students</option>
                <option value="31 to 50">31 to 50 students</option>
                <option value="51 to 100">51 to 100 students</option>
                <option value="More than 100">More than 100 students</option>
              </select>
              {ERR(errors.students)}
            </div>

            <div>
              <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', font: '500 14px/1.45 Inter, sans-serif', color: '#334155', cursor: 'pointer' }}>
                <input type="checkbox" checked={consent} onChange={() => { setConsent((p) => !p); setErrors((e2) => ({ ...e2, consent: '' })); }} aria-invalid={errors.consent ? true : false} style={{ width: '20px', height: '20px', marginTop: '2px', flex: 'none' }} />
                I agree to be contacted about my request and to the Privacy policy and Terms.
              </label>
              {ERR(errors.consent)}
            </div>
          </div>

          {formError && <p role="alert" style={{ margin: '14px 0 0', font: '600 14px Inter, sans-serif', color: '#DC2626' }}>{formError}</p>}
          <button type="button" className="btn pr" onClick={submit} disabled={sending} style={{ marginTop: '20px', width: '100%', minHeight: '50px', border: 'none', background: sending ? '#FB923C' : '#EA580C', cursor: sending ? 'wait' : 'pointer' }}>
            {sending ? 'Setting up your facility...' : 'Continue'}
          </button>
        </div>
      </main>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Page 2: congratulations, the review of everything entered, the facility's
// URL and its plan, then the hand-off to the app.
// ---------------------------------------------------------------------------
export const SignupConfirmPage: React.FC = () => {
  const [owner] = useState<FlowOwner | null>(() => readJSON<FlowOwner>(OWNER_KEY));
  const [facility] = useState<FlowFacility | null>(() => readJSON<FlowFacility>(FACILITY_KEY));
  const [result] = useState<FlowResult | null>(() => readJSON<FlowResult>(RESULT_KEY));

  useEffect(() => {
    if (!owner || !facility || !result) window.location.replace('/start');
  }, [owner, facility, result]);
  if (!owner || !facility || !result) return null;

  const endsOn = new Date(result.startedAt + 14 * 24 * 3600 * 1000).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const domain = result.domain || `${slugForName(facility.name)}.tutorialos.com`;
  const firstName = t(owner.fullName).split(/\s+/)[0] || 'there';
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`https://${domain}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable: the link is selectable on the page. */ }
  };

  const row = (label: string, value: React.ReactNode) => (
    <div key={label} style={{ display: 'flex', gap: '12px', padding: '9px 0', borderBottom: '1px solid #F1F5F9', alignItems: 'flex-start' }}>
      <span style={{ font: '700 12px Inter, sans-serif', letterSpacing: '0.05em', textTransform: 'uppercase', color: '#94A3B8', width: '92px', flex: 'none', paddingTop: '2px' }}>{label}</span>
      <span style={{ font: '500 14.5px/1.5 Inter, sans-serif', color: '#0F172A', flex: 1, wordBreak: 'break-word' }}>{value}</span>
    </div>
  );

  return (
    <div className="pg">
      <Confetti />
      <FlowHeader />
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '0 20px 72px' }}>
        <StepStrip current={3} />
        <p style={{ margin: '0 0 16px' }}><a href="/start" style={{ font: '600 14px Inter, sans-serif', color: '#C2410C', textDecoration: 'underline' }}>&larr; Back</a></p>
        <div role="status" style={{ background: 'linear-gradient(135deg, #FFF7ED, #FEF3C7)', border: '1px solid #FDBA74', borderRadius: '20px', padding: '22px 20px', display: 'flex', gap: '14px', alignItems: 'center', marginTop: '14px' }}>
          <span style={{ width: '46px', height: '46px', borderRadius: '50%', background: '#16A34A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
          </span>
          <div>
            <h1 style={{ ...h1Style, fontSize: 25, margin: '0 0 4px' }}>Congratulations, {firstName}!</h1>
            <p style={{ font: '500 15px/1.55 Inter, sans-serif', color: '#7C2D12' }}>{facility.name} is set up and your free trial has started.</p>
          </div>
        </div>

        <div style={CARD}>
          <h2 style={h2Style}>What you signed up with</h2>
          <div style={{ margin: '4px 0 0' }}>
            {row('Owner', owner.fullName)}
            {row('Email', owner.email)}
            {row('Phone', owner.phone)}
            {row('Facility', <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>{facility.logoUrl && <img src={facility.logoUrl} alt="Facility logo" style={{ width: '34px', height: '34px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC', padding: '2px' }} />}{facility.name}</span>)}
            {row('State', owner.state)}
            {row('Address', facility.address)}
            {row('Teachers', facility.teachers)}
            {row('Students', facility.students)}
            {row('Exams', facility.exams.join(', '))}
          </div>
        </div>

        <div style={CARD}>
          <h2 style={h2Style}>Your facility's website</h2>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ background: '#0F172A', color: '#FDBA74', borderRadius: '14px', padding: '14px 16px', fontFamily: HF, fontWeight: 800, fontSize: 19, wordBreak: 'break-all', flex: '1 1 260px' }}>{domain}</span>
            <button type="button" onClick={copy} style={{ minHeight: '48px', padding: '0 18px', borderRadius: '12px', border: '1px solid #CBD5E1', background: '#fff', font: '700 14px Inter, sans-serif', color: '#334155', cursor: 'pointer' }}>{copied ? 'Copied' : 'Copy link'}</button>
          </div>
          <p style={{ font: '500 14.5px/1.6 Inter, sans-serif', color: '#475569', margin: '12px 0 0' }}>
            This address is your facility's landing page. Share it on flyers, WhatsApp and social media to market your facility, promote your programmes and let students reach you and fill your forms.
          </p>
        </div>

        <div style={CARD}>
          <h2 style={h2Style}>Your plan</h2>
          <span className="pill" style={{ marginBottom: '12px' }}>Standard plan · included with your free trial</span>
          <p style={{ font: '500 15px/1.6 Inter, sans-serif', color: '#334155', margin: '10px 0 0' }}>
            Your facility starts on the <b>Standard plan</b> by default. When your trial ends it continues at <b>₦2,000 per student per month</b>.
          </p>
          <p style={{ font: '500 15px/1.6 Inter, sans-serif', color: '#0F172A', margin: '10px 0 0' }}>
            Your free trial ends on <b>{endsOn}</b>.
          </p>
        </div>

        <div style={CARD}>
          <h2 style={h2Style}>Signing in</h2>
          <p style={{ font: '500 15px/1.6 Inter, sans-serif', color: '#334155' }}>
            You are the owner and admin of {facility.name}. You can log in to your facility's portal through the app, using the login details we sent to {owner.email}.
          </p>
          <button type="button" className="btn pr" onClick={() => window.location.assign('/start/app')} style={{ marginTop: '16px', width: '100%', minHeight: '50px', border: 'none' }}>
            Continue to the app download
          </button>
        </div>
      </main>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Page 3: install the app, with the login-details notice and the WhatsApp
// community line beneath the installation area.
// ---------------------------------------------------------------------------
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export const SignupAppPage: React.FC = () => {
  const [owner] = useState<FlowOwner | null>(() => readJSON<FlowOwner>(OWNER_KEY));
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
  );
  const [justInstalled, setJustInstalled] = useState(false);

  useEffect(() => {
    if (!owner) window.location.replace('/start');
  }, [owner]);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    const media = window.matchMedia('(display-mode: standalone)');
    const onMode = () => setInstalled(media.matches);
    media.addEventListener?.('change', onMode);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      media.removeEventListener?.('change', onMode);
    };
  }, []);

  if (!owner) return null;

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === 'accepted') {
      setJustInstalled(true);
      setDeferred(null);
    }
  };

  const done = () => {
    try {
      sessionStorage.removeItem(OWNER_KEY);
      sessionStorage.removeItem(FACILITY_KEY);
      sessionStorage.removeItem(RESULT_KEY);
      sessionStorage.removeItem('tos:signup-owner-draft');
    } catch { /* ignore */ }
    window.location.assign('/');
  };

  return (
    <div className="pg">
      <FlowHeader />
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '0 20px 72px' }}>
        <StepStrip current={4} />
        <p style={{ margin: '0 0 16px' }}><a href="/start/confirm" style={{ font: '600 14px Inter, sans-serif', color: '#C2410C', textDecoration: 'underline' }}>&larr; Back</a></p>
        <h1 style={{ ...h1Style, margin: '12px 0 10px' }}>Get your own branded app</h1>
        <p style={{ font: '500 15px/1.6 Inter, sans-serif', color: '#475569' }}>
          Everything your facility runs on works best on the app: your name, your logo and your colours on every screen your students and tutors see.
        </p>

        <div style={CARD}>
          {installed ? (
            <div role="status" style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '14px', padding: '12px 14px', font: '500 14px/1.5 Inter, sans-serif', color: '#166534' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none', marginTop: '2px', color: '#15803D' }}><path d="M5 12l5 5 9-10" /></svg>
              {justInstalled ? 'The app is now on your home screen. Open it and sign in with the details from your email.' : 'You already have the app. Open it from your home screen and sign in with the details from your email.'}
            </div>
          ) : deferred ? (
            <button type="button" className="btn pr" onClick={install} style={{ width: '100%', minHeight: '52px', border: 'none', fontSize: '16px' }}>
              Install the app
            </button>
          ) : (
            <p style={{ font: '500 14px/1.6 Inter, sans-serif', color: '#475569', margin: '0' }}>
              On your phone, open Tutorial OS in your browser and use your browser's menu to install it. The steps below work on any phone.
            </p>
          )}

          <div style={{ display: 'grid', gap: '14px', marginTop: '16px' }}>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '16px', padding: '16px' }}>
              <b style={{ font: '700 15px Inter, sans-serif', color: '#0F172A', display: 'block', marginBottom: '10px' }}>Android phones</b>
              <ol style={{ margin: 0, paddingLeft: '20px', font: '400 14px/1.7 Inter, sans-serif', color: '#334155' }}>
                <li>Open Tutorial OS in Chrome on your phone.</li>
                <li>Tap the three-dot menu at the top right.</li>
                <li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li>
                <li>Confirm. Your app icon appears on your home screen.</li>
              </ol>
            </div>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '16px', padding: '16px' }}>
              <b style={{ font: '700 15px Inter, sans-serif', color: '#0F172A', display: 'block', marginBottom: '10px' }}>iPhone and iPad</b>
              <ol style={{ margin: 0, paddingLeft: '20px', font: '400 14px/1.7 Inter, sans-serif', color: '#334155' }}>
                <li>Open Tutorial OS in Safari on your phone.</li>
                <li>Tap the Share button at the bottom.</li>
                <li>Tap <b>Add to Home Screen</b>.</li>
                <li>Confirm. Your app icon appears on your home screen.</li>
              </ol>
            </div>
          </div>
        </div>

        <div role="status" style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '14px', padding: '12px 14px', marginTop: '16px', font: '500 14px/1.5 Inter, sans-serif', color: '#166534' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none', marginTop: '2px', color: '#15803D' }}><path d="M5 12l5 5 9-10" /></svg>
          Your login details have been delivered to your email ({owner.email}). It contains your access code and temporary password.
        </div>

        <div style={CARD}>
          <h2 style={h2Style}>Tutorial OS community on WhatsApp</h2>
          <p style={{ font: '500 14.5px/1.6 Inter, sans-serif', color: '#475569' }}>
            Join for webinar dates, free live guides and enquiries about the product.
          </p>
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: '50px', borderRadius: '12px', background: '#16A34A', color: '#fff', font: '700 15px Inter, sans-serif', textDecoration: 'none', marginTop: '12px' }}>
            Join the WhatsApp community
          </a>
        </div>

        <button type="button" onClick={done} style={{ marginTop: '16px', width: '100%', minHeight: '48px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#fff', color: '#334155', font: '700 15px Inter, sans-serif', cursor: 'pointer' }}>
          Done
        </button>
      </main>
    </div>
  );
};
