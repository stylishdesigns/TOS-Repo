import { useEffect, useState, type CSSProperties } from 'react';
import { getPendingInstallPrompt, waitForInstallPrompt, detectInstalledApp, resetPendingInstallPrompt, consumeInstallRetryFlag, reloadForFreshInstallPrompt } from '../../hooks/usePWAInstall';
import { isAppOnlyOn } from '../portal/AppOnlyGate';

// Dedicated install page served at /app (the app-only gate links here, and so
// does anyone who types the address). The facility's access code comes FIRST:
// with it the page finds the facility and installs THAT facility's branded app
// (name, logo and colours), never a generic Tutorial OS one.
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type AppCentre = { slug: string; name: string; logo: string; accent?: string };

const CENTRE_KEY = 'tos:app-centre';

const slugifyName = (raw: string) => String(raw || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function iosDevice(): boolean {
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
}

function mobileDevice(): boolean {
  return iosDevice() || /Android|Mobile/i.test(window.navigator.userAgent);
}

// Swap the manifest to the facility's branded one as early as possible, before
// the browser judges installability, so the install pop-up offers the
// facility's own app. The page reloads once right after a code lookup, so this
// runs on a fresh load with the manifest already pointed at the facility.
let appCentre: AppCentre | null = null;
try {
  const raw = sessionStorage.getItem(CENTRE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw) as AppCentre;
    if (parsed && parsed.slug) {
      appCentre = parsed;
      const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
      if (link) link.href = `/api/public/pwa-manifest?centre=${encodeURIComponent(parsed.slug)}`;
    }
  }
} catch { /* storage unavailable: the page still works without branding */ }

const initialsOf = (name: string) =>
  String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || 'TO';

export function AppInstallPage() {
  const [centre] = useState<AppCentre | null>(() => appCentre);
  const [installed, setInstalled] = useState(
    () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
  );
  const [justInstalled, setJustInstalled] = useState(false);
  const [code, setCode] = useState('');
  const [looking, setLooking] = useState(false);
  const [accent, setAccent] = useState<string>(() => appCentre?.accent || '');
  const [codeError, setCodeError] = useState('');
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(() => getPendingInstallPrompt() as InstallPromptEvent | null);
  const [noPrompt, setNoPrompt] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [retryHint] = useState(() => consumeInstallRetryFlag());
  const [appOnly, setAppOnly] = useState<boolean | null>(null);

  useEffect(() => {
    isAppOnlyOn().then(setAppOnly).catch(() => undefined);
  }, []);
  const [ios] = useState(iosDevice);
  const [mobile] = useState(mobileDevice);

  // Warm up the browser's install pop-up as soon as the page loads, so by the
  // time the user taps Install the pop-up fires straight away.
  useEffect(() => {
    if (installed) return;
    let alive = true;
    waitForInstallPrompt(6000).then((evt) => { if (alive && evt) setDeferred(evt as InstallPromptEvent); });
    return () => { alive = false; };
  }, [installed]);

  useEffect(() => {
    const prevBg = document.body.style.background;
    document.body.style.background = '#0F172A';
    const media = window.matchMedia('(display-mode: standalone)');
    const onMode = () => { if (media.matches) setInstalled(true); };
    const onAppInstalled = () => { setJustInstalled(true); setInstalled(true); };
    media.addEventListener?.('change', onMode);
    window.addEventListener('appinstalled', onAppInstalled);
    if (!media.matches) {
      detectInstalledApp().then((yes) => { if (yes) setInstalled(true); });
    }
    return () => {
      document.body.style.background = prevBg;
      media.removeEventListener?.('change', onMode);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const lookup = async () => {
    setCodeError('');
    const value = code.trim();
    if (!/^\d{6}$/.test(value)) {
      setCodeError('Enter the 6-digit access code from your welcome email.');
      return;
    }
    setLooking(true);
    try {
      const r = await fetch(`/api/public/centre-by-code?code=${encodeURIComponent(value)}`);
      const d = await r.json();
      if (!r.ok) {
        setCodeError(d.error || 'That code did not match any facility. Check it and try again.');
        return;
      }
      if (d.suspended) {
        setCodeError("This facility's access is currently paused. Contact Tutorial OS support.");
        return;
      }
      const name = String(d.centreName || 'Education facility');
      const a = String(d.accentColor || '').trim();
      setAccent(/^#[0-9a-fA-F]{6}$/.test(a) ? a : '');
      const slug = slugifyName(name);
      if (!slug) {
        setCodeError('Could not read that facility. Check the code and try again.');
        return;
      }
      try {
        sessionStorage.setItem(CENTRE_KEY, JSON.stringify({ slug, name, logo: String(d.logoUrl || '') }));
        // This code is now the device's facility: drop any earlier signup's
        // branding so it can never win over the code the user just entered.
        sessionStorage.removeItem('tos:signup-result');
      } catch { /* ignore */ }
      // A fresh load with the branded manifest already in place, so the
      // browser's install pop-up offers the facility's own app.
      window.location.reload();
    } catch {
      setCodeError('Could not look up that code. Check your connection and try again.');
    } finally {
      setLooking(false);
    }
  };

  const install = async () => {
    setNoPrompt(false);
    // The pop-up is offered once per page: after a cancellation the next tap
    // reloads into a clean page so the pop-up can come back.
    if (cancelled) { reloadForFreshInstallPrompt(); return; }
    let evt = deferred;
    if (!evt) {
      setWaiting(true);
      evt = (await waitForInstallPrompt(5000)) as InstallPromptEvent | null;
      setWaiting(false);
    }
    if (!evt) { setNoPrompt(true); return; }
    try {
      await evt.prompt();
    } catch {
      setNoPrompt(true);
      return;
    }
    const choice = await evt.userChoice;
    if (choice.outcome === 'accepted') {
      setJustInstalled(true);
      setDeferred(null);
    } else {
      setDeferred(null);
      resetPendingInstallPrompt();
      setCancelled(true);
    }
  };

  const card: CSSProperties = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 22, textAlign: 'center' };
  const primaryBtn: CSSProperties = { width: '100%', minHeight: 52, borderRadius: 12, border: 'none', background: accent || '#EA580C', color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer' };

  const loginCard = (
    <div style={{ ...card, background: 'rgba(22,163,74,0.14)', borderColor: 'rgba(34,197,94,0.35)' }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 6px', color: '#DCFCE7' }}>
        {justInstalled ? 'All set' : 'You already have the app'}
      </h2>
      <p style={{ fontSize: 14.5, color: '#BBF7D0', margin: 0, lineHeight: 1.55 }}>
        {justInstalled
          ? `${centre ? centre.name : 'Tutorial OS'} is now on your home screen. Check your home screen for the app and open it from there to sign in with the details from your welcome email.`
          : `${centre ? centre.name : 'Tutorial OS'} is already on your home screen. Check your home screen for the app and open it from there to sign in.`}
      </p>
    </div>
  );

  const codeStep = (
    <>
      <span style={{ display: 'inline-block', background: 'rgba(234,88,12,0.16)', color: '#FDBA74', borderRadius: 999, padding: '8px 16px', fontSize: 13, fontWeight: 700 }}>
        Your facility&apos;s app
      </span>
      <h1 style={{ fontSize: 'clamp(26px,6vw,34px)', fontWeight: 800, margin: '16px 0 10px', letterSpacing: '-0.02em' }}>
        Install your facility&apos;s app
      </h1>
      <p style={{ color: '#94A3B8', fontSize: 15, lineHeight: 1.6, margin: '0 auto 26px', maxWidth: 420 }}>
        Enter your facility&apos;s access code so the app installs with your facility&apos;s own name, logo and colours. The code is in your welcome email.
      </p>
      <div style={card}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          aria-label="Facility access code"
          style={{
            width: '100%', textAlign: 'center', letterSpacing: '0.35em', fontSize: 22, fontWeight: 800,
            padding: '14px 0', borderRadius: 12, border: '1px solid rgba(255,255,255,0.18)',
            background: 'rgba(255,255,255,0.06)', color: '#fff', outline: 'none', boxSizing: 'border-box',
          }}
        />
        <button
          type="button"
          onClick={lookup}
          disabled={looking || code.length !== 6}
          style={{ ...primaryBtn, marginTop: 14, opacity: looking || code.length !== 6 ? 0.55 : 1 }}
        >
          {looking ? 'Finding your facility…' : 'Find my facility'}
        </button>
        {codeError && <p style={{ color: '#FCA5A5', fontSize: 13.5, marginTop: 10, lineHeight: 1.5 }}>{codeError}</p>}
      </div>
      <p style={{ color: '#64748B', fontSize: 12.5, marginTop: 16 }}>Don&apos;t have the code? Ask your facility.</p>
    </>
  );

  const readyStep = centre ? (
    <>
      {centre.logo ? (
        <img src={centre.logo} alt={centre.name} style={{ width: 72, height: 72, borderRadius: 18, objectFit: 'cover', margin: '0 auto 16px', display: 'block', border: '1px solid rgba(255,255,255,0.15)' }} />
      ) : (
        <span style={{ width: 72, height: 72, borderRadius: 18, background: accent || '#EA580C', color: '#fff', fontWeight: 800, fontSize: 24, display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>{initialsOf(centre.name)}</span>
      )}
      <h1 style={{ fontSize: 'clamp(24px,6vw,32px)', fontWeight: 800, margin: '0 0 10px', letterSpacing: '-0.02em' }}>
        {installed || justInstalled ? `${centre.name}'s app is on your home screen` : `Install ${centre.name}'s app`}
      </h1>
      <p style={{ color: '#94A3B8', fontSize: 15, lineHeight: 1.6, margin: '0 auto 26px', maxWidth: 420 }}>
        The app carries {centre.name}&apos;s name, logo and colours on every screen your students and tutors see.
      </p>

      {installed || justInstalled ? (
        <div style={{ display: 'grid', gap: 14, justifyItems: 'center' }}>
          <button
            type="button"
            disabled
            style={{ ...primaryBtn, minWidth: 240, minHeight: 56, fontSize: 16, background: '#16A34A', cursor: 'default', opacity: 1 }}
          >
            App installed
          </button>
          {loginCard}
        </div>
      ) : ios ? (
        <div style={{ ...card, textAlign: 'left' }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 14px' }}>Add it to your Home Screen</h2>
          <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 12 }}>
            <li style={{ fontSize: 15, lineHeight: 1.55 }}>Tap the <strong>Share</strong> button at the bottom of Safari.</li>
            <li style={{ fontSize: 15, lineHeight: 1.55 }}>Scroll and choose <strong>Add to Home Screen</strong>.</li>
            <li style={{ fontSize: 15, lineHeight: 1.55 }}>Tap <strong>Add</strong>. The app appears on your home screen like any app.</li>
          </ol>
          <p style={{ fontSize: 12.5, color: '#94A3B8', margin: '14px 0 0' }}>There is no install button on iPhone; Apple only allows it from the Share menu.</p>
        </div>
      ) : mobile ? (
        <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
          <button type="button" onClick={install} disabled={waiting} style={{ ...primaryBtn, minWidth: 240, minHeight: 56, fontSize: 16, opacity: waiting ? 0.75 : 1 }}>
            {waiting ? 'Getting the install pop-up ready…' : 'Install the app'}
          </button>
          {noPrompt && !cancelled && (
            <p style={{ fontSize: 13.5, color: '#FDBA74', margin: 0, lineHeight: 1.6, maxWidth: 400 }}>
              Chrome didn&apos;t offer the install pop-up this time. Wait a few seconds and tap Install again. If the app is
              already on this phone, open it from your home screen.
            </p>
          )}
          {cancelled && (
            <p style={{ fontSize: 13.5, color: '#FDBA74', margin: 0, lineHeight: 1.6, maxWidth: 400 }}>
              You cancelled the install. Tap Install again whenever you&apos;re ready.
            </p>
          )}
          {retryHint && !cancelled && !noPrompt && (
            <p style={{ fontSize: 12.5, color: '#94A3B8', margin: 0 }}>Tap Install to bring the pop-up back.</p>
          )}
        </div>
      ) : (
        <div style={card}>
          <h2 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 6px' }}>On a computer?</h2>
          {appOnly === false ? (
            <>
              <p style={{ fontSize: 14.5, color: '#94A3B8', margin: '0 0 18px', lineHeight: 1.55 }}>
                {centre.name} runs right in your browser, and you can install it from the address bar too. On your phone it is even better.
              </p>
              <a href={`/?centre=${encodeURIComponent(centre.slug)}`} style={{ ...primaryBtn, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', minWidth: 220 }}>
                Open {centre.name}
              </a>
            </>
          ) : (
            <p style={{ fontSize: 14.5, color: '#94A3B8', margin: 0, lineHeight: 1.55 }}>
              {centre.name} opens in the installed app. Install it straight from your browser&apos;s address bar (the install icon appears there on this page), then sign in inside the app itself.
            </p>
          )}
        </div>
      )}
    </>
  ) : null;

  return (
    <div style={{ minHeight: '100dvh', background: '#0F172A', color: '#F8FAFC', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, sans-serif' }}>
      <header style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <img src="/tos-brand-icon.png" alt="Tutorial OS" style={{ width: 38, height: 38, borderRadius: 10, objectFit: 'contain', flexShrink: 0 }} />
        <span style={{ fontWeight: 800, fontSize: 17 }}>Tutorial OS</span>
      </header>

      <main style={{ flex: 1, display: 'grid', placeItems: 'center', padding: '40px 20px', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ width: '100%', maxWidth: 480, textAlign: 'center' }}>
          {installed && !justInstalled && !centre ? loginCard : centre ? readyStep : codeStep}
        </div>
      </main>

      {appOnly && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0 24px 6px' }}>
          <a
            href="/#landing"
            style={{
              color: '#CBD5E1',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: 14,
              padding: '12px 22px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.16)',
              background: 'rgba(255,255,255,0.04)',
            }}
          >
            Back to landing page
          </a>
        </div>
      )}
      <footer style={{ padding: '18px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', color: '#64748B', fontSize: 13 }}>
        <span style={{ fontWeight: 700, color: '#94A3B8' }}>Tutorial OS</span>
        <span>One system for educational facilities.</span>
      </footer>
    </div>
  );
}
