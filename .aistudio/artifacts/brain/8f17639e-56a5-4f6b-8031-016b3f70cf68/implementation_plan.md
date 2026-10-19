# Implementation Plan: Dynamic AI Prompt Auto-Fill & Generator Flow

This plan establishes a seamless prompt-generation bridge between assessment setup parameters (Subject, Programme, Topic, Question Count, Total Marks for Essay, Difficulty/Mode) and the AI question generation engine across the **Admin CBT Manager** (`CBTManager.tsx`) and **Tutor Assessment Portal** (`AssessmentTab.tsx`).

---

## 1. User Problem & Design Objectives
- **Current Friction**: When using AI Generation mode, users previously faced an empty textarea where they had to manually type their instructions and context, while the manual paste area already had comprehensive dynamic prompt guides.
- **Desired Flow**:
  1. As users configure the assessment settings (Subject, Topic, Class/Level, Number of Questions, Total Essay Marks, Mode), the system dynamically builds the full structured prompt template.
  2. Users can click an **"Auto-Fill Prompt from Setup"** button in the AI Generation panel to instantly inject the structured prompt into the editable textarea.
  3. Users can review, adjust, customize, or append any custom instructions directly in the textarea.
  4. If a user clicks **"Generate Questions"** with an empty prompt field, an explicit alert toast prompts them to click **Auto-Fill Prompt** or enter custom instructions first, rather than proceeding with underspecified requests.
  5. The backend (`/api/generate-questions`) processes the full prompt alongside the structured parameters, ensuring the AI strictly adheres to the requested curriculum standards, LaTeX notation, and question schemas.

---

## 2. Component Architecture & UI Changes

### A. Dynamic Prompt Builder Utility
We will create a centralized prompt builder helper `buildAssessmentAIPrompt`:
- **Inputs**:
  - `subject`: selected subject name(s) (or active mock subject)
  - `programme`: selected programme category (JAMB, WAEC, NECO, A-Levels, etc.)
  - `topic`: target topic specified in the setup form
  - `mode`: MCQ, Essay, or Both
  - `questionCount`: number of questions
  - `totalEssayMarks`: score awarded to essays (if applicable)
  - `scorePerQuestion`: points per question for MCQ
- **Output**:
  - A formatted, multi-section prompt matching the proven prompt-guide standard:
    - Target Curriculum & Academic Role
    - Scope Parameters (Subject, Topic, Level, Question Count, Mark Allocation)
    - Mode-Specific Rules (A, B, C, D choices for MCQ, sequential numbering, LaTeX syntax `$x^2$`, `\times`, balanced chemical equations, and structured Essay stems/parts)
    - Instructions to focus on academic rigor and clear explanations

### B. AI Generation Panel Enhancements (`CBTManager.tsx` & `AssessmentTab.tsx`)
In the AI Generation tab of the assessment modal:
1. **Header Action Bar**:
   - Title: `AI Assessment Engine` with `Sparkles` icon.
   - Action Button: **"Auto-Fill Prompt"** (`Wand2` / `Sparkles` button) with subtle tooltip explaining "Load prompt crafted from your setup settings".
   - Helper label showing: `Ready to generate for [Subject] · [Count] Qs · [Mode]`.
2. **Editable Textarea**:
   - Large, comfortable textarea (minimum 140px height) where the prompt is loaded.
   - Textarea placeholder: *"Click 'Auto-Fill Prompt' to automatically construct instructions from your setup form, or type your own custom guidelines..."*
   - Includes a quick **"Reset / Clear"** button if modified.
3. **Empty Field Validation on Generation**:
   - In `handleGenerateAIQuestions`:
     - If `!aiPrompt.trim()`:
       - Show warning toast: `"Instruction Prompt Required: Please click 'Auto-Fill Prompt' to load details from your setup form or enter instructions before generating."`
       - Focus the textarea and halt execution immediately without spinning or making network requests.
4. **Generate / Regenerate Button**:
   - Displays **"Generate & Review Questions"** on first run, switching to **"Regenerate Questions"** once questions exist in state.

---

## 3. Data Flow & Integration Verification

```
[Assessment Setup Form]
  (Programme, Subject, Topic, Mode, Q-Count, Total Marks)
         │
         ▼
[buildAssessmentAIPrompt] (Dynamic Prompt Template)
         │
         ├─► User clicks "Auto-Fill Prompt" ──► Injected into `aiPrompt` state
         │                                       │
         │                                       ▼
         │                             User edits/customizes in Textarea
         │                                       │
         ▼                                       ▼
User clicks "Generate Questions" ──► Empty check: if empty, alert user to auto-fill
         │ (if valid prompt)
         ▼
[POST /api/generate-questions] ──► Gemini AI Engine
         │
         ▼
[Cleaned & Validated Questions] ──► Live Preview & Question Palette
```

---

## 4. Verification Plan

1. **Admin CBT Manager Verification**:
   - Open CBT Manager -> Click "Create Assessment".
   - Select Programme (e.g. JAMB), Subject (e.g. Economics), Topic (e.g. Inflation), Mode (MCQ & Essay), Q-Count (10), Total Marks (20).
   - Switch to "AI" mode. Notice the "Auto-Fill Prompt" action.
   - Click "Auto-Fill Prompt": Verify the textarea fills with the dynamic prompt containing Economics, Inflation, JAMB, 10 questions, and formatting rules.
   - Edit the textarea (e.g., add "Focus on demand-pull inflation and CPI calculations").
   - Click "Generate & Review Questions": Verify questions generate successfully and reflect the customized prompt.
   - Clear the prompt and click "Generate": Verify the warning toast appears and prevents empty submission.
   - Verify the button switches to "Regenerate Questions" after successful generation.

2. **Tutor Portal Assessment Tab Verification**:
   - Repeat the exact test in the Tutor Portal Assessment creation flow to ensure consistency.

3. **Build & Lint Verification**:
   - Run `compile_applet` and `lint_applet` to confirm TypeScript compliance and build success.
