/**
 * Batch 38: the partnership-proposal page.
 *
 * The TOS console generates a per-facility link (/proposal/<slug>?n=<name>)
 * that opens this page: a fully designed, self-contained proposal addressed
 * to that facility, with Open Graph / Twitter meta tags so WhatsApp and
 * Facebook show a branded preview card when the link is shared. The page
 * carries its own Copy link and Download PDF actions; the PDF is rendered
 * client-side from this exact layout, so the link and the PDF always match.
 *
 * Public by design: anyone holding the link opens it, no sign-in.
 */
import express from 'express';

/** Escape a value for safe interpolation into HTML text and attribute slots. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "bright-minds-tutorial" -> "Bright Minds Tutorial". */
export function nameFromSlug(slug: string): string {
  const base = String(slug || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!base) return 'Your Facility';
  return base
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

const PAGE_CSS = `
:root{--ink:#0F172A;--muted:#64748B;--line:#E2E8F0;--orange:#F97316;--orange-d:#EA580C;--cream:#FFF7ED;--paper:#FFFFFF}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:var(--ink);background:#F8FAFC;line-height:1.55}
.wrap{max-width:880px;margin:0 auto;padding:0 22px}
.hero{background:linear-gradient(160deg,#0F172A 0%,#1E293B 70%,#273449 100%);color:#F8FAFC;padding:64px 0 56px;position:relative;overflow:hidden}
.hero:before{content:'';position:absolute;right:-140px;top:-180px;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,rgba(249,115,22,.45),rgba(249,115,22,0) 70%)}
.hero:after{content:'';position:absolute;left:-160px;bottom:-260px;width:460px;height:460px;border-radius:50%;background:radial-gradient(circle,rgba(249,115,22,.25),rgba(249,115,22,0) 70%)}
.hero .wrap{position:relative;z-index:1}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:34px}
.mark{width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#F97316,#EA580C);color:#fff;font-weight:800;font-size:17px;display:flex;align-items:center;justify-content:center;letter-spacing:.5px;box-shadow:0 8px 24px rgba(249,115,22,.35)}
.brand b{font-size:19px;letter-spacing:-.2px}
.eyebrow{display:inline-block;margin-bottom:16px;font-size:11px;font-weight:800;letter-spacing:.18em;color:#FDBA74;text-transform:uppercase}
.hero h1{font-size:clamp(30px,6vw,46px);line-height:1.12;font-weight:800;letter-spacing:-.02em;max-width:15em}
.forline{margin-top:22px;display:inline-flex;flex-wrap:wrap;gap:8px 14px;align-items:center;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:10px 20px;font-size:14px;color:#CBD5E1}
.forline b{color:#fff}
.forline span{color:#94A3B8}
main{padding:20px 0 8px}
section{margin-bottom:14px;background:#fff;border:1px solid var(--line);border-radius:20px;padding:38px 36px;box-shadow:0 1px 2px rgba(15,23,42,.04)}
.sh{display:flex;gap:16px;align-items:baseline;margin-bottom:6px}
.num{font-size:13px;font-weight:800;color:var(--orange);letter-spacing:.08em}
section h2{font-size:24px;font-weight:800;letter-spacing:-.02em;margin-bottom:14px}
p.lead{color:#334155;font-size:15.5px;margin-bottom:12px}
p.body{color:#475569;font-size:14.5px;margin-bottom:12px}
.facts{display:grid;grid-template-columns:1fr 1fr;gap:14px 26px;margin-top:18px;background:#F8FAFC;border:1px solid var(--line);border-radius:14px;padding:18px 20px}
.facts div{display:flex;gap:8px;font-size:13.5px}
.facts dt{color:var(--muted);min-width:110px;font-weight:600}
.facts dd{color:var(--ink);font-weight:600}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px}
.card{border:1px solid var(--line);border-radius:14px;padding:18px 18px 16px;background:#FCFCFD}
.card h4{font-size:14.5px;font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:8px}
.card h4:before{content:'';width:8px;height:8px;border-radius:3px;background:var(--orange);flex:none}
.card p{color:#64748B;font-size:13.5px}
.steps{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-top:16px}
.step{background:var(--cream);border:1px solid #FED7AA;border-radius:14px;padding:18px}
.step .n{font-size:11px;font-weight:800;color:var(--orange-d);letter-spacing:.1em;display:block;margin-bottom:8px}
.step h4{font-size:14.5px;font-weight:700;margin-bottom:5px}
.step p{color:#9A3412;font-size:13px}
.duo{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px}
.duo .card{border-radius:16px}
.duo .chip{display:inline-block;font-size:10.5px;font-weight:800;letter-spacing:.12em;color:var(--orange-d);background:var(--cream);border:1px solid #FED7AA;border-radius:999px;padding:4px 10px;margin-bottom:10px}
.duo .big{color:var(--ink);font-weight:700;font-size:15px;margin-bottom:6px}
.tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.tbl{width:100%;border-collapse:collapse;margin-top:16px;font-size:13.5px}
.tbl caption{caption-side:top;text-align:left;color:var(--muted);font-size:12.5px;padding-bottom:10px}
.tbl th,.tbl td{text-align:left;padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:top}
.tbl thead th{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);border-bottom:2px solid var(--line)}
.tbl tbody th{font-weight:700;color:var(--ink);white-space:nowrap}
.tbl td .price{font-weight:800;color:var(--orange-d);white-space:nowrap}
.tbl td:nth-child(2){white-space:nowrap}
.cta{margin-top:16px;background:linear-gradient(135deg,#0F172A,#1E293B);border-radius:18px;padding:34px;color:#F8FAFC;text-align:center}
.cta h3{font-size:22px;font-weight:800;margin-bottom:8px;letter-spacing:-.02em}
.cta p{color:#94A3B8;font-size:14px;margin-bottom:18px}
.btn{display:inline-block;background:linear-gradient(135deg,#F97316,#EA580C);color:#fff;font-weight:700;font-size:14.5px;padding:13px 28px;border-radius:999px;text-decoration:none;box-shadow:0 10px 26px rgba(249,115,22,.4)}
.foot{color:var(--muted);font-size:12.5px;text-align:center;padding:26px 0 90px}
.foot b{color:var(--ink)}
.toolbar{position:fixed;right:18px;bottom:18px;display:flex;gap:10px;z-index:50}
.toolbar button{border:0;cursor:pointer;font:inherit;font-size:13px;font-weight:700;padding:12px 18px;border-radius:999px;box-shadow:0 10px 26px rgba(15,23,42,.25)}
.tb-copy{background:#fff;color:var(--ink);border:1.5px solid #CBD5E1!important;box-shadow:0 10px 26px rgba(15,23,42,.12)!important}
.tb-pdf{background:linear-gradient(135deg,#F97316,#EA580C);color:#fff}
@media(max-width:720px){section{padding:26px 20px;border-radius:16px}.grid,.duo,.facts{grid-template-columns:1fr}.steps{grid-template-columns:1fr}.hero{padding:48px 0 44px}body{padding-bottom:84px}.toolbar{left:0;right:0;bottom:0;gap:12px;padding:10px 16px calc(10px + env(safe-area-inset-bottom));background:rgba(255,255,255,.94);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-top:1px solid var(--line);box-shadow:0 -6px 20px rgba(15,23,42,.08);border-radius:0}.toolbar button{flex:1;padding:13px 10px;font-size:14px}}
@media print{
 .toolbar{display:none}
 body{background:#fff}
 section{box-shadow:none;border:none;padding:18px 0;break-inside:avoid}
 .hero{background:#0F172A!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;border-radius:0 0 18px 18px;margin-bottom:10px}
 .cta{-webkit-print-color-adjust:exact;print-color-adjust:exact}
 main{padding:0}
 .foot{padding:10px 0}
}
`;

/** The full standalone proposal document. */
export function buildProposalPage(displayName: string, origin: string, slug: string): string {
  const name = esc(displayName);
  const title = `Tutorial OS x ${displayName} - Partnership proposal`;
  const desc = `Run admissions, fees, classes, exams and chat on one system, under your own name. Partnership proposal prepared for ${displayName}.`;
  const ogUrl = `${origin}/proposal/${encodeURIComponent(slug)}`;
  const dateStr = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' }).format(new Date());
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${esc(ogUrl)}" />
<meta property="og:image" content="${esc(origin)}/og-proposal.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(desc)}" />
<meta name="twitter:image" content="${esc(origin)}/og-proposal.jpg" />
<style>${PAGE_CSS}</style>
</head>
<body>
<header class="hero">
  <div class="wrap">
    <div class="brand"><span class="mark">T</span><b>Tutorial OS</b></div>
    <span class="eyebrow">Partnership proposal</span>
    <h1>Run your whole learning facility on one system.</h1>
    <div class="forline">Prepared for <b>${name}</b><span aria-hidden="true">·</span><span>${esc(dateStr)}</span></div>
  </div>
</header>
<main>
<div class="wrap" id="proposal">

<section>
  <div class="sh"><span class="num">01</span><h2>One platform for learning facilities of every kind</h2></div>
  <p class="lead">Tutorial OS is one system that runs a learning facility end to end: the owner's console, portals for tutors and students, a student phone app, and a branded public landing page for enrolment. Everything carries the facility's own name, logo and colours, so students and parents see the facility, never us.</p>
  <p class="body">It is built for learning facilities of every kind: tutorial and lesson centres preparing students for JAMB, WAEC and NECO, bridge programmes like IJMB and JUPEB, satellite campuses, distance-learning programmes, professional-course providers, online tutorial programmes and their students, undergraduate study groups, and schools that want the same structure. It runs in the browser on any phone or laptop, with nothing to install.</p>
  <dl class="facts">
    <div><dt>Built for</dt><dd>Learning facilities of every kind</dd></div>
    <div><dt>Exams</dt><dd>JAMB, WAEC, NECO, IJMB and JUPEB, plus your own custom exams</dd></div>
    <div><dt>Question bank</dt><dd>Over 100,000 practice questions</dd></div>
    <div><dt>Branding</dt><dd>Your name, logo and colours</dd></div>
  </dl>
</section>

<section>
  <div class="sh"><span class="num">02</span><h2>What your facility gets</h2></div>
  <div class="grid">
    <div class="card"><h4>Admissions and records</h4><p>Take applications online, approve students, and give every facility a join code so students and tutors land in the right place.</p></div>
    <div class="card"><h4>Fees and payments</h4><p>Set programme fees and let students pay straight into the facility's own bank details, with a receipt for every confirmed payment.</p></div>
    <div class="card"><h4>Exam preparation</h4><p>Timed CBT practice and scheduled mock exams for JAMB, WAEC and NECO, bridge programmes like IJMB and JUPEB, plus your own custom exams for any other programme you run.</p></div>
    <div class="card"><h4>Question bank</h4><p>Over 100,000 practice questions across subjects and topics, banked per year, so practice never runs dry.</p></div>
    <div class="card"><h4>Performance analytics</h4><p>Every student's scores, trends and weak topics in one place. Facility admins see at a glance who is doing well and who needs help.</p></div>
    <div class="card"><h4>Chat for the whole facility</h4><p>Admins, tutors and students in one chat, with a group for every class. Announcements reach everyone at once.</p></div>
    <div class="card"><h4>AI built in</h4><p>An AI study coach for students, question generation and performance analysis for tutors, and answers from your facility's own data for admins.</p></div>
    <div class="card"><h4>Your brand, everywhere</h4><p>Your name, logo and colours on the portals, the student app and a branded landing page for enrolment. Tutorial OS stays in the background.</p></div>
  </div>
</section>

<section>
  <div class="sh"><span class="num">03</span><h2>Even without a tutor, no student sits idle</h2></div>
  <p class="lead">Tutor availability is one of the hardest problems a facility runs into: when a tutor is away, classes stop and students drift. Tutorial OS keeps the day alive, so an absent tutor stops being a lost day.</p>
  <div class="steps">
    <div class="step"><span class="n">01</span><h4>Practice runs itself</h4><p>The CBT engine, run by Tutorial OS, keeps every class on timed practice and mock exams while a tutor is away.</p></div>
    <div class="step"><span class="n">02</span><h4>The leaderboard keeps them competing</h4><p>Students climb the leaderboard with their scores, and the facility rewards the top of the board, so practice feels like a contest, not homework.</p></div>
    <div class="step"><span class="n">03</span><h4>The AI study coach fills the gap</h4><p>Students ask questions and get explanations in simple terms until the tutor is back.</p></div>
  </div>
  <p class="body" style="margin-top:14px">And when tutors are present, they get more done: AI drafts questions in minutes, reviews how each class performed, and flags students falling behind, so one tutor covers more ground with less preparation.</p>
</section>

<section>
  <div class="sh"><span class="num">04</span><h2>Results are what fill your classes</h2></div>
  <p class="lead">In Nigeria, a facility grows on its results. A student who scores 300 and above in JAMB, or brings home A1 to B3 across nine subjects, becomes the story parents tell one another, and the enquiries follow.</p>
  <p class="body">Tutorial OS is built to make those results repeatable rather than lucky. Daily practice, mock exams that surface the gaps long before the real day, and AI that closes those gaps: the same engine your students use every day is the engine that produces the scores parents chase. Better scores, term after term, are the one marketing a facility cannot buy.</p>
</section>

<section>
  <div class="sh"><span class="num">05</span><h2>Money and parents, handled</h2></div>
  <div class="duo">
    <div class="card"><span class="chip">FEES</span><div class="big">Without running after anyone</div><p>No more chasing students for money. The facility plugs in its own payment and bank details, and students pay straight into it. Each student can see exactly what they owe and when it is due, and admins see who has paid and who has not. Reminders go out on their own: daily notifications to the admin for every student who has not paid or whose due date is about to expire, and a notice to the student when their own payment is due. Every confirmed payment gets a receipt.</p></div>
    <div class="card"><span class="chip">PARENTS</span><div class="big">In the loop, on time</div><p>Parents who see progress renew and refer. Your branded landing page brings enrolment enquiries straight to you, day and night. Results and mock scores give parents proof their child is moving, not just attending, and notices by email and WhatsApp keep them updated on their child's performance and fees without anyone chasing them one by one.</p></div>
  </div>
</section>

<section>
  <div class="sh"><span class="num">06</span><h2>Pricing and getting started</h2></div>
  <div class="tbl-wrap"><table class="tbl">
    <caption>Every facility starts free and upgrades when it grows.</caption>
    <thead><tr><th>Plan</th><th>Price</th><th>What it covers</th></tr></thead>
    <tbody>
      <tr><th>Free Facility</th><td><span class="price">NGN 0</span><br /><small style="color:#64748B">free forever</small></td><td>Up to 5 students, white-label landing page, portals, email notifications, 50 AI credits per seat</td></tr>
      <tr><th>Standard Facility</th><td><span class="price">NGN 1,000</span><br /><small style="color:#64748B">/ seat / month</small></td><td>Unlimited students, email and push notifications, 200 AI credits per seat, AI question generation and performance analysis</td></tr>
      <tr><th>Premium Facility</th><td><span class="price">NGN 2,500</span><br /><small style="color:#64748B">/ seat / month</small></td><td>Everything in Standard plus WhatsApp notifications for parents, 500 AI credits per seat</td></tr>
    </tbody>
  </table></div>
  <p class="body" style="margin-top:14px">A seat is one student's place on the platform. Facilities can start on Free and move up any time; no setup fee, no contract, no card needed to begin. Starting takes three steps: sign up free on the landing page, check your email for the access code and login details, then brand the facility, add students and tutors with the facility code, and you are running.</p>
  <div class="cta">
    <h3>Ready to see it live?</h3>
    <p>Start on the Free Facility plan today. No card, no payment, setup in minutes.</p>
    <a class="btn" href="/">Start for free</a>
  </div>
</section>

</div>
</main>
<div class="foot"><div class="wrap"><b>Tutorial OS</b> · One system for learning facilities of every kind. This proposal was prepared for ${name}.</div></div>
<div class="toolbar">
  <button type="button" class="tb-copy" id="copyBtn">Copy link</button>
  <button type="button" class="tb-pdf" id="pdfBtn">Download PDF</button>
</div>
<script type="module">
const copyBtn = document.getElementById('copyBtn');
const pdfBtn = document.getElementById('pdfBtn');
const fileName = 'TutorialOS-Proposal-${esc(displayName).replace(/[^A-Za-z0-9]+/g, '-')}.pdf';
copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    copyBtn.textContent = 'Copied!';
  } catch (e) {
    copyBtn.textContent = window.location.href.slice(0, 40);
  }
  setTimeout(() => { copyBtn.textContent = 'Copy link'; }, 2000);
});
async function downloadPdf() {
  const label = pdfBtn.textContent;
  pdfBtn.textContent = 'Preparing PDF...';
  pdfBtn.disabled = true;
  try {
    const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
      import('https://esm.sh/jspdf@2.5.2'),
      import('https://esm.sh/html2canvas@1.4.1'),
    ]);
    const el = document.getElementById('proposal');
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgW = 210;
    const pageHpx = Math.floor(canvas.width * 297 / imgW);
    let y = 0;
    let page = 0;
    while (y < canvas.height) {
      const sliceH = Math.min(pageHpx, canvas.height - y);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sliceH;
      const ctx = slice.getContext('2d');
      ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      if (page > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgW, sliceH * imgW / canvas.width);
      y += sliceH;
      page += 1;
    }
    pdf.save(fileName);
  } catch (e) {
    window.print();
  }
  pdfBtn.textContent = 'Download PDF';
  pdfBtn.disabled = false;
}
pdfBtn.addEventListener('click', downloadPdf);
try {
  if (new URLSearchParams(window.location.search).get('pdf') === '1') {
    setTimeout(downloadPdf, 600);
  }
} catch (e) { /* no auto-download on old browsers */ }
</script>
</body>
</html>`;
}

/**
 * Registers the public proposal routes. Both shapes exist:
 * - /proposal/:slug  (direct, dev and Cloud Run; before the SPA fallback)
 * - /api/public/proposal/:slug (Netlify: /proposal/* redirects into the
 *   function, which normalises to /api/public/proposal/:slug; /api/public/*
 *   is unauthenticated by design).
 */
export function registerProposalRoutes(app: express.Express): void {
  const serve = (req: express.Request, res: express.Response) => {
    const rawName = typeof req.query.n === 'string' ? req.query.n.trim() : '';
    const slug = String(req.params.slug || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'your-facility';
    const displayName = rawName ? rawName.slice(0, 120) : nameFromSlug(slug);
    const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https';
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'tutorialos.com').split(',')[0].trim();
    const origin = `${proto}://${host}`;
    res.set('Cache-Control', 'public, max-age=300');
    res.type('html').send(buildProposalPage(displayName, origin, slug));
  };
  app.get('/proposal/:slug', serve);
  app.get('/api/public/proposal/:slug', serve);
}
