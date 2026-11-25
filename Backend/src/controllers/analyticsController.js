const Resume = require("../models/Resume");
const Analysis = require("../models/Analysis");
const Activity = require("../models/Activity");
const asyncHandler = require("../utils/asyncHandler");

const getDashboard = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const [resumes, analyses, activities] = await Promise.all([
    Resume.find({ userId }).sort({ updatedAt: -1 }).lean(),
    Analysis.find({ userId }).sort({ createdAt: 1 }).lean(),
    Activity.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  const totalVersions = resumes.reduce((s, r) => s + (r.versions?.length || 0), 0);
  const totalRewrites = resumes.reduce(
    (s, r) => s + (r.versions || []).filter((v) => v.sourceType === "rewrite").length,
    0
  );

  const latestResume = resumes[0] || null;
  const latestVersions = latestResume?.versions || [];

  const scoreSeries = latestVersions
    .filter((v) => v.score != null)
    .map((v) => ({ label: v.label, score: v.score }));

  const versionStack = latestVersions.map((v) => ({
    id: v._id,
    label: v.label,
    title: v.sourceType === "rewrite" ? "Rewrite pass" : "Upload",
    score: v.score ?? 0,
  }));

  const latestAnalysis = analyses[analyses.length - 1] || null;
  const prevAnalysis = analyses.length > 1 ? analyses[analyses.length - 2] : null;

  const atsValue = latestAnalysis?.atsScore ?? null;
  const atsDelta =
    atsValue != null && prevAnalysis ? atsValue - prevAnalysis.atsScore : 0;

  const issuesValue = latestAnalysis ? latestAnalysis.issues?.length || 0 : null;
  const issuesDelta =
    issuesValue != null && prevAnalysis
      ? issuesValue - (prevAnalysis.issues?.length || 0)
      : 0;

  const kwMatched = latestAnalysis?.keywordsPresent?.length ?? null;
  const kwTotal =
    latestAnalysis != null
      ? (latestAnalysis.keywordsPresent?.length || 0) +
        (latestAnalysis.keywordsMissing?.length || 0)
      : null;

  res.json({
    totals: {
      resumes: resumes.length,
      rewrites: totalRewrites,
      analyses: analyses.length,
    },
    latestResume: latestResume
      ? { _id: latestResume._id, title: latestResume.title }
      : null,
    scoreSeries,
    versionStack,
    kpi: {
      atsScore: {
        value: atsValue,
        delta: atsDelta,
        spark: analyses.slice(-7).map((a) => ({ v: a.atsScore })),
      },
      versions: {
        value: totalVersions,
        spark: latestVersions.slice(-7).map((_, idx) => ({ v: idx + 1 })),
      },
      issuesIdentified: {
        value: issuesValue,
        delta: issuesDelta,
        spark: analyses.slice(-7).map((a) => ({ v: a.issues?.length || 0 })),
      },
      keywordsMatched: {
        value: kwMatched,
        total: kwTotal,
        delta: 0,
        spark: analyses.slice(-7).map((a) => ({ v: a.keywordsPresent?.length || 0 })),
      },
    },
    activity: activities.map((a) => ({
      id: a._id,
      type: a.type,
      title: a.title,
      subtitle: a.subtitle,
      label: a.label,
      at: a.createdAt,
      resumeId: a.resumeId,
    })),
  });
});

const getInsights = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const [resumes, analyses] = await Promise.all([
    Resume.find({ userId }).lean(),
    Analysis.find({ userId }).sort({ createdAt: 1 }).lean(),
  ]);

  if (!analyses.length) {
    return res.json({ empty: true });
  }

  const resumeMap = new Map(resumes.map((r) => [r._id.toString(), r]));
  const avg = Math.round(
    analyses.reduce((s, a) => s + a.atsScore, 0) / analyses.length
  );

  let best = analyses[0];
  for (const a of analyses) {
    if (a.atsScore > best.atsScore) best = a;
  }

  const issueCounts = new Map();
  const missingKwCounts = new Map();
  const presentKwCounts = new Map();

  for (const a of analyses) {
    for (const iss of a.issues || []) {
      const key = iss.title;
      const cur = issueCounts.get(key) || {
        title: iss.title,
        severity: iss.severity,
        count: 0,
      };
      cur.count++;
      issueCounts.set(key, cur);
    }
    for (const kw of a.keywordsMissing || []) {
      missingKwCounts.set(kw, (missingKwCounts.get(kw) || 0) + 1);
    }
    for (const kw of a.keywordsPresent || []) {
      presentKwCounts.set(kw, (presentKwCounts.get(kw) || 0) + 1);
    }
  }

  const resumePerformance = resumes.map((r) => {
    const rAnalyses = analyses.filter(
      (a) => a.resumeId.toString() === r._id.toString()
    );
    const first = rAnalyses[0]?.atsScore ?? 0;
    const latest = rAnalyses[rAnalyses.length - 1]?.atsScore ?? 0;
    return {
      resumeId: r._id,
      title: r.title,
      latestScore: latest,
      bestScore: r.bestScore ?? latest,
      improvement: Math.max(0, latest - first),
      analysesCount: rAnalyses.length,
    };
  });

  res.json({
    averageScore: avg,
    bestScore: {
      value: best.atsScore,
      resumeId: best.resumeId,
      resumeTitle: resumeMap.get(best.resumeId.toString())?.title || "Resume",
    },
    totalAnalyses: analyses.length,
    scoreTrend: analyses.map((a) => ({
      score: a.atsScore,
      at: a.createdAt,
      resumeTitle: resumeMap.get(a.resumeId.toString())?.title || "Resume",
    })),
    topIssues: Array.from(issueCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    topMissingKeywords: Array.from(missingKwCounts.entries())
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    topPresentKeywords: Array.from(presentKwCounts.entries())
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    resumePerformance,
  });
});

const getAllVersions = asyncHandler(async (req, res) => {
  const resumes = await Resume.find({ userId: req.user._id }).lean();
  const versions = [];
  let uploads = 0;
  let rewrites = 0;

  for (const r of resumes) {
    for (const v of r.versions || []) {
      if (v.sourceType === "rewrite") rewrites++;
      else uploads++;
      versions.push({
        id: v._id,
        label: v.label,
        resumeId: r._id,
        resumeTitle: r.title,
        sourceType: v.sourceType,
        score: v.score ?? 0,
        createdAt: v.createdAt,
      });
    }
  }

  versions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({
    totals: { all: versions.length, uploads, rewrites },
    versions,
  });
});

const getHistory = asyncHandler(async (req, res) => {
  const events = await Activity.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  const upload = events.filter((e) => e.type === "upload").length;
  const analyze = events.filter((e) => e.type === "analyze").length;
  const rewrite = events.filter((e) => e.type === "rewrite").length;

  res.json({
    totals: { all: events.length, upload, analyze, rewrite },
    events: events.map((e) => ({
      id: e._id,
      type: e.type,
      title: e.title,
      subtitle: e.subtitle,
      label: e.label,
      at: e.createdAt,
      resumeId: e.resumeId,
    })),
  });
});

module.exports = {
  getDashboard,
  getInsights,
  getAllVersions,
  getHistory,
};
