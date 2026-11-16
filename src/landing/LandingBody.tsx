import React from 'react';
import {
  LandingContent,
  LandingCard,
  LandingTestimonial,
  LandingStat,
  templatePreset,
  normalizeTemplateId,
  textOnAccent,
} from './landingContent';

/**
 * Landing-page renderer (piece 6): each of the five templates now has its own
 * LAYOUT, not just its own colours, following the uploaded "Education Landing
 * Page Templates" design:
 *  - Scholar  classic: split hero, amber stats band, serif headlines, bordered cards.
 *  - Meridian bold: full-bleed dark forest hero band, left-aligned section
 *    heads with a lime kicker bar, sharp cards with a lime edge.
 *  - Aurora   modern: soft violet-gradient hero, centred text, pill buttons,
 *    gradient chips, glow cards.
 *  - Sunrise  friendly: hero reversed (photo left, words right), chunky
 *    rounded buttons and warm shadow cards.
 *  - Obsidian premium: full dark page, gold serif headlines, sharp corners,
 *    thin gold rules and gold-outlined chips.
 *
 * The public page (/c/{centreId}) and the editor's phone preview both render
 * this component, so what an admin sees while editing is exactly what
 * visitors get. The floating WhatsApp button is part of every design; the
 * enquiry form always posts to the facility's Website Enquiries inbox.
 */

const ICONS: Record<string, string> = {
  pencil: '\u270E',
  list: '\u2261',
  target: '\u25CE',
  star: '\u2605',
  users: '\u2637',
  clock: '\u25F4',
};

export type LandingFormApi = {
  form: { name: string; phone: string; email: string; message: string };
  sending: boolean;
  sent: boolean;
  error: string;
  set: (k: 'name' | 'phone' | 'email' | 'message', v: string) => void;
  submit: (e: React.FormEvent) => void;
};

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
        <path d="M12 4.3c2.5 0 2.8 0 3.8.1.9 0 1.4.2 1.7.3.5.2.8.4 1.1.7.3.3.5.6.7 1.1.1.3.3.8.3 1.7.1 1 .1 1.3.1 3.8s0 2.8-.1 3.8c0 .9-.2 1.4-.3 1.7-.2.5-.4.8-.7 1.1-.3.3-.6.5-1.1.7-.3.1-.8.3-1.7.3-1 .1-1.3.1-3.8.1s-2.8 0-3.8-.1c-.9 0-1.4-.2-1.7-.3-.5-.2-.8-.4-1.1-.7-.3-.3-.5-.6-.7-1.1-.1-.3-.3-.8-.3-1.7-.1-1-.1-1.3-.1-3.8s0-2.8.1-3.8c0-.9.2-1.4.3-1.7.2-.5.4-.8.7-1.1.3-.3.6-.5 1.1-.7.6-.2 1.3-.4 2.3-.4 1-.1 1.3-.1 3.9-.1zm0-1.7c-2.6 0-2.9 0-3.9.1-1 0-1.7.2-2.3.4-.6.3-1.2.6-1.7 1.1-.5.5-.9 1.1-1.1 1.7-.2.6-.4 1.3-.4 2.3-.1 1-.1 1.3-.1 3.9s0 2.9.1 3.9c0 1 .2 1.7.4 2.3.3.6.6 1.2 1.1 1.7.5.5 1.1.9 1.7 1.1.6.2 1.3.4 2.3.4 1 .1 1.3.1 3.9.1s2.9 0 3.9-.1c1 0 1.7-.2 2.3-.4a4.9 4.9 0 0 0 2.8-2.8c.2-.6.4-1.3.4-2.3.1-1 .1-1.3.1-3.9s0-2.9-.1-3.9c0-1-.2-1.7-.4-2.3-.3-.6-.6-1.2-1.1-1.7-.5-.5-1.1-.9-1.7-1.1-.6-.2-1.3-.4-2.3-.4-1-.1-1.3-.1-3.9-.1zm0 4.6a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6zm0 7.9a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2zM18.1 7a1.1 1.1 0 1 1-2.3 0 1.1 1.1 0 0 1 2.3 0z" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.6 6.7a4.8 4.8 0 0 1-3.8-4.3h-3.3v12.9a2.7 2.7 0 1 1-2.7-2.7c.3 0 .6 0 .9.1V9.3a6.1 6.1 0 0 0-.9-.1 6 6 0 1 0 6 6V8.9a8.1 8.1 0 0 0 4.4 1.3V6.9c-.2 0-.4 0-.6-.2z" />
    </svg>
  );
};

type HeroLayout = 'split' | 'centered' | 'reversed';

export const LandingBody: React.FC<{
  content: LandingContent;
  centreName: string;
  waHrefFor: (href: string) => string;
  formApi: LandingFormApi;
  /** Shows the floating WhatsApp button when set; pass the wa.me link. */
  waFab?: string;
  /** 'fixed' floats over the whole page (public page); 'sticky' floats
   *  inside the scrolling preview frame. */
  fabMode?: 'fixed' | 'sticky';
}> = ({ content: c, centreName, waHrefFor, formApi, waFab, fabMode = 'fixed' }) => {
  const tpl = normalizeTemplateId(c.templateId);
  const preset = templatePreset(tpl);
  const accent = /^#[0-9a-fA-F]{6}$/.test(c.accent) ? c.accent : preset.accent;
  const on = textOnAccent(accent);
  const ink = preset.ink;
  const bg = preset.bg;
  const sf = preset.dark ? `color-mix(in srgb, ${ink} 8%, ${bg})` : '#FFFFFF';
  const mut = `color-mix(in srgb, ${ink} 68%, ${bg})`;
  const tint = `color-mix(in srgb, ${ink} 5%, ${bg})`;
  const line = `1px solid color-mix(in srgb, ${ink} 14%, transparent)`;
  const rad = preset.radius;
  const smallRad = `min(${rad}px, 12px)`;
  const cardRad = `min(${rad}px, 28px)`;

  // Per-template layout character.
  const isMeridian = tpl === 'meridian';
  const isAurora = tpl === 'aurora';
  const isSunrise = tpl === 'sunrise';
  const isObsidian = tpl === 'obsidian';
  const heroLayout: HeroLayout = isAurora || isObsidian ? 'centered' : isSunrise ? 'reversed' : 'split';
  // Aurora's secondary hue for gradients (blended with the saved accent).
  const auroraB = `color-mix(in srgb, ${accent} 55%, #A855F7)`;
  const grad = `linear-gradient(135deg, ${accent}, ${auroraB})`;

  // Meridian: the hero sits on a full-bleed dark forest band, so the words
  // and buttons inside it flip to cream-on-dark.
  const heroBand = isMeridian;
  const hInk = heroBand ? bg : ink;
  const hMut = heroBand ? `color-mix(in srgb, ${bg} 72%, transparent)` : mut;
  const hLine = heroBand ? `1.5px solid color-mix(in srgb, ${bg} 55%, transparent)` : `1.5px solid ${ink}`;
  const heroBg = isMeridian
    ? ink
    : isAurora
      ? `linear-gradient(180deg, color-mix(in srgb, ${accent} 18%, ${bg}) 0%, color-mix(in srgb, ${accent} 5%, ${bg}) 62%, ${bg} 100%)`
      : undefined;

  const btnProps = (b: { label: string; kind: 'primary' | 'ghost'; href: string }, compact = false, onBand = false) => ({
    href: waHrefFor(b.href || '#enquiry'),
    style: {
      display: 'inline-block',
      padding: compact ? '9px 16px' : '13px 24px',
      borderRadius: isAurora ? 999 : rad,
      fontWeight: 700,
      fontSize: compact ? 13 : 15,
      textDecoration: 'none' as const,
      ...(b.kind === 'primary'
        ? { background: accent, color: on, boxShadow: isAurora ? `0 6px 18px color-mix(in srgb, ${accent} 35%, transparent)` : undefined }
        : {
            border: onBand ? hLine : `1.5px solid ${ink}`,
            color: onBand ? hInk : ink,
            background: 'transparent',
          }),
    },
  });

  const name = centreName || c.footer.copyright.replace(/^©\s*\d{4}\s*/, '') || 'Our facility';
  const initial = (name.trim().charAt(0) || 'A').toUpperCase();

  const socials: [string, string][] = (
    [
      ['facebook', c.socials?.facebook || ''],
      ['instagram', c.socials?.instagram || ''],
      ['tiktok', c.socials?.tiktok || ''],
    ] as [string, string][]
  ).filter(([, url]) => !!url);

  const cardChip = (card: LandingCard, i: number) => {
    const glyph = ICONS[card.icon || ''] || i + 1;
    if (isObsidian) {
      return (
        <span style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 0, border: `1.5px solid color-mix(in srgb, ${accent} 55%, transparent)`, color: accent, fontFamily: preset.headingFont, fontSize: 15, flexShrink: 0 }}>
          {glyph}
        </span>
      );
    }
    if (isAurora) {
      return (
        <span style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 999, background: grad, color: on, fontFamily: preset.headingFont, fontWeight: 700, fontSize: 16, flexShrink: 0, boxShadow: `0 4px 14px color-mix(in srgb, ${accent} 30%, transparent)` }}>
          {glyph}
        </span>
      );
    }
    return (
      <span style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: isMeridian ? `min(${rad}px, 8px)` : smallRad, background: accent, color: on, fontFamily: preset.headingFont, fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
        {glyph}
      </span>
    );
  };

  const cardBox = (): React.CSSProperties => {
    if (isMeridian) return { background: sf, border: line, borderLeft: `4px solid ${accent}`, borderRadius: cardRad, padding: 24 };
    if (isAurora) return { background: sf, border: 'none', borderRadius: cardRad, padding: 24, boxShadow: `0 10px 30px color-mix(in srgb, ${accent} 14%, transparent)` };
    if (isSunrise) return { background: sf, border: line, borderRadius: cardRad, padding: 24, boxShadow: `0 8px 22px color-mix(in srgb, ${accent} 13%, transparent)` };
    if (isObsidian) return { background: sf, border: `1px solid color-mix(in srgb, ${accent} 30%, transparent)`, borderRadius: 0, padding: 24 };
    return { background: sf, border: line, borderRadius: cardRad, padding: 24 };
  };

  const cardGrid = (cards: LandingCard[]) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 18, marginTop: 36 }}>
      {cards.map((card, i) => (
        <div key={i} style={cardBox()}>
          {cardChip(card, i)}
          <h3 style={{ marginTop: 16, fontSize: 20, lineHeight: 1.2 }}>{card.title}</h3>
          <p style={{ margin: '8px 0 0', fontSize: 14.5, lineHeight: 1.6, color: mut }}>{card.text}</p>
        </div>
      ))}
    </div>
  );

  const sectionHead = (title: string, lead?: string) => {
    if (isMeridian) {
      return (
        <>
          <span style={{ display: 'block', width: 36, height: 4, background: accent, borderRadius: 2, marginBottom: 12 }} />
          <h2 className="lpb-h2" style={{ fontSize: 36, lineHeight: 1.1, textAlign: 'left' }}>{title}</h2>
          {lead ? (
            <p style={{ margin: '14px 0 0', maxWidth: 640, textAlign: 'left', fontSize: 16, lineHeight: 1.6, color: mut }}>{lead}</p>
          ) : null}
        </>
      );
    }
    if (isObsidian) {
      return (
        <>
          <h2 className="lpb-h2" style={{ fontSize: 36, lineHeight: 1.15, textAlign: 'center', letterSpacing: '0.01em' }}>{title}</h2>
          <span style={{ display: 'block', width: 44, height: 2, background: `color-mix(in srgb, ${accent} 70%, transparent)`, margin: '14px auto 0' }} />
          {lead ? (
            <p style={{ margin: '14px auto 0', maxWidth: 560, textAlign: 'center', fontSize: 16, lineHeight: 1.6, color: mut }}>{lead}</p>
          ) : null}
        </>
      );
    }
    return (
      <>
        <h2 className="lpb-h2" style={{ fontSize: 38, lineHeight: 1.1, textAlign: 'center' }}>{title}</h2>
        {lead ? (
          <p style={{ margin: '14px auto 0', maxWidth: 560, textAlign: 'center', fontSize: 16, lineHeight: 1.6, color: mut }}>{lead}</p>
        ) : null}
      </>
    );
  };

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 44,
    border: `1.5px solid color-mix(in srgb, ${on} 35%, transparent)`,
    background: `color-mix(in srgb, ${on} 10%, transparent)`,
    borderRadius: isAurora ? 12 : `min(${rad}px, 14px)`,
    padding: '10px 12px',
    fontSize: 14,
    color: on,
    fontFamily: 'inherit',
    outline: 'none',
  };

  const heroPhoto = (wide: boolean) => (
    <div
      style={{
        aspectRatio: wide ? '16 / 8' : '4 / 3',
        borderRadius: isObsidian ? 0 : cardRad,
        overflow: 'hidden',
        border: heroBand ? hLine : isObsidian ? `1px solid color-mix(in srgb, ${accent} 40%, transparent)` : line,
        ...(isAurora ? { boxShadow: `0 18px 44px color-mix(in srgb, ${accent} 22%, transparent)` } : {}),
        ...(isSunrise ? { boxShadow: `0 12px 30px color-mix(in srgb, ${accent} 18%, transparent)` } : {}),
        position: 'relative',
      }}
    >
      {c.hero.photoUrl ? (
        <img src={c.hero.photoUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${accent} 14%, ${bg})` }}>
          <span style={{ fontFamily: preset.headingFont, fontWeight: 700, fontSize: 64, color: `color-mix(in srgb, ${ink} 25%, ${bg})` }}>{initial}</span>
        </div>
      )}
    </div>
  );

  const heroWords = (center: boolean) => (
    <div style={{ textAlign: center ? 'center' : 'left', margin: center ? '0 auto' : undefined, maxWidth: center ? 720 : undefined }}>
      {c.ribbon ? (
        <span
          style={{
            display: 'inline-block',
            padding: '6px 14px',
            borderRadius: isObsidian ? 0 : 999,
            background: heroBand ? `color-mix(in srgb, ${bg} 10%, transparent)` : isObsidian ? 'transparent' : `color-mix(in srgb, ${ink} 6%, ${bg})`,
            border: isObsidian ? `1px solid color-mix(in srgb, ${accent} 45%, transparent)` : undefined,
            color: heroBand ? hInk : isObsidian ? accent : mut,
            fontSize: isObsidian ? 12 : 13,
            fontWeight: 600,
            letterSpacing: isObsidian ? '0.18em' : undefined,
            textTransform: isObsidian ? 'uppercase' : undefined,
            marginBottom: 16,
          }}
        >
          {c.ribbon}
        </span>
      ) : null}
      <h1 className="lpb-h1" style={{ fontSize: 52, lineHeight: 1.05, color: heroBand ? hInk : undefined }}>
        {c.hero.headline || 'Your next step starts here'}
      </h1>
      <p style={{ margin: '20px 0 0', fontSize: 18, lineHeight: 1.65, color: hMut }}>{c.hero.subText}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 28, justifyContent: center ? 'center' : 'flex-start' }}>
        {c.hero.buttons.filter((b) => b.label).map((b, i) => (
          <a key={i} {...btnProps(b, false, heroBand)}>{b.label}</a>
        ))}
      </div>
      {c.hero.badges.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 22, justifyContent: center ? 'center' : 'flex-start' }}>
          {c.hero.badges.map((b, i) => (
            <span
              key={i}
              style={{
                border: heroBand ? `1px solid color-mix(in srgb, ${bg} 40%, transparent)` : isObsidian ? `1px solid color-mix(in srgb, ${accent} 40%, transparent)` : `1px solid color-mix(in srgb, ${ink} 22%, transparent)`,
                color: heroBand ? hInk : isObsidian ? mut : mut,
                padding: '7px 12px',
                borderRadius: isObsidian ? 0 : 999,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {b}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <div
      className={`lpb lpb-${tpl}`}
      style={{
        ['--lp-ac' as string]: accent,
        ['--lp-on' as string]: on,
        ['--lp-hf' as string]: preset.headingFont,
        background: bg,
        color: ink,
        fontFamily: preset.bodyFont,
      }}
    >
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '18px 28px', borderBottom: isObsidian ? `1px solid color-mix(in srgb, ${accent} 30%, transparent)` : `1px solid color-mix(in srgb, ${ink} 12%, transparent)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ flexShrink: 0, width: 38, height: 38, borderRadius: isObsidian ? 0 : smallRad, background: accent, color: on, display: 'grid', placeItems: 'center', fontWeight: 700, fontFamily: preset.headingFont }}>{initial}</span>
          <span style={{ fontFamily: preset.headingFont, fontWeight: 700, fontSize: 18, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
        </div>
        <nav className="lpb-navl" style={{ display: 'flex', gap: 22, fontSize: 14, fontWeight: 600, color: mut }}>
          <a className="lpb-navlink" href="#programs" style={{ color: 'inherit', textDecoration: 'none' }}>Programs</a>
          <a className="lpb-navlink" href="#why-us" style={{ color: 'inherit', textDecoration: 'none' }}>Why us</a>
          <a className="lpb-navlink" href="#enquiry" style={{ color: 'inherit', textDecoration: 'none' }}>Enquiries</a>
        </nav>
        {c.hero.buttons[0]?.label ? (
          <a className="lpb-navcta" {...btnProps(c.hero.buttons[0], true)}>{c.hero.buttons[0].label}</a>
        ) : null}
      </header>

      {/* Hero */}
      <section className="lpb-sec" style={{ padding: heroLayout === 'centered' ? '64px 48px 72px' : '72px 48px', background: heroBg }}>
        {heroLayout === 'split' ? (
          <div className="lpb-in lpb-g2" style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 40, alignItems: 'center' }}>
            {heroWords(false)}
            {heroPhoto(false)}
          </div>
        ) : heroLayout === 'reversed' ? (
          <div className="lpb-in lpb-g2" style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 40, alignItems: 'center' }}>
            {heroPhoto(false)}
            {heroWords(false)}
          </div>
        ) : (
          <div className="lpb-in" style={{ maxWidth: 880, margin: '0 auto' }}>
            {heroWords(true)}
            <div style={{ marginTop: 40 }}>{heroPhoto(true)}</div>
          </div>
        )}
      </section>

      {/* Stats strip */}
      {c.stats.length > 0 ? (
        <section
          className="lpb-sec"
          style={{
            paddingTop: 40,
            paddingBottom: 40,
            ...(isMeridian
              ? { background: ink, color: bg }
              : isAurora
                ? { background: `linear-gradient(90deg, ${accent}, ${auroraB})`, color: on }
                : isObsidian
                  ? { background: 'transparent', color: accent, borderTop: `1px solid color-mix(in srgb, ${accent} 35%, transparent)`, borderBottom: `1px solid color-mix(in srgb, ${accent} 35%, transparent)` }
                  : { background: accent, color: on }),
          }}
        >
          <div className="lpb-in" style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 24, textAlign: 'center' }}>
            {c.stats.map((s: LandingStat, i) => (
              <div key={i}>
                <div style={{ fontFamily: preset.headingFont, fontWeight: 700, fontSize: 40, lineHeight: 1 }}>{s.value}</div>
                <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600, opacity: isObsidian ? 0.75 : 0.9, color: isObsidian ? mut : undefined }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Programs */}
      <section className="lpb-sec" id="programs" style={{ padding: '72px 48px' }}>
        <div className="lpb-in" style={{ maxWidth: 1000, margin: '0 auto' }}>
          {sectionHead(c.programs.title || 'Our programs', c.programs.lead)}
          {c.programs.cards.length > 0 ? cardGrid(c.programs.cards) : null}
        </div>
      </section>

      {/* Why us */}
      <section className="lpb-sec" id="why-us" style={{ padding: '72px 48px', background: isMeridian ? tint : isObsidian ? sf : tint }}>
        <div className="lpb-in" style={{ maxWidth: 1000, margin: '0 auto' }}>
          {sectionHead(c.whyUs.title || 'Why choose us', c.whyUs.lead)}
          {c.whyUs.cards.length > 0 ? cardGrid(c.whyUs.cards) : null}
        </div>
      </section>

      {/* Testimonials */}
      {c.testimonials.quotes.length > 0 ? (
        <section className="lpb-sec" style={{ padding: '72px 48px' }}>
          <div className="lpb-in" style={{ maxWidth: 1000, margin: '0 auto' }}>
            {sectionHead(c.testimonials.title || 'What parents say', c.testimonials.lead)}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18, marginTop: 36 }}>
              {c.testimonials.quotes.map((q: LandingTestimonial, i) => (
                <figure key={i} style={{ margin: 0, ...cardBox() }}>
                  {isObsidian ? <span style={{ display: 'block', fontFamily: preset.headingFont, fontSize: 30, color: accent, lineHeight: 1 }}>&ldquo;</span> : null}
                  <blockquote style={{ margin: 0, fontSize: 16, lineHeight: 1.7 }}>{q.quote}</blockquote>
                  <figcaption style={{ marginTop: 16, fontWeight: 700, fontSize: 14, color: mut }}>
                    {q.name}
                    {q.role ? <span style={{ fontWeight: 400 }}> · {q.role}</span> : null}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Enquiry */}
      <section className="lpb-sec" id="enquiry" style={{ padding: '72px 48px' }}>
        <div className="lpb-in" style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div
            className="lpb-encard lpb-g2"
            style={{
              display: 'grid',
              gridTemplateColumns: '1.1fr 1fr',
              gap: 36,
              alignItems: 'center',
              background: isAurora ? grad : accent,
              color: on,
              borderRadius: isObsidian ? 0 : `min(${rad}px, 32px)`,
              padding: 44,
              ...(isObsidian ? { border: `1px solid color-mix(in srgb, ${accent} 55%, transparent)` } : {}),
              ...(isSunrise ? { boxShadow: `0 14px 34px color-mix(in srgb, ${accent} 22%, transparent)` } : {}),
            }}
          >
            <div>
              <h2 className="lpb-h2" style={{ fontSize: 38, lineHeight: 1.1 }}>{c.contact.title || 'Ready to enrol?'}</h2>
              <p style={{ margin: '14px 0 0', fontSize: 16, lineHeight: 1.65, opacity: 0.92 }}>{c.contact.text}</p>
              {c.contact.address || c.contact.phone || c.contact.hours ? (
                <div style={{ marginTop: 18, display: 'grid', gap: 6, fontSize: 14, opacity: 0.9 }}>
                  {c.contact.address ? <span>{c.contact.address}</span> : null}
                  {c.contact.phone ? <a href={`tel:${c.contact.phone.replace(/\s/g, '')}`} style={{ color: 'inherit', fontWeight: 700 }}>{c.contact.phone}</a> : null}
                  {c.contact.hours ? <span>{c.contact.hours}</span> : null}
                </div>
              ) : null}
            </div>
            <div>
              {formApi.sent ? (
                <div style={{ background: `color-mix(in srgb, ${on} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${on} 30%, transparent)`, borderRadius: isObsidian ? 0 : `min(${rad}px, 14px)`, padding: 20 }}>
                  <b style={{ fontSize: 16 }}>Thank you{formApi.form.name.trim() ? `, ${formApi.form.name.trim().split(' ')[0]}` : ''}.</b>
                  <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.55, opacity: 0.92 }}>
                    Your enquiry has reached {name}. They will get back to you, usually on WhatsApp or by phone.
                  </p>
                </div>
              ) : (
                <form onSubmit={formApi.submit} noValidate style={{ display: 'grid', gap: 12 }}>
                  <div className="lpb-g2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <input type="text" value={formApi.form.name} maxLength={80} placeholder="Your name" aria-label="Your name" onChange={(e) => formApi.set('name', e.target.value)} style={fieldStyle} />
                    <input type="tel" value={formApi.form.phone} maxLength={24} placeholder="Phone / WhatsApp" aria-label="Phone or WhatsApp number" onChange={(e) => formApi.set('phone', e.target.value)} style={fieldStyle} />
                  </div>
                  <input type="email" value={formApi.form.email} maxLength={120} placeholder="Email (optional)" aria-label="Email, optional" onChange={(e) => formApi.set('email', e.target.value)} style={fieldStyle} />
                  <textarea value={formApi.form.message} maxLength={1000} rows={4} placeholder="Tell the facility about your child, or ask a question." aria-label="Your message" onChange={(e) => formApi.set('message', e.target.value)} style={{ ...fieldStyle, minHeight: 88, resize: 'vertical' }} />
                  {formApi.error ? (
                    <div style={{ background: `color-mix(in srgb, ${on} 16%, transparent)`, border: `1.5px solid ${on}`, borderRadius: isObsidian ? 0 : `min(${rad}px, 14px)`, padding: '10px 12px', fontSize: 13.5, fontWeight: 600 }}>{formApi.error}</div>
                  ) : null}
                  <button type="submit" disabled={formApi.sending} style={{ background: on, color: accent, border: 'none', cursor: formApi.sending ? 'default' : 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 15, padding: '13px 24px', borderRadius: isAurora ? 999 : isObsidian ? 0 : `min(${rad}px, 14px)`, minHeight: 44, opacity: formApi.sending ? 0.7 : 1 }}>
                    {formApi.sending ? 'Sending…' : c.contact.ctaLabel || 'Send enquiry'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: 28, borderTop: isObsidian ? `1px solid color-mix(in srgb, ${accent} 30%, transparent)` : `1px solid color-mix(in srgb, ${ink} 12%, transparent)`, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 14, color: mut }}>
        <span>{c.footer.copyright}</span>
        {socials.length > 0 ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {socials.map(([platform, url]) => (
              <a
                key={platform}
                className="lpb-social"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={platform}
                title={platform.charAt(0).toUpperCase() + platform.slice(1)}
                style={{ width: 34, height: 34, borderRadius: isObsidian ? 0 : 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ink} 8%, ${bg})`, color: mut, transition: 'all .15s ease' }}
              >
                <SocialIcon platform={platform} />
              </a>
            ))}
          </div>
        ) : null}
        <span>Powered by TutorialOS</span>
      </footer>

      {/* Floating WhatsApp button */}
      {waFab ? (
        fabMode === 'sticky' ? (
          <div style={{ height: 0, position: 'sticky', bottom: 18, zIndex: 6 }}>
            <a className="plp-wafab" style={{ position: 'absolute', right: 18, top: -58, width: 52, height: 52 }} href={waFab} target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp" title="Chat with us on WhatsApp">
              <WhatsAppIcon />
            </a>
          </div>
        ) : (
          <a className="plp-wafab" href={waFab} target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp" title="Chat with us on WhatsApp">
            <WhatsAppIcon />
          </a>
        )
      ) : null}
    </div>
  );
};
