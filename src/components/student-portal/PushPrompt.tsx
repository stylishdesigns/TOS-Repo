import React, { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { ensurePushRegistered, pushPermission, pushSupported } from './push';
import { useApp } from '../../context/AppContext';

// One quiet banner (Nov 19): when the browser can receive push notifications
// and hasn't been asked yet, the student portal offers the "turn on" step
// once. Once allowed, reminders can reach the device with the app closed.
// Dismissal is remembered on this device; a member who later grants
// notification permission in browser settings gets subscribed silently here.
const DISMISS_KEY = 'tos:push-dismissed';

export function PushPrompt() {
  const { addToast } = useApp() as any;
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) return;
    // Self-heal first, banner rules second: even a dismissed banner must not
    // leave a granted device off the sender's list. The heal runs on every
    // return to the app, never asks, and just re-confirms this device.
    const heal = () => { if (pushPermission() === 'granted') void ensurePushRegistered(); };
    heal();
    const onVis = () => { if (document.visibilityState === 'visible') heal(); };
    document.addEventListener('visibilitychange', onVis);
    if (localStorage.getItem(DISMISS_KEY) === '1') {
      return () => document.removeEventListener('visibilitychange', onVis);
    }
    if (pushPermission() === 'default') setShow(true);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  if (!show) return null;

  const turnOn = async () => {
    setBusy(true);
    const state = await enablePush();
    setBusy(false);
    if (state === 'granted') {
      addToast({ type: 'success', title: 'Notifications on', description: 'Planner reminders can now reach this device.' });
      setShow(false);
    } else if (state === 'denied') {
      addToast({ type: 'info', title: 'Not allowed yet', description: 'Notifications are blocked in this browser. Allow them in the browser settings to get reminders.' });
      setShow(false);
    } else {
      setBusy(false);
    }
  };

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode */ }
    setShow(false);
  };

  return (
    <div className="px-3 pt-2">
      <div className="bg-white/95 backdrop-blur rounded-2xl border border-orange-200/80 shadow-sm px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center shrink-0">
          <BellRing className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-black text-slate-900 leading-tight">Turn on notifications?</p>
          <p className="text-[11px] text-slate-500 font-medium leading-snug mt-0.5">
            Get planner reminders even when the app is closed.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={dismiss}
            aria-label="Not now"
            className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            onClick={turnOn}
            disabled={busy}
            className="px-3 py-2 rounded-xl bg-orange-600 text-white text-[11px] font-black disabled:opacity-60 hover:bg-orange-700 active:scale-95 transition-all"
          >
            {busy ? 'Turning on...' : 'Turn on'}
          </button>
        </div>
      </div>
    </div>
  );
}
