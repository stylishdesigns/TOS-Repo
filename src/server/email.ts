/**
 * Email adapter (Prompt C Part A).
 *
 * The provider is chosen by environment variables, so no credentials ever
 * live in code:
 *   RESEND_API_KEY + EMAIL_FROM  -> Resend (https://resend.com)
 *
 * When no provider is configured, sending never fails provisioning: the
 * caller is told `delivered: false` so it can flag the record for TOS staff.
 * Anything logged here is redacted: a temporary password must never appear
 * in a log or a Firestore document (acceptance rule 3).
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  delivered: boolean;
  provider: 'resend' | 'none';
  error?: string;
}

export function emailProviderConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail(email: OutgoingEmail): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'Tutorial OS <onboarding@resend.dev>';

  if (!apiKey) {
    console.log(
      `[email:not-configured] Would send to ${email.to}: "${email.subject}". ` +
      `Body omitted (may contain credentials). Set RESEND_API_KEY to deliver email.`
    );
    return { delivered: false, provider: 'none' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('[email] provider rejected the message:', res.status, body.slice(0, 300));
      return { delivered: false, provider: 'resend', error: `provider status ${res.status}` };
    }
    return { delivered: true, provider: 'resend' };
  } catch (err: any) {
    console.error('[email] send failed:', err?.message || err);
    return { delivered: false, provider: 'resend', error: 'network error' };
  }
}

// ============================================================================
// TEMPLATES. Plain, warm, and specific: what the person must do next.
// ============================================================================

const WRAP = (title: string, body: string) => `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
  <p style="font-size:11px;font-weight:800;letter-spacing:.3em;color:#c2410c;margin:0 0 8px;">TUTORIAL OS</p>
  <h1 style="font-size:22px;margin:0 0 16px;">${title}</h1>
  ${body}
  <p style="font-size:11px;color:#64748b;margin-top:32px;">Tutorial OS &mdash; the school operating system for tutorial centres.</p>
</div>`;

const BOX = (label: string, value: string) => `
<div style="margin:10px 0;">
  <p style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#64748b;margin:0 0 4px;">${label}</p>
  <p style="font-size:18px;font-weight:800;margin:0;letter-spacing:.04em;">${value}</p>
</div>`;

export function buildVerificationEmail(params: { to: string; fullName: string; businessName: string; verifyUrl: string }): OutgoingEmail {
  const body = `
  <p style="margin:0 0 16px;">Hi ${escapeHtml(params.fullName)},</p>
  <p style="margin:0 0 16px;">Confirm this email address to finish setting up <strong>${escapeHtml(params.businessName)}</strong> on Tutorial OS. Your login details and access code arrive right after.</p>
  <p style="margin:24px 0;">
    <a href="${params.verifyUrl}" style="background:#ea580c;color:#ffffff;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px;display:inline-block;">Confirm my email</a>
  </p>
  <p style="font-size:13px;color:#475569;margin:0;">If the button does not work, paste this link into your browser:<br>${params.verifyUrl}</p>`;
  return {
    to: params.to,
    subject: 'Confirm your email to set up your Tutorial OS centre',
    html: WRAP('One click to finish', body),
    text: `Hi ${params.fullName},\n\nConfirm this email address to finish setting up ${params.businessName} on Tutorial OS:\n${params.verifyUrl}\n\nYour login details and access code arrive right after.`,
  };
}

export function buildWelcomeEmail(params: {
  to: string;
  fullName?: string;
  centreName: string;
  loginEmail: string;
  tempPassword?: string;
  accessCode?: string;
  appUrl: string;
  resend?: boolean;
}): OutgoingEmail {
  const credentials = params.tempPassword
    ? `${BOX('Login email', escapeHtml(params.loginEmail))}${BOX('Temporary password', escapeHtml(params.tempPassword))}`
    : `<p style="margin:0 0 12px;">Sign in with the password you already use for <strong>${escapeHtml(params.loginEmail)}</strong>.</p>`;
  const steps = params.tempPassword
    ? `<li style="margin:0 0 8px;">Sign in and set your own password (the temporary one only works for 7 days).</li>
       <li style="margin:0 0 8px;">Share your access code with your staff and students so they can join.</li>`
    : `<li style="margin:0 0 8px;">Share your access code with your staff and students so they can join.</li>`;
  const body = `
  <p style="margin:0 0 16px;">Hi ${escapeHtml(params.fullName || 'there')},</p>
  <p style="margin:0 0 16px;">${params.resend ? 'Here are fresh login details for' : 'Welcome to'} <strong>${escapeHtml(params.centreName)}</strong> on Tutorial OS.</p>
  ${credentials}
  ${params.accessCode ? BOX('Access code', escapeHtml(params.accessCode)) : ''}
  <p style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#64748b;margin:18px 0 8px;">What happens next</p>
  <ol style="margin:0;padding-left:20px;font-size:14px;line-height:1.6;">
    ${steps}
  </ol>
  <p style="margin:24px 0;">
    <a href="${params.appUrl}/" style="background:#ea580c;color:#ffffff;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px;display:inline-block;">Open Tutorial OS</a>
  </p>
  ${params.tempPassword ? `<p style="font-size:12px;color:#64748b;margin:0;">This temporary password expires in 7 days and is never stored anywhere. If it expires, contact us and we will send fresh details.</p>` : ''}`;
  return {
    to: params.to,
    subject: params.resend
      ? `Your new Tutorial OS login details for ${params.centreName}`
      : `Your Tutorial OS login details for ${params.centreName}`,
    html: WRAP(params.resend ? 'Fresh login details' : 'Welcome to Tutorial OS', body),
    text:
      `Hi ${params.fullName || 'there'},\n\n${params.resend ? 'Fresh login details for' : 'Welcome to'} ${params.centreName} on Tutorial OS.\n` +
      (params.tempPassword ? `Login email: ${params.loginEmail}\nTemporary password: ${params.tempPassword}\n` : `Sign in with your existing password for ${params.loginEmail}.\n`) +
      (params.accessCode ? `Access code: ${params.accessCode}\n` : '') +
      `\nSign in at ${params.appUrl}/\n` +
      (params.tempPassword ? '\nThe temporary password expires in 7 days and is never stored anywhere.\n' : ''),
  };
}

export function buildAccessCodeChangedEmail(params: { to: string; centreName: string; accessCode: string; appUrl: string }): OutgoingEmail {
  const body = `
  <p style="margin:0 0 16px;">The access code for <strong>${escapeHtml(params.centreName)}</strong> was changed. The old code stopped working immediately; existing members are unaffected.</p>
  ${BOX('New access code', escapeHtml(params.accessCode))}
  <p style="margin:24px 0;">
    <a href="${params.appUrl}/" style="background:#ea580c;color:#ffffff;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px;display:inline-block;">Open Tutorial OS</a>
  </p>`;
  return {
    to: params.to,
    subject: `Your new access code for ${params.centreName}`,
    html: WRAP('Access code changed', body),
    text: `The access code for ${params.centreName} was changed. The old code stopped working immediately; existing members are unaffected.\n\nNew access code: ${params.accessCode}\n\nOpen Tutorial OS: ${params.appUrl}/`,
  };
}

function escapeHtml(value: string): string {
  return (value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
