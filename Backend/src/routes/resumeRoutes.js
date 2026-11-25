const express = require("express");
const multer = require("multer");
const { requireAuth } = require("../middleware/auth");
const { analyzeLimiter } = require("../middleware/ratelimit");
const { validate } = require("../middleware/validate");
const ApiError = require("../utils/ApiError");
const {
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
} = require("../controllers/resumeController");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/octet-stream",
    ];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(ApiError.badRequest("Only PDF and DOCX files are supported."));
  },
});

const router = express.Router();

router.use(requireAuth);

router.get("/", listResumes);
router.post("/", upload.single("file"), uploadResume);
router.get("/:id", getResume);
router.delete("/:id", deleteResume);
router.get("/:id/versions/:versionId", getVersion);
router.post("/:id/analyze", analyzeLimiter, validate(analyzeBodySchema), analyzeResume);
router.get("/:id/analyses", listAnalyses);
router.get("/:id/versions/:versionId/analysis", getAnalysisForVersion);
router.post("/:id/rewrite", validate(rewriteBodySchema), applyRewrites);
router.get("/:id/diff", getDiff);
router.get("/:id/report", downloadReport);

module.exports = router;
