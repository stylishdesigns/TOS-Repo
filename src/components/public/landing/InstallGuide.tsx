import React from 'react';

/**
 * Animated install guide (Nov 16). Opens when someone taps "Install app" on a
 * facility landing page and renders inline on the signup app page (inline:
 * phone screen on the left, guide on the right, no heading of its own). Four
 * auto-playing scenes per platform (Android Chrome / iPhone Safari) with step
 * captions, dots and pause/play, adapted from the owner's HTML guide. Android
 * installs right from the guide; iPhone walks Safari Add to Home Screen.
 */

export type InstallGuideProps = {
  centreName: string;
  url: string;
  accent?: string;
  variant?: 'overlay' | 'inline';
  canPrompt?: boolean;
  noPrompt?: boolean;
  onInstall?: () => void;
  onDone?: () => void;
  onClose?: () => void;
};

const ACCENT = '#EA580C';
const INK = '#0F172A';
const MUT = '#64748B';

const initialsOf = (name: string) => {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return (words.map((w) => Array.from(w)[0]).join('') || 'TO').toUpperCase();
};

const isIOSDevice = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints > 1);
const isAndroidDevice = () => /Android/i.test(navigator.userAgent);
const isStandalone = () => {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
};
const isNotSafari = () => /CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(navigator.userAgent);

const CAPTIONS: Record<'a' | 'i', Array<[string, string]>> = {
  a: [
    ['Tap Install app', 'Tap the orange Install app button right below this guide.'],
    ['Confirm the pop-up', 'Android asks "Install app?" Tap Install.'],
    ['Find your app', "Your facility's icon is now on your home screen."],
    ['Open it and sign in', 'Open it like any other app. There is no browser bar and no typing a web address.'],
  ],
  i: [
    ['Tap the Share button', 'It is the square with an arrow at the bottom of the screen.'],
    ['Tap Add to Home Screen', 'Scroll down the list that appears and tap Add to Home Screen.'],
    ['Tap Add', 'Check the name, then tap Add in the top corner.'],
    ['Open it from your home screen', 'Open the app like any other. Your tutors and students do the same.'],
  ],
};

const Pointer: React.FC<{ x: string; y: string; accent: string }> = ({ x, y, accent }) => (
  <span
    style={{ position: 'absolute', left: x, top: y, width: 18, height: 18, borderRadius: '50%', border: '3px solid #FFFFFF', background: accent, boxShadow: '0 0 0 3px rgba(15,23,42,.35)', animation: 'igPoint 1.4s ease-in-out infinite', pointerEvents: 'none' }}
  />
);

const MiniWeb: React.FC<{ ini: string; accent: string }> = ({ ini, accent }) => (
  <div style={{ padding: '18px 14px 0' }}>
    <div style={{ width: 44, height: 44, borderRadius: 12, background: accent, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 15 }}>{ini}</div>
    <div style={{ height: 10, borderRadius: 5, background: '#E2E8F0', width: '70%', marginTop: 14, animation: 'igBar 1.6s ease-in-out infinite' }} />
    <div style={{ height: 10, borderRadius: 5, background: '#E2E8F0', width: '55%', marginTop: 8, animation: 'igBar 1.6s ease-in-out .2s infinite' }} />
    <div style={{ height: 10, borderRadius: 5, background: '#E2E8F0', width: '40%', marginTop: 8, animation: 'igBar 1.6s ease-in-out .4s infinite' }} />
  </div>
);

const StatusBar: React.FC = () => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 14px', fontSize: 10, fontWeight: 700, color: '#111827', background: '#fff' }}>
    <span>9:41</span>
    <span>5G</span>
  </div>
);

const HomeGrid: React.FC<{ ini: string; name: string; accent: string }> = ({ ini, name, accent }) => (
  <div style={{ padding: '26px 20px' }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, justifyItems: 'center' }}>
      {Array.from({ length: 8 }).map((_, k) =>
        k === 5 ? (
          <div key={k} style={{ display: 'grid', gap: 4, justifyItems: 'center' }}>
            <span style={{ width: 44, height: 44, borderRadius: 12, background: accent, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13 }}>{ini}</span>
            <span style={{ fontSize: 8, fontWeight: 600, color: '#334155', maxWidth: 48, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          </div>
        ) : (
          <span key={k} style={{ width: 44, height: 44, borderRadius: 12, background: '#E2E8F0', display: 'block' }} />
        ),
      )}
    </div>
  </div>
);

const Splash: React.FC<{ ini: string; name: string; accent: string }> = ({ ini, name, accent }) => (
  <div style={{ position: 'absolute', inset: 0, background: accent, display: 'grid', placeItems: 'center', animation: 'igSplash 3.2s ease both' }}>
    <div style={{ textAlign: 'center', color: '#fff' }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(255,255,255,.22)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 18, margin: '0 auto 10px' }}>{ini}</div>
      <div style={{ fontWeight: 800, fontSize: 13 }}>{name}</div>
    </div>
  </div>
);

const SignInMock: React.FC<{ ini: string; accent: string }> = ({ ini, accent }) => (
  <div style={{ padding: '30px 16px', textAlign: 'center' }}>
    <div style={{ width: 44, height: 44, borderRadius: 12, background: accent, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 15, margin: '0 auto 12px' }}>{ini}</div>
    <div style={{ fontWeight: 800, fontSize: 13, color: INK, marginBottom: 12 }}>Sign in</div>
    <div style={{ height: 30, borderRadius: 8, background: '#F1F5F9', marginBottom: 8 }} />
    <div style={{ height: 30, borderRadius: 8, background: '#F1F5F9', marginBottom: 12 }} />
    <div style={{ height: 34, borderRadius: 8, background: accent, opacity: 0.85 }} />
  </div>
);

const InstallDialog: React.FC<{ ini: string; name: string; accent: string }> = ({ ini, name, accent }) => (
  <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 16 }}>
    <div style={{ background: '#fff', borderRadius: 16, padding: 16, width: '100%', boxShadow: '0 18px 40px rgba(15,23,42,.28)' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ width: 40, height: 40, borderRadius: 10, background: accent, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13, flex: 'none' }}>{ini}</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 13, color: INK }}>Install app?</div>
          <div style={{ fontSize: 11, color: MUT }}>{name}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <span style={{ flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: 9, background: '#F1F5F9', color: INK, fontWeight: 700, fontSize: 12 }}>Cancel</span>
        <span style={{ flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: 9, background: accent, color: '#fff', fontWeight: 700, fontSize: 12 }}>Install</span>
      </div>
    </div>
  </div>
);

const ShareSheet: React.FC<{ accent: string }> = ({ accent }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#F8FAFC', borderRadius: '18px 18px 0 0', padding: '12px 14px 18px', boxShadow: '0 -10px 30px rgba(15,23,42,.25)' }}>
    {[
      ['Copy', '⧉', false],
      ['Add to Bookmarks', '☆', false],
      ['Add to Home Screen', '＋', true],
      ['Find on Page', '⌕', false],
    ].map(([label, icon, hot]) => (
      <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 12px', borderRadius: 10, marginBottom: 6, background: hot ? accent : '#FFFFFF', color: hot ? '#fff' : INK, fontWeight: hot ? 800 : 500, fontSize: 12.5 }}>
        <span>{label}</span>
        <span>{icon}</span>
      </div>
    ))}
  </div>
);

const AddToHomeDialog: React.FC<{ ini: string; name: string; url: string; accent: string }> = ({ ini, name, url, accent }) => (
  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
    <div style={{ background: '#F1F5F9', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5 }}>
      <span style={{ color: '#2563EB', fontWeight: 600 }}>Cancel</span>
      <span style={{ color: INK, fontWeight: 700 }}>Add to Home Screen</span>
      <span style={{ color: accent, fontWeight: 800 }}>Add</span>
    </div>
    <div style={{ background: '#fff', flex: 1, display: 'grid', placeItems: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <span style={{ width: 42, height: 42, borderRadius: 10, background: accent, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13, margin: '0 auto 8px' }}>{ini}</span>
        <div style={{ fontWeight: 700, fontSize: 12, color: INK }}>{name}</div>
        <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>{url}</div>
      </div>
    </div>
  </div>
);

const SAFARI_TOOLBAR = (
  <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '9px 8px', borderTop: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: 13, color: '#2563EB' }}>
    <span>‹</span><span style={{ opacity: 0.4 }}>›</span><span>⬆</span><span>▢</span><span>❐</span>
  </div>
);

export const InstallGuide: React.FC<InstallGuideProps> = ({ centreName, url, accent = ACCENT, variant = 'overlay', canPrompt = false, noPrompt = false, onInstall, onDone, onClose }) => {
  const detected = isIOSDevice() ? 'i' : 'a';
  const [platform, setPlatform] = React.useState<'a' | 'i'>(detected);
  const [idx, setIdx] = React.useState(0);
  const [playing, setPlaying] = React.useState(true);
  const ini = initialsOf(centreName);

  React.useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => setIdx((v) => (v + 1) % 4), 5000);
    return () => window.clearInterval(t);
  }, [playing, platform]);

  const captions = CAPTIONS[platform];
  const standalone = isStandalone();
  const notSafari = platform === 'i' && isIOSDevice() && isNotSafari();
  const onDesktop = !isIOSDevice() && !isAndroidDevice();
  const warning = notSafari
    ? "You are not in Safari. Copy this page's link and open it in Safari to install."
    : standalone
      ? 'You are already using the installed app.'
      : onDesktop
        ? 'Open this page on your phone to install. You can still watch the guide here.'
        : '';

  const scene = () => {
    const dim = platform === 'a' ? (idx === 1 ? 'brightness(.55)' : 'none') : idx >= 1 && idx <= 2 ? 'brightness(.55)' : 'none';
    const body = (
      <div style={{ filter: dim, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <StatusBar />
        {platform === 'a' ? (
          <>
            <div style={{ padding: '8px 12px', background: '#fff' }}>
              <div style={{ background: '#F1F5F9', borderRadius: 999, padding: '7px 12px', fontSize: 11, color: '#334155', textAlign: 'center', overflow: 'hidden', whiteSpace: 'nowrap' }}>{url}</div>
            </div>
            <MiniWeb ini={ini} accent={accent} />
            {idx === 0 ? (
              <div style={{ padding: '16px 14px 0', textAlign: 'center' }}>
                <span style={{ display: 'inline-block', background: accent, color: '#fff', fontWeight: 800, fontSize: 12, padding: '10px 18px', borderRadius: 999 }}>↓ Install app</span>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <MiniWeb ini={ini} accent={accent} />
            <div style={{ marginTop: 'auto' }}>
              <div style={{ padding: '8px 12px', background: '#F8FAFC' }}>
                <div style={{ background: '#E2E8F0', borderRadius: 999, padding: '7px 12px', fontSize: 11, color: '#334155', textAlign: 'center', overflow: 'hidden' }}>
                  <span style={{ display: 'inline-block', overflow: 'hidden', whiteSpace: 'nowrap', animation: 'igTyp 4.5s steps(30) infinite' }}>{url}</span>
                </div>
              </div>
              {SAFARI_TOOLBAR}
            </div>
          </>
        )}
      </div>
    );

    return (
      <div style={{ position: 'relative', width: 250, height: 470, borderRadius: 30, border: '9px solid #0F172A', background: '#F8FAFC', overflow: 'hidden', margin: '0 auto', flex: 'none' }}>
        <div style={{ position: 'absolute', inset: 0 }}>{body}</div>
        {platform === 'a' && idx === 0 ? <Pointer x="50%" y="48%" accent={accent} /> : null}
        {platform === 'a' && idx === 1 ? <InstallDialog ini={ini} name={centreName} accent={accent} /> : null}
        {platform === 'a' && idx === 2 ? <HomeGrid ini={ini} name={centreName} accent={accent} /> : null}
        {platform === 'a' && idx === 3 ? (
          <>
            <HomeGrid ini={ini} name={centreName} accent={accent} />
            <Splash ini={ini} name={centreName} accent={accent} />
          </>
        ) : null}
        {platform === 'i' && idx === 0 ? <Pointer x="50%" y="88%" accent={accent} /> : null}
        {platform === 'i' && idx === 1 ? <ShareSheet accent={accent} /> : null}
        {platform === 'i' && idx === 2 ? <AddToHomeDialog ini={ini} name={centreName} url={url} accent={accent} /> : null}
        {platform === 'i' && idx === 3 ? (
          <>
            <HomeGrid ini={ini} name={centreName} accent={accent} />
            <Splash ini={ini} name={centreName} accent={accent} />
          </>
        ) : null}
      </div>
    );
  };

  const card = (
    <div className="igCard" style={{ background: '#fff', color: INK, borderRadius: 24, maxWidth: 780, width: '100%', margin: '0 auto', padding: '22px 22px 26px', maxHeight: '94vh', overflowY: 'auto' }}>
      {variant === 'overlay' ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <h2 style={{ font: '800 19px "Plus Jakarta Sans", Inter, sans-serif', margin: 0 }}>Install the app on your phone</h2>
            <button type="button" onClick={onClose} aria-label="Close the install guide" style={{ border: 'none', background: '#F1F5F9', color: MUT, width: 34, height: 34, borderRadius: '50%', fontSize: 16, cursor: 'pointer', flex: 'none' }}>✕</button>
          </div>
          <p style={{ font: '500 14px/1.6 Inter, sans-serif', color: MUT, margin: '8px 0 0' }}>
            Tutorial OS works as an app on your phone: no browser bar, no typing a web address. Watch the guide, then install.
          </p>
        </>
      ) : null}

      <style>{'.igRow{display:flex;gap:24px;align-items:flex-start;margin-top:16px}.igScreen{width:288px;height:541px;flex:none;margin:0 auto;position:relative}.igScreen>div{transform:scale(1.15);transform-origin:top left}.igSide{flex:1;min-width:220px}@media (max-width:660px){.igRow{gap:10px}.igScreen{width:186px;height:348px}.igScreen>div{transform:scale(.74)}.igSide{min-width:0}.igSide h3{font-size:14px !important}.igSide p{font-size:11.5px !important}.igCard{padding:16px 14px !important}}'}</style>
      <div style={{ display: 'flex', gap: 8, margin: '16px 0 0', background: '#F1F5F9', borderRadius: 12, padding: 4 }}>
        {([['a', 'Android'], ['i', 'iPhone']] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-selected={platform === id}
            onClick={() => { setPlatform(id); setIdx(0); }}
            style={{ flex: 1, border: 'none', borderRadius: 9, padding: '10px 0', font: '700 14px Inter, sans-serif', cursor: 'pointer', background: platform === id ? '#fff' : 'transparent', color: platform === id ? accent : MUT, boxShadow: platform === id ? '0 1px 4px rgba(15,23,42,.12)' : 'none' }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="igRow">
        <div className="igScreen">
          {scene()}
        </div>
        <div className="igSide">
        <div style={{ textAlign: 'center', margin: '8px 0 0' }}>
        <span style={{ font: '700 11px Inter, sans-serif', letterSpacing: '0.06em', textTransform: 'uppercase', color: accent }}>Step {idx + 1} of 4</span>
        <h3 style={{ font: '800 17px Inter, sans-serif', margin: '6px 0 4px' }}>{captions[idx][0]}</h3>
        <p style={{ font: '500 13.5px/1.6 Inter, sans-serif', color: MUT, margin: 0 }}>{captions[idx][1]}</p>
      </div>

        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, margin: '14px 0 0' }}>
        {captions.map((c, k) => (
          <button key={k} type="button" aria-label={`Step ${k + 1}: ${c[0]}`} aria-current={k === idx ? 'step' : undefined} onClick={() => { setIdx(k); setPlaying(true); }} style={{ width: 9, height: 9, borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer', background: k === idx ? accent : '#CBD5E1' }} />
        ))}
        <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause the animation' : 'Play the animation'} style={{ border: '1px solid #E2E8F0', background: '#fff', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', color: MUT, fontSize: 11 }}>{playing ? '❚❚' : '▶'}</button>
      </div>

      {platform === 'a' ? (
        <div style={{ marginTop: 16 }}>
          <button type="button" onClick={() => { if (onInstall) onInstall(); }} style={{ width: '100%', border: 'none', borderRadius: 12, padding: '15px 0', background: accent, color: '#fff', font: '800 16px Inter, sans-serif', cursor: 'pointer' }}>↓ Install app</button>
          {noPrompt && (
            <p style={{ font: '500 12.5px/1.55 Inter, sans-serif', color: '#B91C1C', margin: '6px 0 0', textAlign: 'center' }}>Your phone hasn't offered the install pop-up. Tap the three-dot menu at the top of your browser and choose Install app (or Add to Home screen). If the app is already on this phone, check your home screen.</p>
          )}
          <p style={{ font: '500 12.5px/1.55 Inter, sans-serif', color: MUT, margin: '8px 0 0', textAlign: 'center' }}>Tap the button and your phone will ask you to confirm.</p>
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          <button type="button" onClick={() => { if (onDone) onDone(); }} style={{ width: '100%', border: 'none', borderRadius: 12, padding: '15px 0', background: accent, color: '#fff', font: '800 16px Inter, sans-serif', cursor: 'pointer' }}>I have added it to my home screen</button>
          <p style={{ font: '500 12.5px/1.55 Inter, sans-serif', color: MUT, margin: '8px 0 0', textAlign: 'center' }}>There is no install button on iPhone. Apple only allows it from the Share menu.</p>
        </div>
      )}

      <p style={{ font: '500 12px/1.5 Inter, sans-serif', color: MUT, margin: '14px 0 0', textAlign: 'center' }}>
        We detected: <b style={{ color: INK }}>{isIOSDevice() ? 'iPhone' : isAndroidDevice() ? 'Android phone' : 'a computer'}</b>
        {warning ? <><br />{warning}</> : null}
      </p>
    </div>
  );

  if (variant === 'inline') return card;

  return (
    <div role="dialog" aria-modal="true" aria-label="How to install the app" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(2,6,23,.58)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 14px', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 800 }}>{card}</div>
    </div>
  );
};
