const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { authLimiter } = require("../middleware/ratelimit");
const { validate } = require("../middleware/validate");
const {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  register,
  login,
  logout,
  me,
  updateProfile,
  changePassword,
} = require("../controllers/authController");

const router = express.Router();

router.post("/register", authLimiter, validate(registerSchema), register);
router.post("/login", authLimiter, validate(loginSchema), login);
router.post("/logout", logout);
router.get("/me", requireAuth, me);
router.patch("/profile", requireAuth, validate(updateProfileSchema), updateProfile);
router.patch("/password", requireAuth, validate(changePasswordSchema), changePassword);

module.exports = router;
