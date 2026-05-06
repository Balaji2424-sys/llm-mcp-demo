import "dotenv/config";

import express from "express";
import cors from "cors";

import crypto from "crypto";

import { spawnSync } from "child_process";

import config from "./config.js";
import { processQuery } from "./router.js";

// ========================================
// APP SETUP
// ========================================

const app = express();

app.use(cors());

app.use(express.json());

// ========================================
// PYTHON DETECTION
// ========================================

const pythonCandidates = process.env.PYTHON_BIN
  ? [process.env.PYTHON_BIN]
  : ["python3", "python", "py"];

// ========================================
// REQUEST LOGGER
// ========================================

app.use((req, res, next) => {

  const reqId =
    crypto.randomUUID().slice(0, 8);

  req.reqId = reqId;

  req.startTs = Date.now();

  console.log(
    `[${reqId}] ${req.method} ${req.originalUrl} started`
  );

  next();
});

// ========================================
// ROOT ROUTE
// ========================================

app.get("/", (_req, res) => {

  return res.status(200).json({

    service: "mcp-backend",

    status: "ok",

    message: "MCP backend is running",

    endpoints: [
      "/health",
      "/query"
    ]
  });
});

// ========================================
// HEALTH CHECK
// ========================================

app.get("/health", (_req, res) => {

  let detectedBin = null;

  let detectedVersion = null;

  for (const bin of pythonCandidates) {

    const probe = spawnSync(
      bin,
      ["--version"],
      {
        encoding: "utf8",
        timeout: 5000
      }
    );

    const version =
      (probe.stdout || probe.stderr || "").trim();

    if (
      probe.status === 0 &&
      version
    ) {

      detectedBin = bin;

      detectedVersion = version;

      break;
    }
  }

  return res.status(200).json({

    service: "mcp-backend",

    status: "ok",

    timestamp: new Date().toISOString(),

    runtime: {

      node: process.version,

      platform: process.platform,

      python: {

        configuredCandidates:
          pythonCandidates,

        detectedBin,

        available:
          Boolean(detectedBin),

        version:
          detectedVersion
      }
    },

    env: {

      GROQ_API_KEY:
        Boolean(process.env.GROQ_API_KEY),

      GROQ_MODEL:
        process.env.GROQ_MODEL || null,

      GITHUB_TOKEN:
        Boolean(process.env.GITHUB_TOKEN),

      GOOGLE_CREDENTIALS_PATH:
        process.env.GOOGLE_CREDENTIALS_PATH || null,

      GOOGLE_TOKEN_PATH:
        process.env.GOOGLE_TOKEN_PATH || null
    }
  });
});

// ========================================
// MAIN QUERY ROUTE
// ========================================

app.post("/query", async (req, res) => {

  const { query } = req.body || {};

  const reqId =
    req.reqId || "unknown";

  if (
    !query ||
    typeof query !== "string"
  ) {

    console.warn(
      `[${reqId}] Invalid query payload`
    );

    return res.status(400).json({

      success: false,

      error: "Query is required"
    });
  }

  try {

    console.log(
      `[${reqId}] Processing query: ${query}`
    );

    const result =
      await processQuery(
        query,
        { reqId }
      );

    const durationMs =
      Date.now() - req.startTs;

    console.log(
      `[${reqId}] Success in ${durationMs}ms`
    );

    return res.status(200).json({

      success: true,

      ...result
    });

  } catch (error) {

    const durationMs =
      Date.now() - req.startTs;

    console.error(
      `[${reqId}] Failed in ${durationMs}ms:`,
      error
    );

    return res.status(500).json({

      success: false,

      error:
        error.message ||
        "Internal server error"
    });
  }
});

// ========================================
// 404 HANDLER
// ========================================

app.use((req, res) => {

  return res.status(404).json({

    success: false,

    error: "Route not found"
  });
});

// ========================================
// GLOBAL ERROR HANDLER
// ========================================

app.use((error, req, res, next) => {

  console.error(
    "[GLOBAL ERROR]",
    error
  );

  return res.status(500).json({

    success: false,

    error:
      error.message ||
      "Unhandled server error"
  });
});

// ========================================
// SERVER START
// ========================================

const PORT =
  process.env.PORT ||
  config.port ||
  3000;

app.listen(PORT, () => {

  console.log(
    `MCP backend running on port ${PORT}`
  );

  console.log(
    `Health endpoint: /health`
  );
});

// ========================================
// EXPORT
// ========================================

export default app;