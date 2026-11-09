import React, { useEffect, useState } from 'react';
import { LandingContent } from '../../landing/landingContent';

/**
 * Public centre landing page (pieces 1 and 3 of the landing-page feature).
 *
 * Rendered at /c/{centreId} for anonymous visitors, outside the app shell:
 * no portal chrome, no auth, only public marketing content served by
 * /api/public/landing/:centreId. Piece 3 adds the floating WhatsApp button
 * (wired to the number the centre owner set in centre admin settings), the
 * enquiry form (submissions land in the centre admin's Website Enquiries
 * inbox) and social media links. There is deliberately no sign-up here.
 */

const ICONS: Record<string, string> = {
  pencil: '\u270E',
  list: '\u2261',
  target: '\u25CE',
  star: '\u2605',
  users: '\u2637',
  clock: '\u25F4',
};

type ApiResult = {
  ok: boolean;
  published: boolean;
  centreName: string;
  content: LandingContent;
  whatsapp?: string;
};

function hrefFor(href: string): string {
  if (!href || href === '/') return '/';
  if (href.startsWith('#')) return href;
  return '/';
}

function waDigits(v: string): string {
  let digits = (v || '').replace(/[^0-9]/g, '');
  // Nigerian numbers are usually saved locally (0903…); wa.me needs 234….
  if (digits.length === 11 && digits.startsWith('0')) digits = '234' + digits.slice(1);
  return digits;
}
function waLink(v: string | undefined): string {
  const digits = waDigits(v || '');
  return digits ? `https://wa.me/${digits}` : '';
}

const WhatsAppIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4 0-.6.2-.8l.4-.5c.1-.2.2-.3.3-.5v-.5c0-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1.1 2.7c.1.2 1.9 2.9 4.6 4 .6.3 1.1.4 1.5.5.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z" />
  </svg>
);

const SocialIcon: React.FC<{ platform: string }> = ({ platform }) => {
  const size = 18;
  if (platform === 'facebook') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.3-1.5 1.6-1.5h1.6V3.6c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4.1v2.3H7.6V13h2.7v8h3.2z" />
      </svg>
    );
  }
  if (platform === 'instagram') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 4.3c2.5 0 2.8 0 3.8.1.9 0 1.4.2 1.7.3.5.2.8.4 1.1.7.3.3.5.6.7 1.1.1.3.3.8.3 1.7.1 1 .1 1.3.1 3.8s0 2.8-.1 3.8c0 .9-.2 1.4-.3 1.7-.2.5-.4.8-.7 1.1-.3.3-.6.5-1.1.7-.3.1-.8.3-1.7.3-1 .1-1.3.1-3.8.1s-2.8 0-3.8-.1c-.9 0-1.4-.2-1.7-.3-.5-.2-.8-.4-1.1-.7-.3-.3-.5-.6-.7-1.1-.1-.3-.3-.8-.3-1.7-.1-1-.1-1.3-.1-3.8s0-2.8.1-3.8c0-.9.2-1.4.3-1.7.2-.5.4-.8.7-1.1.3-.3.6-.5 1.1-.7.3-.1.8-.3 1.7-.3 1-.1 1.3-.1 3.8-.1M12 2.6c-2.6 0-2.9 0-3.9.1-1 0-1.7.2-2.3.4-.6.3-1.2.6-1.7 1.1-.5.5-.9 1.1-1.1 1.7-.2.6-.4 1.3-.4 2.3-.1 1-.1 1.3-.1 3.9s0 2.9.1 3.9c0 1 .2 1.7.4 2.3.3.6.6 1.2 1.1 1.7.5.5 1.1.9 1.7 1.1.6.2 1.3.4 2.3.4 1 .1 1.3.1 3.9.1s2.9 0 3.9-.1c1 0 1.7-.2 2.3-.4a4.9 4.9 0 0 0 2.8-2.8c.2-.6.4-1.3.4-2.3.1-1 .1-1.3.1-3.9s0-2.9-.1-3.9c0-1-.2-1.7-.4-2.3-.3-.6-.6-1.2-1.1-1.7-.5-.5-1.1-.9-1.7-1.1-.6-.2-1.3-.4-2.3-.4-1-.1-1.3-.1-3.9-.1zm0 4.6a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6zm0 7.9a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2zM18.1 7a1.1 1.1 0 1 1-2.3 0 1.1 1.1 0 0 1 2.3 0z" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.6 6.7a4.8 4.8 0 0 1-3.8-4.3h-3.3v12.9a2.7 2.7 0 1 1-2.7-2.7c.3 0 .6 0 .9.1V9.3a6.1 6.1 0 0 0-.9-.1 6 6 0 1 0 6 6V8.9a8.1 8.1 0 0 0 4.4 1.3V6.9c-.2 0-.4 0-.6-.2z" />
    </svg>
  );
};

export const PublicLandingPage: React.FC<{ centreId: string }> = ({ centreId }) => {
  const [data, setData] = useState<ApiResult | null>(null);
  const [failed, setFailed] = useState(false);

  // Enquiry form state
  const [form, setForm] = useState({ name: '', phone: '', email: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    let alive = true;
    fetch(`/api/public/landing/${encodeURIComponent(centreId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: ApiResult) => {
        if (alive) setData(j);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [centreId]);

  if (failed) {
    return (
      <div className="plp-root">
        <div className="plp-shell" style={{ paddingTop: 80, paddingBottom: 80, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22 }}>This centre's website is not available right now.</h1>
          <p style={{ color: '#64748b', marginTop: 10 }}>Please check the address or try again shortly.</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="plp-root">
        <div className="plp-shell" style={{ paddingTop: 120, paddingBottom: 120, textAlign: 'center', color: '#94a3b8' }}>
          Loading…
        </div>
      </div>
    );
  }

  const c = data.content;
  const accent = /^#[0-9a-fA-F]{6}$/.test(c.accent) ? c.accent : '#EA580C';
  const wa = waLink(data.whatsapp);

  const waHrefFor = (href: string): string => {
    if (href === '#whatsapp') return wa || '#enquiry';
    return hrefFor(href);
  };

  const setField = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submitEnquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim() || !form.phone.trim() || !form.message.trim()) {
      setFormError('Please fill in your name, phone number and message.');
      return;
    }
    setSending(true);
    try {
      const r = await fetch(`/api/public/landing/${encodeURIComponent(centreId)}/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setFormError(j?.error || 'Your enquiry could not be sent. Please try again.');
      } else {
        setSent(true);
      }
    } catch {
      setFormError('Your enquiry could not be sent. Please check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  const socials: [string, string][] = [
    ['facebook', c.socials?.facebook || ''],
    ['instagram', c.socials?.instagram || ''],
    ['tiktok', c.socials?.tiktok || ''],
  ].filter(([, url]) => !!url) as [string, string][];

  return (
    <div className="plp-root" style={{ ['--plp-accent' as string]: accent }}>
      <div className="plp-topbar">
        <div className="plp-shell plp-toprow">
          <div className="plp-logo">{(data.centreName || 'T')[0].toUpperCase()}</div>
          <div className="plp-brand">{data.centreName}</div>
          <nav className="plp-nav">
            <a href="#programs">Programs</a>
            <a href="#why-us">Why us</a>
            <a href="#enquiry">Enquiries</a>
            <a href="#contact">Contact</a>
          </nav>
          <a className="plp-btn" href={waHrefFor(c.hero.buttons[0]?.href || '#enquiry')}>{c.hero.buttons[0]?.label || 'Send an enquiry'}</a>
        </div>
      </div>

      <div className="plp-hero">
        <div className="plp-shell plp-herogrid">
          <div>
            {c.ribbon ? <span className="plp-tag">{c.ribbon}</span> : null}
            <h1>{c.hero.headline}</h1>
            <p className="plp-sub">{c.hero.subText}</p>
            <div className="plp-ctas">
              {c.hero.buttons.map((b, i) => (
                <a key={i} className={b.kind === 'ghost' ? 'plp-btn plp-ghost' : 'plp-btn'} href={waHrefFor(b.href)}>
                  {b.label}
                </a>
              ))}
            </div>
          </div>
          <div className="plp-heroart">
            {c.hero.photoUrl ? (
              <img className="plp-heroimg" src={c.hero.photoUrl} alt={data.centreName || 'Centre photo'} />
            ) : (
              <>
                <div className="plp-line" />
                <div className="plp-line plp-short" />
                <div className="plp-line" />
              </>
            )}
            <div className="plp-badges">
              {c.hero.badges.map((b, i) => (
                <span key={i} className="plp-badge">{b}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {c.stats.length > 0 ? (
        <div className="plp-stats">
          <div className="plp-shell plp-statgrid">
            {c.stats.map((s, i) => (
              <div key={i}>
                <b>{s.value}</b>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <section className="plp-sec" id="programs">
        <div className="plp-shell">
          <h2>{c.programs.title}</h2>
          <p className="plp-lead">{c.programs.lead}</p>
          <div className="plp-grid3">
            {c.programs.cards.map((card, i) => (
              <div key={i} className="plp-card">
                <div className="plp-ic">{ICONS[card.icon || ''] || '\u2605'}</div>
                <h3>{card.title}</h3>
                <p>{card.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="plp-sec plp-tint" id="why-us">
        <div className="plp-shell">
          <h2>{c.whyUs.title}</h2>
          <p className="plp-lead">{c.whyUs.lead}</p>
          <div className="plp-grid3">
            {c.whyUs.cards.map((card, i) => (
              <div key={i} className="plp-card">
                <div className="plp-ic">{ICONS[card.icon || ''] || '\u2605'}</div>
                <h3>{card.title}</h3>
                <p>{card.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="plp-sec">
        <div className="plp-shell">
          <h2>{c.testimonials.title}</h2>
          <p className="plp-lead">{c.testimonials.lead}</p>
          <div className="plp-grid3">
            {c.testimonials.quotes.map((q, i) => (
              <div key={i} className="plp-quote">
                <p>"{q.quote}"</p>
                <div className="plp-who">
                  {q.name}
                  {q.role ? <span> · {q.role}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="plp-sec plp-tint" id="enquiry">
        <div className="plp-shell">
          <h2>Send us an enquiry</h2>
          <p className="plp-lead">Ask about classes, fees or anything else. The centre gets your message straight away.</p>
          {sent ? (
            <div className="plp-formdone">
              <b>Thank you{form.name.trim() ? `, ${form.name.trim().split(' ')[0]}` : ''}.</b>
              <p>Your enquiry has reached {data.centreName}. They will get back to you, usually on WhatsApp or by phone.</p>
            </div>
          ) : (
            <form className="plp-form" onSubmit={submitEnquiry} noValidate>
              <div className="plp-formrow">
                <label>
                  Your name *
                  <input
                    type="text"
                    value={form.name}
                    maxLength={80}
                    placeholder="e.g. Mrs Adeyemi"
                    onChange={(e) => setField('name', e.target.value)}
                  />
                </label>
                <label>
                  Phone / WhatsApp number *
                  <input
                    type="tel"
                    value={form.phone}
                    maxLength={24}
                    placeholder="e.g. 0803 000 0000"
                    onChange={(e) => setField('phone', e.target.value)}
                  />
                </label>
              </div>
              <label>
                Email (optional)
                <input
                  type="email"
                  value={form.email}
                  maxLength={120}
                  placeholder="you@example.com"
                  onChange={(e) => setField('email', e.target.value)}
                />
              </label>
              <label>
                Message *
                <textarea
                  value={form.message}
                  maxLength={1000}
                  rows={4}
                  placeholder="Tell the centre about your child, the class you are interested in, or ask a question."
                  onChange={(e) => setField('message', e.target.value)}
                />
              </label>
              {formError ? <div className="plp-formerr">{formError}</div> : null}
              <button type="submit" className="plp-formbtn" disabled={sending}>
                {sending ? 'Sending…' : 'Send enquiry'}
              </button>
            </form>
          )}
        </div>
      </section>

      <section className="plp-sec" id="contact">
        <div className="plp-shell">
          <div className="plp-cta">
            <h2>{c.contact.title}</h2>
            <p>{c.contact.text}</p>
            <a className="plp-btn" href={waHrefFor(c.hero.buttons[0]?.href || '#enquiry')}>{c.contact.ctaLabel}</a>
            <div className="plp-contactmeta">
              {c.contact.address ? <span>{c.contact.address}</span> : null}
              {c.contact.phone ? <a href={`tel:${c.contact.phone.replace(/\s/g, '')}`}>{c.contact.phone}</a> : null}
              {c.contact.hours ? <span>{c.contact.hours}</span> : null}
            </div>
          </div>
        </div>
      </section>

      <footer className="plp-footer">
        <div className="plp-shell plp-footrow">
          <span>{c.footer.copyright}</span>
          {socials.length > 0 ? (
            <div className="plp-socials">
              {socials.map(([platform, url]) => (
                <a
                  key={platform}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={platform}
                  title={platform[0].toUpperCase() + platform.slice(1)}
                >
                  <SocialIcon platform={platform} />
                </a>
              ))}
            </div>
          ) : null}
          <span>Powered by TutorialOS</span>
        </div>
      </footer>

      {wa ? (
        <a
          className="plp-wafab"
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat with us on WhatsApp"
          title="Chat with us on WhatsApp"
        >
          <WhatsAppIcon />
        </a>
      ) : null}
    </div>
  );
};
