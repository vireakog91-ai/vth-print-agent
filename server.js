"use strict";

const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");

const PORT = Number(process.env.VTH_PRINT_AGENT_PORT || 17654);
const allowedOrigins = new Set([
  "http://localhost:13000",
  "http://127.0.0.1:13000",
  ...(process.env.VTH_PRINT_AGENT_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean),
]);
const bundledScriptPath = path.join(__dirname, "print-raw.ps1");
const packaged = Boolean(process.pkg || process.isSea);
const scriptPath = packaged
  ? path.join(os.tmpdir(), "vth-mart-print-agent-print-raw.ps1")
  : bundledScriptPath;
if (packaged && !fs.existsSync(scriptPath)) {
  const script = process.isSea
    ? require("node:sea").getAsset("print-raw.ps1", { encoding: "utf8" })
    : fs.readFileSync(bundledScriptPath, "utf8");
  fs.writeFileSync(scriptPath, script, "utf8");
}

function writeJson(response, status, body, origin) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": origin || "http://localhost:13000",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function originAllowed(origin) {
  return !origin || allowedOrigins.has(origin);
}

function listPrinters() {
  return new Promise((resolve, reject) => {
    const command = "Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress";
    const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command]);
    let output = "";
    let error = "";
    ps.stdout.on("data", (chunk) => { output += chunk; });
    ps.stderr.on("data", (chunk) => { error += chunk; });
    ps.on("error", reject);
    ps.on("close", (code) => {
      if (code !== 0) return reject(new Error(error || `PowerShell exited with code ${code}`));
      if (!output.trim()) return resolve([]);
      const parsed = JSON.parse(output);
      resolve(Array.isArray(parsed) ? parsed : [parsed]);
    });
  });
}

function printRaw(printerName, base64) {
  return new Promise((resolve, reject) => {
    const ps = spawn("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", scriptPath, "-PrinterName", printerName,
    ]);
    let error = "";
    ps.stderr.on("data", (chunk) => { error += chunk; });
    ps.on("error", reject);
    ps.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(error.trim() || `Windows print spooler exited with code ${code}`));
    });
    ps.stdin.end(base64, "utf8");
  });
}

async function readBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 4 * 1024 * 1024) throw new Error("Print request is too large.");
  }
  return JSON.parse(body || "{}");
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (!originAllowed(origin)) return writeJson(response, 403, { error: "Origin is not allowed." }, origin);
  if (request.method === "OPTIONS") return writeJson(response, 204, {}, origin);

  try {
    if (request.method === "GET" && request.url === "/health") {
      return writeJson(response, 200, { status: "ok", service: "vth-mart-print-agent" }, origin);
    }
    if (request.method === "GET" && request.url === "/printers") {
      return writeJson(response, 200, { printers: await listPrinters() }, origin);
    }
    if (request.method === "POST" && request.url === "/print") {
      const payload = await readBody(request);
      if (!payload.printerName || typeof payload.printerName !== "string") throw new Error("printerName is required.");
      if (!payload.base64 || typeof payload.base64 !== "string") throw new Error("base64 print data is required.");
      await printRaw(payload.printerName, payload.base64);
      return writeJson(response, 200, { success: true }, origin);
    }
    return writeJson(response, 404, { error: "Not found." }, origin);
  } catch (error) {
    return writeJson(response, 500, { error: error instanceof Error ? error.message : String(error) }, origin);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`VTH Mart Print Agent listening on http://127.0.0.1:${PORT}`);
});
