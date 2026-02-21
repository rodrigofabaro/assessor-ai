export type NoteToneKey =
  | "supportive_coach"
  | "neutral_professional"
  | "strict_compliance"
  | "encouraging_brief"
  | "warm_praise_first"
  | "iv_audit_neutral";

export type GradeBand = "PASS" | "MERIT" | "DISTINCTION" | "REFER";

export type ToneProfile = {
  key: NoteToneKey;
  label: string;
  description: string;
  style: {
    maxSentences: number;
    useContractions: boolean;
    emoji: "none" | "light";
    bulletStyle: "dash" | "dots";
  };
  phrases: {
    openers: string[];
    praise: string[];
    evidenceLeadIns: string[];
    gapLeadIns: string[];
    actionLeadIns: string[];
    nextGradeLeadIns: string[];
    closers: string[];
    handwritingAdvice: string[];
    complianceAdvice: string[];
  };
  avoid: {
    absolutes: string[];
    blamey: string[];
    vague: string[];
  };
  gradeLines: Record<
    GradeBand,
    {
      headline: string[];
      rationaleLeadIn: string[];
    }
  >;
};

export const TONES: Record<NoteToneKey, ToneProfile> = {
  supportive_coach: {
    key: "supportive_coach",
    label: "Supportive coach",
    description: "Friendly, student-centred, specific actions. Good default for the red note box.",
    style: { maxSentences: 5, useContractions: true, emoji: "none", bulletStyle: "dash" },
    phrases: {
      openers: [
        "Thanks for submitting this - here is a clear summary of where you are at.",
        "Here is your feedback in plain terms, linked to the criteria.",
        "I have reviewed your work and pulled out the key strengths and next steps.",
      ],
      praise: [
        "Well done - the method is clear in the places you show your working.",
        "Good effort - your approach is on the right track.",
        "Nice start - your steps are easy to follow.",
      ],
      evidenceLeadIns: [
        "What you did well:",
        "Strong evidence in your submission:",
        "The clearest strengths are:",
      ],
      gapLeadIns: [
        "To improve your grade, focus next on:",
        "What is holding the grade back is:",
        "The main gap to address is:",
      ],
      actionLeadIns: ["Action steps to take now:", "To fix this quickly:", "Next steps:"],
      nextGradeLeadIns: [
        "To move up to the next grade, I would expect:",
        "If you are aiming higher, add:",
        "To reach the next band:",
      ],
      closers: [
        "Once you add those pieces, your work will be much easier to award at the higher band.",
        "Make those changes and you will have a stronger, more defensible submission.",
        "Tidy those points up and you will be in a good position for the next band.",
      ],
      handwritingAdvice: [
        "Your maths working is fine handwritten, but for a more professional submission, type the headings and explanations and insert neat scans or photos of the handwritten maths.",
        "Presentation tip: keep the maths handwritten if you like, but put the write-up in a word-processed document and embed clear scans so it is easier to read and assess.",
        "To improve clarity, use a word-processed document for the narrative and include your handwritten calculations as clean scanned images.",
      ],
      complianceAdvice: [
        "Also note: follow the required referencing format and include the specified bibliography tool and link where required.",
        "There is a submission requirement to follow for referencing; fix that alongside the academic improvements.",
        "Please address the referencing requirement exactly as specified in the brief.",
      ],
    },
    avoid: {
      absolutes: ["always", "never", "obviously"],
      blamey: ["you failed to", "you did not bother"],
      vague: ["do better", "improve your work", "be more detailed"],
    },
    gradeLines: {
      PASS: {
        headline: ["At the moment, this meets the Pass standard."],
        rationaleLeadIn: ["You have met the core requirements, but there are clear gaps for the higher bands."],
      },
      MERIT: {
        headline: ["This is currently at Merit standard."],
        rationaleLeadIn: [
          "You meet the Pass requirements and show stronger method, but a Distinction needs clearer confirmation and completeness.",
        ],
      },
      DISTINCTION: {
        headline: ["This meets the Distinction standard."],
        rationaleLeadIn: ["You meet all criteria with clear, confirmed evidence and strong presentation."],
      },
      REFER: {
        headline: ["This is currently a Refer or resubmission."],
        rationaleLeadIn: [
          "Key Pass criteria are not evidenced clearly enough yet, so it cannot be awarded at this stage.",
        ],
      },
    },
  },

  neutral_professional: {
    key: "neutral_professional",
    label: "Neutral professional",
    description: "Clear, concise, evidence-focused. Minimal warmth.",
    style: { maxSentences: 4, useContractions: false, emoji: "none", bulletStyle: "dash" },
    phrases: {
      openers: ["Feedback summary linked to the assessment criteria:", "Assessment summary (criteria-referenced):"],
      praise: ["Work demonstrates correct methodology where shown.", "There is clear evidence in parts of the submission."],
      evidenceLeadIns: ["Evidence observed:"],
      gapLeadIns: ["Gaps preventing a higher band:"],
      actionLeadIns: ["Required actions:"],
      nextGradeLeadIns: ["For the next band, evidence must include:"],
      closers: ["Address the actions above to support a higher outcome.", "Once actions are completed, the decision can be reviewed."],
      handwritingAdvice: [
        "Presentation note: use a word-processed document for narrative text; include handwritten calculations as clear scanned inserts.",
      ],
      complianceAdvice: ["Submission compliance: referencing must follow the stated format and tool in the brief."],
    },
    avoid: {
      absolutes: ["always", "never", "clearly"],
      blamey: ["you failed to", "wrong"],
      vague: ["improve", "better", "more"],
    },
    gradeLines: {
      PASS: { headline: ["Outcome: PASS."], rationaleLeadIn: ["Pass criteria are met; higher-band evidence is incomplete."] },
      MERIT: { headline: ["Outcome: MERIT."], rationaleLeadIn: ["Merit-level method is shown; Distinction confirmation is insufficient."] },
      DISTINCTION: { headline: ["Outcome: DISTINCTION."], rationaleLeadIn: ["All criteria are met with confirmed results."] },
      REFER: { headline: ["Outcome: REFER."], rationaleLeadIn: ["Pass criteria are not evidenced sufficiently."] },
    },
  },

  strict_compliance: {
    key: "strict_compliance",
    label: "Strict compliance",
    description: "Used when submission requirements are not met (formatting, missing sections, referencing).",
    style: { maxSentences: 4, useContractions: false, emoji: "none", bulletStyle: "dash" },
    phrases: {
      openers: [
        "Submission review: key requirements are missing.",
        "This submission does not currently meet the required submission conditions.",
      ],
      praise: ["Some correct working is present.", "There are elements that can be awarded once requirements are met."],
      evidenceLeadIns: ["Evidence present:"],
      gapLeadIns: ["Non-compliance and missing requirements:"],
      actionLeadIns: ["You must:"],
      nextGradeLeadIns: ["After compliance is met, higher bands require:"],
      closers: ["Resubmit after addressing the requirements above.", "Once requirements are met, the work can be assessed fully."],
      handwritingAdvice: [
        "Required improvement: provide a word-processed submission for the written sections; embed neat scans or photos of any handwritten maths.",
      ],
      complianceAdvice: [
        "Referencing must be produced using the required tool and include the specified link and version information stated in the brief.",
      ],
    },
    avoid: {
      absolutes: ["obviously"],
      blamey: ["lazy", "careless"],
      vague: ["fix it", "redo it"],
    },
    gradeLines: {
      PASS: {
        headline: ["Outcome: PASS (subject to compliance)."],
        rationaleLeadIn: ["Academic evidence meets Pass, but compliance items must be corrected."],
      },
      MERIT: {
        headline: ["Outcome: MERIT (subject to compliance)."],
        rationaleLeadIn: ["Academic evidence meets Merit, but compliance items must be corrected."],
      },
      DISTINCTION: {
        headline: ["Outcome: DISTINCTION (subject to compliance)."],
        rationaleLeadIn: ["Academic evidence meets Distinction, but compliance items must be corrected."],
      },
      REFER: { headline: ["Outcome: REFER."], rationaleLeadIn: ["This cannot be awarded until the requirements are met."] },
    },
  },

  encouraging_brief: {
    key: "encouraging_brief",
    label: "Encouraging (brief)",
    description: "Short, warm, two actions max. Good for quick turnaround.",
    style: { maxSentences: 3, useContractions: true, emoji: "none", bulletStyle: "dots" },
    phrases: {
      openers: ["Quick feedback summary:"],
      praise: ["Good effort - you have got the core idea in place."],
      evidenceLeadIns: ["Strengths:"],
      gapLeadIns: ["To improve:"],
      actionLeadIns: ["Do this next:"],
      nextGradeLeadIns: ["For the next band:"],
      closers: ["Nice work overall - just tighten those points up."],
      handwritingAdvice: ["Presentation tip: type the write-up and insert neat scans of the maths."],
      complianceAdvice: ["Do not forget the required referencing format from the brief."],
    },
    avoid: { absolutes: ["always", "never"], blamey: ["failed"], vague: ["better"] },
    gradeLines: {
      PASS: { headline: ["PASS."], rationaleLeadIn: ["Core criteria met; higher-band evidence missing."] },
      MERIT: { headline: ["MERIT."], rationaleLeadIn: ["Good method; needs clearer confirmation for Distinction."] },
      DISTINCTION: { headline: ["DISTINCTION."], rationaleLeadIn: ["All criteria met with confirmation."] },
      REFER: { headline: ["REFER."], rationaleLeadIn: ["Key evidence missing."] },
    },
  },

  warm_praise_first: {
    key: "warm_praise_first",
    label: "Warm (praise-first)",
    description: "Starts with a positive, then moves to gaps and actions.",
    style: { maxSentences: 5, useContractions: true, emoji: "light", bulletStyle: "dash" },
    phrases: {
      openers: ["First: well done for getting this submitted."],
      praise: [
        "You have shown solid effort and there are parts that are clearly correct.",
        "There is good progress here, especially where your working is shown.",
      ],
      evidenceLeadIns: ["What is working well:"],
      gapLeadIns: ["What to improve next:"],
      actionLeadIns: ["To boost your grade, do these:"],
      nextGradeLeadIns: ["To reach the next grade band:"],
      closers: ["Keep going - a few targeted improvements will make a big difference."],
      handwritingAdvice: [
        "Tip: keep the maths handwritten if you like, but type the write-up and insert clean scans so everything is easy to read.",
      ],
      complianceAdvice: ["Also: make sure your referencing matches the brief requirements."],
    },
    avoid: { absolutes: ["always", "never"], blamey: ["you failed"], vague: ["do better"] },
    gradeLines: {
      PASS: {
        headline: ["Right now this is a PASS."],
        rationaleLeadIn: ["The core criteria are met, but the higher-band pieces are not evidenced yet."],
      },
      MERIT: {
        headline: ["Right now this is a MERIT."],
        rationaleLeadIn: ["Strong method is shown; Distinction needs clearer confirmation and completeness."],
      },
      DISTINCTION: {
        headline: ["This is a DISTINCTION."],
        rationaleLeadIn: ["Everything is evidenced clearly, including confirmation and presentation."],
      },
      REFER: {
        headline: ["Right now this is a REFER."],
        rationaleLeadIn: ["Key Pass evidence is missing or unclear, so it needs resubmission."],
      },
    },
  },

  iv_audit_neutral: {
    key: "iv_audit_neutral",
    label: "IV / audit neutral",
    description: "Very factual, for internal audit logs (not student red note).",
    style: { maxSentences: 4, useContractions: false, emoji: "none", bulletStyle: "dash" },
    phrases: {
      openers: ["Assessment note (audit):"],
      praise: ["Evidence is present for the criteria listed below."],
      evidenceLeadIns: ["Evidence:"],
      gapLeadIns: ["Gaps:"],
      actionLeadIns: ["Actions:"],
      nextGradeLeadIns: ["Next band requires:"],
      closers: ["Decision recorded based on evidence available at time of marking."],
      handwritingAdvice: ["Presentation observation recorded; no penalty applied unless required by brief."],
      complianceAdvice: ["Compliance requirement flagged per brief; academic decision recorded separately."],
    },
    avoid: { absolutes: ["obviously"], blamey: ["failed"], vague: ["better"] },
    gradeLines: {
      PASS: { headline: ["Decision: PASS."], rationaleLeadIn: ["Pass evidence met; higher evidence incomplete."] },
      MERIT: { headline: ["Decision: MERIT."], rationaleLeadIn: ["Merit evidence met; Distinction evidence incomplete."] },
      DISTINCTION: { headline: ["Decision: DISTINCTION."], rationaleLeadIn: ["All evidence met and confirmed."] },
      REFER: { headline: ["Decision: REFER."], rationaleLeadIn: ["Pass evidence not met."] },
    },
  },
};

export const DEFAULT_NOTE_TONE_KEY: NoteToneKey = "supportive_coach";

export const LEGACY_GRADING_TONE_TO_NOTE_TONE: Record<string, NoteToneKey> = {
  supportive: "supportive_coach",
  professional: "neutral_professional",
  strict: "strict_compliance",
};

function normalizeText(v: unknown) {
  return String(v || "").trim();
}

function hashSeed(value: string) {
  let seed = 0;
  for (let i = 0; i < value.length; i += 1) seed = (seed + value.charCodeAt(i) * (i + 1)) % 10007;
  return seed;
}

export function pickTonePhrase(values: string[], seedSource: string, fallback = "") {
  const list = Array.isArray(values) ? values.map((v) => normalizeText(v)).filter(Boolean) : [];
  if (!list.length) return fallback;
  const idx = hashSeed(seedSource || "tone-seed") % list.length;
  return list[idx] || fallback;
}

export function resolveToneProfile(noteToneKey: unknown): ToneProfile {
  const key = normalizeText(noteToneKey).toLowerCase() as NoteToneKey;
  if (key && TONES[key]) return TONES[key];
  return TONES[DEFAULT_NOTE_TONE_KEY];
}

export function resolveToneProfileFromLegacy(gradingTone: unknown): ToneProfile {
  const key = normalizeText(gradingTone).toLowerCase();
  const mapped = LEGACY_GRADING_TONE_TO_NOTE_TONE[key] || DEFAULT_NOTE_TONE_KEY;
  return resolveToneProfile(mapped);
}

