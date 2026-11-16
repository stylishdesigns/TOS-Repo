import React, { useEffect, useState } from 'react';
import { LandingContent } from '../../landing/landingContent';
import { LandingBody, LandingFormApi } from '../../landing/LandingBody';

/**
 * Public centre landing page (piece 5).
 *
 * Rendered at /c/{centreId} for anonymous visitors, outside the app shell:
 * no portal chrome, no auth, only public marketing content served by
 * /api/public/landing/:centreId. The markup lives in the shared
 * LandingBody renderer, so the public page and the editor's phone preview
 * always look identical. There is deliberately no sign-up here; the floating
 * WhatsApp button uses the number the centre owner set in facility admin
 * settings, and every enquiry form submission lands in the facility's
 * Website Enquiries inbox.
 */

type ApiResult = {
  ok: boolean;
  published: boolean;
  centreName: string;
  content: LandingContent;
  whatsapp?: string;
  appSlug?: string;
  appIcon?: string;
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

  // Piece 5: the landing link is what centres send students, so a visitor
  // here is installing THIS facility's app. Swap the page's manifest and
  // home-screen icon to the facility's own as soon as its page loads.
  React.useEffect(() => {
    if (!data || !data.appSlug) return;
    try {
      let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'manifest';
        document.head.appendChild(link);
      }
      link.href = `/api/public/pwa-manifest?centre=${encodeURIComponent(data.appSlug)}`;
      if (data.appIcon) {
        let ati = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
        if (!ati) {
          ati = document.createElement('link');
          ati.rel = 'apple-touch-icon';
          document.head.appendChild(ati);
        }
        ati.href = data.appIcon;
      }
    } catch {
      // Manifest swap is progressive; the page still renders without it.
    }
  }, [data]);

  if (failed) {
    return (
      <div className="plp-root">
        <div className="plp-shell" style={{ paddingTop: 80, paddingBottom: 80, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22 }}>This facility's website is not available right now.</h1>
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

  const formApi: LandingFormApi = {
    form,
    sending,
    sent,
    error: formError,
    set: (k, v) => setField(k, v),
    submit: submitEnquiry,
  };

  return (
    <LandingBody installCentre={data.appSlug || centreId} installUrl={data.appSlug ? `tutorialos.com/${data.appSlug}` : undefined}
      content={c}
      centreName={data.centreName}
      waHrefFor={waHrefFor}
      formApi={formApi}
      waFab={wa || undefined}
      fabMode="fixed"
    />
  );
};
