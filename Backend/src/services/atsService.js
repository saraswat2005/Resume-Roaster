const { uniqueNormalized } = require("./jdParser");

const STRONG_ACTION_VERBS = new Set([
  "accelerated", "achieved", "architected", "automated", "built", "championed",
  "created", "cut", "delivered", "designed", "developed", "directed", "drove",
  "engineered", "established", "executed", "expanded", "generated", "implemented",
  "improved", "increased", "initiated", "launched", "led", "managed", "migrated",
  "optimized", "orchestrated", "owned", "pioneered", "reduced", "redesigned",
  "refactored", "resolved", "scaled", "shipped", "spearheaded", "streamlined",
  "transformed", "unified",
]);

const WEAK_STARTERS = [
  "helped", "worked on", "responsible for", "assisted", "participated", "tasked with", "handled",
];

function computeAtsScore({ parsedSections = {}, rawText = "", parsedJd = {}, warnings = [] }) {
  const lowerRaw = String(rawText || "").toLowerCase();
  const words = String(rawText || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  // 1. Keyword Coverage
  const targetKeywords = uniqueNormalized([
    ...(parsedJd.keywords || []),
    ...(parsedJd.requiredSkills || []),
    ...(parsedJd.preferredSkills || []),
  ]);
  const candidateSkills = new Set(
    uniqueNormalized([
      ...(parsedSections.skills || []),
      ...(parsedSections.technicalSkills || []),
      ...(parsedSections.projects || []).flatMap((p) => p.tech || []),
    ]).map((s) => s.norm)
  );

  const keywordsPresent = [];
  const keywordsMissing = [];

  for (const kw of targetKeywords) {
    const escaped = kw.norm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const inText = new RegExp(`(^|[^a-z0-9+])${escaped}([^a-z0-9+]|$)`, "i").test(lowerRaw);
    if (candidateSkills.has(kw.norm) || inText) {
      keywordsPresent.push(kw.display);
    } else {
      keywordsMissing.push(kw.display);
    }
  }

  let keywordScore = 72;
  if (targetKeywords.length > 0) {
    keywordScore = Math.round((keywordsPresent.length / targetKeywords.length) * 100);
  } else {
    keywordScore = Math.min(100, Math.max(35, candidateSkills.size * 7));
  }

  // 2. Formatting & Section Completeness
  const formattingWarnings = [...warnings];
  let formatScore = 100;

  if (!parsedSections.basics?.email) {
    formatScore -= 12;
    formattingWarnings.push("Missing email address in contact header.");
  }
  if (!parsedSections.basics?.phone) {
    formatScore -= 6;
    formattingWarnings.push("Missing phone number in contact header.");
  }
  if (!parsedSections.summary) {
    formatScore -= 8;
    formattingWarnings.push("No professional summary section detected.");
  }
  if (!(parsedSections.experience || []).length && !(parsedSections.internships || []).length) {
    formatScore -= 15;
    formattingWarnings.push("No work experience or internship entries detected.");
  }
  if (!(parsedSections.education || []).length) {
    formatScore -= 10;
    formattingWarnings.push("No education section detected.");
  }
  if (!(parsedSections.skills || []).length && !(parsedSections.technicalSkills || []).length) {
    formatScore -= 12;
    formattingWarnings.push("No explicit skills section detected.");
  }
  if (words.length < 180) {
    formatScore -= 15;
    formattingWarnings.push("Resume text is very short (< 180 words), which may lack detail for ATS.");
  } else if (words.length > 1500) {
    formatScore -= 10;
    formattingWarnings.push("Resume exceeds 1,500 words; consider tightening to 1–2 pages.");
  }
  formatScore = Math.max(20, Math.min(100, formatScore));

  // 3. Impact (Quantified bullets) & Action Verbs & Readability
  const allBullets = [
    ...(parsedSections.experience || []).flatMap((e) => e.bullets || []),
    ...(parsedSections.internships || []).flatMap((e) => e.bullets || []),
    ...(parsedSections.projects || []).flatMap((p) => p.highlights || []),
  ];

  let impactScore = 50;
  let actionVerbScore = 55;
  let readabilityScore = 75;

  if (allBullets.length > 0) {
    const quantifiedCount = allBullets.filter((b) =>
      /\d+%|\$\d+|\d+\+|\d+x|\b\d{2,}\b/i.test(b)
    ).length;
    impactScore = Math.min(100, Math.round(35 + (quantifiedCount / allBullets.length) * 65));

    let strongCount = 0;
    let weakCount = 0;
    let goodLengthCount = 0;

    for (const bullet of allBullets) {
      const lower = bullet.trim().toLowerCase();
      const firstWord = lower.split(/\s+/)[0]?.replace(/[^a-z]/g, "");
      if (STRONG_ACTION_VERBS.has(firstWord)) strongCount++;
      if (WEAK_STARTERS.some((w) => lower.startsWith(w))) weakCount++;

      const wc = bullet.trim().split(/\s+/).length;
      if (wc >= 7 && wc <= 30) goodLengthCount++;
    }

    actionVerbScore = Math.max(
      25,
      Math.min(100, Math.round(45 + (strongCount / allBullets.length) * 55 - weakCount * 8))
    );
    readabilityScore = Math.max(
      35,
      Math.min(100, Math.round(40 + (goodLengthCount / allBullets.length) * 60))
    );
  } else {
    formattingWarnings.push("Few or no bullet points detected in experience/projects.");
  }

  const atsScore = Math.round(
    keywordScore * 0.3 +
      formatScore * 0.2 +
      impactScore * 0.2 +
      readabilityScore * 0.15 +
      actionVerbScore * 0.15
  );

  const scoreBreakdown = [
    { label: "Keywords", value: keywordScore },
    { label: "Format", value: formatScore },
    { label: "Impact", value: impactScore },
    { label: "Readability", value: readabilityScore },
    { label: "Action verbs", value: actionVerbScore },
  ];

  return {
    atsScore: Math.max(0, Math.min(100, atsScore)),
    scoreBreakdown,
    keywordsPresent,
    keywordsMissing,
    formattingWarnings,
  };
}

module.exports = { computeAtsScore };
