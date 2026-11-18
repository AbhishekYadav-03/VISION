#!/usr/bin/env node

/**
 * Stops every VISION development process.
 *
 *   npm run stop
 *
 * Finds listeners on the API/web ports plus this project's Node and Python
 * processes, then terminates their process trees. Useful when Ctrl+C left an
 * orphan behind (common on Windows, where `npm` can exit before its children).
 */

import { execFileSync } from "node:child_process";

const isWindows = process.platform === "win32";
const ports = [
  process.env.PORT || "5000",
  process.env.WEB_PORT || "5173",
  "5174",
  "5175",
].map(Number);

function run(command, args) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

function unique(values) {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0 && value !== process.pid))];
}

function windowsPids() {
  const powershell = `${process.env.SystemRoot || "C:\\Windows"}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
  const script = `
$ports = @(${ports.join(",")})
$pids = @()
foreach ($port in $ports) {
  $pids += (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).OwningProcess
}
$pids += (Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*VISION*" -or $_.CommandLine -like "*scripts/dev.mjs*" } |
  Select-Object -ExpandProperty ProcessId)
$pids += (Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*face_worker.py*" } |
  Select-Object -ExpandProperty ProcessId)
$pids | Sort-Object -Unique
`;

  const output = run(powershell, ["-NoProfile", "-Command", script]);
  return unique(output.split(/\r?\n/).map((line) => Number.parseInt(line.trim(), 10)));
}

function posixPids() {
  const pids = [];
  for (const port of ports) {
    const output = run("lsof", ["-ti", `tcp:${port}`]);
    pids.push(...output.split(/\s+/).map((value) => Number.parseInt(value, 10)));
  }
  const pattern = run("pgrep", ["-f", "scripts/dev.mjs|face_worker.py"]);
  pids.push(...pattern.split(/\s+/).map((value) => Number.parseInt(value, 10)));
  return unique(pids);
}

const pids = isWindows ? windowsPids() : posixPids();

if (pids.length === 0) {
  console.log("Nothing to stop - VISION is not running.");
  process.exit(0);
}

console.log(`Stopping ${pids.length} process${pids.length === 1 ? "" : "es"}: ${pids.join(", ")}`);

for (const pid of pids) {
  if (isWindows) {
    run(`${process.env.SystemRoot || "C:\\Windows"}\\System32\\taskkill.exe`, ["/PID", String(pid), "/T", "/F"]);
  } else {
    run("kill", ["-TERM", String(pid)]);
  }
}

console.log("Stopped. Ports should be free now.");
