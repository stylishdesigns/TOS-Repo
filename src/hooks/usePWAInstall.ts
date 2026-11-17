import { useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// Chrome fires beforeinstallprompt once, and it can fire before React has
// even mounted. The earliest possible capture lives at module scope so no
// install button ever misses the browser's install offer.
let pendingInstallPrompt: BeforeInstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    pendingInstallPrompt = e as BeforeInstallPromptEvent;
  });
}

export const getPendingInstallPrompt = (): BeforeInstallPromptEvent | null => pendingInstallPrompt;

// The browser offers the install pop-up once per page. After it is used or
// cancelled, only a fresh page load brings it back, so install screens clear
// the captured offer and, on the next tap, reload into a clean page instead of
// going silent.
export const resetPendingInstallPrompt = (): void => {
  pendingInstallPrompt = null;
};

export const INSTALL_RETRY_KEY = 'tos:install-retry';

export const consumeInstallRetryFlag = (): boolean => {
  try {
    if (sessionStorage.getItem(INSTALL_RETRY_KEY) === '1') {
      sessionStorage.removeItem(INSTALL_RETRY_KEY);
      return true;
    }
  } catch { /* storage unavailable */ }
  return false;
};

export const reloadForFreshInstallPrompt = (): void => {
  try { sessionStorage.setItem(INSTALL_RETRY_KEY, '1'); } catch { /* ignore */ }
  window.location.reload();
};

export async function waitForInstallPrompt(ms: number): Promise<BeforeInstallPromptEvent | null> {
  const deadline = Date.now() + ms;
  while (!pendingInstallPrompt && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return pendingInstallPrompt;
}

// True when this facility's app is already on the phone (Chrome then never
// fires the install offer again).
export async function detectInstalledApp(): Promise<boolean> {
  const nav = window.navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> };
  if (!nav.getInstalledRelatedApps) return false;
  try {
    const apps = await nav.getInstalledRelatedApps();
    return Array.isArray(apps) && apps.length > 0;
  } catch {
    return false;
  }
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => pendingInstallPrompt);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detect standalone mode (already installed)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    // Detect iOS devices
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      pendingInstallPrompt = null;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    if (!isStandalone) {
      detectInstalledApp().then((yes) => { if (yes) setIsInstalled(true); });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    const evt = deferredPrompt || (await waitForInstallPrompt(2000));
    if (!evt) return false;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      pendingInstallPrompt = null;
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
  };
}
