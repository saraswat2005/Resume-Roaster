const { parseJobDescriptionWithGemini } = require("./geminiService");

const SKILL_ALIASES = new Map([
  ["reactjs", "react"],
  ["react.js", "react"],
  ["react js", "react"],
  ["nodejs", "node.js"],
  ["node js", "node.js"],
  ["node", "node.js"],
  ["nextjs", "next.js"],
  ["next js", "next.js"],
  ["vuejs", "vue.js"],
  ["vue", "vue.js"],
  ["angularjs", "angular"],
  ["ts", "typescript"],
  ["js", "javascript"],
  ["ecmascript", "javascript"],
  ["py", "python"],
  ["python3", "python"],
  ["k8s", "kubernetes"],
  ["postgres", "postgresql"],
  ["mongo", "mongodb"],
  ["tailwindcss", "tailwind css"],
  ["tailwind", "tailwind css"],
  ["amazon web services", "aws"],
  ["google cloud", "gcp"],
  ["google cloud platform", "gcp"],
  ["microsoft azure", "azure"],
  ["cicd", "ci/cd"],
  ["ci cd", "ci/cd"],
  ["expressjs", "express"],
  ["express.js", "express"],
  ["restful api", "rest api"],
  ["rest apis", "rest api"],
  ["html5", "html"],
  ["css3", "css"],
  ["cpp", "c++"],
  ["csharp", "c#"],
  ["dotnet", ".net"],
]);

function normalizeSkill(skill) {
  const cleaned = String(skill || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!cleaned) return "";
  return SKILL_ALIASES.get(cleaned) || cleaned;
}

function uniqueNormalized(list) {
  const seen = new Map();
  for (const item of list || []) {
    const raw = String(item || "").trim();
    if (!raw) continue;
    const norm = normalizeSkill(raw);
    if (norm && !seen.has(norm)) {
      seen.set(norm, raw);
    }
  }
  return Array.from(seen.entries()).map(([norm, display]) => ({ norm, display }));
}

function defaultRoleKeywords(targetRole = "") {
  const role = targetRole.toLowerCase();
  if (role.includes("frontend") || role.includes("react")) {
    return ["React", "TypeScript", "JavaScript", "HTML", "CSS", "REST API", "Git", "Testing"];
  }
  if (role.includes("backend") || role.includes("node")) {
    return ["Node.js", "Express", "MongoDB", "PostgreSQL", "REST API", "Docker", "Git", "Testing"];
  }
  if (role.includes("full") || role.includes("stack")) {
    return ["React", "Node.js", "TypeScript", "MongoDB", "PostgreSQL", "Docker", "REST API", "Git"];
  }
  if (role.includes("data") || role.includes("ml") || role.includes("ai")) {
    return ["Python", "SQL", "Machine Learning", "Pandas", "TensorFlow", "PyTorch", "Statistics", "Git"];
  }
  return ["JavaScript", "TypeScript", "Python", "SQL", "Git", "REST API", "Docker", "CI/CD"];
}

async function parseJobDescription(jobDescription = "", targetRole = "") {
  const jdText = String(jobDescription || "").trim();
  const roleText = String(targetRole || "").trim();

  if (!jdText && !roleText) {
    return {
      jobTitle: "",
      requiredSkills: [],
      preferredSkills: [],
      requiredExperienceYears: null,
      educationalRequirements: [],
      responsibilities: [],
      keywords: [],
    };
  }

  if (jdText.length >= 30) {
    const parsed = await parseJobDescriptionWithGemini(jdText, roleText);
    return {
      jobTitle: parsed.jobTitle || roleText,
      requiredSkills: parsed.requiredSkills || [],
      preferredSkills: parsed.preferredSkills || [],
      requiredExperienceYears: parsed.requiredExperienceYears ?? null,
      educationalRequirements: parsed.educationalRequirements || [],
      responsibilities: parsed.responsibilities || [],
      keywords: parsed.keywords?.length
        ? parsed.keywords
        : [...(parsed.requiredSkills || []), ...(parsed.preferredSkills || [])],
    };
  }

  const fallbackKeywords = defaultRoleKeywords(roleText);
  return {
    jobTitle: roleText,
    requiredSkills: fallbackKeywords.slice(0, 5),
    preferredSkills: fallbackKeywords.slice(5),
    requiredExperienceYears: null,
    educationalRequirements: [],
    responsibilities: [],
    keywords: fallbackKeywords,
  };
}

module.exports = {
  normalizeSkill,
  uniqueNormalized,
  parseJobDescription,
};
