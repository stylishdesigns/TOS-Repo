import React, { useEffect } from 'react';
import { X, CheckCircle2 } from 'lucide-react';

/**
 * Terms & Conditions and Privacy Policy (batch 57).
 *
 * The facility-details signup page used to make owners agree to documents
 * that did not exist anywhere. These live in one place now: the agree line on
 * /start opens them as a popup (no navigation away), and /terms and /privacy
 * render the same content as real public pages.
 */

export type LegalKind = 'terms' | 'privacy';

export interface LegalSection {
  title: string;
  paras: string[];
}

export const TERMS_SECTIONS: LegalSection[] = [
  {
    title: 'What Tutorial OS is',
    paras: [
      'Tutorial OS is one software system for education facilities: tutorial and lesson centres, bridge programmes such as IJMB and JUPEB, satellite campuses, distance learning centres, professional courses and online tutorials.',
      'The facility is our customer. You create an account for your facility, and the students, tutors and parents you bring in use the system through you. Your facility pays for seats, and it chooses which student occupies each seat.',
    ],
  },
  {
    title: 'Plans and payments',
    paras: [
      'Every facility starts on the Free Facility plan: up to 5 students, free forever.',
      'Upgrade any time to add more students: the Standard Facility plan at ₦1,000 per seat per month or the Premium Facility plan at ₦2,500 per seat per month. There is no trial period to run out and nothing to cancel: you upgrade only when you want more seats.',
      'Payments are made by transfer to the account Tutorial OS provides, and the receipt is uploaded in the app. A purchase becomes active once Tutorial OS confirms the receipt, and the seats appear in your facility.',
    ],
  },
  {
    title: 'Your facility account',
    paras: [
      'The person who signs a facility up is its owner and admin, and is responsible for the accounts, content and activity inside that facility.',
      'Keep your sign-in details, access code and payment records safe. Tell us promptly if you believe someone is using your facility’s account without permission.',
    ],
  },
  {
    title: 'Acceptable use',
    paras: [
      'Use the system for genuine teaching and facility management. Do not upload unlawful content, material you have no right to share, or anything that pretends to be an official exam paper.',
      'Tutor AI and the question bank are for your facility’s own teaching and practice. Do not resell access to Tutorial OS or present the system as your own product.',
    ],
  },
  {
    title: 'Tutorial OS video classes',
    paras: [
      'The video lessons hosted on the Tutorial OS dashboard are public assets of the educationists who created them. Hosting them on Tutorial OS gives those educationists visibility on the platform and a wider audience for their teaching.',
      'Your facility may show these lessons to its enrolled students inside the app, and set them as study material. Your facility may not download, screen-record, re-upload, redistribute or sell the lessons anywhere else, and may not claim ownership of them. The name of the educationist behind a lesson stays with the lesson.',
      'A lesson can be removed at the request of the educationist or rights holder behind it. Repeated breaches of this section can end a facility’s access to the video classes.',
    ],
  },
  {
    title: 'Your content and data',
    paras: [
      'The materials, records, results, fees and messages your facility puts into the system stay yours. Tutorial OS stores them and shows them only to the right people in your facility.',
      'You can export your facility’s data or ask us to delete it at any time. When a facility’s account ends, its data is removed in line with the Privacy Policy.',
    ],
  },
  {
    title: 'Availability and changes',
    paras: [
      'Tutorial OS is provided as a live, evolving product. Features improve and change over time, and we work to keep the service available; planned downtime is kept short and announced where possible.',
      'These terms may be updated as the product grows. Material changes are announced in the app or by email. Continuing to use your facility’s account after a change means you accept the updated terms.',
    ],
  },
  {
    title: 'Suspension',
    paras: [
      'A facility’s access can be paused where payment is genuinely outstanding past its grace period, or where there is abuse, unlawful activity or a serious breach of these terms. Where possible you are told first and given the chance to put it right.',
    ],
  },
  {
    title: 'Questions',
    paras: [
      'Anything about these terms: ask in the Tutorial OS community on WhatsApp or reach the team through the support link in your dashboard.',
    ],
  },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: 'What we collect',
    paras: [
      'Account details for the facility owner and staff: name, email, phone number, and the facility details you enter (name, address, state, logo, exam focus).',
      'The records your facility enters as it works: student details, attendance, results, fees and receipts, materials, chats and settings. Also basic technical data such as sign-in device and time, so we can keep accounts secure.',
    ],
  },
  {
    title: 'Your facility’s data stays with your facility',
    paras: [
      'Each facility’s data is kept separate from every other facility’s. Only the owner, admins and tutors of your facility see your facility’s students, records and messages.',
      'Tutorial OS staff see facility data only to operate the service, confirm payments or help you with a problem you have raised.',
    ],
  },
  {
    title: 'Student and parent records',
    paras: [
      'Your facility is responsible for the student and parent records it enters, and for having the permission it needs from parents or guardians to hold and use them.',
      'Tutorial OS processes those records only to run the service for your facility: portals, attendance, results, fee reminders and communication. They are never sold or shared for marketing.',
    ],
  },
  {
    title: 'Where your data lives and how it is protected',
    paras: [
      'Data is stored on Google Cloud infrastructure through Firebase, protected by server-side security rules, so a client cannot read another facility’s data by editing its own app.',
      'Passwords are stored only as secure hashes. Temporary passwords are never written to logs or databases, and they expire. Sign-in sessions stay on the device that signed in.',
    ],
  },
  {
    title: 'Emails and messages we send',
    paras: [
      'We email sign-in details, access codes, payment confirmations and service notices. The WhatsApp community is optional: joining it is your choice, and you can leave any time.',
      'Students and parents receive only the notices their facility’s work needs, such as due-date reminders and results.',
    ],
  },
  {
    title: 'AI features',
    paras: [
      'Tutor AI answers from your facility’s own materials and the platform’s study tools. Your chats and materials are not used to train third-party AI models.',
    ],
  },
  {
    title: 'Keeping and deleting data',
    paras: [
      'We keep your facility’s data while its account is active, and for a short period afterwards so a mistake does not become permanent. On a confirmed request to delete, your facility’s data is removed within 30 days.',
      'You can ask for an export of your facility’s data at any time.',
    ],
  },
  {
    title: 'Questions',
    paras: [
      'Anything about privacy: ask in the Tutorial OS community on WhatsApp or reach the team through the support link in your dashboard.',
    ],
  },
];

/** The popup: the facility-details page opens this over itself, the owner
 *  reads, closes it, and ticks the checkbox. No navigation away. */
export const LegalModal: React.FC<{ kind: LegalKind; onClose: () => void }> = ({ kind, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const sections = kind === 'terms' ? TERMS_SECTIONS : PRIVACY_SECTIONS;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={kind === 'terms' ? 'Terms and Conditions' : 'Privacy Policy'}
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-[#C2410C]">Tutorial OS</p>
            <h2 className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
              {kind === 'terms' ? 'Terms & Conditions' : 'Privacy Policy'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-4">
          {sections.map((s) => (
            <section key={s.title} className="mb-4">
              <h3 className="text-[13px] font-black text-slate-800 dark:text-slate-100 mb-1">{s.title}</h3>
              {s.paras.map((p, i) => (
                <p key={i} className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 mb-1.5">{p}</p>
              ))}
            </section>
          ))}
        </div>
        <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-400">Last updated November 2026.</p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#C2410C] hover:brightness-110"
          >
            Done reading
          </button>
        </div>
      </div>
    </div>
  );
};

/** The real public pages: tutorialos.com/terms and tutorialos.com/privacy. */
export const LegalPage: React.FC<{ kind: LegalKind }> = ({ kind }) => {
  const sections = kind === 'terms' ? TERMS_SECTIONS : PRIVACY_SECTIONS;
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          <p className="font-black text-slate-900 dark:text-white">Tutorial OS</p>
          <a href="/" className="text-xs font-bold text-[#C2410C] hover:underline">tutorialos.com</a>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-5 py-10">
        <p className="text-[10px] font-black uppercase tracking-wider text-[#C2410C]">Tutorial OS</p>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-1 mb-2">
          {kind === 'terms' ? 'Terms & Conditions' : 'Privacy Policy'}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">Last updated November 2026.</p>
        {sections.map((s) => (
          <section key={s.title} className="mb-7">
            <h2 className="text-base font-black text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#C2410C]" />
              {s.title}
            </h2>
            {s.paras.map((p, i) => (
              <p key={i} className="text-sm leading-relaxed text-slate-600 dark:text-slate-300 mb-2">{p}</p>
            ))}
          </section>
        ))}
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-10">
          {kind === 'terms' ? (
            <>Read alongside our <a href="/privacy" className="text-[#C2410C] underline">Privacy Policy</a>.</>
          ) : (
            <>Read alongside our <a href="/terms" className="text-[#C2410C] underline">Terms &amp; Conditions</a>.</>
          )}
        </p>
      </main>
    </div>
  );
};

/** The video-classes terms: the card a facility admin sees above the switch
 *  in Resources > Tutorial OS video classes. Only admins see this switch. */
export const VIDEO_TERMS_SECTIONS: LegalSection[] = [
  {
    title: 'Whose videos these are',
    paras: [
      'The lessons in the Tutorial OS video classes are public assets of the educationists who created them. Tutorial OS hosts the library; the teaching and the rights behind it stay with the educationist named on each lesson.',
    ],
  },
  {
    title: 'Why the lessons are here',
    paras: [
      'Hosting the library on Tutorial OS works both ways: your facility gets ready-made, exam-focused lessons for its students, and the educationists behind the lessons gain visibility on the platform and reach a wider audience through every facility that shows them.',
    ],
  },
  {
    title: 'What your facility may do',
    paras: [
      'Show the lessons to your enrolled students inside the app, arrange them into your teaching plan, and set them as study material alongside your own uploads. Students watch them in the app, signed in to your facility.',
    ],
  },
  {
    title: 'What your facility may not do',
    paras: [
      'Download, screen-record, re-upload, redistribute or sell the lessons anywhere else, and never present them as your facility’s own recordings or claim ownership of them. The educationist’s name stays with the lesson wherever it is shown.',
    ],
  },
  {
    title: 'Removal and disputes',
    paras: [
      'A lesson can be removed at the request of the educationist or rights holder behind it. Repeated breaches of these terms can end a facility’s access to the video classes.',
    ],
  },
  {
    title: 'Changes to the library',
    paras: [
      'The library grows and changes as educationists add or withdraw lessons, so what is available can shift over time. Your own uploaded materials are always yours and always visible.',
    ],
  },
];

export const VideoTermsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Video classes terms and conditions"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-[#C2410C]">Tutorial OS</p>
            <h2 className="text-lg font-black text-slate-900 dark:text-white mt-0.5">Video classes: terms &amp; conditions</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">For facility admins switching on the Tutorial OS video classes.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-4">
          {VIDEO_TERMS_SECTIONS.map((s) => (
            <section key={s.title} className="mb-4">
              <h3 className="text-[13px] font-black text-slate-800 dark:text-slate-100 mb-1">{s.title}</h3>
              {s.paras.map((p, i) => (
                <p key={i} className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 mb-1.5">{p}</p>
              ))}
            </section>
          ))}
        </div>
        <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-400">Last updated November 2026.</p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#C2410C] hover:brightness-110"
          >
            Done reading
          </button>
        </div>
      </div>
    </div>
  );
};
