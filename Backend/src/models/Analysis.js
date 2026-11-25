const mongoose = require("mongoose");

const scoreItemSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    value: { type: Number, required: true, min: 0, max: 100 },
    weight: { type: Number, default: null },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const issueSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    severity: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    fix: { type: String, required: true },
  },
  { _id: false }
);

const strengthSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const bulletRewriteSchema = new mongoose.Schema(
  {
    section: { type: String, default: "experience" },
    original: { type: String, required: true },
    rewritten: { type: String, required: true },
    rationale: { type: String, default: "" },
  },
  { _id: true }
);

const analysisSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    resumeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resume",
      required: true,
      index: true,
    },
    versionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    targetRole: { type: String, trim: true, default: "" },
    jobDescription: { type: String, default: "" },
    parsedJd: {
      jobTitle: { type: String, default: "" },
      requiredSkills: [{ type: String }],
      preferredSkills: [{ type: String }],
      requiredExperienceYears: { type: Number, default: null },
      educationalRequirements: [{ type: String }],
      responsibilities: [{ type: String }],
      keywords: [{ type: String }],
    },
    atsScore: { type: Number, required: true, min: 0, max: 100 },
    matchScore: { type: Number, default: null, min: 0, max: 100 },
    overallScore: { type: Number, required: true, min: 0, max: 100 },
    model: { type: String, default: "gemini-3.5-flash" },
    summary: { type: String, default: "" },
    roast: { type: String, default: "" },
    scoreBreakdown: [scoreItemSchema],
    matchBreakdown: [scoreItemSchema],
    issues: [issueSchema],
    strengths: [strengthSchema],
    keywordsPresent: [{ type: String }],
    keywordsMissing: [{ type: String }],
    matchingSkills: [{ type: String }],
    missingMandatorySkills: [{ type: String }],
    preferredSkillsMatched: [{ type: String }],
    preferredSkillsMissing: [{ type: String }],
    formattingWarnings: [{ type: String }],
    experienceAnalysis: { type: String, default: "" },
    projectAnalysis: { type: String, default: "" },
    educationAnalysis: { type: String, default: "" },
    bulletRewrites: [bulletRewriteSchema],
  },
  { timestamps: true }
);

analysisSchema.index({ resumeId: 1, versionId: 1, createdAt: -1 });

analysisSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("Analysis", analysisSchema);
