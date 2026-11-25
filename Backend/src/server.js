const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const morgan = require("morgan");

const env = require("./config/env");
const { connectDB } = require("./config/db");
const healthRouter = require("./routes/health");
const authRouter = require("./routes/authRoutes");
const resumeRouter = require("./routes/resumeRoutes");
const analyticsRouter = require("./routes/analyticsRoutes");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();

app.use(helmet());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: env.clientOrigins,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(morgan(env.isProd ? "combined" : "dev"));

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/resumes", resumeRouter);
app.use("/api", analyticsRouter);

app.use(notFound);
app.use(errorHandler);

const startServer = async () => {
  try {
    await connectDB();
    app.listen(env.port, () => {
      console.log(`Server running on port ${env.port}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

module.exports = app;
