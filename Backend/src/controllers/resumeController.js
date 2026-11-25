const path = require("path");
const { z } = require("zod");
const Resume = require("../models/Resume");
const Analysis = require("../models/Analysis");
const Activity = require("../models/Activity");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { extractTextFromBuffer } = require("../services/resumeParser");
const {
  parseResumeWithGemini,
  generateResumeFeedbackWithGemini,
} = require("../services/geminiService");
const { parseJobDescription } = require("../services/jdParser");
const { computeMatchScore } = require("../services/matchingService");
const { computeAtsScore } = require("../services/atsService");
const { buildAnalysisReportPdf } = require("../services/reportService");

const analyzeBodySchema = z.object({
  versionId: z.string().optional(),
  targetRole: z.string().max(160).optional(),
  jobDescription: z.string().max(20000).optional(),
});

const rewriteBodySchema = z.object({
  analysisId: z.string().min(1, "analysisId is required"),
  rewriteIds: z.array(z.string()).optional(),
});

function buildLineDiff(fromText = "", toText = "") {
  const fromLines = String(fromText)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const toLines = String(toText)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const toSet = new Set(toLines);
  const fromSet = new Set(fromLines);
  const hunks = [];

  for (const line of fromLines) {
    if (!toSet.has(line)) {
      hunks.push({ type: "remove", text: line });
    } else {
      hunks.push({ type: "context", text: line });
    }
  }
  for (const line of toLines) {
    if (!fromSet.has(line)) {
      hunks.push({ type: "add", text: line });
    }
  }
  return hunks.slice(0, 80);
}

const listResumes = asyncHandler(async (req, res) => {
  const resumes = await Resume.find({ userId: req.user._id })
    .sort({ updatedAt: -1 })
    .lean();

  const shallow = resumes.map((r) => ({
    _id: r._id,
    title: r.title,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    versionCount: r.versions?.length || 0,
    bestScore: r.bestScore ?? null,
  }));

  res.json({ resumes: shallow });
});

const uploadResume = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest("Please attach a PDF or DOCX resume file.");
  }

  const { rawText, warnings } = await extractTextFromBuffer(req.file);
  const parsedSections = await parseResumeWithGemini(rawText);

  const defaultTitle =
    req.body?.title?.trim() ||
    parsedSections?.basics?.title ||
    path.basename(req.file.originalname, path.extname(req.file.originalname)) ||
    "Untitled Resume";

  const resume = new Resume({
    userId: req.user._id,
    title: defaultTitle.slice(0, 160),
    versions: [
      {
        label: "V1",
        sourceType: "upload",
        score: null,
        rawText,
        originalFileName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        parsedSections,
        extractionWarnings: warnings,
      },
    ],
  });

  resume.currentVersionId = resume.versions[0]._id;
  await resume.save();

  const sectionCount = [
    parsedSections.summary ? 1 : 0,
    parsedSections.experience?.length ? 1 : 0,
    parsedSections.education?.length ? 1 : 0,
    parsedSections.skills?.length ? 1 : 0,
    parsedSections.projects?.length ? 1 : 0,
    parsedSections.certifications?.length ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  await Activity.create({
    userId: req.user._id,
    resumeId: resume._id,
    versionId: resume.versions[0]._id,
    type: "upload",
    title: `${req.file.originalname} uploaded`,
    subtitle: `Parsed ${sectionCount} sections`,
    label: "V1",
  });

  res.status(201).json({
    resume: {
      _id: resume._id,
      title: resume.title,
      createdAt: resume.createdAt,
      updatedAt: resume.updatedAt,
      currentVersionId: resume.currentVersionId,
      versions: resume.versions,
    },
  });
});

const getResume = asyncHandler(async (req, res) => {
  const resume = await Resume.findOne({
    _id: req.params.id,
    userId: req.user._id,
  }).lean();

  if (!resume) throw ApiError.notFound("Resume not found");

  res.json({
    resume: {
      _id: resume._id,
      title: resume.title,
      createdAt: resume.createdAt,
      updatedAt: resume.updatedAt,
      currentVersionId: resume.currentVersionId,
      bestScore: resume.bestScore,
    },
    versions: resume.versions || [],
  });
});

const getVersion = asyncHandler(async (req, res) => {
  const resume = await Resume.findOne({
    _id: req.params.id,
    userId: req.user._id,
  }).lean();

  if (!resume) throw ApiError.notFound("Resume not found");

  const version = (resume.versions || []).find(
    (v) => v._id.toString() === req.params.versionId
  );
  if (!version) throw ApiError.notFound("Version not found");

  res.json({ version });
});

const deleteResume = asyncHandler(async (req, res) => {
  const resume = await Resume.findOneAndDelete({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!resume) throw ApiError.notFound("Resume not found");

  await Promise.all([
    Analysis.deleteMany({ resumeId: resume._id, userId: req.user._id }),
    Activity.deleteMany({ resumeId: resume._id, userId: req.user._id }),
  ]);

  res.json({ ok: true });
});

const analyzeResume = asyncHandler(async (req, res) => {
  const { versionId, targetRole = "", jobDescription = "" } = req.body;

  const resume = await Resume.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (!resume) throw ApiError.notFound("Resume not found");

  const targetVId = versionId || resume.currentVersionId?.toString();
  const version = resume.versions.find((v) => v._id.toString() === targetVId);
  if (!version) throw ApiError.notFound("Resume version not found");

  const parsedJd = await parseJobDescription(jobDescription, targetRole);
  const atsResult = computeAtsScore({
    parsedSections: version.parsedSections,
    rawText: version.rawText,
    parsedJd,
    warnings: version.extractionWarnings || [],
  });

  const matchResult = computeMatchScore(
    version.parsedSections,
    parsedJd,
    version.rawText
  );

  const hasJobTarget = Boolean(
    jobDescription.trim() || targetRole.trim()
  );
  const overallScore = hasJobTarget
    ? Math.round(atsResult.atsScore * 0.5 + matchResult.matchScore * 0.5)
    : atsResult.atsScore;

  const aiFeedback = await generateResumeFeedbackWithGemini({
    parsedSections: version.parsedSections,
    rawText: version.rawText,
    targetRole,
    parsedJd,
    deterministicMetrics: {
      atsScore: atsResult.atsScore,
      matchScore: hasJobTarget ? matchResult.matchScore : null,
      keywordsPresent: atsResult.keywordsPresent,
      keywordsMissing: atsResult.keywordsMissing,
      missingMandatorySkills: matchResult.missingMandatorySkills,
      formattingWarnings: atsResult.formattingWarnings,
    },
  });

  const analysis = await Analysis.create({
    userId: req.user._id,
    resumeId: resume._id,
    versionId: version._id,
    targetRole: targetRole.trim(),
    jobDescription: jobDescription.trim(),
    parsedJd,
    atsScore: atsResult.atsScore,
    matchScore: hasJobTarget ? matchResult.matchScore : null,
    overallScore,
    model: env.geminiModel,
    summary: aiFeedback.summary,
    roast: aiFeedback.roast,
    scoreBreakdown: atsResult.scoreBreakdown,
    matchBreakdown: matchResult.matchBreakdown,
    issues: aiFeedback.issues,
    strengths: aiFeedback.strengths,
    keywordsPresent: atsResult.keywordsPresent,
    keywordsMissing: atsResult.keywordsMissing,
    matchingSkills: matchResult.matchingSkills,
    missingMandatorySkills: matchResult.missingMandatorySkills,
    preferredSkillsMatched: matchResult.preferredSkillsMatched,
    preferredSkillsMissing: matchResult.preferredSkillsMissing,
    formattingWarnings: atsResult.formattingWarnings,
    experienceAnalysis: aiFeedback.experienceAnalysis,
    projectAnalysis: aiFeedback.projectAnalysis,
    educationAnalysis: aiFeedback.educationAnalysis,
    bulletRewrites: aiFeedback.bulletRewrites,
  });

  const prevScore = version.score;
  version.score = atsResult.atsScore;
  if (resume.bestScore == null || atsResult.atsScore > resume.bestScore) {
    resume.bestScore = atsResult.atsScore;
  }
  await resume.save();

  const delta = prevScore != null ? atsResult.atsScore - prevScore : null;
  await Activity.create({
    userId: req.user._id,
    resumeId: resume._id,
    versionId: version._id,
    type: "analyze",
    title: `Analysis complete on ${version.label}`,
    subtitle: `ATS score ${atsResult.atsScore} / 100`,
    label: delta != null ? `${delta >= 0 ? "+" : ""}${delta} pts` : "Analyzed",
    score: atsResult.atsScore,
  });

  res.status(201).json({ analysis });
});

const listAnalyses = asyncHandler(async (req, res) => {
  const analyses = await Analysis.find({
    resumeId: req.params.id,
    userId: req.user._id,
  })
    .sort({ createdAt: -1 })
    .lean();

  res.json({ analyses });
});

const getAnalysisForVersion = asyncHandler(async (req, res) => {
  const analysis = await Analysis.findOne({
    resumeId: req.params.id,
    versionId: req.params.versionId,
    userId: req.user._id,
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!analysis) {
    throw ApiError.notFound("No analysis for this version");
  }

  res.json({ analysis });
});

const applyRewrites = asyncHandler(async (req, res) => {
  const { analysisId, rewriteIds } = req.body;

  const resume = await Resume.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (!resume) throw ApiError.notFound("Resume not found");

  const analysis = await Analysis.findOne({
    _id: analysisId,
    resumeId: resume._id,
    userId: req.user._id,
  });
  if (!analysis) throw ApiError.notFound("Analysis not found");

  const sourceVersion = resume.versions.find(
    (v) => v._id.toString() === analysis.versionId.toString()
  );
  if (!sourceVersion) throw ApiError.notFound("Source version not found");

  const selectedSet = rewriteIds?.length ? new Set(rewriteIds) : null;
  const toApply = (analysis.bulletRewrites || []).filter(
    (rw) => !selectedSet || selectedSet.has(rw._id.toString())
  );

  const clonedSections = JSON.parse(
    JSON.stringify(sourceVersion.parsedSections || {})
  );
  let updatedRawText = sourceVersion.rawText || "";
  let appliedCount = 0;

  for (const rw of toApply) {
    let replaced = false;
    if (rw.section === "summary" && clonedSections.summary) {
      clonedSections.summary = rw.rewritten;
      replaced = true;
    } else if (Array.isArray(clonedSections.experience)) {
      for (const exp of clonedSections.experience) {
        if (!Array.isArray(exp.bullets)) continue;
        const idx = exp.bullets.findIndex(
          (b) => b.trim() === rw.original.trim()
        );
        if (idx !== -1) {
          exp.bullets[idx] = rw.rewritten;
          replaced = true;
          break;
        }
      }
    }

    if (updatedRawText.includes(rw.original)) {
      updatedRawText = updatedRawText.replace(rw.original, rw.rewritten);
      replaced = true;
    }
    if (replaced) appliedCount++;
  }

  const nextLabel = `V${resume.versions.length + 1}`;
  resume.versions.push({
    label: nextLabel,
    sourceType: "rewrite",
    score: null,
    rawText: updatedRawText,
    originalFileName: sourceVersion.originalFileName,
    mimeType: sourceVersion.mimeType,
    fileSize: sourceVersion.fileSize,
    parsedSections: clonedSections,
    parentVersionId: sourceVersion._id,
  });

  const newVersion = resume.versions[resume.versions.length - 1];
  resume.currentVersionId = newVersion._id;
  await resume.save();

  await Activity.create({
    userId: req.user._id,
    resumeId: resume._id,
    versionId: newVersion._id,
    type: "rewrite",
    title: `${appliedCount} bullet${appliedCount === 1 ? "" : "s"} rewritten`,
    subtitle: resume.title,
    label: `${nextLabel} created`,
  });

  res.status(201).json({
    version: newVersion,
    appliedCount,
  });
});

const getDiff = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const resume = await Resume.findOne({
    _id: req.params.id,
    userId: req.user._id,
  }).lean();
  if (!resume) throw ApiError.notFound("Resume not found");

  const vFrom = resume.versions.find((v) => v._id.toString() === from);
  const vTo = resume.versions.find((v) => v._id.toString() === to);
  if (!vFrom || !vTo) throw ApiError.notFound("Version not found");

  const hunks = buildLineDiff(vFrom.rawText, vTo.rawText);
  res.json({ hunks });
});

const downloadReport = asyncHandler(async (req, res) => {
  const resume = await Resume.findOne({
    _id: req.params.id,
    userId: req.user._id,
  }).lean();
  if (!resume) throw ApiError.notFound("Resume not found");

  const versionId = req.query.versionId || resume.currentVersionId?.toString();
  const version = resume.versions.find((v) => v._id.toString() === versionId);
  if (!version) throw ApiError.notFound("Version not found");

  const analysis = await Analysis.findOne({
    resumeId: resume._id,
    versionId: version._id,
    userId: req.user._id,
  })
    .sort({ createdAt: -1 })
    .lean();
  if (!analysis) {
    throw ApiError.notFound("No analysis found for this version. Run analysis first.");
  }

  const pdfBuffer = await buildAnalysisReportPdf({ resume, version, analysis });
  const safeName = (resume.title || "resume")
    .replace(/[^a-z0-9\-_ ]/gi, "")
    .trim()
    .replace(/\s+/g, "_");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${safeName}_${version.label}_Report.pdf"`
  );
  res.send(pdfBuffer);
});

module.exports = {
  analyzeBodySchema,
  rewriteBodySchema,
  listResumes,
  uploadResume,
  getResume,
  getVersion,
  deleteResume,
  analyzeResume,
  listAnalyses,
  getAnalysisForVersion,
  applyRewrites,
  getDiff,
  downloadReport,
};
