import {useEffect, useState} from 'react';

// Dedicated install page served at /app. The welcome email's "Download the app"
// button links here: one tap installs the PWA on Android/desktop Chrome, iOS
// gets the Add to Home Screen steps, and desktop users can open the web app.
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{outcome: 'accepted' | 'dismissed'}>;
};

function iosDevice(): boolean {
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
}

function mobileDevice(): boolean {
  return iosDevice() || /Android|Mobile/i.test(window.navigator.userAgent);
}

export function AppInstallPage() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(
    () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari exposes navigator.standalone when the PWA is running installed.
      (window.navigator as Navigator & {standalone?: boolean}).standalone === true,
  );
  const [justInstalled, setJustInstalled] = useState(false);
  const [ios] = useState(iosDevice);
  const [mobile] = useState(mobileDevice);

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

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === 'accepted') {
      setJustInstalled(true);
      setDeferred(null);
    }
  };

  return (
    <div className="pg">
      <header style={{background:'#020617'}}>
        <div className="w bar">
          <div className="brand">
            <span className="bx" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24"><path d="M4 19V5a2 2 0 0 1 2-2h13v14H6a2 2 0 0 0-2 2Zm0 0a2 2 0 0 0 2 2h13"/></svg>
            </span>
            Tutorial OS
          </div>
        </div>
      </header>

      <section className="hero dk" style={{padding:'56px 0 64px'}}>
        <div style={{maxWidth:560, margin:'0 auto', textAlign:'center', padding:'0 24px'}}>
          <span className="pill" style={{marginBottom:18}}>Tutorial OS community</span>
          <h1 className="hx" style={{fontSize:'clamp(32px,6vw,46px)'}}>Get the Tutorial OS app</h1>
          <p className="sub" style={{margin:'0 auto 30px'}}>
            One system for your facility: students, tutors and your dashboard, right on your
            home screen. Installing takes under a minute.
          </p>

          {installed ? (
            <div className="cd" style={{padding:24, color:'#0F172A'}}>
              <h3 style={{fontSize:20, marginBottom:6}}>You already have the app</h3>
              <p style={{fontSize:15, color:'#475569'}}>Tutorial OS is installed. Open it from your home screen or app list and sign in with the details from your welcome email.</p>
            </div>
          ) : justInstalled ? (
            <div className="cd" style={{padding:24, color:'#0F172A'}}>
              <h3 style={{fontSize:20, marginBottom:6}}>All set</h3>
              <p style={{fontSize:15, color:'#475569'}}>Tutorial OS is now on your home screen. Open it and sign in with the details from your welcome email.</p>
            </div>
          ) : ios ? (
            <div className="cd" style={{padding:24, textAlign:'left', color:'#0F172A'}}>
              <h3 style={{fontSize:20, marginBottom:14}}>Add it to your Home Screen</h3>
              <ol style={{margin:0, paddingLeft:20, display:'grid', gap:12}}>
                <li style={{fontSize:15, lineHeight:1.5}}>Tap the <strong>Share</strong> button at the bottom of Safari.</li>
                <li style={{fontSize:15, lineHeight:1.5}}>Scroll and choose <strong>Add to Home Screen</strong>.</li>
                <li style={{fontSize:15, lineHeight:1.5}}>Tap <strong>Add</strong>. Tutorial OS appears on your home screen like any app.</li>
              </ol>
            </div>
          ) : (
            <div style={{display:'grid', gap:14, justifyItems:'center'}}>
              {deferred ? (
                <button type="button" className="btn pr" style={{minWidth:240, minHeight:56, fontSize:16}} onClick={install}>
                  Install the app
                </button>
              ) : mobile ? (
                <div className="cd" style={{padding:24, textAlign:'left', color:'#0F172A'}}>
                  <h3 style={{fontSize:20, marginBottom:14}}>Add it to your Home Screen</h3>
                  <ol style={{margin:0, paddingLeft:20, display:'grid', gap:12}}>
                    <li style={{fontSize:15, lineHeight:1.5}}>Tap the <strong>menu</strong> button (three dots) at the top of your browser.</li>
                    <li style={{fontSize:15, lineHeight:1.5}}>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
                  </ol>
                </div>
              ) : (
                <div className="cd" style={{padding:24, color:'#0F172A'}}>
                  <h3 style={{fontSize:20, marginBottom:6}}>On a computer?</h3>
                  <p style={{fontSize:15, color:'#475569', marginBottom:18}}>Tutorial OS runs right in your browser, and you can install it from the address bar too. On your phone it is even better.</p>
                  <a className="btn pr" style={{minWidth:220, minHeight:52, fontSize:15}} href="/">Open Tutorial OS</a>
                </div>
              )}
              <p style={{fontSize:13, color:'#94A3B8'}}>Free during your 14-day trial.</p>
            </div>
          )}
        </div>
      </section>

      <footer className="dk" style={{padding:'26px 0'}}>
        <div className="w" style={{display:'flex', flexWrap:'wrap', gap:10, alignItems:'center', justifyContent:'space-between'}}>
          <span className="brand" style={{fontSize:14}}>
            <span className="bx" style={{width:30, height:30, borderRadius:9}} aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24"><path d="M4 19V5a2 2 0 0 1 2-2h13v14H6a2 2 0 0 0-2 2Zm0 0a2 2 0 0 0 2 2h13"/></svg>
            </span>
            Tutorial OS
          </span>
          <span style={{fontSize:13, color:'#94A3B8'}}>One system for educational facilities.</span>
        </div>
      </footer>
    </div>
  );
}
