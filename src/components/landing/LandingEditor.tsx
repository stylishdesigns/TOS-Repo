import React, { useEffect, useMemo, useState } from 'react';
import {
  ExternalLink, Loader2, Plus, Trash2, Check, Image as ImageIcon,
} from 'lucide-react';
import { api, Card, Field, inputCls, btnPrimary, btnGhost } from '../tos/tosShared';
import { LandingContent, LandingCard, LandingTestimonial, TEMPLATE_PRESETS, normalizeTemplateId } from '../../landing/landingContent';
import { LandingBody, LandingFormApi } from '../../landing/LandingBody';

/**
 * Landing-page editor shared by the TOS dashboard (Website tab) and the
 * facility-admin portal (Website (Landing page) section). It loads, edits,
 * saves and publishes ONE facility's public landing content; the caller picks
 * the facility by passing apiPath (/api/tos/landing/{centreId} for TOS staff,
 * /api/centre/landing for a facility admin, which the server scopes to their
 * own facility). Edits write only PUBLIC marketing content
 * (centreLandingPages/{centreId}); nothing private can enter this screen, and
 * the public page at /c/{centreId} reads only what this editor publishes.
 */

const ICON_OPTIONS = [
  { value: 'pencil', label: 'Pencil' },
  { value: 'list', label: 'List' },
  { value: 'target', label: 'Target' },
  { value: 'star', label: 'Star' },
  { value: 'users', label: 'People' },
  { value: 'clock', label: 'Clock' },
];

const ACCENTS = ['#EA580C', '#2563EB', '#059669', '#7C3AED', '#DB2777', '#B45309'];

type LandingState = LandingContent;

const asCards = (raw: any): LandingCard[] =>
  (Array.isArray(raw) ? raw : []).map((c: any) => ({ icon: c?.icon || 'star', title: String(c?.title || ''), text: String(c?.text || '') }));

const asQuotes = (raw: any): LandingTestimonial[] =>
  (Array.isArray(raw) ? raw : []).map((q: any) => ({ quote: String(q?.quote || ''), name: String(q?.name || ''), role: q?.role ? String(q.role) : undefined }));

function toState(raw: any): LandingState {
  return {
    templateId: normalizeTemplateId(raw?.templateId),
    accent: raw?.accent || '#EA580C',
    ribbon: raw?.ribbon || '',
    hero: {
      headline: raw?.hero?.headline || '',
      subText: raw?.hero?.subText || '',
      photoUrl: raw?.hero?.photoUrl || '',
      buttons: (Array.isArray(raw?.hero?.buttons) ? raw.hero.buttons : []).map((b: any) => ({ label: String(b?.label || ''), href: String(b?.href || '/'), kind: b?.kind === 'ghost' ? 'ghost' : 'primary' })),
      badges: (Array.isArray(raw?.hero?.badges) ? raw.hero.badges : []).map(String),
    },
    stats: (Array.isArray(raw?.stats) ? raw.stats : []).map((s: any) => ({ value: String(s?.value || ''), label: String(s?.label || '') })),
    programs: { title: raw?.programs?.title || '', lead: raw?.programs?.lead || '', cards: asCards(raw?.programs?.cards) },
    whyUs: { title: raw?.whyUs?.title || '', lead: raw?.whyUs?.lead || '', cards: asCards(raw?.whyUs?.cards) },
    testimonials: { title: raw?.testimonials?.title || '', lead: raw?.testimonials?.lead || '', quotes: asQuotes(raw?.testimonials?.quotes) },
    contact: {
      title: raw?.contact?.title || '',
      text: raw?.contact?.text || '',
      ctaLabel: raw?.contact?.ctaLabel || '',
      address: raw?.contact?.address || '',
      phone: raw?.contact?.phone || '',
      hours: raw?.contact?.hours || '',
    },
    footer: { copyright: raw?.footer?.copyright || '' },
    socials: {
      facebook: raw?.socials?.facebook || '',
      instagram: raw?.socials?.instagram || '',
      tiktok: raw?.socials?.tiktok || '',
    },
  };
}

const SectionHead: React.FC<{ n: number; title: string }> = ({ n, title }) => (
  <h3 className="text-sm font-bold text-white flex items-center gap-2">
    <span className="w-5 h-5 rounded-md bg-orange-500/20 text-orange-300 text-[11px] font-black flex items-center justify-center">{n}</span>
    {title}
  </h3>
);

export const LandingEditor: React.FC<{ apiPath: string; refreshKey?: number }> = ({ apiPath, refreshKey = 0 }) => {
  const [centreId, setCentreId] = useState('');
  const [content, setContent] = useState<LandingState | null>(null);
  const [published, setPublished] = useState(false);
  const [centreName, setCentreName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      const d = await api(apiPath);
      setCentreId(String(d.centreId || ''));
      setCentreName(String(d.centreName || ''));
      setContent(toState(d.content));
      setPublished(d.published === true);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiPath, refreshKey]);

  const set = (patch: Partial<LandingState>) => setContent((c) => (c ? { ...c, ...patch } : c));
  const setHero = (patch: Partial<LandingState['hero']>) => setContent((c) => (c ? { ...c, hero: { ...c.hero, ...patch } } : c));

  const save = async (nextPublished: boolean) => {
    if (!content) return;
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      const d = await api(apiPath, { method: 'PUT', body: { content, published: nextPublished } });
      setPublished(d.published === true);
      setMsg(nextPublished ? 'Saved and published. The live page is updated.' : 'Saved as a draft. The live page is unchanged until you publish.');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const uploadHero = async (file: File) => {
    setUploading(true);
    setErr('');
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('Hero photos can be up to 8 MB.');
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error('That file could not be read.'));
        r.readAsDataURL(file);
      });
      const d = await api(`${apiPath}/hero-image`, { method: 'POST', body: { dataUrl } });
      setHero({ photoUrl: String(d.url || '') });
      setMsg('Hero photo uploaded. Remember to save.');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setUploading(false);
    }
  };

  const liveUrl = centreId ? `${window.location.origin}/c/${centreId}` : '';

  return (
    <div className="space-y-5">
      {liveUrl ? (
        <div className="flex flex-wrap items-center gap-3">
          <a href={liveUrl} target="_blank" rel="noreferrer" className={`${btnGhost} min-h-[44px] inline-flex items-center gap-2`}>
            <ExternalLink className="w-4 h-4" /> View {centreName || 'live'} page
          </a>
        </div>
      ) : null}

      {err && <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-100">{err}</div>}
      {msg && <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-100 flex items-center gap-2"><Check className="w-3.5 h-3.5" /> {msg}</div>}

      {loading || !content ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading content…</div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_340px] gap-5 items-start">
          <div className="space-y-5">
            <Card title="Template">
              <p className="text-[12px] text-slate-500 mb-3">Pick a look for your app. Your text, photos and details stay exactly as they are; each look brings its own fonts, corners and colour mood. You can still fine-tune the accent colour under Top of page.</p>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {TEMPLATE_PRESETS.map((p) => {
                  const on = content.templateId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => set({ templateId: p.id, accent: p.accent })}
                      className={`text-left rounded-xl p-4 border transition ${on ? 'border-orange-400 bg-orange-500/10' : 'border-white/10 bg-slate-950/40 hover:border-white/25'}`}
                    >
                      <div className="flex h-10 rounded-lg overflow-hidden mb-3">
                        <span className="flex-[2]" style={{ background: p.swatch[0] }} />
                        <span className="flex-[3]" style={{ background: p.swatch[1] }} />
                        <span className="flex-[2]" style={{ background: p.swatch[2] }} />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-white">{p.name}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-none ${on ? 'bg-orange-500 text-white' : 'bg-slate-700 text-slate-300'}`}>{on ? 'In use' : 'Use'}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-snug">{p.desc}</p>
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card title="Top of page">
              <div className="space-y-4">
                <SectionHead n={1} title="Hero" />
                <Field label="Announcement ribbon (optional)">
                  <input className={inputCls} maxLength={120} value={content.ribbon || ''} onChange={(e) => set({ ribbon: e.target.value })} placeholder="Admissions open · 2026/27 session" />
                </Field>
                <Field label="Headline">
                  <input className={inputCls} maxLength={140} value={content.hero.headline} onChange={(e) => setHero({ headline: e.target.value })} />
                </Field>
                <Field label="Sub-text">
                  <textarea className={`${inputCls} min-h-[80px]`} maxLength={500} value={content.hero.subText} onChange={(e) => setHero({ subText: e.target.value })} />
                </Field>
                <Field label="Hero photo (optional)">
                  <div className="flex items-center gap-3 flex-wrap">
                    {content.hero.photoUrl ? (
                      <img src={content.hero.photoUrl} alt="Hero preview" className="h-16 w-24 rounded-lg object-cover border border-white/10" />
                    ) : (
                      <div className="h-16 w-24 rounded-lg bg-slate-800 border border-white/10 flex items-center justify-center text-slate-500"><ImageIcon className="w-5 h-5" /></div>
                    )}
                    <label className="inline-flex items-center gap-2 text-xs font-bold px-3 py-2.5 rounded-lg bg-slate-800 border border-white/10 text-white hover:bg-slate-700 cursor-pointer min-h-[44px]">
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                      {content.hero.photoUrl ? 'Replace photo' : 'Upload photo'}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadHero(f); e.currentTarget.value = ''; }} />
                    </label>
                    {content.hero.photoUrl ? (
                      <button onClick={() => setHero({ photoUrl: '' })} className="text-xs text-rose-300 hover:text-rose-200 min-h-[44px] px-2">Remove</button>
                    ) : null}
                  </div>
                </Field>
                <div className="grid sm:grid-cols-2 gap-3">
                  {content.hero.buttons.map((b, i) => (
                    <div key={i} className="space-y-2">
                      <input className={inputCls} maxLength={40} value={b.label} onChange={(e) => { const buttons = [...content.hero.buttons]; buttons[i] = { ...b, label: e.target.value }; setHero({ buttons }); }} placeholder={`Button ${i + 1} label`} />
                      <select className={inputCls} value={b.kind} onChange={(e) => { const buttons = [...content.hero.buttons]; buttons[i] = { ...b, kind: e.target.value === 'ghost' ? 'ghost' : 'primary' }; setHero({ buttons }); }} aria-label={`Button ${i + 1} style`}>
                        <option value="primary">Filled</option>
                        <option value="ghost">Outline</option>
                      </select>
                    </div>
                  ))}
                </div>
                <Field label="Exam badges">
                  <div className="flex flex-wrap gap-2">
                    {content.hero.badges.map((b, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/15 text-orange-200 text-xs font-semibold px-3 py-1.5">
                        {b}
                        <button onClick={() => setHero({ badges: content.hero.badges.filter((_, j) => j !== i) })} aria-label={`Remove badge ${b}`}><Trash2 className="w-3 h-3" /></button>
                      </span>
                    ))}
                    {content.hero.badges.length < 8 ? (
                      <AddChip label="Add badge" onAdd={(v) => setHero({ badges: [...content.hero.badges, v.slice(0, 48)] })} placeholder="e.g. WAEC" />
                    ) : null}
                  </div>
                </Field>
                <Field label="Accent colour">
                  <div className="flex gap-2">
                    {ACCENTS.map((a) => (
                      <button key={a} onClick={() => set({ accent: a })} aria-label={`Accent ${a}`} className={`w-9 h-9 rounded-full border-2 ${content.accent === a ? 'border-white' : 'border-transparent'}`} style={{ background: a }} />
                    ))}
                  </div>
                </Field>
              </div>
            </Card>

            <Card title="Numbers strip">
              <div className="space-y-3">
                {content.stats.map((s, i) => (
                  <div key={i} className="grid grid-cols-[110px_1fr_auto] gap-2 items-center">
                    <input className={inputCls} maxLength={12} value={s.value} onChange={(e) => { const stats = [...content.stats]; stats[i] = { ...s, value: e.target.value }; set({ stats }); }} placeholder="500+" aria-label={`Stat ${i + 1} value`} />
                    <input className={inputCls} maxLength={60} value={s.label} onChange={(e) => { const stats = [...content.stats]; stats[i] = { ...s, label: e.target.value }; set({ stats }); }} placeholder="students taught" aria-label={`Stat ${i + 1} label`} />
                    <button onClick={() => set({ stats: content.stats.filter((_, j) => j !== i) })} className="text-rose-300 hover:text-rose-200 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label={`Remove stat ${i + 1}`}><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
                {content.stats.length < 4 ? <AddChip label="Add number" onAdd={(v) => { const [value, ...rest] = v.split('|'); set({ stats: [...content.stats, { value: (value || '').trim().slice(0, 12), label: rest.join('|').trim().slice(0, 60) }] }); }} placeholder="96% | exam pass rate" /> : null}
              </div>
            </Card>

            <Card title="Programs">
              <div className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <input className={inputCls} maxLength={80} value={content.programs.title} onChange={(e) => set({ programs: { ...content.programs, title: e.target.value } })} placeholder="Section title" aria-label="Programs title" />
                  <input className={inputCls} maxLength={300} value={content.programs.lead} onChange={(e) => set({ programs: { ...content.programs, lead: e.target.value } })} placeholder="Section sub-text" aria-label="Programs sub-text" />
                </div>
                {content.programs.cards.map((c, i) => (
                  <CardEditor key={i} card={c} index={i} onChange={(card) => { const cards = [...content.programs.cards]; cards[i] = card; set({ programs: { ...content.programs, cards } }); }} onRemove={() => set({ programs: { ...content.programs, cards: content.programs.cards.filter((_, j) => j !== i) } })} />
                ))}
                {content.programs.cards.length < 6 ? <AddChip label="Add program" onAdd={(v) => set({ programs: { ...content.programs, cards: [...content.programs.cards, { icon: 'star', title: v.slice(0, 60), text: '' }] }})} placeholder="Program name" /> : null}
              </div>
            </Card>

            <Card title="Why choose us">
              <div className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <input className={inputCls} maxLength={80} value={content.whyUs.title} onChange={(e) => set({ whyUs: { ...content.whyUs, title: e.target.value } })} placeholder="Section title" aria-label="Why-us title" />
                  <input className={inputCls} maxLength={300} value={content.whyUs.lead} onChange={(e) => set({ whyUs: { ...content.whyUs, lead: e.target.value } })} placeholder="Section sub-text" aria-label="Why-us sub-text" />
                </div>
                {content.whyUs.cards.map((c, i) => (
                  <CardEditor key={i} card={c} index={i} onChange={(card) => { const cards = [...content.whyUs.cards]; cards[i] = card; set({ whyUs: { ...content.whyUs, cards } }); }} onRemove={() => set({ whyUs: { ...content.whyUs, cards: content.whyUs.cards.filter((_, j) => j !== i) } })} />
                ))}
                {content.whyUs.cards.length < 6 ? <AddChip label="Add reason" onAdd={(v) => set({ whyUs: { ...content.whyUs, cards: [...content.whyUs.cards, { icon: 'star', title: v.slice(0, 60), text: '' }] }})} placeholder="Reason name" /> : null}
              </div>
            </Card>

            <Card title="Testimonials">
              <div className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <input className={inputCls} maxLength={80} value={content.testimonials.title} onChange={(e) => set({ testimonials: { ...content.testimonials, title: e.target.value } })} placeholder="Section title" aria-label="Testimonials title" />
                  <input className={inputCls} maxLength={300} value={content.testimonials.lead} onChange={(e) => set({ testimonials: { ...content.testimonials, lead: e.target.value } })} placeholder="Section sub-text" aria-label="Testimonials sub-text" />
                </div>
                {content.testimonials.quotes.map((q, i) => (
                  <div key={i} className="rounded-xl border border-white/10 p-3 space-y-2">
                    <textarea className={`${inputCls} min-h-[64px]`} maxLength={500} value={q.quote} onChange={(e) => { const quotes = [...content.testimonials.quotes]; quotes[i] = { ...q, quote: e.target.value }; set({ testimonials: { ...content.testimonials, quotes } }); }} placeholder="What they said" aria-label={`Quote ${i + 1}`} />
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                      <input className={inputCls} maxLength={60} value={q.name} onChange={(e) => { const quotes = [...content.testimonials.quotes]; quotes[i] = { ...q, name: e.target.value }; set({ testimonials: { ...content.testimonials, quotes } }); }} placeholder="Name" aria-label={`Name for quote ${i + 1}`} />
                      <input className={inputCls} maxLength={80} value={q.role || ''} onChange={(e) => { const quotes = [...content.testimonials.quotes]; quotes[i] = { ...q, role: e.target.value }; set({ testimonials: { ...content.testimonials, quotes } }); }} placeholder="Role (optional)" aria-label={`Role for quote ${i + 1}`} />
                      <button onClick={() => set({ testimonials: { ...content.testimonials, quotes: content.testimonials.quotes.filter((_, j) => j !== i) } })} className="text-rose-300 hover:text-rose-200 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label={`Remove quote ${i + 1}`}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
                {content.testimonials.quotes.length < 6 ? <AddChip label="Add testimonial" onAdd={() => set({ testimonials: { ...content.testimonials, quotes: [...content.testimonials.quotes, { quote: '', name: '' }] }})} placeholder="Optional first name" /> : null}
              </div>
            </Card>

            <Card title="Contact & enrol">
              <div className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <input className={inputCls} maxLength={80} value={content.contact.title} onChange={(e) => set({ contact: { ...content.contact, title: e.target.value } })} placeholder="Section title" aria-label="Contact title" />
                  <input className={inputCls} maxLength={40} value={content.contact.ctaLabel} onChange={(e) => set({ contact: { ...content.contact, ctaLabel: e.target.value } })} placeholder="Button label" aria-label="Contact button label" />
                </div>
                <textarea className={`${inputCls} min-h-[64px]`} maxLength={500} value={content.contact.text} onChange={(e) => set({ contact: { ...content.contact, text: e.target.value } })} placeholder="Section text" aria-label="Contact text" />
                <div className="grid sm:grid-cols-3 gap-3">
                  <input className={inputCls} maxLength={200} value={content.contact.address || ''} onChange={(e) => set({ contact: { ...content.contact, address: e.target.value } })} placeholder="Address" aria-label="Contact address" />
                  <input className={inputCls} maxLength={40} value={content.contact.phone || ''} onChange={(e) => set({ contact: { ...content.contact, phone: e.target.value } })} placeholder="Phone" aria-label="Contact phone" />
                  <input className={inputCls} maxLength={120} value={content.contact.hours || ''} onChange={(e) => set({ contact: { ...content.contact, hours: e.target.value } })} placeholder="Hours" aria-label="Contact hours" />
                </div>
                <input className={inputCls} maxLength={120} value={content.footer.copyright} onChange={(e) => set({ footer: { copyright: e.target.value } })} placeholder="Footer line" aria-label="Footer copyright" />
              </div>
            </Card>

            <Card title="Social media">
              <div className="space-y-3">
                <p className="text-[12px] text-slate-500">Your Facebook, Instagram and TikTok pages show as icons at the foot of the landing page. Paste each page's full address (starting with https://); leave a box empty to hide it.</p>
                <div className="grid sm:grid-cols-3 gap-3">
                  <input className={inputCls} maxLength={200} value={content.socials?.facebook || ''} onChange={(e) => set({ socials: { ...(content.socials || { facebook: '', instagram: '', tiktok: '' }), facebook: e.target.value } })} placeholder="https://facebook.com/…" aria-label="Facebook page address" />
                  <input className={inputCls} maxLength={200} value={content.socials?.instagram || ''} onChange={(e) => set({ socials: { ...(content.socials || { facebook: '', instagram: '', tiktok: '' }), instagram: e.target.value } })} placeholder="https://instagram.com/…" aria-label="Instagram page address" />
                  <input className={inputCls} maxLength={200} value={content.socials?.tiktok || ''} onChange={(e) => set({ socials: { ...(content.socials || { facebook: '', instagram: '', tiktok: '' }), tiktok: e.target.value } })} placeholder="https://tiktok.com/@…" aria-label="TikTok page address" />
                </div>
                <p className="text-[12px] text-slate-500">The floating WhatsApp button on the landing page uses the WhatsApp number set in facility admin settings (System Settings), so update it there, not here.</p>
              </div>
            </Card>

            <div className="flex flex-wrap items-center gap-3 pb-4">
              <button onClick={() => save(false)} disabled={saving} className={`${btnGhost} min-h-[44px]`}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save draft'}</button>
              <button onClick={() => save(true)} disabled={saving} className={`${btnPrimary} min-h-[44px]`}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save & publish'}</button>
              <span className={`text-xs ${published ? 'text-emerald-300' : 'text-slate-400'}`}>{published ? 'Live: this page is published' : 'Not published: the live page still shows the day-one version'}</span>
            </div>
          </div>

          <div className="lg:sticky lg:top-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Phone preview</p>
            <PhonePreview content={content} centreName={centreName} />
          </div>
        </div>
      )}
    </div>
  );
};

const AddChip: React.FC<{ label: string; onAdd: (value: string) => void; placeholder: string }> = ({ label, onAdd, placeholder }) => {
  const [v, setV] = useState('');
  const [open, setOpen] = useState(false);
  if (!open) {
    return <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-300 hover:text-orange-200 px-3 py-2.5 min-h-[44px]"><Plus className="w-3.5 h-3.5" /> {label}</button>;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <input autoFocus className={inputCls + ' !w-44 !min-h-[40px]'} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) { onAdd(v.trim()); setV(''); setOpen(false); } if (e.key === 'Escape') { setV(''); setOpen(false); } }} />
      <button onClick={() => { if (v.trim()) { onAdd(v.trim()); setV(''); setOpen(false); } }} className="text-emerald-300 p-2 min-h-[44px] min-w-[44px]" aria-label={`Confirm ${label}`}><Check className="w-4 h-4" /></button>
      <button onClick={() => { setV(''); setOpen(false); }} className="text-slate-400 p-2 min-h-[44px] min-w-[44px]" aria-label="Cancel"><Trash2 className="w-4 h-4" /></button>
    </span>
  );
};

const CardEditor: React.FC<{ card: LandingCard; index: number; onChange: (c: LandingCard) => void; onRemove: () => void }> = ({ card, index, onChange, onRemove }) => (
  <div className="rounded-xl border border-white/10 p-3 space-y-2">
    <div className="grid grid-cols-[150px_1fr_auto] gap-2">
      <select className={inputCls} value={card.icon || 'star'} onChange={(e) => onChange({ ...card, icon: e.target.value })} aria-label={`Icon for card ${index + 1}`}>
        {ICON_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <input className={inputCls} maxLength={60} value={card.title} onChange={(e) => onChange({ ...card, title: e.target.value })} placeholder="Card title" aria-label={`Title for card ${index + 1}`} />
      <button onClick={onRemove} className="text-rose-300 hover:text-rose-200 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label={`Remove card ${index + 1}`}><Trash2 className="w-4 h-4" /></button>
    </div>
    <textarea className={`${inputCls} min-h-[56px]`} maxLength={300} value={card.text} onChange={(e) => onChange({ ...card, text: e.target.value })} placeholder="Card text" aria-label={`Text for card ${index + 1}`} />
  </div>
);

const previewForm: LandingFormApi = {
  form: { name: '', phone: '', email: '', message: '' },
  sending: false,
  sent: false,
  error: '',
  set: () => {},
  submit: (e) => e.preventDefault(),
};

const PhonePreview: React.FC<{ content: LandingState; centreName: string }> = ({ content, centreName }) => (
  <div className="rounded-[2rem] border border-white/15 bg-slate-950 p-2 shadow-xl">
    <div className="rounded-[1.6rem] overflow-hidden" style={{ height: 560, overflowY: 'auto' }}>
      <LandingBody
        content={content}
        centreName={centreName || 'Your facility'}
        waHrefFor={(href) => (href === '#whatsapp' ? '#enquiry' : href.startsWith('#') ? href : '#enquiry')}
        formApi={previewForm}
        waFab="#whatsapp"
        fabMode="sticky"
      />
    </div>
  </div>
);
