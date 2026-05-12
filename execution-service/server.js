// execution-service/server.js
// ─────────────────────────────────────────────────────────────────────────────
// SkillSprint Secure Code Execution Sidecar
//
// INTERNAL SERVICE — Never expose port 4000 to the internet.
// Only the main SkillSprint API can reach this via Docker internal network.
//
// POST /execute   → Run user code inside an isolated Docker container
// GET  /health    → Health check
// GET  /languages → Return list of supported language keys
// ─────────────────────────────────────────────────────────────────────────────

import express from "express";
import { exec } from "child_process";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { v4 as uuidv4 } from "uuid";
import { LANGUAGES } from "./langConfig.js";

const app = express();
const PORT = process.env.PORT || 4000;

// ── Limits ────────────────────────────────────────────────────────────────────
const MAX_CODE_BYTES   = 50_000; // 50 KB  — block massive payloads
const MAX_STDOUT_BYTES = 10_000; // 10 KB  — cap runaway print loops
const MAX_STDERR_BYTES =  2_000; // 2  KB
const HARD_TIMEOUT_CAP =     15; // seconds — absolute max regardless of lang config

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(express.json({ limit: "100kb" }));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Health Check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "skillsprint-execution-service",
    uptime: process.uptime(),
    languages: Object.keys(LANGUAGES),
  });
});

// ── Supported Languages ───────────────────────────────────────────────────────
app.get("/languages", (_req, res) => {
  res.json({ languages: Object.keys(LANGUAGES) });
});

// ── Execute Endpoint ──────────────────────────────────────────────────────────
app.post("/execute", (req, res) => {
  const { language, code, timeout: requestedTimeout } = req.body;

  // ── Validation ────────────────────────────────────────────────────────────
  if (!language || typeof language !== "string") {
    return res.status(400).json({ error: "language is required" });
  }

  if (!LANGUAGES[language]) {
    return res.status(400).json({
      error: `Unsupported language: "${language}". Supported: ${Object.keys(LANGUAGES).join(", ")}`,
    });
  }

  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "code is required and must be a string" });
  }

  if (Buffer.byteLength(code, "utf8") > MAX_CODE_BYTES) {
    return res.status(400).json({ error: `Code exceeds ${MAX_CODE_BYTES / 1000}KB limit` });
  }

  // ── Prepare temp file ─────────────────────────────────────────────────────
  const lang              = LANGUAGES[language];
  const executionId       = uuidv4();
  const fileName          = `skillsprint_${executionId}.${lang.fileExt}`;
  const hostTmpPath       = join(tmpdir(), fileName);
  const containerFilePath = `/tmp/${fileName}`; // inside container's tmpfs
  const timeoutSec        = Math.min(requestedTimeout || lang.timeout, HARD_TIMEOUT_CAP);
  const startTime         = Date.now();

  try {
    writeFileSync(hostTmpPath, code, "utf8");
  } catch (writeErr) {
    console.error(`[${executionId}] Failed to write temp file:`, writeErr.message);
    return res.status(500).json({ error: "Failed to prepare code file" });
  }

  // ── Build Hardened Docker Command ─────────────────────────────────────────
  // Every flag is a deliberate security control — see architecture doc.
  const dockerCmd = [
    "docker run",
    "--rm",                               // auto-delete container on exit
    "--network none",                     // zero network access
    "--memory 50m",                       // 50 MB RAM hard limit
    "--memory-swap 50m",                  // no swap (avoids disk-backed memory)
    "--cpus 0.1",                         // max 10% of 1 CPU core
    "--read-only",                        // immutable root filesystem
    "--tmpfs /tmp:size=5m,exec",          // only writable dir — 5 MB /tmp
    "--pids-limit 32",                    // kills fork bombs
    "--security-opt no-new-privileges",   // blocks setuid / privilege escalation
    `--stop-timeout ${timeoutSec}`,       // Docker stop grace period
    `-v "${hostTmpPath}":"${containerFilePath}":ro`, // code file — read-only mount
    lang.image,
    lang.command(containerFilePath),      // e.g. node /tmp/skillsprint_xxx.js
  ].join(" ");

  console.log(`[${executionId}] Executing lang=${language} timeout=${timeoutSec}s`);

  // Hard kill timeout = Docker stop timeout + 3s grace for Docker overhead
  exec(dockerCmd, { timeout: (timeoutSec + 3) * 1000 }, (err, rawStdout, rawStderr) => {

    // ── Cleanup host temp file ──────────────────────────────────────────────
    try {
      if (existsSync(hostTmpPath)) unlinkSync(hostTmpPath);
    } catch (cleanupErr) {
      console.warn(`[${executionId}] Temp file cleanup failed:`, cleanupErr.message);
    }

    const executionTimeMs = Date.now() - startTime;

    // Truncate to prevent huge payloads from runaway output loops
    const stdout    = (rawStdout || "").slice(0, MAX_STDOUT_BYTES);
    const stderr    = (rawStderr || "").slice(0, MAX_STDERR_BYTES);
    const timedOut  = err?.killed === true || err?.code === 124;
    const exitCode  = err ? (typeof err.code === "number" ? err.code : 1) : 0;

    console.log(
      `[${executionId}] Done | exitCode=${exitCode} | time=${executionTimeMs}ms | timedOut=${timedOut}`
    );

    res.json({
      stdout,
      stderr,
      exitCode,
      timedOut,
      executionTimeMs,
      executionId,
    });
  });
});

// ── 404 Catch-All ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("[execution-service] Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[execution-service] 🚀 Listening on port ${PORT}`);
  console.log(`[execution-service] Supported: ${Object.keys(LANGUAGES).join(", ")}`);
});
