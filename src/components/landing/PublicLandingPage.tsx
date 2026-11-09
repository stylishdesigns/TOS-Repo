import React, { useEffect, useState } from 'react';
import { LandingContent } from '../../landing/landingContent';

/**
 * Public centre landing page (piece 1 of the landing-page feature).
 *
 * Rendered at /c/{centreId} for anonymous visitors, outside the app shell:
 * no portal chrome, no auth, only public marketing content served by
 * /api/landing/:centreId. The template is Classic Orange.
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
};

function hrefFor(href: string): string {
  // In piece 1 every primary CTA leads to the app's access-code gate.
  if (!href || href === '/') return '/';
  if (href.startsWith('#')) return href;
  return '/';
}

export const PublicLandingPage: React.FC<{ centreId: string }> = ({ centreId }) => {
  const [data, setData] = useState<ApiResult | null>(null);
  const [failed, setFailed] = useState(false);

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

  return (
    <div className="plp-root" style={{ ['--plp-accent' as string]: accent }}>
      <div className="plp-topbar">
        <div className="plp-shell plp-toprow">
          <div className="plp-logo">{(data.centreName || 'T')[0].toUpperCase()}</div>
          <div className="plp-brand">{data.centreName}</div>
          <nav className="plp-nav">
            <a href="#programs">Programs</a>
            <a href="#why-us">Why us</a>
            <a href="#contact">Contact</a>
          </nav>
          <a className="plp-btn" href={hrefFor(c.hero.buttons[0]?.href || '/')}>{c.hero.buttons[0]?.label || 'Sign up'}</a>
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
                <a key={i} className={b.kind === 'ghost' ? 'plp-btn plp-ghost' : 'plp-btn'} href={hrefFor(b.href)}>
                  {b.label}
                </a>
              ))}
            </div>
          </div>
          <div className="plp-heroart">
            <div className="plp-line" />
            <div className="plp-line plp-short" />
            <div className="plp-line" />
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

      <section className="plp-sec" id="contact">
        <div className="plp-shell">
          <div className="plp-cta">
            <h2>{c.contact.title}</h2>
            <p>{c.contact.text}</p>
            <a className="plp-btn" href={hrefFor(c.hero.buttons[0]?.href || '/')}>{c.contact.ctaLabel}</a>
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
          <span>Powered by TutorialOS</span>
        </div>
      </footer>
    </div>
  );
};
