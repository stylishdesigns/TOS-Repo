import {
  TenantSettings,
  Branch,
  CMSContent,
  Student,
  AdmissionApplication,
  Tutor,
  Programme,
  TimetableSlot,
  StudentResult,
  CBTQuestion,
  PaymentRecord,
  Announcement,
  AdminUser,
  ActivityLog,
  Classroom,
  AttendanceSettings,
  SubjectEntry,
  StudyMaterial
} from './types';

export const INITIAL_ATTENDANCE_SETTINGS: AttendanceSettings = {
  resumptionTime: '08:00 AM',
  closingTime: '03:30 PM',
  lateArrivalTime: '08:30 AM',
};

export const INITIAL_CLASSROOMS: Classroom[] = [
  { id: 'room-1', name: 'Lecture Hall A', code: 'LHA', capacity: 120, building: 'Main Academic Block (Ground Floor)', features: ['Ceiling Fans', 'Digital Projector', 'PA Sound System'], isAvailable: true },
  { id: 'room-2', name: 'Physics & Electronics Lab', code: 'PHY-LAB', capacity: 45, building: 'Science Wing', features: ['Apparatus Benches', 'Oscilloscopes', 'Smart Screen'], isAvailable: true },
  { id: 'room-3', name: 'Chemistry & Biology Lab', code: 'CHM-LAB', capacity: 50, building: 'Science Wing', features: ['Fume Hood', 'Reagent Racks', 'Microscopes'], isAvailable: true },
  { id: 'room-4', name: 'Commercial & Arts Lecture Room 1', code: 'CR-1', capacity: 60, building: 'Annex Block (1st Floor)', features: ['Air Conditioning', 'Whiteboard'], isAvailable: true },
  { id: 'room-5', name: 'CBT Practice Centre (50 PCs)', code: 'CBT-1', capacity: 50, building: 'ICT Centre', features: ['High-speed LAN', 'Backup Inverter Power', '50 Workstations'], isAvailable: true },
  { id: 'room-6', name: 'Seminar & Revision Room 2', code: 'SEM-2', capacity: 35, building: 'Main Block (2nd Floor)', features: ['Interactive Whiteboard'], isAvailable: true },
];

export const INITIAL_SETTINGS: TenantSettings = {
  centreName: '',
  tagline: '',
  logoText: 'TC',
  primaryColor: '#f97316', // Vibrant Amber/Orange like the video design
  secondaryColor: '#0f172a', // Deep slate navy
  address: '',
  state: '',
  phone: '',
  email: '',
  whatsapp: '',
  whatsappNumber: '',
  currencySymbol: '₦',
  academicSession: '',
  activeBranchId: '',
  websiteDomain: '',
  maintenanceMode: false,
  allowPublicAdmissions: true,
  smsNotifications: true,
  emailNotifications: true,
  bankName: '',
  bankAccountNumber: '',
  bankAccountName: '',
  cashPaymentGuide: '',
  academicSessions: [],
};

export const INITIAL_BRANCHES: Branch[] = [
  {
    id: 'branch-1',
    name: 'Ikeja Main Campus',
    state: 'Lagos',
    address: '14 Allen Avenue, Ikeja, Lagos',
    phone: '+234 805 676 5455',
    coordinator: 'Mr. Babatunde Alabi',
    studentCount: 142,
  },
  {
    id: 'branch-2',
    name: 'Yaba Tech Hub Centre',
    state: 'Lagos',
    address: '82 Herbert Macaulay Way, Yaba, Lagos',
    phone: '+234 802 334 1190',
    coordinator: 'Mrs. Folashade Adeleke',
    studentCount: 98,
  },
  {
    id: 'branch-3',
    name: 'Surulere Annex',
    state: 'Lagos',
    address: '25 Ogunlana Drive, Surulere, Lagos',
    phone: '+234 813 456 7890',
    coordinator: 'Engr. Emeka Nwosu',
    studentCount: 76,
  },
  {
    id: 'branch-4',
    name: 'Abuja Federal Capital Centre',
    state: 'FCT Abuja',
    address: 'Plot 402 Garki II, Area 11, Abuja',
    phone: '+234 809 111 2233',
    coordinator: 'Dr. Usman Danjuma',
    studentCount: 65,
  }
];

export const INITIAL_CMS: CMSContent = {
  hero: {
    badge: '🏆 #1 RATED TUTORIAL CENTRE IN LAGOS',
    headline: 'Prepare for JAMB, WAEC & A-Levels with Elite Tutors',
    subheadline:
      'Join Nigeria’s most rigorous examination preparation centre. Over 96% of our registered candidates secure top-tier federal university admissions on their first attempt.',
    primaryCtaText: 'Register for Admission',
    secondaryCtaText: 'Explore Programmes',
    bannerImage:
      'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1400&q=80',
    statsHighlight: [
      { label: 'Average JAMB Score', value: '298+' },
      { label: 'Distinctions in WAEC', value: '94.6%' },
      { label: 'Students Placed', value: '3,800+' },
      { label: 'Specialist Tutors', value: '24' },
    ],
  },
  about: {
    title: 'Dedicated to Academic Distinction',
    description:
      'Founded with the single mission of dismantling exam anxiety and unlocking student potential, we deliver structured tutoring, rigorous mock tests, CBT simulations, and holistic mentorship for secondary and post-secondary candidates.',
    highlights: [
      'Comprehensive syllabus coverage mapped to latest JAMB/WAEC brochures',
      'Fully equipped computer-based testing (CBT) lab with 50+ terminals',
      'Weekly diagnostic tests with instant performance analytics for parents',
      'Small group cohorts capped at 25 students per class for individualized focus',
    ],
    mission: 'To empower Nigerian youth with superior academic competence, disciplined study habits, and university-ready confidence.',
    vision: 'To remain the undisputed benchmark in preparatory education across West Africa.',
  },
  faqs: [
    {
      id: 'faq-1',
      question: 'When do the 2026/2027 JAMB Intensive lectures begin?',
      answer:
        'Lectures run Monday through Saturday with morning (9:00 AM - 1:00 PM) and evening cohorts (4:00 PM - 7:00 PM). Admissions are open until class capacities are reached.',
      category: 'Admissions',
    },
    {
      id: 'faq-2',
      question: 'Do you offer installment payment for the tuition fees?',
      answer:
        'Yes! Parents can pay in two flexible installments: 60% upon admission registration and the remaining 40% within 45 days.',
      category: 'Fees',
    },
    {
      id: 'faq-3',
      question: 'Are study materials and CBT past question softwares included in the fee?',
      answer:
        'All enrolled students receive comprehensive printed summary handouts, past question compilations, and unlimited access to our in-house CBT test bank.',
      category: 'Curriculum',
    },
    {
      id: 'faq-4',
      question: 'Can parents monitor their ward’s daily attendance and scores?',
      answer:
        'Absolutely. Our Parent Portal enables parents to check real-time attendance percentages, mock test report sheets, and fee payment histories using their ward’s Student ID.',
      category: 'Parent Portal',
    },
  ],
  testimonials: [],
  gallery: [
    {
      id: 'g-1',
      title: 'Active CBT Simulation Hall',
      category: 'Facilities',
      imageUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80',
    },
    {
      id: 'g-2',
      title: 'Interactive Physics Masterclass',
      category: 'Classroom',
      imageUrl: 'https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=600&q=80',
    },
    {
      id: 'g-3',
      title: 'Annual Academic Merit Awards',
      category: 'Events',
      imageUrl: 'https://images.unsplash.com/photo-1523580494863-6f3031224c94?auto=format&fit=crop&w=600&q=80',
    },
    {
      id: 'g-4',
      title: 'Chemistry Laboratory Demonstration',
      category: 'Science Lab',
      imageUrl: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=600&q=80',
    },
  ],
};

export const INITIAL_PROGRAMMES: Programme[] = [
  {
    id: 'prog-1',
    name: 'JAMB / UTME 2027 Intensive',
    code: 'JAMB-2027',
    description: 'High-yield masterclass covering Use of English, Mathematics, Physics, Chemistry, Biology, Economics, and Government with daily CBT simulations.',
    subjects: ['English Language', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Economics'],
    fee: 50000,
    duration: '4 Months (Jan - Apr 2027)',
    startDate: '2027-01-05',
    endDate: '2027-04-28',
    maxStudents: 120,
    enrolledStudents: 94,
    status: 'Active',
    category: 'JAMB',
  },
  {
    id: 'prog-2',
    name: 'WAEC / WASSCE Comprehensive Prep',
    code: 'WAEC-2027',
    description: 'Targeted syllabus mastery with practical laboratory sessions, theory marking schemes, and past paper dissection for SSS3 students.',
    subjects: ['General Mathematics', 'English Studies', 'Physics', 'Chemistry', 'Biology', 'Civic Education'],
    fee: 40000,
    duration: '5 Months (Nov - Mar 2027)',
    startDate: '2026-11-10',
    endDate: '2027-04-15',
    maxStudents: 80,
    enrolledStudents: 62,
    status: 'Active',
    category: 'WAEC',
  },
  {
    id: 'prog-3',
    name: 'NECO SSCE Senior Prep',
    code: 'NECO-2027',
    description: 'Specialized remedial and preparatory coaching focused on the national NECO curriculum guidelines and practicals.',
    subjects: ['Mathematics', 'English', 'Government', 'Literature in English', 'Economics', 'Accounting'],
    fee: 35000,
    duration: '3 Months (Mar - Jun 2027)',
    startDate: '2027-03-01',
    endDate: '2027-06-15',
    maxStudents: 60,
    enrolledStudents: 41,
    status: 'Active',
    category: 'NECO',
  },
  {
    id: 'prog-4',
    name: 'Cambridge A-Level & JUPEB Fast-Track',
    code: 'ALEVEL-2027',
    description: 'Direct Entry university qualification pathway into 200-Level across premier Nigerian and international universities.',
    subjects: ['Physics', 'Chemistry', 'Biology', 'Pure Mathematics'],
    fee: 180000,
    duration: '9 Months (Sep - Jun 2027)',
    startDate: '2026-09-15',
    endDate: '2027-06-30',
    maxStudents: 35,
    enrolledStudents: 28,
    status: 'Active',
    category: 'A-Levels',
  },
  {
    id: 'prog-5',
    name: 'SAT & Post-UTME Screening Prep',
    code: 'SAT-POSTUTME',
    description: 'Advanced aptitude testing, quantitative reasoning, reading comprehension, and university screening interview preparation.',
    subjects: ['Critical Reading', 'Maths Section', 'General Paper', 'Verbal Reasoning'],
    fee: 75000,
    duration: '2 Months Accelerated',
    startDate: '2027-05-01',
    endDate: '2027-07-01',
    maxStudents: 40,
    enrolledStudents: 15,
    status: 'Upcoming',
    category: 'SAT / International',
  },
];

export const INITIAL_TUTORS: Tutor[] = [];

export const INITIAL_STUDENTS: Student[] = [];

export const INITIAL_ADMISSIONS: AdmissionApplication[] = [];

const getCurrentWeekWeekdayDate = (dayOffset: number) => {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const d = new Date(now);
  d.setDate(now.getDate() + mondayOffset + dayOffset);
  return d.toISOString().split('T')[0];
};

export const INITIAL_TIMETABLE: TimetableSlot[] = [
  {
    id: 'tt-1',
    date: getCurrentWeekWeekdayDate(0),
    day: 'Monday',
    time: '09:00 AM - 11:00 AM',
    subject: 'Mathematics',
    tutorName: 'Mr. Babatunde Alabi',
    tutorId: 'tut-1',
    programmeId: 'prog-1',
    programmeName: 'JAMB / UTME 2027 Intensive',
    room: 'Lecture Hall A',
    roomId: 'room-1',
    status: 'active',
    topic: 'Differential Calculus & Rates of Change',
  },
  {
    id: 'tt-2',
    date: getCurrentWeekWeekdayDate(0),
    day: 'Monday',
    time: '11:30 AM - 01:30 PM',
    subject: 'Physics',
    tutorName: 'Dr. Michael Adeleke',
    tutorId: 'tut-3',
    programmeId: 'prog-1',
    programmeName: 'JAMB / UTME 2027 Intensive',
    room: 'Physics & Electronics Lab',
    roomId: 'room-2',
    status: 'active',
    topic: 'Electromagnetism & Faraday’s Induction Laws',
  },
  {
    id: 'tt-3',
    date: getCurrentWeekWeekdayDate(1),
    day: 'Tuesday',
    time: '09:00 AM - 11:00 AM',
    subject: 'English Language',
    tutorName: 'Mrs. Adaobi Nwosu',
    tutorId: 'tut-2',
    programmeId: 'prog-1',
    programmeName: 'JAMB / UTME 2027 Intensive',
    room: 'Commercial & Arts Lecture Room 1',
    roomId: 'room-4',
    status: 'active',
    topic: 'Concord, Lexis & Oral Vowel Phonetics',
  },
  {
    id: 'tt-4',
    date: getCurrentWeekWeekdayDate(1),
    day: 'Tuesday',
    time: '11:30 AM - 01:30 PM',
    subject: 'Chemistry',
    tutorName: 'Mrs. Folake Jimoh',
    tutorId: 'tut-4',
    programmeId: 'prog-1',
    programmeName: 'JAMB / UTME 2027 Intensive',
    room: 'Chemistry & Biology Lab',
    roomId: 'room-3',
    status: 'pending_tutor_consent',
    topic: '', // Pending tutor to fill in topic and give consent
  },
  {
    id: 'tt-5',
    date: getCurrentWeekWeekdayDate(2),
    day: 'Wednesday',
    time: '09:00 AM - 11:00 AM',
    subject: 'Biology',
    tutorName: 'Mr. David Danjuma',
    tutorId: 'tut-5',
    programmeId: 'prog-1',
    programmeName: 'JAMB / UTME 2027 Intensive',
    room: 'Chemistry & Biology Lab',
    roomId: 'room-3',
    status: 'pending_tutor_consent',
    topic: '', // Pending tutor to fill in topic and give consent
  },
  {
    id: 'tt-6',
    date: getCurrentWeekWeekdayDate(2),
    day: 'Wednesday',
    time: '02:00 PM - 04:00 PM',
    subject: 'Further Mathematics',
    tutorName: 'Mr. Babatunde Alabi',
    tutorId: 'tut-1',
    programmeId: 'prog-4',
    programmeName: 'Cambridge A-Level & JUPEB Fast-Track',
    room: 'Seminar & Revision Room 2',
    roomId: 'room-6',
    status: 'reschedule_requested',
    topic: 'Matrices, Determinants & Vector Spaces',
    changeRequestType: 'reschedule',
    changeRequestReason: 'Clash with UNILAG post-graduate research seminar; please move to Thursday 2:00 PM.',
  },
  {
    id: 'tt-7',
    date: getCurrentWeekWeekdayDate(3),
    day: 'Thursday',
    time: '09:00 AM - 11:00 AM',
    subject: 'CBT Practice & Speed Drill',
    tutorName: 'Mr. Babatunde Alabi',
    tutorId: 'tut-1',
    programmeId: 'prog-1',
    programmeName: 'JAMB / UTME 2027 Intensive',
    room: 'CBT Practice Centre (50 PCs)',
    roomId: 'room-5',
    status: 'active',
    topic: 'Full 180-Question Mock Test with Real-time Stopwatch',
  },
];

export const INITIAL_RESULTS: StudentResult[] = [];

export const INITIAL_STUDY_MATERIALS: StudyMaterial[] = [
  {
    id: 'mat-1',
    title: 'Differential Calculus & Rates of Change: Comprehensive Summary Notes',
    subject: 'Mathematics',
    topic: 'Differential Calculus & Rates of Change',
    tutorName: 'Mr. Babatunde Alabi',
    tutorId: 'tut-1',
    programmeId: 'prog-1',
    fileType: 'PDF',
    fileSize: '3.2 MB',
    pages: 24,
    uploadedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    description: 'Complete lecture summary covering first principles, product and quotient rules, chain rule, and real-world maximum/minimum word problems.',
    contentSummary: 'Includes 45 worked exam questions with step-by-step calculus proofs, graphical interpretations of dy/dx, and speed-drill shortcuts for JAMB and WAEC.'
  },
  {
    id: 'mat-2',
    title: 'Electromagnetism & Faraday’s Induction Laws: Formula Handout',
    subject: 'Physics',
    topic: 'Electromagnetism & Faraday’s Induction Laws',
    tutorName: 'Dr. Michael Adeleke',
    tutorId: 'tut-3',
    programmeId: 'prog-1',
    fileType: 'PDF',
    fileSize: '2.1 MB',
    pages: 18,
    uploadedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    description: 'Concise physics formulae, magnetic flux density derivations, Lenz’s law direction cheat-sheets, and transformer efficiency equations.',
    contentSummary: 'Covers right-hand grip rules, solenoid field equations, self and mutual inductance, and alternating current generator workings.'
  },
  {
    id: 'mat-3',
    title: 'Concord, Lexis & Oral Vowel Phonetics: Class Study Guide',
    subject: 'English Language',
    topic: 'Concord, Lexis & Oral Vowel Phonetics',
    tutorName: 'Mrs. Adaobi Nwosu',
    tutorId: 'tut-2',
    programmeId: 'prog-1',
    fileType: 'PDF',
    fileSize: '1.8 MB',
    pages: 15,
    uploadedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    description: 'Crucial rules of grammatical concord, proximity, pluralia tantum, stress placement, and phonetic vowel symbols.',
    contentSummary: 'Highlights the top 50 concord traps tested in JAMB UTME, with paired phonetic exercises for pure vowels and diphthongs.'
  },
  {
    id: 'mat-4',
    title: 'Chemical Equilibrium & Le Chatelier’s Principle: Revision Pack',
    subject: 'Chemistry',
    topic: 'Chemical Equilibrium & Reaction Kinetics',
    tutorName: 'Mrs. Folake Jimoh',
    tutorId: 'tut-4',
    programmeId: 'prog-1',
    fileType: 'PDF',
    fileSize: '2.6 MB',
    pages: 20,
    uploadedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    description: 'Equilibrium constant calculations (Kc and Kp), effect of temperature, pressure and catalyst on reversible chemical systems.',
    contentSummary: 'Complete review of Haber and Contact processes with industrial yield optimizations and graphical rate curves.'
  },
  {
    id: 'mat-5',
    title: 'Cell Biology & Genetics: High-Yield Diagrams & Summaries',
    subject: 'Biology',
    topic: 'Cell Structure, Mitosis & Mendelian Genetics',
    tutorName: 'Mr. David Danjuma',
    tutorId: 'tut-5',
    programmeId: 'prog-1',
    fileType: 'PDF',
    fileSize: '4.5 MB',
    pages: 32,
    uploadedAt: new Date(Date.now() - 6 * 86400000).toISOString(),
    description: 'Labeled biological structures, organelles, stages of meiosis and mitosis, Punnett squares, and pedigree chart analysis.',
    contentSummary: 'Includes monohybrid and dihybrid cross problem sets, sex-linked inheritance traits, and past JAMB diagram identification practice.'
  },
  {
    id: 'mat-6',
    title: 'Matrices, Determinants & Vector Spaces Practice Handout',
    subject: 'Further Mathematics',
    topic: 'Matrices, Determinants & Vector Spaces',
    tutorName: 'Mr. Babatunde Alabi',
    tutorId: 'tut-1',
    programmeId: 'prog-4',
    fileType: 'PDF',
    fileSize: '1.9 MB',
    pages: 14,
    uploadedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    description: '3x3 matrix inverses using adjugates, Cramer’s rule for linear systems, linear independence, and eigenvalue basics.',
    contentSummary: 'Advanced problems mapped to Cambridge A-Level and JUPEB syllabi with step-by-step matrix reduction strategies.'
  }
];

export const INITIAL_CBT_QUESTIONS: CBTQuestion[] = [
  {
    id: 'cbt-1',
    subject: 'Mathematics',
    question: 'Solve for x in the equation: 3^(2x - 1) = 27^(x - 2).',
    options: ['x = 5', 'x = 3', 'x = 7', 'x = -5'],
    correctIndex: 0,
    explanation: '3^(2x-1) = (3^3)^(x-2) = 3^(3x-6). Equating exponents: 2x - 1 = 3x - 6 => x = 5.',
  },
  {
    id: 'cbt-2',
    subject: 'English Language',
    question: 'From the words provided, choose the word opposite in meaning to the italicized word: "The minister was praised for his *frugal* spending during the fiscal year."',
    options: ['Prudent', 'Profligate', 'Miserly', 'Ostentatious'],
    correctIndex: 1,
    explanation: '"Frugal" means economical and cautious with money. "Profligate" means recklessly extravagant or wasteful.',
  },
  {
    id: 'cbt-3',
    subject: 'Physics',
    question: 'A ball of mass 0.5 kg is dropped from a height of 20 m. Neglecting air resistance, what is its kinetic energy just before hitting the ground? (Take g = 10 m/s²)',
    options: ['50 J', '100 J', '200 J', '20 J'],
    correctIndex: 1,
    explanation: 'By conservation of energy: PE_initial = KE_final. PE = m * g * h = 0.5 * 10 * 20 = 100 Joules.',
  },
  {
    id: 'cbt-4',
    subject: 'Chemistry',
    question: 'Which of the following elements has the highest first ionization energy?',
    options: ['Sodium (Na)', 'Chlorine (Cl)', 'Neon (Ne)', 'Argon (Ar)'],
    correctIndex: 2,
    explanation: 'Noble gases with closed outer shell configurations have exceptionally high ionization energies; Neon has a smaller atomic radius than Argon and thus holds outer electrons most tightly.',
  },
  {
    id: 'cbt-5',
    subject: 'Biology',
    question: 'In cellular genetics, which organelle is directly responsible for synthesizing ribosomes?',
    options: ['Golgi apparatus', 'Nucleolus', 'Endoplasmic reticulum', 'Lysosome'],
    correctIndex: 1,
    explanation: 'The nucleolus within the cell nucleus is the site of ribosomal RNA (rRNA) transcription and ribosome subunit assembly.',
  }
];

export const INITIAL_PAYMENTS: PaymentRecord[] = [];

export const INITIAL_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'ann-1',
    title: 'JAMB 2027 Syllabus Updates & Literature Text Distribution',
    content: 'All enrolled JAMB Intensive students are to collect their assigned recommended prose and poetry texts from the administrative desk by Friday, 4:00 PM.',
    target: 'All',
    date: 'Yesterday',
    priority: 'Urgent',
  },
  {
    id: 'ann-2',
    title: 'Special Physics Clinic with Dr. Adeleke this Saturday',
    content: 'An intensive 3-hour masterclass on Rotational Dynamics and Alternating Current circuits will hold at the Ikeja campus amphitheatre starting 10:00 AM prompt.',
    target: 'Students',
    date: '3 days ago',
    priority: 'Normal',
  },
  {
    id: 'ann-3',
    title: 'Parent-Teacher Consultative Forum & Mid-Term Report Review',
    content: 'Parents and guardians are cordially invited to the virtual consultation session scheduled for next Sunday at 5:00 PM via Zoom.',
    target: 'Parents',
    date: '5 days ago',
    priority: 'Normal',
  }
];

export const INITIAL_ADMINS: AdminUser[] = [];

export const INITIAL_ACTIVITIES: ActivityLog[] = [
  {
    id: 'act-1',
    title: 'Oluwaseun Bakare submitted admission application',
    subtitle: 'JAMB Intensive • Ikeja Campus',
    category: 'Admissions',
    timeAgo: '1 day ago',
    type: 'pending',
  },
  {
    id: 'act-2',
    title: 'Payment of ₦50,000 confirmed for John Ade',
    subtitle: 'Receipt #REC-2026-0811 • Bank Transfer',
    category: 'Finance',
    timeAgo: '2 days ago',
    type: 'success',
  },
  {
    id: 'act-3',
    title: 'Approved Zainab Balogun into JAMB 2027 cohort',
    subtitle: 'Assigned to Ikeja Campus',
    category: 'Students',
    timeAgo: '2 days ago',
    type: 'success',
  },
  {
    id: 'act-4',
    title: 'CMS Hero Banner & Tuition Fees Updated',
    subtitle: 'Modified by Super Admin',
    category: 'CMS',
    timeAgo: '3 days ago',
    type: 'info',
  },
  {
    id: 'act-5',
    title: 'Weekly Attendance Recorded: 92% Average',
    subtitle: '6 Cohorts • 381 Total Attendances logged',
    category: 'Students',
    timeAgo: '4 days ago',
    type: 'info',
  },
];

export const INITIAL_SUBJECTS: SubjectEntry[] = [
  {
    id: 'sub-1',
    name: 'Use of English',
    department: 'General',
    description: 'Comprehension, Lexis & Structure, Oral Forms, Concord, and Idiomatic Expressions.',
  },
  {
    id: 'sub-2',
    name: 'General Mathematics',
    department: 'General',
    description: 'Number & Numeration, Algebraic Processes, Trigonometry, Calculus, and Statistics.',
  },
  {
    id: 'sub-3',
    name: 'Physics',
    department: 'Science',
    description: 'Mechanics, Thermal Energy, Wave Motion & Optics, Electricity & Magnetism, Modern Physics.',
  },
  {
    id: 'sub-4',
    name: 'Chemistry',
    department: 'Science',
    description: 'Particulate Nature of Matter, Stoichiometry, Periodicity, Organic Chemistry, Electrochemistry.',
  },
  {
    id: 'sub-5',
    name: 'Biology',
    department: 'Science',
    description: 'Cell Biology, Nutrition, Internal Transport Systems, Genetics, Ecology, and Evolution.',
  },
  {
    id: 'sub-6',
    name: 'Further Mathematics',
    department: 'Science',
    description: 'Pure Mathematics, Statistics, Mechanics, and Calculus at an advanced level.',
  },
  {
    id: 'sub-7',
    name: 'Government',
    department: 'Arts',
    description: 'Political Science, Public Administration, and National Interest.',
  },
  {
    id: 'sub-8',
    name: 'Literature in English',
    department: 'Arts',
    description: 'Drama, Prose, and Poetry analysis.',
  },
  {
    id: 'sub-9',
    name: 'Economics',
    department: 'Commercial',
    description: 'Macroeconomics, Microeconomics, and Statistical Methods.',
  },
  {
    id: 'sub-10',
    name: 'Financial Accounting',
    department: 'Commercial',
    description: 'Bookkeeping, Balance Sheets, and Final Accounts.',
  },
  {
    id: 'sub-11',
    name: 'Commerce',
    department: 'Commercial',
    description: 'Trade, Aids to Trade, and Business Management.',
  },
  {
    id: 'sub-12',
    name: 'Christian Religious Studies',
    department: 'Arts',
    description: 'Biblical teachings and application.',
  },
  {
    id: 'sub-13',
    name: 'Islamic Religious Studies',
    department: 'Arts',
    description: 'Quranic studies and Islamic law.',
  },
  {
    id: 'sub-14',
    name: 'History',
    department: 'Arts',
    description: 'National and International historical events.',
  },
  {
    id: 'sub-15',
    name: 'Geography',
    department: 'Science',
    description: 'Physical, Human, and Regional Geography.',
  },
  {
    id: 'sub-16',
    name: 'Agricultural Science',
    department: 'Science',
    description: 'Crop production, Animal husbandry, and Soil science.',
  },
];
