const path = require("path");
const { PDFParse } = require("pdf-parse");
const mammoth = require("mammoth");
const ApiError = require("../utils/ApiError");

const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const ALLOWED_EXTS = new Set([".pdf", ".docx"]);

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /disregard\s+(all\s+)?(previous|prior|system)\s+(instructions|prompt)/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /system\s*:\s*override/i,
  /give\s+(this\s+resume|me)\s+(a\s+)?100(\s*\/\s*100|%)?/i,
];

function detectSuspiciousText(text) {
  const warnings = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      warnings.push(
        "Suspicious instruction-like text was detected in the document and neutralized during analysis."
      );
      break;
    }
  }
  return warnings;
}

function normalizeExtractedText(raw) {
  return String(raw || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function validateUploadedFile(file) {
  if (!file || !file.buffer || file.buffer.length === 0) {
    throw ApiError.badRequest("Uploaded file is empty.");
  }

  const ext = path.extname(file.originalname || "").toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) {
    throw ApiError.badRequest(
      "Unsupported file extension. Please upload a PDF or DOCX file."
    );
  }

  if (file.mimetype && !ALLOWED_MIMES.has(file.mimetype)) {
    // Allow generic octet-stream only if magic bytes match below
    if (file.mimetype !== "application/octet-stream") {
      throw ApiError.badRequest(
        "Unsupported file type. Please upload a PDF or DOCX file."
      );
    }
  }

  const header = file.buffer.subarray(0, 5).toString("utf8");
  const isPdfMagic = header.startsWith("%PDF-");
  const isZipMagic =
    file.buffer[0] === 0x50 &&
    file.buffer[1] === 0x4b &&
    file.buffer[2] === 0x03 &&
    file.buffer[3] === 0x04;

  if (ext === ".pdf" && !isPdfMagic) {
    throw ApiError.badRequest("File does not appear to be a valid PDF document.");
  }
  if (ext === ".docx" && !isZipMagic) {
    throw ApiError.badRequest("File does not appear to be a valid DOCX document.");
  }

  return ext;
}

async function extractTextFromBuffer(file) {
  const ext = validateUploadedFile(file);

  if (ext === ".pdf") {
    let parser;
    try {
      parser = new PDFParse({ data: file.buffer });
      const result = await parser.getText();
      const text = normalizeExtractedText(result?.text);

      if (!text || text.length < 40) {
        throw ApiError.badRequest(
          "No readable text found in this PDF. It appears to be a scanned or image-based PDF (OCR is not enabled). Please upload a text-based PDF or DOCX file."
        );
      }

      return {
        rawText: text,
        warnings: detectSuspiciousText(text),
      };
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw ApiError.badRequest(
        "Could not read PDF file. It may be corrupted, encrypted, or password-protected."
      );
    } finally {
      if (parser && typeof parser.destroy === "function") {
        await parser.destroy().catch(() => {});
      }
    }
  }

  // .docx
  try {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    const text = normalizeExtractedText(result?.value);

    if (!text || text.length < 20) {
      throw ApiError.badRequest(
        "No readable text found in this DOCX file. Please check that the document is not empty."
      );
    }

    return {
      rawText: text,
      warnings: detectSuspiciousText(text),
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw ApiError.badRequest(
      "Could not read DOCX file. The document may be corrupted."
    );
  }
}

module.exports = {
  extractTextFromBuffer,
  validateUploadedFile,
  detectSuspiciousText,
  normalizeExtractedText,
};
