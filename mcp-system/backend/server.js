import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import config from "./config.js";
import { processQuery } from "./router.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const frontendDir = path.join(__dirname, "..", "frontend");
const frontendIndexPath = path.join(frontendDir, "index.html");
const hasFrontendIndex = fs.existsSync(frontendIndexPath);
const pythonBin = process.env.PYTHON_BIN || "python";

app.use((req, res, next) => {
  const reqId = crypto.randomUUID().slice(0, 8);
  req.reqId = reqId;
  req.startTs = Date.now();
  console.log(`[${reqId}] ${req.method} ${req.originalUrl} started`);
  next();
});

if (hasFrontendIndex) {
  app.use("/", express.static(frontendDir));
} else {
  app.get("/", (_req, res) => {
    return res.status(200).json({
      service: "mcp-backend",
      status: "ok",
      mode: "api-only",
      message: "Frontend index.html is not deployed in ../frontend",
      endpoints: ["/health", "/query"],
    });
  });
}

app.get("/health", (_req, res) => {
  const pythonProbe = spawnSync(pythonBin, ["--version"], {
    encoding: "utf8",
    timeout: 5000,
  });
  const pythonVersion = (pythonProbe.stdout || pythonProbe.stderr || "").trim();
  const pythonAvailable = pythonProbe.status === 0 && Boolean(pythonVersion);

  return res.status(200).json({
    service: "mcp-backend",
    status: "ok",
    timestamp: new Date().toISOString(),
    runtime: {
      node: process.version,
      isVercel: Boolean(process.env.VERCEL),
      python: {
        bin: pythonBin,
        available: pythonAvailable,
        version: pythonVersion || null,
      },
    },
    frontend: {
      directory: frontendDir,
      hasIndex: hasFrontendIndex,
    },
    env: {
      GROQ_API_KEY: Boolean(process.env.GROQ_API_KEY),
      GROQ_MODEL: process.env.GROQ_MODEL || null,
      GITHUB_TOKEN: Boolean(process.env.GITHUB_TOKEN),
      GOOGLE_CREDENTIALS_PATH: process.env.GOOGLE_CREDENTIALS_PATH || null,
      GOOGLE_TOKEN_PATH: process.env.GOOGLE_TOKEN_PATH || null,
    },
  });
});

app.post("/query", async (req, res) => {
  const { query } = req.body || {};
  const reqId = req.reqId || "unknown";

  if (!query || typeof query !== "string") {
    console.warn(`[${reqId}] /query invalid payload`);
    return res.status(400).json({ error: "Query is required" });
  }

  try {
    const result = await processQuery(query, { reqId });
    const durationMs = Date.now() - req.startTs;
    console.log(`[${reqId}] /query success in ${durationMs}ms`);
    return res.json(result);
  } catch (error) {
    const durationMs = Date.now() - req.startTs;
    console.error(`[${reqId}] /query failed in ${durationMs}ms: ${error.message}`);
    return res.status(500).json({
      error: error.message || "Internal server error",
    });
  }
});

app.listen(config.port, () => {
  console.log(`Server running at http://localhost:${config.port}`);
});

export default app;
