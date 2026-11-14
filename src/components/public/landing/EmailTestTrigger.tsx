import React, { useState } from 'react';

/**
 * Email delivery test trigger (user-requested, 2026-11-13).
 *
 * Sends the registered welcome/login-details ZeptoMail template to an
 * address the owner types, so email delivery can be checked without
 * provisioning another trial account. The server endpoint is dead unless
 * ZEPTOMAIL_TEST_TRIGGER is "on" in the Netlify environment, so this block
 * is inert wherever that switch is off.
 */
export const EmailTestTrigger: React.FC = () => {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'good' | 'warn'; text: string } | null>(null);

  const send = async () => {
    if (busy || !email.trim()) return;
    setResult(null);
    setBusy(true);
    try {
      const res = await fetch('/api/public/email-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.delivered) {
        setResult({ tone: 'good', text: 'Sent. Check the inbox for the test email.' });
      } else {
        setResult({ tone: 'warn', text: String(data.error || 'Could not send the test email. Try again.') });
      }
    } catch {
      setResult({ tone: 'warn', text: 'Network error. Check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || !email.trim();

  return (
    <section id="email-test" aria-label="Email delivery test" style={{ maxWidth: '1160px', margin: '0 auto', padding: '0 20px 28px' }}>
      <div style={{ maxWidth: '640px', marginLeft: 'auto', marginRight: 'auto', border: '1px solid #334155', borderRadius: '14px', padding: '18px', background: '#0F172A' }}>
        <p style={{ font: '700 14px Inter,sans-serif', color: '#E2E8F0' }}>Email delivery test</p>
        <p style={{ font: '400 13px Inter,sans-serif', color: '#94A3B8', marginTop: '4px' }}>
          Sends the welcome-template email to the address you type. No account is created.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '12px' }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email address"
            style={{ flex: '1 1 240px', minHeight: '44px', borderRadius: '10px', border: '1px solid #334155', background: '#1E293B', color: '#F1F5F9', padding: '0 12px', font: '400 14px Inter,sans-serif' }}
          />
          <button
            type="button"
            onClick={send}
            disabled={disabled}
            style={{ minHeight: '44px', borderRadius: '10px', padding: '0 18px', font: '600 14px Inter,sans-serif', color: disabled ? '#64748B' : '#0F172A', background: disabled ? '#1E293B' : '#F59E0B', border: '1px solid #334155', cursor: disabled ? 'not-allowed' : 'pointer' }}
          >
            {busy ? 'Sending...' : 'Test trigger'}
          </button>
        </div>
        {result && (
          <p role="status" style={{ font: '500 13px Inter,sans-serif', color: result.tone === 'good' ? '#34D399' : '#FBBF24', marginTop: '10px' }}>
            {result.text}
          </p>
        )}
      </div>
    </section>
  );
};
