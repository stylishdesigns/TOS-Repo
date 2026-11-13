import React, { useEffect, useRef, useState } from 'react';

/**
 * TrialSignupModal (W1, 2026-11-13): the three-stage signup popup.
 *
 * Stage 1 - Educational facility information: facility name (with a live
 *   subdomain availability check under the field), logo upload (becomes the
 *   PWA app branding), teachers dropdown, state + address, exams with a
 *   Custom option, student count, the 20% discount request and consent.
 *   Continue provisions the facility right away and moves to stage 2 with the
 *   "login details sent" notice.
 * Stage 2 - Get the app: best experience on mobile, the app carries the
 *   facility's own branding, install guides for Android and iPhone.
 *   (Animated guides arrive in W2; static steps for now.)
 * Stage 3 - The Tutorial OS community on WhatsApp: why it matters and the
 *   join button, then back to their email for the login details.
 */

const NIGERIAN_STATES = ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara','FCT Abuja'];

const WHATSAPP_URL = 'https://chat.whatsapp.com/CfaN0Rt2J9IFZLsBkUUS2N?s=cl&p=a&iam=2';

export interface OwnerInfo {
  fullName: string;
  email: string;
  phone: string;
}

interface Props {
  open: boolean;
  owner: OwnerInfo;
  onClose: () => void;
}

const STEP_LABELS = ['Facility information', 'Get the app', 'Join the community'];

const t = (x: unknown) => String(x || '').trim();

export const TrialSignupModal: React.FC<Props> = ({ open, owner, onClose }) => {
  const [stage, setStage] = useState(1);
  const [sentNotice, setSentNotice] = useState(false);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Stage 1 fields.
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoName, setLogoName] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [teachers, setTeachers] = useState('');
  const [state, setState] = useState('');
  const [address, setAddress] = useState('');
  const [ex, setEx] = useState({ jamb: true, waec: true, neco: false, post: false, custom: false });
  const [customExam, setCustomExam] = useState('');
  const [students, setStudents] = useState('');
  const [discount, setDiscount] = useState(false);
  const [consent, setConsent] = useState(false);

  // Live name availability: debounced so typing does not hammer the endpoint.
  const [nameState, setNameState] = useState<{ status: 'idle' | 'checking' | 'available' | 'taken'; domain: string }>({ status: 'idle', domain: '' });
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const raw = name.trim();
    if (raw.length < 2) {
      setNameState({ status: 'idle', domain: '' });
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      setNameState((p) => ({ ...p, status: 'checking' }));
      try {
        const res = await fetch(`/api/public/name-check?name=${encodeURIComponent(raw)}`);
        const data = await res.json().catch(() => ({}));
        if (data && data.ok) {
          setNameState({ status: data.taken ? 'taken' : 'available', domain: String(data.domain || '') });
        } else {
          setNameState({ status: 'idle', domain: '' });
        }
      } catch {
        setNameState({ status: 'idle', domain: '' });
      }
    }, 400);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [name]);

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
      setLogoUrl(String(data.url));
      setLogoName(file.name);
    } catch (err: unknown) {
      setErrors((e) => ({ ...e, logo: (err as Error)?.message || 'The logo could not be uploaded. Please try again.' }));
    } finally {
      setUploadingLogo(false);
    }
  };

  const validateStage1 = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (t(name).length < 2 || t(name).length > 120) e.name = 'Please give your facility name.';
    if (!logoUrl) e.logo = 'Please upload your facility logo.';
    if (!teachers) e.teachers = 'Please choose how many teachers you have.';
    if (!state) e.state = 'Please choose a state.';
    if (!t(address) || t(address).length > 200) e.address = 'Please give your facility address.';
    const c = Number(students);
    if (!Number.isInteger(c) || c < 1 || c > 10000) e.students = 'How many students do you teach?';
    if (ex.custom && !t(customExam)) e.customExam = 'Please type the exams you prepare students for.';
    if (!ex.jamb && !ex.waec && !ex.neco && !ex.post && !ex.custom) e.exams = 'Choose at least one exam.';
    if (!consent) e.consent = 'Consent is required.';
    return e;
  };

  const submit = async () => {
    setFormError('');
    const e = validateStage1();
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    setErrors({});
    setSending(true);
    try {
      const examTypes = [ex.jamb ? 'JAMB' : '', ex.waec ? 'WAEC' : '', ex.neco ? 'NECO' : '', ex.post ? 'Post-UTME' : '', ex.custom ? t(customExam) : ''].filter(Boolean);
      const res = await fetch('/api/public/trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: owner.fullName,
          businessName: name,
          email: owner.email,
          phone: owner.phone,
          studentCount: Number(students),
          state,
          city: '',
          address,
          logoUrl,
          teacherCount: teachers,
          examTypes,
          skipTrial: discount,
          consent: true,
          website: '', // honeypot: real visitors leave it empty
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not start your trial. Please try again.');
      setSentNotice(true);
      setStage(2);
    } catch (err: unknown) {
      setFormError((err as Error)?.message || 'Could not start your trial. Please try again.');
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setStage(1);
      setSentNotice(false);
      setFormError('');
      setErrors({});
    }
  }, [open]);

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label="Start your free trial" style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(2,6,23,0.72)' }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: '620px', maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: '20px', padding: '24px 22px 26px', boxShadow: '0 24px 64px rgba(2,6,23,0.45)' }}>
        <button type="button" aria-label="Close" onClick={onClose} style={{ position: 'absolute', top: '14px', right: '14px', width: '40px', height: '40px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#fff', color: '#334155', font: '600 18px Inter, sans-serif', cursor: 'pointer' }}>×</button>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', margin: '2px 44px 18px 0', flexWrap: 'wrap' }}>
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            const active = stage === n;
            const done = stage > n;
            return (
              <React.Fragment key={label}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', font: '600 13px Inter, sans-serif', color: active ? '#C2410C' : done ? '#15803D' : '#64748B', whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', fontSize: '12px', color: '#fff', background: active ? '#EA580C' : done ? '#15803D' : '#CBD5E1' }}>{done ? '✓' : n}</span>
                  {label}
                </span>
                {n < STEP_LABELS.length && <span style={{ flex: 1, minWidth: '12px', height: '2px', background: stage > n ? '#86EFAC' : '#E2E8F0', borderRadius: '1px' }} />}
              </React.Fragment>
            );
          })}
        </div>

        {sentNotice && stage >= 2 && (
          <div role="status" style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '14px', padding: '12px 14px', marginBottom: '16px', font: '500 14px/1.5 Inter, sans-serif', color: '#166534' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none', marginTop: '2px', color: '#15803D' }}><path d="M5 12l5 5 9-10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Your login details have been sent to your email ({owner.email}). They include your access code and a temporary password.
          </div>
        )}

        {stage === 1 && (
          <div>
            <p style={{ margin: '0 0 4px', font: '600 13px Inter, sans-serif', color: '#C2410C', letterSpacing: '0.02em' }}>STAGE 1 OF 3</p>
            <h3 style={{ margin: '0 0 18px', font: '700 20px Inter, sans-serif', color: '#0F172A' }}>Educational facility information</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label htmlFor="w1-name" style={{ display: 'block', font: '600 14px Inter, sans-serif', color: '#334155', marginBottom: '6px' }}>Name of your educational facility</label>
                <input id="w1-name" type="text" value={name} onChange={(ev) => setName(ev.target.value)} aria-invalid={errors.name ? true : false} style={{ width: '100%', minHeight: '44px', borderRadius: '12px', border: errors.name ? '1px solid #DC2626' : '1px solid #E2E8F0', padding: '10px 14px', font: '500 15px Inter, sans-serif', color: '#0F172A' }} />
                {nameState.status !== 'idle' && nameState.domain && (
                  <p style={{ margin: '8px 0 0', font: '500 13px Inter, sans-serif', color: nameState.status === 'available' ? '#15803D' : nameState.status === 'taken' ? '#DC2626' : '#64748B' }}>
                    {nameState.status === 'checking' && `Checking ${nameState.domain}...`}
                    {nameState.status === 'available' && `${nameState.domain} is available for your facility.`}
                    {nameState.status === 'taken' && `${nameState.domain} has been taken.`}
                  </p>
                )}
                {errors.name && <span role="alert" style={{ display: 'block', marginTop: '6px', font: '500 13px Inter, sans-serif', color: '#DC2626' }}>{errors.name}</span>}
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <label htmlFor="w1-logo" style={{ display: 'block', font: '600 14px Inter, sans-serif', color: '#334155', marginBottom: '6px' }}>Facility logo</label>
                <p style={{ margin: '0 0 8px', font: '400 13px/1.5 Inter, sans-serif', color: '#64748B' }}>Upload your logo. It becomes the icon and splash screen of your own app.</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {logoUrl && <img src={logoUrl} alt="Facility logo preview" style={{ width: '56px', height: '56px', objectFit: 'contain', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#F8FAFC', padding: '4px' }} />}
                  <label htmlFor="w1-logo" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: '44px', padding: '0 18px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#fff', color: '#334155', font: '600 14px Inter, sans-serif', cursor: 'pointer' }}>{uploadingLogo ? 'Uploading...' : logoUrl ? 'Change logo' : 'Upload logo'}</label>
                  {logoName && <span style={{ font: '400 13px Inter, sans-serif', color: '#64748B', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{logoName}</span>}
                </div>
                <input id="w1-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={(ev) => pickLogo(ev.target.files && ev.target.files[0] ? ev.target.files[0] : null)} style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }} />
                {errors.logo && <span role="alert" style={{ display: 'block', marginTop: '6px', font: '500 13px Inter, sans-serif', color: '#DC2626' }}>{errors.logo}</span>}
              </div>

              <div>
                <label htmlFor="w1-teachers" style={{ display: 'block', font: '600 14px Inter, sans-serif', color: '#334155', marginBottom: '6px' }}>Number of teachers</label>
                <select id="w1-teachers" value={teachers} onChange={(ev) => setTeachers(ev.target.value)} aria-invalid={errors.teachers ? true : false} style={{ width: '100%', minHeight: '44px', borderRadius: '12px', border: errors.teachers ? '1px solid #DC2626' : '1px solid #E2E8F0', padding: '10px 14px', font: '500 15px Inter, sans-serif', color: '#0F172A', background: '#fff' }}>
                  <option value="">Choose one</option>
                  <option value="1-5">1 to 5 teachers</option>
                  <option value="6-10">6 to 10 teachers</option>
                  <option value="11-20">11 to 20 teachers</option>
                  <option value="21-50">21 to 50 teachers</option>
                  <option value="50+">More than 50 teachers</option>
                </select>
                {errors.teachers && <span role="alert" style={{ display: 'block', marginTop: '6px', font: '500 13px Inter, sans-serif', color: '#DC2626' }}>{errors.teachers}</span>}
              </div>

              <div>
                <label htmlFor="w1-state" style={{ display: 'block', font: '600 14px Inter, sans-serif', color: '#334155', marginBottom: '6px' }}>State</label>
                <select id="w1-state" value={state} onChange={(ev) => setState(ev.target.value)} aria-invalid={errors.state ? true : false} style={{ width: '100%', minHeight: '44px', borderRadius: '12px', border: errors.state ? '1px solid #DC2626' : '1px solid #E2E8F0', padding: '10px 14px', font: '500 15px Inter, sans-serif', color: '#0F172A', background: '#fff' }}>
                  <option value="">Choose a state</option>
                  {NIGERIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {errors.state && <span role="alert" style={{ display: 'block', marginTop: '6px', font: '500 13px Inter, sans-serif', color: '#DC2626' }}>{errors.state}</span>}
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <label htmlFor="w1-address" style={{ display: 'block', font: '600 14px Inter, sans-serif', color: '#334155', marginBottom: '6px' }}>Facility address</label>
                <input id="w1-address" type="text" value={address} onChange={(ev) => setAddress(ev.target.value)} aria-invalid={errors.address ? true : false} style={{ width: '100%', minHeight: '44px', borderRadius: '12px', border: errors.address ? '1px solid #DC2626' : '1px solid #E2E8F0', padding: '10px 14px', font: '500 15px Inter, sans-serif', color: '#0F172A' }} />
                {errors.address && <span role="alert" style={{ display: 'block', marginTop: '6px', font: '500 13px Inter, sans-serif', color: '#DC2626' }}>{errors.address}</span>}
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <span style={{ display: 'block', font: '600 14px Inter, sans-serif', color: '#334155', marginBottom: '8px' }}>Exams you prepare students for</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '10px 14px', font: '500 14px Inter, sans-serif', color: '#334155', minHeight: '44px', cursor: 'pointer' }}><input type="checkbox" checked={ex.jamb} onChange={() => { setEx((p) => ({ ...p, jamb: !p.jamb })); setErrors((e) => ({ ...e, exams: '' })); }} style={{ width: '18px', height: '18px' }} />JAMB</label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '10px 14px', font: '500 14px Inter, sans-serif', color: '#334155', minHeight: '44px', cursor: 'pointer' }}><input type="checkbox" checked={ex.waec} onChange={() => setEx((p) => ({ ...p, waec: !p.waec }))} style={{ width: '18px', height: '18px' }} />WAEC</label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '10px 14px', font: '500 14px Inter, sans-serif', color: '#334155', minHeight: '44px', cursor: 'pointer' }}><input type="checkbox" checked={ex.neco} onChange={() => setEx((p) => ({ ...p, neco: !p.neco }))} style={{ width: '18px', height: '18px' }} />NECO</label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '10px 14px', font: '500 14px Inter, sans-serif', color: '#334155', minHeight: '44px', cursor: 'pointer' }}><input type="checkbox" checked={ex.post} onChange={() => setEx((p) => ({ ...p, post: !p.post }))} style={{ width: '18px', height: '18px' }} />Post-UTME</label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '10px 14px', font: '500 14px Inter, sans-serif', color: '#334155', minHeight: '44px', cursor: 'pointer' }}><input type="checkbox" checked={ex.custom} onChange={() => setEx((p) => ({ ...p, custom: !p.custom }))} style={{ width: '18px', height: '18px' }} />Custom</label>
                </div>
                {ex.custom && (
                  <div style={{ marginTop: '10px' }}>
                    <input type="text" placeholder="Type the exams you prepare students for, e.g. IGCSE, A-Level" value={customExam} onChange={(ev) => setCustomExam(ev.target.value)} aria-invalid={errors.customExam ? true : false} style={{ width: '100%', minHeight: '44px', borderRadius: '12px', border: errors.customExam ? '1px solid #DC2626' : '1px solid #E2E8F0', padding: '10px 14px', font: '500 15px Inter, sans-serif', color: '#0F172A' }} />
                    {errors.customExam && <span role="alert" style={{ display: 'block', marginTop: '6px', font: '500 13px Inter, sans-serif', color: '#DC2626' }}>{errors.customExam}</span>}
                  </div>
                )}
                {errors.exams && <span role="alert" style={{ display: 'block', marginTop: '6px', font: '500 13px Inter, sans-serif', color: '#DC2626' }}>{errors.exams}</span>}
              </div>

              <div>
                <label htmlFor="w1-students" style={{ display: 'block', font: '600 14px Inter, sans-serif', color: '#334155', marginBottom: '6px' }}>How many students do you teach?</label>
                <input id="w1-students" type="number" min={1} value={students} onChange={(ev) => setStudents(ev.target.value)} aria-invalid={errors.students ? true : false} style={{ width: '100%', minHeight: '44px', borderRadius: '12px', border: errors.students ? '1px solid #DC2626' : '1px solid #E2E8F0', padding: '10px 14px', font: '500 15px Inter, sans-serif', color: '#0F172A' }} />
                {errors.students && <span role="alert" style={{ display: 'block', marginTop: '6px', font: '500 13px Inter, sans-serif', color: '#DC2626' }}>{errors.students}</span>}
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', font: '500 14px Inter, sans-serif', color: '#334155', minHeight: '44px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={discount} onChange={() => setDiscount((p) => !p)} style={{ width: '20px', height: '20px', marginTop: '2px', flex: 'none' }} />
                  Request a 20% discount
                </label>
                {discount && <p style={{ margin: '0', font: '600 13px/1.5 Inter, sans-serif', color: '#9A3412' }}>The 20% discount applies when you pay upfront for at least 10 students in one payment, and you enjoy it from day one.</p>}
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', font: '500 14px/1.45 Inter, sans-serif', color: '#334155', minHeight: '44px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={consent} onChange={() => { setConsent((p) => !p); setErrors((e) => ({ ...e, consent: '' })); }} aria-invalid={errors.consent ? true : false} style={{ width: '20px', height: '20px', marginTop: '2px', flex: 'none' }} />
                  I agree to be contacted about my request and to the Privacy policy and Terms.
                </label>
                {errors.consent && <span role="alert" style={{ display: 'block', marginTop: '6px', font: '500 13px Inter, sans-serif', color: '#DC2626' }}>{errors.consent}</span>}
              </div>
            </div>

            {formError && <p role="alert" style={{ margin: '14px 0 0', font: '500 14px Inter, sans-serif', color: '#DC2626' }}>{formError}</p>}
            <button type="button" className="btn pr" onClick={submit} disabled={sending} style={{ marginTop: '18px', width: '100%', minHeight: '48px', borderRadius: '12px', border: 'none', background: sending ? '#FB923C' : '#EA580C', color: '#fff', font: '700 15px Inter, sans-serif', cursor: sending ? 'wait' : 'pointer' }}>{sending ? 'Setting up your facility...' : 'Continue'}</button>
          </div>
        )}

        {stage === 2 && (
          <div>
            <p style={{ margin: '0 0 4px', font: '600 13px Inter, sans-serif', color: '#C2410C', letterSpacing: '0.02em' }}>STAGE 2 OF 3</p>
            <h3 style={{ margin: '0 0 10px', font: '700 20px Inter, sans-serif', color: '#0F172A' }}>Download your own branded app</h3>
            <p style={{ margin: '0 0 14px', font: '400 15px/1.6 Inter, sans-serif', color: '#334155' }}>
              You can get the best experience on the mobile app. With the app downloaded, your educational facility is branded in your own business format: your name, your logo and your colours on everything your students and tutors see.
            </p>
            <div style={{ display: 'grid', gap: '14px' }}>
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
            <button type="button" className="btn pr" onClick={() => setStage(3)} style={{ marginTop: '18px', width: '100%', minHeight: '48px', borderRadius: '12px', border: 'none', background: '#EA580C', color: '#fff', font: '700 15px Inter, sans-serif', cursor: 'pointer' }}>Next</button>
          </div>
        )}

        {stage === 3 && (
          <div>
            <p style={{ margin: '0 0 4px', font: '600 13px Inter, sans-serif', color: '#C2410C', letterSpacing: '0.02em' }}>STAGE 3 OF 3</p>
            <h3 style={{ margin: '0 0 10px', font: '700 20px Inter, sans-serif', color: '#0F172A' }}>Join the Tutorial OS community</h3>
            <p style={{ margin: '0 0 14px', font: '400 15px/1.6 Inter, sans-serif', color: '#334155' }}>
              The Tutorial OS community on WhatsApp is where webinar dates are announced and where free live guides show you how to get the best out of Tutorial OS for your facility, your students and your tutors. Questions and enquiries are answered there too.
            </p>
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: '48px', borderRadius: '12px', background: '#16A34A', color: '#fff', font: '700 15px Inter, sans-serif', textDecoration: 'none' }}>
              Join the Tutorial OS community on WhatsApp
            </a>
            <p style={{ margin: '16px 0 0', font: '400 14px/1.6 Inter, sans-serif', color: '#334155' }}>
              Then open the email we just sent you ({owner.email}), and sign in with the app using your access code and temporary password.
            </p>
            <button type="button" onClick={onClose} style={{ marginTop: '18px', width: '100%', minHeight: '48px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#fff', color: '#334155', font: '700 15px Inter, sans-serif', cursor: 'pointer' }}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
};
