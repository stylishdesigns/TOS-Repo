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
  /** Kept for the OTP template route only; ordinary mail always sends the
   *  internal template's own HTML and text. */
  mergeFields?: Record<string, string>;
  /** The OTP template key, set only by sendOtpEmail. */
  templateKey?: string;
}

export interface SendEmailResult {
  delivered: boolean;
  provider: 'resend' | 'zeptomail' | 'none';
  error?: string;
}

export function emailProviderConfigured(): boolean {
  return !!(process.env.ZEPTOMAIL_API || process.env.RESEND_API_KEY);
}

// ZeptoMail (Zoho) transactional sending. Credentials come from Netlify env:
//   ZEPTOMAIL_API          - the mail agent's Send Mail token
//   ZEPTOMAIL_AGENT_ALIAS  - the verified sender address when it holds one
//   ZEPTOMAIL_HOST         - API base URL when it holds one (otherwise the
//                            default https://api.zeptomail.com)
//   ZEPTOMAIL_BOUNCE       - optional: a verified bounce address under the
//                            agent's domain; when unset the field is omitted
//                            and Zoho uses the account's bounce address
// Values are never logged.
function zeptoFromAddress(): string {
  const alias = (process.env.ZEPTOMAIL_AGENT_ALIAS || '').trim();
  if (alias.includes('@')) return alias;
  const from = (process.env.EMAIL_FROM || '').trim();
  const m = from.match(/<([^>]+)>/);
  const addr = (m ? m[1] : from).trim();
  if (addr.includes('@') && !addr.includes('resend.dev')) return addr;
  return 'noreply@tutorialos.com';
}

async function sendViaZepto(email: OutgoingEmail): Promise<SendEmailResult> {
  const token = (process.env.ZEPTOMAIL_API || '').trim().replace(/^Zoho-enczapikey\s+/i, '');
  if (!token) return { delivered: false, provider: 'zeptomail', error: 'not configured' };
  // The tutorialos_email agent was created on the Zoho CPaaS console, whose
  // send endpoint is cpaas.zoho.com/v1.1/email (NOT the legacy
  // api.zeptomail.com). Honor ZEPTOMAIL_HOST only when it names a zoho host.
  const host = (process.env.ZEPTOMAIL_HOST || '').trim();
  const normalized = host && !/^https?:\/\//.test(host) ? `https://${host}` : host;
  const base = normalized && /zoho\.com/i.test(normalized)
    ? normalized.replace(/\/+$/, '')
    : 'https://cpaas.zoho.com';
  const from = zeptoFromAddress();
  const domain = (from.split('@')[1] || 'tutorialos.com').trim();
  const bounce =
    (process.env.ZEPTOMAIL_BOUNCE || '').trim() ||
    (host.includes('@') ? host : '');
  // Batch 57: the registered ZeptoMail templates are retired. Every mail goes
  // out as a raw message carrying Tutorial OS's own template (email.ts
  // builders and welcomeTemplate.ts), so what owners receive always matches
  // what the code renders. Only the OTP template key may still route through
  // a registered template, and only when set on the send itself.
  const templateKey = (email.templateKey || '').trim();
  if (templateKey && email.mergeFields) {
    try {
      const res = await fetch(`${base}/v1.1/email/template`, {
        method: 'POST',
        headers: {
          Authorization: `Zoho-enczapikey ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          ...(bounce ? { bounce_address: bounce } : {}),
          template_key: templateKey,
          from: { address: from, name: 'Tutorial OS' },
          to: [{ email_address: { address: email.to } }],
          merge_info: email.mergeFields,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error('[email] zeptomail template rejected the message:', res.status, 'from', from, 'bounce', bounce, body.slice(0, 300));
        return { delivered: false, provider: 'zeptomail', error: `provider status ${res.status}` };
      }
      return { delivered: true, provider: 'zeptomail' };
    } catch (err: any) {
      console.error('[email] zeptomail template send failed:', err?.message || err);
      return { delivered: false, provider: 'zeptomail', error: 'network error' };
    }
  }
  try {
    const res = await fetch(`${base}/v1.1/email`, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-enczapikey ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        ...(bounce ? { bounce_address: bounce } : {}),
        from: { address: from, name: 'Tutorial OS' },
        to: [{ email_address: { address: email.to } }],
        subject: email.subject,
        htmlbody: email.html,
        textbody: email.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      // ZeptoMail rejection reasons (unverified sender, bad bounce address) are
      // operational detail worth logging; the token never appears in responses.
      // from/bounce are addresses, not secrets; they pinpoint which side of
      // the send ZeptoMail refused.
      console.error('[email] zeptomail rejected the message:', res.status, 'from', from, 'bounce', bounce, body.slice(0, 300));
      return { delivered: false, provider: 'zeptomail', error: `provider status ${res.status}` };
    }
    return { delivered: true, provider: 'zeptomail' };
  } catch (err: any) {
    console.error('[email] zeptomail send failed:', err?.message || err);
    return { delivered: false, provider: 'zeptomail', error: 'network error' };
  }
}

export async function sendEmail(email: OutgoingEmail): Promise<SendEmailResult> {
  if (process.env.ZEPTOMAIL_API) return sendViaZepto(email);
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
  <p style="font-size:11px;color:#64748b;margin-top:32px;">Tutorial OS &mdash; the school operating system for education facilities.</p>
</div>`;

const BOX = (label: string, value: string) => `
<div style="margin:10px 0;">
  <p style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#64748b;margin:0 0 4px;">${label}</p>
  <p style="font-size:18px;font-weight:800;margin:0;letter-spacing:.04em;">${value}</p>
</div>`;

// Batch 57: credentials are listed as check rows, one tick each, never as a
// run-together statement. Order everywhere: login email, temporary password,
// access code.
const CHECK = (label: string, value: string) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 10px;">
  <tr>
    <td style="width:26px;vertical-align:top;">
      <div style="width:22px;height:22px;border-radius:11px;background:#DCFCE7;color:#15803D;font-size:13px;font-weight:700;line-height:22px;text-align:center;">&#10003;</div>
    </td>
    <td style="vertical-align:top;padding-left:10px;">
      <p style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#64748b;margin:0;">${label}</p>
      <p style="font-size:16px;font-weight:800;color:#0f172a;margin:2px 0 0;word-break:break-all;">${value}</p>
    </td>
  </tr>
</table>`;

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
    subject: 'Confirm your email to set up your Tutorial OS facility',
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
    ? `${CHECK('Login email', escapeHtml(params.loginEmail))}${CHECK('Temporary password', escapeHtml(params.tempPassword))}`
    : `<p style="margin:0 0 12px;">Sign in with the password you already use for <strong>${escapeHtml(params.loginEmail)}</strong>.</p>`;
  const steps = params.tempPassword
    ? `<li style="margin:0 0 8px;">Sign in and set your own password (the temporary one only works for 7 days).</li>
       <li style="margin:0 0 8px;">Share your access code with your staff and students so they can join.</li>`
    : `<li style="margin:0 0 8px;">Share your access code with your staff and students so they can join.</li>`;
  const body = `
  <p style="margin:0 0 16px;">Hi ${escapeHtml(params.fullName || 'there')},</p>
  <p style="margin:0 0 16px;">${params.resend ? 'Here are fresh login details for' : 'Welcome to'} <strong>${escapeHtml(params.centreName)}</strong> on Tutorial OS.</p>
  ${credentials}
  ${params.accessCode ? CHECK('Access code', escapeHtml(params.accessCode)) : ''}
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
      (params.tempPassword ? `✓ Login email: ${params.loginEmail}\n✓ Temporary password: ${params.tempPassword}\n` : `Sign in with your existing password for ${params.loginEmail}.\n`) +
      (params.accessCode ? `✓ Access code: ${params.accessCode}\n` : '') +
      `\nSign in at ${params.appUrl}/\n` +
      (params.tempPassword ? '\nThe temporary password expires in 7 days and is never stored anywhere.\n' : ''),
  };
}

export function buildStaffInviteEmail(params: {
  to: string;
  fullName: string;
  centreName: string;
  role: string;
  loginEmail: string;
  tempPassword: string;
  accessCode?: string;
  appUrl: string;
}): OutgoingEmail {
  const body = `
  <p style="margin:0 0 16px;">Hi ${escapeHtml(params.fullName || 'there')},</p>
  <p style="margin:0 0 16px;">You have been added as <strong>${escapeHtml(params.role)}</strong> at <strong>${escapeHtml(params.centreName)}</strong> on Tutorial OS. Here is everything you need to sign in:</p>
  ${CHECK('Login email', escapeHtml(params.loginEmail))}
  ${CHECK('Temporary password', escapeHtml(params.tempPassword))}
  ${params.accessCode ? CHECK('Facility access code', escapeHtml(params.accessCode)) : ''}
  <p style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#64748b;margin:18px 0 8px;">What happens next</p>
  <ol style="margin:0;padding-left:20px;font-size:14px;line-height:1.6;">
    <li style="margin:0 0 8px;">Sign in and set your own password. The temporary password only works for 7 days.</li>
  </ol>
  <p style="margin:24px 0;">
    <a href="${params.appUrl}/app" style="background:#ea580c;color:#ffffff;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px;display:inline-block;">Sign in to your portal</a>
  </p>
  <p style="font-size:12px;color:#64748b;margin:0;">This temporary password expires in 7 days and is never stored anywhere. If it expires, ask your facility admin to send fresh details.</p>`;
  return {
    to: params.to,
    subject: `You have been added to ${params.centreName} on Tutorial OS`,
    html: WRAP('Welcome to the team', body),
    text:
      `Hi ${params.fullName || 'there'},\n\nYou have been added as ${params.role} at ${params.centreName} on Tutorial OS.\n` +
      `✓ Login email: ${params.loginEmail}\n✓ Temporary password: ${params.tempPassword}\n` +
      (params.accessCode ? `✓ Facility access code: ${params.accessCode}\n` : '') +
      `\nSign in at ${params.appUrl}/app and set your own password. The temporary password works for 7 days.\n`,
  };
}

export function buildAccessCodeChangedEmail(params: { to: string; centreName: string; accessCode: string; appUrl: string }): OutgoingEmail {
  const body = `
  <p style="margin:0 0 16px;">The access code for <strong>${escapeHtml(params.centreName)}</strong> was changed. The old code stopped working immediately; existing members are unaffected.</p>
  ${CHECK('New access code', escapeHtml(params.accessCode))}
  <p style="margin:24px 0;">
    <a href="${params.appUrl}/" style="background:#ea580c;color:#ffffff;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px;display:inline-block;">Open Tutorial OS</a>
  </p>`;
  return {
    to: params.to,
    subject: `Your new access code for ${params.centreName}`,
    html: WRAP('Access code changed', body),
    text: `The access code for ${params.centreName} was changed. The old code stopped working immediately; existing members are unaffected.\n\n✓ New access code: ${params.accessCode}\n\nOpen Tutorial OS: ${params.appUrl}/`,
  };
}

export type WelcomeRole = 'admin' | 'tutor' | 'student';

/** Batch 58: the role welcome, sent once when an account takes its first
 *  look inside its portal. Same facility, three different first stops. */
export function buildRoleWelcomeEmail(params: {
  to: string;
  fullName: string;
  centreName: string;
  programmes: string;
  role: WelcomeRole;
  appUrl: string;
}): OutgoingEmail {
  const first = (params.fullName || '').split(/\s+/)[0] || 'there';
  const name = escapeHtml(first);
  const centre = escapeHtml(params.centreName);
  const programmeLine = params.programmes
    ? `<p style="margin:0 0 16px;">Your programmes: <strong>${escapeHtml(params.programmes)}</strong>.</p>`
    : '';
  const body = `<p style="margin:0 0 16px;">${name}, welcome to <strong>${centre}</strong> on Tutorial OS.</p>
${programmeLine}
<p style="margin:0 0 16px;">${escapeHtml(roleLine(params.role, centre))}</p>
<p style="margin:24px 0;">
  <a href="${params.appUrl}/" style="background:#ea580c;color:#ffffff;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px;display:inline-block;">Open Tutorial OS</a>
</p>`;
  return {
    to: params.to,
    subject: `Welcome to ${params.centreName} on Tutorial OS`,
    html: WRAP('Welcome', body),
    text: `${first}, welcome to ${params.centreName} on Tutorial OS.\n\n${roleLine(params.role, params.centreName)}\n\nOpen Tutorial OS: ${params.appUrl}/`,
  };
}

function roleLine(role: WelcomeRole, centre: string): string {
  if (role === 'admin') {
    return `Everything about ${centre} lives in your dashboard: students, tutors, fees, study materials, CBT mocks, attendance and the leaderboard. Add your students and take attendance from one place.`;
  }
  if (role === 'tutor') {
    return `Your classes, study materials, attendance and CBT mocks for ${centre} are all in one place. Check your timetable and reach your students any time.`;
  }
  return `Your classes, study materials, video lessons, practice questions and CBT mocks are ready. Practise daily, take your mocks and climb the leaderboard.`;
}

function escapeHtml(value: string): string {
  return (value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface OtpEmailRequest {
  to: string;
  code: string;
  centreName: string;
  expiryMinutes: number;
}

/**
 * The student registration OTP. When ZEPTOMAIL_OTP_TEMPLATE_KEY is configured
 * (the OTP template registered in ZeptoMail), the mail goes out through that
 * template; otherwise a plain inline card carries the code, so registration
 * never blocks on template registration.
 */
export async function sendOtpEmail(req: OtpEmailRequest): Promise<SendEmailResult> {
  const otpKey = (process.env.ZEPTOMAIL_OTP_TEMPLATE_KEY || '').trim();
  if (otpKey) {
    return sendEmail({
      to: req.to,
      subject: 'Your Tutorial OS verification code',
      html: '',
      text: '',
      mergeFields: {
        otp_code: req.code,
        centre_name: req.centreName,
        expiry_minutes: String(req.expiryMinutes),
      },
      templateKey: otpKey,
    });
  }
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;text-align:center;">
<h1 style="font-size:20px;color:#0f172a;margin:0 0 8px;">Your verification code</h1>
<p style="font-size:14px;color:#475569;margin:0 0 24px;">Use this code to finish registering with ${req.centreName} on Tutorial OS.</p>
<div style="font-size:36px;letter-spacing:10px;font-weight:bold;color:#0f172a;padding:16px;background:#f8fafc;border-radius:12px;">${req.code}</div>
<p style="font-size:12px;color:#94a3b8;margin:24px 0 0;">This code expires in ${req.expiryMinutes} minutes. If you did not request it, you can ignore this email.</p>
</div></body></html>`;
  return sendEmail({
    to: req.to,
    subject: 'Your Tutorial OS verification code',
    html,
    text: `Your Tutorial OS verification code is ${req.code}. It expires in ${req.expiryMinutes} minutes. If you did not request it, ignore this email.`,
  });
}
