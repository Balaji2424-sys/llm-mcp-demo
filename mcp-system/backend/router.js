import { spawn } from "child_process";

import path from "path";

import { fileURLToPath } from "url";

import { parseIntentWithGroq } from "./llm/groqClient.js";

// ========================================
// PATH SETUP
// ========================================

const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);

const servicesDir =
  path.join(__dirname, "services");

// ========================================
// PYTHON CONFIG
// ========================================

const PYTHON_BINS =
  process.env.PYTHON_BIN
    ? [process.env.PYTHON_BIN]
    : ["python3", "python", "py"];

const PYTHON_TIMEOUT_MS =
  Number(
    process.env.PYTHON_TIMEOUT_MS || 20000
  );

// ========================================
// TEXT HELPERS
// ========================================

export function cleanInput(text) {

  return String(text || "")

    .replace(/[●○]/g, " ")

    .replace(/\s+/g, " ")

    .trim();
}

function stripLeadingFillers(text) {

  return text

    .replace(
      /^(?:is|are|named|name|with|the|following|folder|folders|folder names|names|create|inside|and)\s+/i,
      ""
    )

    .trim();
}

// ========================================
// SMART NAME EXTRACTION
// ========================================

export function extractNamesSmart(text) {

  const cleaned =
    cleanInput(text);

  if (!cleaned) return [];

  // Comma separated names

  if (cleaned.includes(",")) {

    return cleaned

      .split(",")

      .map((s) => s.trim())

      .filter(Boolean);
  }

  // Space separated names

  const words =
    cleaned
      .split(" ")
      .filter(Boolean);

  const names = [];

  let i = 0;

  while (i < words.length) {

    if (i === words.length - 1) {

      names.push(words[i]);

      break;
    }

    const group = [
      words[i],
      words[i + 1]
    ];

    let j = i + 2;

    while (
      j < words.length &&
      group.length < 4
    ) {

      const token = words[j];

      if (/^[A-Za-z]$/.test(token)) {

        group.push(token);

        j += 1;

        continue;
      }

      break;
    }

    names.push(group.join(" "));

    i = j;
  }

  return names;
}

// ========================================
// DRIVE QUERY PARSER
// ========================================

export function parseDriveQuery(query) {

  const cleaned =
    cleanInput(query);

  const parentMatch =
    cleaned.match(
      /\bnamed\s+(.+?)(?=\s+(?:and|with|inside|create|folders?|names?)\b|$)/i
    );

  const parent =
    parentMatch
      ? parentMatch[1].trim()
      : "Default";

  let namesSection = "";

  const namesIdx =
    cleaned.search(/\bnames?\b/i);

  if (namesIdx >= 0) {

    namesSection =
      cleaned
        .slice(namesIdx)
        .replace(/\bnames?\b/i, "")
        .trim();

  } else {

    const folderIdx =
      cleaned.search(/\bfolder\b/i);

    if (folderIdx >= 0) {

      namesSection =
        cleaned
          .slice(folderIdx)
          .replace(/\bfolder\b/i, "")
          .trim();
    }
  }

  namesSection =
    stripLeadingFillers(namesSection);

  // Parent/children shorthand
  // Example:
  // STUDENTS/A,B,C

  if (namesSection.includes("/")) {

    const [
      parsedParent,
      right
    ] = namesSection.split("/", 2);

    const folders =
      extractNamesSmart(
        stripLeadingFillers(right)
      );

    const finalParent =
      parsedParent.trim() || parent;

    return {

      parent: finalParent,

      folders,

      command:
        `create drive folder ${finalParent}/${folders.join(",")}`
    };
  }

  const folders =
    extractNamesSmart(namesSection);

  return {

    parent,

    folders,

    command:
      `create drive folder ${parent}/${folders.join(",")}`
  };
}

// ========================================
// PYTHON SERVICE EXECUTION
// ========================================

function runPythonServiceWithBin(
  scriptName,
  payload,
  pythonBin,
  options = {}
) {

  const reqId =
    options.reqId || "unknown";

  return new Promise((resolve) => {

    const scriptPath =
      path.join(
        servicesDir,
        scriptName
      );

    console.log(
      `[${reqId}] Starting ${scriptName} using ${pythonBin}`
    );

    const child = spawn(

      pythonBin,

      [
        scriptPath,
        JSON.stringify(payload)
      ],

      {
        cwd: path.join(__dirname, ".."),

        env: process.env
      }
    );

    const startedAt =
      Date.now();

    let wasTimedOut = false;

    let stdout = "";

    let stderr = "";

    // ====================================
    // TIMEOUT HANDLER
    // ====================================

    const timeoutRef =
      setTimeout(() => {

        wasTimedOut = true;

        stderr +=
          `\nTimed out after ${PYTHON_TIMEOUT_MS}ms`;

        child.kill();

      }, PYTHON_TIMEOUT_MS);

    // ====================================
    // PROCESS ERROR
    // ====================================

    child.on("error", (err) => {

      clearTimeout(timeoutRef);

      resolve({

        scriptName,

        code: -1,

        stdout:
          stdout.trim(),

        stderr:
          `Failed to spawn '${pythonBin}': ${err.message}`,

        errorCode:
          err.code || ""
      });
    });

    // ====================================
    // STDOUT
    // ====================================

    child.stdout.on("data", (data) => {

      stdout +=
        data.toString();
    });

    // ====================================
    // STDERR
    // ====================================

    child.stderr.on("data", (data) => {

      stderr +=
        data.toString();
    });

    // ====================================
    // PROCESS CLOSE
    // ====================================

    child.on("close", (code) => {

      clearTimeout(timeoutRef);

      const durationMs =
        Date.now() - startedAt;

      const exitCode =
        wasTimedOut
          ? -2
          : code;

      console.log(
        `[${reqId}] ${scriptName} exited=${exitCode} duration=${durationMs}ms`
      );

      if (stderr.trim()) {

        console.warn(
          `[${reqId}] ${scriptName} stderr=${stderr.trim()}`
        );
      }

      resolve({

        scriptName,

        code: exitCode,

        stdout:
          stdout.trim(),

        stderr:
          stderr.trim(),

        errorCode: ""
      });
    });
  });
}

// ========================================
// PYTHON EXECUTION FALLBACK
// ========================================

async function runPythonService(
  scriptName,
  payload,
  options = {}
) {

  const reqId =
    options.reqId || "unknown";

  console.log(
    `[${reqId}] Trying Python bins: ${PYTHON_BINS.join(", ")}`
  );

  let lastResult = null;

  for (const bin of PYTHON_BINS) {

    const result =
      await runPythonServiceWithBin(
        scriptName,
        payload,
        bin,
        options
      );

    // ENOENT means executable not found

    if (
      !(
        result.code === -1 &&
        result.errorCode === "ENOENT"
      )
    ) {

      return result;
    }

    lastResult = result;
  }

  return {

    scriptName,

    code: -1,

    stdout: "",

    stderr:
      `No Python executable found. Tried: ${PYTHON_BINS.join(", ")}`,

    errorCode: "NO_PYTHON"
  };
}

// ========================================
// MAIN QUERY PROCESSOR
// ========================================

export async function processQuery(
  query,
  options = {}
) {

  const reqId =
    options.reqId || "unknown";

  const queryStart =
    Date.now();

  console.log(
    `[${reqId}] Intent parsing started`
  );

  const intent =
    await parseIntentWithGroq(query);

  console.log(
    `[${reqId}] Intent parsing completed in ${Date.now() - queryStart}ms`
  );

  if (!intent.platform) {

    throw new Error(
      "Could not detect target platform from query"
    );
  }

  const platform =
    intent.platform.toLowerCase();

  const runs = [];

  // ====================================
  // GITHUB
  // ====================================

  if (
    platform === "github" ||
    platform === "both"
  ) {

    runs.push(

      await runPythonService(
        "githubServer.py",
        intent,
        { reqId }
      )
    );
  }

  // ====================================
  // GOOGLE DRIVE
  // ====================================

  if (
    platform === "drive" ||
    platform === "both"
  ) {

    const driveParsed =
      parseDriveQuery(query);

    const drivePayload = {

      ...intent,

      parent_folder:
        driveParsed.parent,

      folders:
        driveParsed.folders,

      raw_query:
        driveParsed.command
    };

    runs.push(

      await runPythonService(
        "driveServer.py",
        drivePayload,
        { reqId }
      )
    );
  }

  // ====================================
  // VALIDATION
  // ====================================

  if (runs.length === 0) {

    throw new Error(
      "Unsupported platform in parsed intent"
    );
  }

  // ====================================
  // FORMAT RESULTS
  // ====================================

  const hasError =
    runs.some(
      (r) => r.code !== 0
    );

  const lines =
    runs.map((r) => {

      const status =
        r.code === 0
          ? "OK"
          : "FAILED";

      const text =
        r.stdout ||
        r.stderr ||
        "No output";

      return `${r.scriptName}: ${status}\n${text}`;
    });

  return {

    success:
      !hasError,

    intent:

      platform === "drive" ||
      platform === "both"

        ? {
            ...intent,

            drive_parsed:
              parseDriveQuery(query)
          }

        : intent,

    message:
      lines.join("\n\n")
  };
}