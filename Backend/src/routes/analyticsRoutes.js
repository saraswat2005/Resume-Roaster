const express = require("express");
const { requireAuth } = require("../middleware/auth");
const {
  getDashboard,
  getInsights,
  getAllVersions,
  getHistory,
} = require("../controllers/analyticsController");

const router = express.Router();

router.use(requireAuth);

router.get("/dashboard", getDashboard);
router.get("/insights", getInsights);
router.get("/versions", getAllVersions);
router.get("/history", getHistory);

module.exports = router;
