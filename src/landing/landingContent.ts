/**
 * Centre landing page content model (pieces 1 and 5 of the landing-page
 * feature).
 *
 * A centre's landing page is stored in Firestore at centreLandingPages/{centreId}.
 * Only PUBLIC marketing content lives here: name, tagline, programs, testimonials,
 * contact details. Nothing from this model may ever include student records,
 * fee data, access codes or any other private centre data: the page is served
 * to anonymous visitors.
 *
 * Templates (piece 5): the five looks from the uploaded "Education Landing
 * Page Templates" design. A template is a skin over the SAME content, so an
 * admin can switch looks without retyping anything. Each preset carries its
 * own colours, fonts and corner style; the admin's saved accent colour
 * overrides the preset accent, so colour editing keeps working on every
 * template. Legacy stored pages with templateId 'classic-orange' still load
 * and render (mapped to Sunrise) so no centre loses its page.
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

export type LandingTemplateId =
  | 'scholar'
  | 'meridian'
  | 'aurora'
  | 'sunrise'
  | 'obsidian';

export type LandingContent = {
  templateId: LandingTemplateId | 'classic-orange';
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

export type TemplatePreset = {
  id: LandingTemplateId;
  name: string;
  desc: string;
  /** The look's own accent; a centre's saved accent overrides it. */
  accent: string;
  /** Page background and text colour. */
  bg: string;
  ink: string;
  /** Dark skins (Obsidian) invert surface and muted tones. */
  dark: boolean;
  /** Corner radius in px (0 = sharp corners). */
  radius: number;
  headingFont: string;
  bodyFont: string;
  /** Three colours for the editor's preview strip. */
  swatch: [string, string, string];
};

/** The five landing-page looks, in the order the editor shows them. */
export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: 'scholar',
    name: 'Scholar',
    desc: 'Classic and trustworthy. Navy, amber and soft serif headlines.',
    accent: '#F2A93B',
    bg: '#FBF8F2',
    ink: '#0E1A3A',
    dark: false,
    radius: 24,
    headingFont: "'Fraunces', Georgia, serif",
    bodyFont: "'Plus Jakarta Sans', system-ui, sans-serif",
    swatch: ['#0E1A3A', '#F2A93B', '#FBF8F2'],
  },
  {
    id: 'meridian',
    name: 'Meridian',
    desc: 'Bold and energetic. Forest green, lime and sharp grotesque type.',
    accent: '#C8F169',
    bg: '#F4F2EA',
    ink: '#0A2E22',
    dark: false,
    radius: 14,
    headingFont: "'Space Grotesk', system-ui, sans-serif",
    bodyFont: "'Inter', system-ui, sans-serif",
    swatch: ['#0A2E22', '#C8F169', '#F4F2EA'],
  },
  {
    id: 'aurora',
    name: 'Aurora',
    desc: 'Light and modern. Violet accents with soft rounded shapes.',
    accent: '#5B3DF5',
    bg: '#F6F4FF',
    ink: '#1B1740',
    dark: false,
    radius: 28,
    headingFont: "'Space Grotesk', system-ui, sans-serif",
    bodyFont: "'Inter', system-ui, sans-serif",
    swatch: ['#1B1740', '#5B3DF5', '#F6F4FF'],
  },
  {
    id: 'sunrise',
    name: 'Sunrise',
    desc: 'Warm and friendly. Orange, cream and playful rounded type.',
    accent: '#FF7A2F',
    bg: '#FFF6E8',
    ink: '#2B2118',
    dark: false,
    radius: 28,
    headingFont: "'Fredoka', system-ui, sans-serif",
    bodyFont: "'Nunito', system-ui, sans-serif",
    swatch: ['#2B2118', '#FF7A2F', '#FFF6E8'],
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    desc: 'Dark and premium. Black, ivory and gold with elegant serifs.',
    accent: '#C9A24B',
    bg: '#0C0C0E',
    ink: '#F3EEE3',
    dark: true,
    radius: 0,
    headingFont: "'Playfair Display', Georgia, serif",
    bodyFont: "'Inter', system-ui, sans-serif",
    swatch: ['#0C0C0E', '#C9A24B', '#F3EEE3'],
  },
];

export function templatePreset(id: string | undefined): TemplatePreset {
  return TEMPLATE_PRESETS.find((p) => p.id === id) || TEMPLATE_PRESETS[0];
}

/** Legacy stored pages keep rendering: 'classic-orange' maps to Sunrise. */
export function normalizeTemplateId(id: unknown): LandingTemplateId {
  if (typeof id === 'string' && TEMPLATE_PRESETS.some((p) => p.id === id)) {
    return id as LandingTemplateId;
  }
  return 'sunrise';
}

/** Readable text colour for an accent background. */
export function textOnAccent(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return '#111111';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.58 ? '#111111' : '#FFFFFF';
}

/**
 * Sensible starter content built from just the centre's name. Used when a
 * centre has never opened the website builder, so every centre already has a
 * decent page at its address on day one, and the builder simply edits these
 * fields.
 */
/** The accent swatches shared by the landing editor and the Facility
 * Settings accent card. Gold first: it is the day-one starter colour. */
export const ACCENTS = ['#F2A93B', '#EA580C', '#2563EB', '#059669', '#7C3AED', '#DB2777', '#B45309'];

export function defaultLandingContent(centreName: string, accent?: string): LandingContent {
  const name = centreName || 'Our education facility';
  return {
    templateId: 'scholar',
    accent: accent || '#F2A93B',
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

const TEMPLATE_IDS = new Set<string>([
  ...TEMPLATE_PRESETS.map((p) => p.id),
  'classic-orange',
]);

/** Basic shape check for content coming out of the database. */
export function isLandingContent(value: unknown): value is LandingContent {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.templateId === 'string' &&
    TEMPLATE_IDS.has(v.templateId) &&
    typeof v.accent === 'string' &&
    !!v.hero && typeof v.hero === 'object'
  );
}
