const mongoose = require("mongoose");

const linkSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true },
    url: { type: String, trim: true },
  },
  { _id: false }
);

const experienceSchema = new mongoose.Schema(
  {
    role: { type: String, trim: true, default: "" },
    company: { type: String, trim: true, default: "" },
    period: { type: String, trim: true, default: "" },
    startDate: { type: String, trim: true, default: "" },
    endDate: { type: String, trim: true, default: "" },
    isInternship: { type: Boolean, default: false },
    bullets: [{ type: String, trim: true }],
    evidence: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const educationSchema = new mongoose.Schema(
  {
    degree: { type: String, trim: true, default: "" },
    school: { type: String, trim: true, default: "" },
    period: { type: String, trim: true, default: "" },
    graduationYear: { type: String, trim: true, default: "" },
    gpa: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "" },
    tech: [{ type: String, trim: true }],
    summary: { type: String, trim: true, default: "" },
    highlights: [{ type: String, trim: true }],
  },
  { _id: false }
);

const certificationSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "" },
    issuer: { type: String, trim: true, default: "" },
    year: { type: mongoose.Schema.Types.Mixed, default: "" },
  },
  { _id: false }
);

const parsedSectionsSchema = new mongoose.Schema(
  {
    basics: {
      name: { type: String, trim: true, default: "" },
      title: { type: String, trim: true, default: "" },
      email: { type: String, trim: true, default: "" },
      phone: { type: String, trim: true, default: "" },
      location: { type: String, trim: true, default: "" },
      links: [linkSchema],
    },
    summary: { type: String, trim: true, default: "" },
    experience: [experienceSchema],
    internships: [experienceSchema],
    education: [educationSchema],
    skills: [{ type: String, trim: true }],
    technicalSkills: [{ type: String, trim: true }],
    softSkills: [{ type: String, trim: true }],
    projects: [projectSchema],
    certifications: [certificationSchema],
    achievements: [{ type: String, trim: true }],
    languages: [{ type: String, trim: true }],
    interests: [{ type: String, trim: true }],
    totalExperienceYears: { type: Number, default: null },
  },
  { _id: false }
);

const versionSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    sourceType: {
      type: String,
      enum: ["upload", "rewrite"],
      default: "upload",
    },
    score: { type: Number, default: null },
    rawText: { type: String, default: "" },
    originalFileName: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    fileSize: { type: Number, default: 0 },
    parsedSections: { type: parsedSectionsSchema, default: () => ({}) },
    extractionWarnings: [{ type: String }],
    parentVersionId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const resumeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    currentVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    bestScore: { type: Number, default: null },
    versions: { type: [versionSchema], default: [] },
  },
  { timestamps: true }
);

resumeSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("Resume", resumeSchema);
