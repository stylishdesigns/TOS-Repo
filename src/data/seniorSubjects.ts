/**
 * Nigerian senior secondary (SS1-SS3) subject catalogue with topics, covering
 * the core and elective subjects offered for JAMB and WAEC/NECO examinations.
 * Used as the dropdown options in the platform Question Bank authoring forms.
 * Topics are the standard scheme-of-work headings per subject.
 */

export const SENIOR_SUBJECTS: Record<string, string[]> = {
  'English Language': [
    'Comprehension', 'Lexis and Structure', 'Oral English', 'Essay Writing', 'Letter Writing',
    'Summary Writing', 'Vocabulary Development', 'Idioms and Phrasal Verbs', 'Synonyms and Antonyms',
    'Stress and Intonation', 'Concord', 'Punctuation and Capitalization',
  ],
  'Mathematics': [
    'Number and Numeration', 'Fractions and Decimals', 'Indices and Logarithms', 'Surds', 'Sets',
    'Algebraic Expressions', 'Linear Equations', 'Quadratic Equations', 'Simultaneous Equations',
    'Inequalities', 'Variation', 'Word Problems', 'Sequences and Series', 'Polynomials',
    'Mensuration', 'Plane Geometry', 'Circle Geometry', 'Trigonometry', 'Bearings and Distances',
    'Coordinate Geometry', 'Statistics', 'Probability', 'Differentiation', 'Integration',
  ],
  'Physics': [
    'Measurement and Units', 'Motion', 'Force and Newton\u2019s Laws', 'Work, Energy and Power',
    'Pressure', 'Elasticity', 'Heat Energy', 'Gas Laws', 'Waves', 'Sound Waves', 'Light Waves',
    'Mirrors and Lenses', 'Electric Field', 'Current Electricity', 'Magnetism', 'Electromagnetic Waves',
    'Simple Machines', 'Radioactivity', 'Nuclear Physics', 'Space Physics',
  ],
  'Chemistry': [
    'Particulate Nature of Matter', 'Separation Techniques', 'Atomic Structure', 'Periodic Table',
    'Chemical Bonding', 'Stoichiometry', 'States of Matter', 'Energy and Chemical Reactions',
    'Acids, Bases and Salts', 'Redox Reactions', 'Electrochemistry', 'Rates of Reaction',
    'Chemical Equilibrium', 'Organic Chemistry', 'Metals and Their Compounds', 'Non-Metals',
    'Air, Water and Pollution', 'Laboratory Practice',
  ],
  'Biology': [
    'Cell Structure and Organization', 'Cell Division', 'Transport in Organisms', 'Respiration',
    'Nutrition in Plants', 'Nutrition in Animals', 'Excretion', 'Growth', 'Skeleton and Movement',
    'Coordination and Nervous System', 'Hormones', 'Reproduction', 'Genetics and Heredity',
    'Evolution', 'Ecology and Ecosystems', 'Microorganisms', 'Diseases and Immunity',
    'Conservation of Natural Resources',
  ],
  'Agricultural Science': [
    'Agricultural Ecology', 'Soil Science', 'Crop Production', 'Crop Diseases and Pests',
    'Animal Production', 'Animal Health', 'Fisheries', 'Forestry and Wildlife', 'Horticulture',
    'Farm Tools and Machinery', 'Agricultural Economics and Extension',
  ],
  'Economics': [
    'Basic Economic Concepts', 'Demand and Supply', 'Elasticity', 'Consumer Behaviour',
    'Theory of Production', 'Cost and Revenue', 'Business Organisations', 'Market Structures',
    'Money and Inflation', 'Financial Institutions', 'Public Finance', 'National Income',
    'International Trade', 'Economic Development and Planning', 'Population',
  ],
  'Government': [
    'Basic Concepts of Government', 'Forms of Government', 'Organs of Government',
    'Separation of Powers', 'Political Ideologies', 'Constitution and Constitutionalism',
    'Federalism', 'Political Parties', 'Pressure Groups', 'Public Opinion', 'Elections and Electoral Process',
    'Civil Service', 'Local Government in Nigeria', 'Colonial Administration',
    'Nationalism in Nigeria', 'Nigeria Since Independence', 'International Organizations',
  ],
  'Literature-in-English': [
    'Poetry', 'Drama', 'Prose', 'Literary Appreciation', 'Figures of Speech', 'Literary Terms',
    'Themes and Characters', 'Setting and Plot', 'Language and Style',
  ],
  'Geography': [
    'Map Reading and Interpretation', 'The Earth and Its Structure', 'Rocks and Landforms',
    'Weather and Climate', 'Rivers and Drainage', 'Oceans and Coastal Features', 'Vegetation',
    'Soils', 'Population', 'Settlement', 'Economic Activities', 'Transport and Communication',
    'Regional Geography of Nigeria', 'Fieldwork',
  ],
  'Commerce': [
    'Introduction to Commerce', 'Production', 'Occupations', 'Home Trade', 'Foreign Trade',
    'Transportation', 'Communication', 'Warehousing', 'Insurance', 'Banking',
    'Business Units', 'Advertising', 'Consumer Protection', 'Documents Used in Trade',
  ],
  'Financial Accounting': [
    'Introduction to Accounting', 'Accounting Equation', 'Books of Original Entry', 'Ledger',
    'Trial Balance', 'Final Accounts of a Sole Trader', 'Adjustments and Provisions', 'Depreciation',
    'Bank Reconciliation', 'Control Accounts', 'Partnership Accounts', 'Company Accounts',
    'Public Sector Accounting',
  ],
  'Civic Education': [
    'Values and Principles', 'Citizenship', 'Nationalism', 'Democracy and Rule of Law',
    'Human Rights', 'Rule of Law and Constitutionalism', 'Political Apathy', 'Civil Society',
    'Popular Participation', 'Public Service', 'Drugs and Drug Abuse', 'Responsible Parenthood',
    'Traffic Regulations', 'Employment', 'Poverty and Its Effects', 'National Development',
  ],
  'Christian Religious Studies': [
    'God and Creation', 'The Covenant', 'Leadership in Israel', 'The Prophets',
    'Birth and Early Life of Jesus', 'Baptism and Temptation of Jesus', 'The Teachings of Jesus',
    'Parables of Jesus', 'Miracles of Jesus', 'The Passion, Death and Resurrection',
    'The Early Church', 'Paul\u2019s Missionary Journeys', 'Christian Living and Society',
  ],
  'Islamic Religious Studies': [
    'The Qur\u2019an', 'Hadith', 'Tawhid (Oneness of Allah)', 'The Pillars of Islam',
    'Fiqh (Islamic Jurisprudence)', 'Seerah of the Prophet Muhammad', 'Islamic Morals and Etiquette',
    'Family and Marriage in Islam', 'Islamic History', 'Islamic Economic System', 'Islamic Law',
  ],
  'History': [
    'Early Nigerian Societies', 'The Kanem-Borno Empire', 'The Hausa States', 'The Sokoto Caliphate',
    'The Benin Empire', 'The Oyo Empire', 'The Trans-Atlantic Slave Trade', 'Legitimate Commerce',
    'Colonial Conquest and Administration', 'Nationalism and the Road to Independence',
    'Nigeria After Independence', 'The Nigerian Civil War', 'Africa Since Independence', 'The World Wars',
  ],
  'Further Mathematics': [
    'Quadratic and Polynomial Theory', 'Inequalities', 'Binomial Expansion', 'Matrices and Determinants',
    'Sequences and Series', 'Trigonometry', 'Coordinate Geometry', 'Statistics', 'Probability',
    'Vectors', 'Kinematics', 'Dynamics', 'Static equilibrium',
  ],
  'Computer Studies': [
    'Computer Hardware', 'Computer Software', 'Operating Systems', 'Word Processing',
    'Spreadsheets', 'Database Management', 'Presentation Software', 'Internet and Email',
    'Networking', 'Web Design', 'Programming', 'Algorithms and Flowcharts', 'Number Systems',
    'Computer Ethics and Safety', 'Emerging Technologies',
  ],
  'Home Economics': [
    'Family Living', 'Housing and Home Management', 'Food and Nutrition Basics', 'Meal Planning',
    'Clothing and Textiles', 'Care of the Home', 'Child Development', 'Consumer Education',
    'Income Management', 'Laundry Work',
  ],
  'Food and Nutrition': [
    'Nutrients and Their Functions', 'Nutrition and Health', 'Meal Planning and Diet Therapy',
    'Food Preparation and Cooking Methods', 'Kitchen and Cooking Equipment', 'Food Hygiene and Safety',
    'Food Preservation and Storage', 'Food Commodities', 'Food Additives', 'Entertaining and Service',
  ],
  'Technical Drawing': [
    'Drawing Equipment and Instruments', 'Lines and Lettering', 'Geometric Construction',
    'Orthographic Projection', 'Isometric and Oblique Drawing', 'Sectioning', 'Dimensioning',
    'Pictorial Drawing', 'Building Drawing', 'Mechanical Drawing', 'Solid Geometry',
  ],
  'Visual Arts': [
    'Drawing', 'Painting', 'Sculpture', 'Ceramics', 'Graphics and Design', 'Textile Design',
    'Colour Theory', 'Composition', 'Art History and Appreciation', 'Crafts',
  ],
  'Music': [
    'Theory of Music', 'Musical Notation', 'Scales and Keys', 'Intervals', 'Harmony',
    'Musical Forms', 'Nigerian Traditional Music', 'Music Appreciation', 'Instruments',
  ],
  'French': [
    'Grammar', 'Vocabulary', 'Reading Comprehension', 'Translation', 'Oral Skills',
    'Composition', 'Francophone Culture',
  ],
  'Yoruba': [
    'Grammar and Composition', 'Oral Literature', 'Written Literature', 'Translation',
    'Culture and Customs', 'Sound System',
  ],
  'Igbo': [
    'Grammar and Composition', 'Oral Literature', 'Written Literature', 'Translation',
    'Culture and Customs', 'Sound System',
  ],
  'Hausa': [
    'Grammar and Composition', 'Oral Literature', 'Written Literature', 'Translation',
    'Culture and Customs', 'Sound System',
  ],
  'Physical and Health Education': [
    'Anatomy and Physiology', 'Physical Fitness', 'Athletics', 'Ball Games', 'Gymnastics',
    'Racket Games', 'Health Education', 'Personal Hygiene', 'First Aid', 'Sports Injuries',
    'Recreational Activities',
  ],
  'Office Practice': [
    'The Office', 'Office Equipment', 'Business Correspondence', 'Filing and Indexing',
    'Reception and Visitors', 'Office Communication', 'Meetings', 'Stock and Stationery Control',
  ],
  'Insurance': [
    'Introduction to Insurance', 'Principles of Insurance', 'Types of Insurance',
    'Insurance Contracts', 'Underwriting', 'Claims Settlement', 'Insurance Marketing',
  ],
  'Marketing': [
    'Marketing Concepts', 'Market Research', 'Consumer Behaviour', 'Product Development',
    'Pricing', 'Distribution Channels', 'Promotion and Advertising', 'Salesmanship',
    'Customer Service', 'Retailing and Wholesaling',
  ],
};

export const SUBJECT_NAMES: string[] = Object.keys(SENIOR_SUBJECTS).sort((a, b) => a.localeCompare(b));

// The practice form picks its year from this list (user-stated window:
// 2010 up to 2026). Newest first.
export const BANK_YEARS: number[] = Array.from({ length: 2026 - 2010 + 1 }, (_, i) => 2026 - i);
