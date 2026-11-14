/**
 * Centre landing page content model (piece 1 of the landing-page feature).
 *
 * A centre's landing page is stored in Firestore at centreLandingPages/{centreId}.
 * Only PUBLIC marketing content lives here: name, tagline, programs, testimonials,
 * contact details. Nothing from this model may ever include student records,
 * fee data, access codes or any other private centre data: the page is served
 * to anonymous visitors.
 */
export type LandingButton = {
  label: string;
  href: string;
  kind: 'primary' | 'ghost';
};

export type LandingCard = {
  icon?: string;
  title: string;
  text: string;
};

export type LandingStat = {
  value: string;
  label: string;
};

export type LandingTestimonial = {
  quote: string;
  name: string;
  role?: string;
};

export type LandingContent = {
  templateId: 'classic-orange';
  /** Accent colour as a hex string, e.g. #EA580C. */
  accent: string;
  /** Optional announcement ribbon above the hero headline. */
  ribbon?: string;
  hero: {
    headline: string;
    subText: string;
    photoUrl?: string;
    buttons: LandingButton[];
    badges: string[];
  };
  stats: LandingStat[];
  programs: { title: string; lead: string; cards: LandingCard[] };
  whyUs: { title: string; lead: string; cards: LandingCard[] };
  testimonials: { title: string; lead: string; quotes: LandingTestimonial[] };
  contact: {
    title: string;
    text: string;
    ctaLabel: string;
    address?: string;
    phone?: string;
    hours?: string;
  };
  footer: { copyright: string };
  /** Social pages the centre wants linked from its landing page. Empty
   *  strings mean the platform is not shown at all. */
  socials: { facebook: string; instagram: string; tiktok: string };
};

/**
 * Sensible starter content built from just the centre's name. Used when a
 * centre has never opened the website builder, so every centre already has a
 * decent page at its address on day one, and the builder (piece 2) simply
 * edits these fields.
 */
export function defaultLandingContent(centreName: string): LandingContent {
  const name = centreName || 'Our education facility';
  return {
    templateId: 'classic-orange',
    accent: '#EA580C',
    ribbon: 'Admissions open · 2026/27 session',
    hero: {
      headline: 'Learn. Excel. Succeed with us.',
      subText:
        'WAEC, NECO and JAMB preparation taught by experienced tutors, with weekly mock exams that keep every student on track.',
      buttons: [
        { label: 'Send an enquiry', href: '#enquiry', kind: 'primary' },
        { label: 'Chat on WhatsApp', href: '#whatsapp', kind: 'ghost' },
      ],
      badges: ['WAEC', 'NECO', 'JAMB', 'Morning & evening classes'],
    },
    stats: [
      { value: '500+', label: 'students taught' },
      { value: '15 yrs', label: 'of teaching' },
      { value: '96%', label: 'exam pass rate' },
    ],
    programs: {
      title: 'Our programs',
      lead: 'Every class is capped in size so each student gets attention.',
      cards: [
        {
          icon: 'pencil',
          title: 'WAEC Prep',
          text: 'Full syllabus coverage with past-question drills and marking-scheme practice.',
        },
        {
          icon: 'list',
          title: 'JAMB / UTME Prep',
          text: 'Computer-based practice, speed drills and weekly scores your child can track.',
        },
        {
          icon: 'target',
          title: 'Primary & Junior',
          text: 'Strong foundations in Maths, English and Sciences from primary 4 to JSS3.',
        },
      ],
    },
    whyUs: {
      title: 'Why parents choose us',
      lead: 'Small classes, serious tutors, honest progress reports.',
      cards: [
        {
          icon: 'star',
          title: 'Experienced tutors',
          text: 'Tutors with over a decade of classroom experience across core subjects.',
        },
        {
          icon: 'users',
          title: 'Small class sizes',
          text: 'A maximum of 15 students per class so nobody hides at the back.',
        },
        {
          icon: 'clock',
          title: 'Weekly mock exams',
          text: 'Every week, with results released to parents the same week.',
        },
      ],
    },
    testimonials: {
      title: 'What parents say',
      lead: 'Real words from families in our community.',
      quotes: [
        {
          quote:
            "My daughter's JAMB score jumped 40 points after one term here. The weekly mocks kept her honest.",
          name: 'Mrs. Adaeze O.',
          role: 'Parent, JAMB class',
        },
        {
          quote:
            "The tutors actually call to discuss my son's weak topics. That is rare and it matters.",
          name: 'Mr. Kunle A.',
          role: 'Parent, WAEC class',
        },
      ],
    },
    contact: {
      title: 'Ready to enrol?',
      text: 'Admissions for the 2026/27 session are open. Registration takes two minutes.',
      ctaLabel: 'Register your child now',
      hours: 'Mon – Sat · 8:00am – 6:00pm',
    },
    footer: { copyright: `© ${new Date().getFullYear()} ${name}` },
    socials: { facebook: '', instagram: '', tiktok: '' },
  };
}

/** Basic shape check for content coming out of the database. */
export function isLandingContent(value: unknown): value is LandingContent {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.templateId === 'classic-orange' &&
    typeof v.accent === 'string' &&
    !!v.hero && typeof v.hero === 'object'
  );
}
