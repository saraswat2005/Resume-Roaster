const PDFDocument = require("pdfkit");

function buildAnalysisReportPdf({ resume, version, analysis }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const basics = version?.parsedSections?.basics || {};

    // Header
    doc
      .fontSize(20)
      .font("Helvetica-Bold")
      .fillColor("#111418")
      .text("AI Resume Analysis Report");
    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#5C6470")
      .text(
        `${resume?.title || "Resume"} (${version?.label || "V1"}) · Generated ${new Date().toLocaleDateString()}`
      );
    doc.moveDown(1);

    // Candidate Details
    if (basics.name || basics.email || basics.phone) {
      doc.fontSize(12).font("Helvetica-Bold").fillColor("#111418").text("Candidate Details");
      doc.fontSize(10).font("Helvetica").fillColor("#333333");
      if (basics.name) doc.text(`Name: ${basics.name}`);
      if (basics.title) doc.text(`Title: ${basics.title}`);
      if (basics.email) doc.text(`Email: ${basics.email}`);
      if (basics.phone) doc.text(`Phone: ${basics.phone}`);
      if (basics.location) doc.text(`Location: ${basics.location}`);
      doc.moveDown(0.8);
    }

    // Scores
    doc.fontSize(12).font("Helvetica-Bold").fillColor("#111418").text("Scores Overview");
    doc.fontSize(10).font("Helvetica").fillColor("#2F4A3A");
    doc.text(`ATS Compatibility Score: ${analysis.atsScore} / 100`);
    if (analysis.matchScore != null) {
      doc.text(`Job Compatibility Score: ${analysis.matchScore} / 100`);
    }
    doc.text(`Overall Score: ${analysis.overallScore ?? analysis.atsScore} / 100`);
    doc.fillColor("#5C6470").fontSize(8.5).text(
      "Note: Heuristic ATS score estimates compatibility and does not represent every proprietary ATS platform."
    );
    doc.moveDown(0.8);

    // Summary
    if (analysis.summary) {
      doc.fontSize(12).font("Helvetica-Bold").fillColor("#111418").text("Executive Summary");
      doc.fontSize(10).font("Helvetica").fillColor("#333333").text(analysis.summary);
      doc.moveDown(0.8);
    }

    // Skills
    doc.fontSize(12).font("Helvetica-Bold").fillColor("#111418").text("Skills & Keywords");
    doc.fontSize(10).font("Helvetica").fillColor("#333333");
    doc.text(
      `Matching Keywords: ${(analysis.keywordsPresent || []).join(", ") || "None detected"}`
    );
    doc.text(
      `Missing Keywords: ${(analysis.keywordsMissing || []).join(", ") || "None"}`
    );
    if (analysis.missingMandatorySkills?.length) {
      doc.text(`Missing Mandatory Skills: ${analysis.missingMandatorySkills.join(", ")}`);
    }
    doc.moveDown(0.8);

    // Experience / Project / Education Analysis
    if (analysis.experienceAnalysis || analysis.projectAnalysis || analysis.educationAnalysis) {
      doc.fontSize(12).font("Helvetica-Bold").fillColor("#111418").text("Section Analysis");
      doc.fontSize(10).font("Helvetica").fillColor("#333333");
      if (analysis.experienceAnalysis) doc.text(`Experience: ${analysis.experienceAnalysis}`);
      if (analysis.projectAnalysis) doc.text(`Projects: ${analysis.projectAnalysis}`);
      if (analysis.educationAnalysis) doc.text(`Education: ${analysis.educationAnalysis}`);
      doc.moveDown(0.8);
    }

    // Strengths
    if (analysis.strengths?.length) {
      doc.fontSize(12).font("Helvetica-Bold").fillColor("#111418").text("Strengths");
      doc.fontSize(10).font("Helvetica").fillColor("#333333");
      for (const s of analysis.strengths) {
        doc.text(`• ${s.title}${s.note ? ` — ${s.note}` : ""}`);
      }
      doc.moveDown(0.8);
    }

    // Weaknesses / Issues
    if (analysis.issues?.length) {
      doc.fontSize(12).font("Helvetica-Bold").fillColor("#111418").text("Issues & Weaknesses");
      doc.fontSize(10).font("Helvetica").fillColor("#333333");
      for (const issue of analysis.issues) {
        doc.text(`• [${issue.severity.toUpperCase()}] ${issue.title}: ${issue.fix}`);
      }
      doc.moveDown(0.8);
    }

    // Recommendations / Rewrites
    if (analysis.bulletRewrites?.length) {
      doc.fontSize(12).font("Helvetica-Bold").fillColor("#111418").text("AI Improvement Recommendations");
      doc.fontSize(9.5).font("Helvetica").fillColor("#333333");
      for (const rw of analysis.bulletRewrites) {
        doc.text(`Before: ${rw.original}`);
        doc.fillColor("#2F4A3A").text(`After: ${rw.rewritten}`);
        if (rw.rationale) doc.fillColor("#5C6470").text(`Why: ${rw.rationale}`);
        doc.fillColor("#333333").moveDown(0.4);
      }
    }

    doc.end();
  });
}

module.exports = { buildAnalysisReportPdf };
