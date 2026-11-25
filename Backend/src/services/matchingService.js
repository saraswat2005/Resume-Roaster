const { normalizeSkill, uniqueNormalized } = require("./jdParser");

const DEFAULT_WEIGHTS = {
  skills: 0.4,
  experience: 0.25,
  projects: 0.15,
  education: 0.1,
  certifications: 0.1,
};

function collectCandidateSkills(parsedSections = {}, rawText = "") {
  const rawList = [
    ...(parsedSections.skills || []),
    ...(parsedSections.technicalSkills || []),
    ...(parsedSections.softSkills || []),
    ...(parsedSections.projects || []).flatMap((p) => p.tech || []),
  ];

  const normalizedMap = new Map();
  for (const item of uniqueNormalized(rawList)) {
    normalizedMap.set(item.norm, item.display);
  }

  // Also check if any known skill tokens appear in rawText (word-boundary safe)
  const lowerRaw = String(rawText || "").toLowerCase();
  return { normalizedMap, lowerRaw };
}

function textContainsSkill(lowerRaw, normSkill) {
  if (!lowerRaw || !normSkill) return false;
  const escaped = normSkill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(^|[^a-z0-9+])${escaped}([^a-z0-9+]|$)`, "i");
  return regex.test(lowerRaw);
}

function computeMatchScore(parsedSections = {}, parsedJd = {}, rawText = "", weights = DEFAULT_WEIGHTS) {
  const { normalizedMap, lowerRaw } = collectCandidateSkills(parsedSections, rawText);

  const reqSkills = uniqueNormalized(parsedJd.requiredSkills || []);
  const prefSkills = uniqueNormalized(parsedJd.preferredSkills || []);

  const hasJdSkills = reqSkills.length > 0 || prefSkills.length > 0;

  const matchingSkills = [];
  const missingMandatorySkills = [];
  const preferredSkillsMatched = [];
  const preferredSkillsMissing = [];

  for (const sk of reqSkills) {
    if (normalizedMap.has(sk.norm) || textContainsSkill(lowerRaw, sk.norm)) {
      matchingSkills.push(sk.display);
    } else {
      missingMandatorySkills.push(sk.display);
    }
  }

  for (const sk of prefSkills) {
    if (normalizedMap.has(sk.norm) || textContainsSkill(lowerRaw, sk.norm)) {
      preferredSkillsMatched.push(sk.display);
      if (!matchingSkills.includes(sk.display)) {
        matchingSkills.push(sk.display);
      }
    } else {
      preferredSkillsMissing.push(sk.display);
    }
  }

  // 1. Technical Skill Match (0-100)
  let skillScore = 70;
  if (hasJdSkills) {
    const reqRatio = reqSkills.length
      ? (reqSkills.length - missingMandatorySkills.length) / reqSkills.length
      : 1;
    const prefRatio = prefSkills.length
      ? preferredSkillsMatched.length / prefSkills.length
      : 1;
    skillScore = Math.round((reqRatio * 0.75 + prefRatio * 0.25) * 100);
  } else {
    const count = normalizedMap.size;
    skillScore = Math.min(100, Math.max(30, count * 8));
  }

  // 2. Experience Relevance (0-100)
  const expCount = (parsedSections.experience || []).length + (parsedSections.internships || []).length;
  const years = parsedSections.totalExperienceYears;
  const reqYears = parsedJd.requiredExperienceYears;
  let experienceScore = 0;
  if (expCount === 0) {
    experienceScore = 25;
  } else if (reqYears != null && years != null) {
    const ratio = Math.min(1.2, years / Math.max(1, reqYears));
    experienceScore = Math.min(100, Math.round(ratio * 85));
  } else {
    const bulletCount = (parsedSections.experience || []).reduce(
      (sum, e) => sum + (e.bullets?.length || 0),
      0
    );
    experienceScore = Math.min(100, 45 + expCount * 12 + Math.min(25, bulletCount * 2));
  }

  // 3. Project Relevance (0-100)
  const projects = parsedSections.projects || [];
  let projectScore = 30;
  if (projects.length > 0) {
    const allJdNorms = new Set([...reqSkills, ...prefSkills].map((s) => s.norm));
    let matchedTechs = 0;
    for (const p of projects) {
      for (const t of p.tech || []) {
        if (allJdNorms.has(normalizeSkill(t))) matchedTechs++;
      }
    }
    projectScore = Math.min(100, 50 + projects.length * 12 + matchedTechs * 8);
  }

  // 4. Education Relevance (0-100)
  const education = parsedSections.education || [];
  let educationScore = education.length > 0 ? 85 : 35;
  if (education.length > 0 && parsedJd.educationalRequirements?.length) {
    const eduText = education.map((e) => `${e.degree} ${e.school}`).join(" ").toLowerCase();
    const matched = parsedJd.educationalRequirements.some((req) =>
      eduText.includes(req.toLowerCase().slice(0, 10))
    );
    educationScore = matched ? 100 : 75;
  }

  // 5. Certifications & Additional Qualifications (0-100)
  const certs = parsedSections.certifications || [];
  const achievements = parsedSections.achievements || [];
  const certScore = Math.min(100, 40 + certs.length * 25 + achievements.length * 10);

  const matchScore = Math.round(
    skillScore * weights.skills +
      experienceScore * weights.experience +
      projectScore * weights.projects +
      educationScore * weights.education +
      certScore * weights.certifications
  );

  const matchBreakdown = [
    { label: "Technical Skills", value: skillScore, weight: Math.round(weights.skills * 100) },
    { label: "Experience", value: experienceScore, weight: Math.round(weights.experience * 100) },
    { label: "Projects", value: projectScore, weight: Math.round(weights.projects * 100) },
    { label: "Education", value: educationScore, weight: Math.round(weights.education * 100) },
    { label: "Certifications", value: certScore, weight: Math.round(weights.certifications * 100) },
  ];

  return {
    matchScore,
    matchBreakdown,
    matchingSkills,
    missingMandatorySkills,
    preferredSkillsMatched,
    preferredSkillsMissing,
  };
}

module.exports = {
  DEFAULT_WEIGHTS,
  computeMatchScore,
};
