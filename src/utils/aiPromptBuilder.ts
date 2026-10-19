export interface AIPromptParams {
  subject: string;
  programme: string;
  topic?: string;
  mode: 'MCQ' | 'Essay' | 'Both';
  questionCount: number;
  totalEssayMarks?: number;
  scorePerQuestion?: number;
}

export function buildAssessmentAIPrompt(params: AIPromptParams): string {
  const {
    subject,
    programme,
    topic,
    mode,
    questionCount,
    totalEssayMarks = 20,
    scorePerQuestion = 1,
  } = params;

  const subjectName = subject?.trim() || 'General Subject';
  const progLine = programme?.trim() || 'General Curriculum / Level';
  const topicLine = topic?.trim() || 'Comprehensive Syllabus Coverage';

  if (mode === 'MCQ') {
    return `You are a professional CBT question generator. Generate multiple-choice questions based on the subject, topic, class/level, difficulty, and number of questions I provide.

IMPORTANT: Format every question EXACTLY like this because the output will be imported directly into a CBT question engine:

1. What is the capital of Nigeria?
A: Lagos
B: Abuja
C: Kano
D: Ibadan
Answer: B
Explanation: Abuja became the capital of Nigeria in 1991.

2. Which planet is known as the Red Planet?
A: Venus
B: Mars
C: Jupiter
D: Saturn
Answer: B
Explanation: Mars appears red due to iron oxide on its surface.

RULES:
- Use exactly four options: A, B, C, D.
- Use exactly \`A:\`, \`B:\`, \`C:\`, \`D:\`.
- Use \`Answer:\` followed only by the correct letter.
- Always include a brief \`Explanation:\`.
- Number questions sequentially: 1., 2., 3., etc.
- Randomize the correct answer position.
- Ensure there is only one correct answer.
- For maths and science, write all numbers, equations, and configurations in LaTeX inside $...$ (for example $2 \\times 3$, $3d^{5} 4s^{1}$, $\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$).
- Do not use tables, bullets, headings, or any extra text.
- Output ONLY the questions in this exact format.

Subject: ${subjectName}
Topic: ${topicLine}
Class/Level: ${progLine}
Number of Questions: ${questionCount}
Marks per Question: ${scorePerQuestion}`;
  }

  if (mode === 'Essay') {
    return `You are a professional CBT essay question generator. Generate essay questions based on the subject, topic, class/level, difficulty, and number of questions I provide.

IMPORTANT: Format every question EXACTLY like this because the output will be imported directly into a CBT question engine:

1. Discuss the causes and effects of inflation in an economy.
a. Define inflation.
Answer: Inflation is a persistent increase in the general price level of goods and services over a period of time.
b. State:
i. Two major causes of inflation.
Answer: Excessive money supply and increased production costs.
ii. One effect of inflation on consumers.
Answer: Reduced purchasing power.
###

RULES:
- Number each main question sequentially: 1., 2., 3., etc.
- Use lowercase letters for sub-questions: a., b., c., etc.
- Use lowercase Roman numerals for sub-points: i., ii., iii., etc.
- Each essay has 2 to 4 lettered parts. Use sub-points only where natural.
- A question line contains only what the student sees. Never put solutions, hints, working or final answers in it.
- Put each answer directly below the corresponding question or sub-question using exactly \`Answer:\`.
- Write each Answer on ONE line. Chain calculation steps with semicolons.
- Provide clear, accurate, complete, but concise educational answers.
- Write all maths, equations, formulas, matrices and chemical formulas in LaTeX inside single $...$, for example $x^{2}$, $\\frac{3}{5}$, $\\begin{pmatrix} 5 & 2 \\\\ 7 & 3 \\end{pmatrix}$, $\\mathrm{CuSO_4}$. Ordinary words stay outside the dollar signs. No unicode superscripts.
- Put a line containing only ### after each question.
- Do not repeat any sentence or phrase. No introduction, no closing sentence, no commentary, no tables, no bullets, headings.
- Output ONLY the questions and answers in this exact format.

Subject: ${subjectName}
Topic: ${topicLine}
Class/Level: ${progLine}
Number of Questions: ${questionCount}
Total Marks (Essay): ${totalEssayMarks}`;
  }

  // mode === 'Both' (Mixed MCQ & Essay)
  const mcqCount = Math.max(1, Math.round(questionCount * 0.7));
  const essayCount = Math.max(1, questionCount - mcqCount);

  return `You are a professional CBT assessment question generator. Generate a comprehensive examination of multiple-choice questions (MCQs) and structured essay questions based on the subject, topic, class/level, and question counts I provide.

PART 1: MULTIPLE-CHOICE QUESTIONS (${mcqCount} Questions)
Format each MCQ exactly like this:
1. What is the capital of Nigeria?
A: Lagos
B: Abuja
C: Kano
D: Ibadan
Answer: B
Explanation: Abuja became the capital of Nigeria in 1991.

RULES FOR MCQs:
- Exactly four options: A, B, C, D.
- Exactly \`A:\`, \`B:\`, \`C:\`, \`D:\`.
- \`Answer:\` followed only by the correct letter.
- Brief \`Explanation:\` below each question.
- Randomize the correct answer position.

PART 2: STRUCTURED ESSAY QUESTIONS (${essayCount} Questions)
Format each essay question exactly like this:
1. Discuss the causes and effects of inflation in an economy.
a. Define inflation.
Answer: Inflation is a persistent increase in the general price level of goods and services over a period of time.
b. State:
i. Two major causes of inflation.
Answer: Excessive money supply and increased production costs.
ii. One effect of inflation on consumers.
Answer: Reduced purchasing power.
###

RULES FOR ESSAYS:
- Number each essay sequentially.
- Lowercase letters for sub-questions (a., b., c.) and lowercase Roman numerals for sub-points (i., ii., iii.).
- Each answer directly below using \`Answer:\`.
- Put a line containing only ### after each question.

GENERAL RULES:
- Write all maths, equations, formulas, and chemistry in LaTeX inside single $...$ (e.g., $x^{2}$, $\\frac{3}{5}$, $\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$, $\\mathrm{CuSO_4}$).
- Do not use tables, bullets, headings, introductions, or closing remarks.
- Output ONLY the questions and answers in this exact format.

Subject: ${subjectName}
Topic: ${topicLine}
Class/Level: ${progLine}
Total Questions: ${questionCount} (${mcqCount} MCQs, ${essayCount} Essays)
Total Marks (Essay): ${totalEssayMarks}`;
}
