import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";

const marker = "Provider-native delegation is disabled. Use Houston-owned orchestration instead.";
const killPatterns = [
  /\/houston-app(?:\s|$)/,
  /\/houston-engine(?:\s|$)/,
  /(?:^|\/|\s)claude(?:\s|$).* -p(?:\s|$)/,
  /(?:^|\/|\s)codex(?:\s|$).* exec(?:\s|$)/,
  /pnpm(?:\s+\S+)*\s+tauri\s+dev(?:\s|$)/,
  /tauri(?:\s+\S+)*\s+dev(?:\s|$)/,
  /node .*\/vite\/bin\/openChrome\.applescript/,
  /node .*\/vite\/bin\/vite\.js/,
];

export function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: false });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

export function listProcesses() {
  const result = spawnSync("pgrep", ["-af", "."], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [pid, ...commandParts] = line.split(/\s+/);
      const numericPid = Number(pid);
      return { pid: numericPid, ppid: parentPid(numericPid), command: commandParts.join(" ") };
    })
    .filter((processInfo) => Number.isFinite(processInfo.pid));
}

export function stopOldDevProcesses({ workspaceRoot, devDataRoot }) {
  const ownPid = process.pid;
  const parent = process.ppid;
  const processes = listProcesses();
  const roots = processes.filter(
    (processInfo) =>
      processInfo.pid !== ownPid &&
      processInfo.pid !== parent &&
      shouldKill(processInfo.command, workspaceRoot, devDataRoot),
  );
  const candidates = descendants(processes, roots)
    .filter((processInfo) => processInfo.pid !== ownPid && processInfo.pid !== parent)
    .sort((a, b) => killPriority(a.command) - killPriority(b.command));

  if (candidates.length === 0) {
    console.log("No old Houston dev processes found.");
    return;
  }
  console.log("Stopping old Houston dev processes:");
  for (const processInfo of candidates) {
    console.log(`  ${processInfo.pid} ${processInfo.command}`);
    tryKill(processInfo.pid, "SIGTERM");
  }
  waitForExit(candidates, 2_000);
  for (const processInfo of candidates.filter((p) => isAlive(p.pid))) {
    tryKill(processInfo.pid, "SIGKILL");
  }
  const remaining = candidates.filter((processInfo) => isAlive(processInfo.pid));
  if (remaining.length === 0) return;
  console.error("Failed to stop old Houston dev processes:");
  for (const processInfo of remaining) console.error(`  ${processInfo.pid} ${processInfo.command}`);
  process.exit(1);
}

export function removeOldDevBinaries({ engineBinary, stagedDir }) {
  const removed = [];
  for (const path of [engineBinary, ...stagedEngineBinaries(stagedDir)]) {
    if (!existsSync(path)) continue;
    rmSync(path, { force: true });
    removed.push(path);
  }
  console.log(removed.length ? "Removed old dev sidecars:" : "No old dev sidecars found.");
  for (const path of removed) console.log(`  ${path}`);
}

export function stagedEngineBinaries(stagedDir) {
  if (!existsSync(stagedDir)) return [];
  return readdirSync(stagedDir)
    .filter((name) => name.startsWith("houston-engine"))
    .map((name) => resolve(stagedDir, name));
}

export function verifyPolicyBinary(path, label) {
  if (!existsSync(path)) fail(`Missing ${label}: ${path}`);
  const info = binaryInfo(path);
  if (!info.hasPolicy) fail(`${label} is missing the provider-native delegation marker: ${path}`);
  console.log(`${label}: ${info.size} bytes sha256=${info.hash.slice(0, 12)}`);
  return info;
}

export function verifyStagedSidecars({ stagedDir, expectedHash }) {
  const staged = stagedEngineBinaries(stagedDir);
  if (staged.length === 0) fail(`Missing staged houston-engine sidecar in ${stagedDir}`);
  for (const path of staged) {
    const info = verifyPolicyBinary(path, "Staged houston-engine");
    if (info.hash !== expectedHash) fail(`Staged sidecar hash mismatch: ${path}`);
  }
}

export function verifyRunningEngine(expectedHash) {
  const deadline = Date.now() + 30_000;
  const timer = setInterval(() => {
    const engine = listProcesses().find((p) => /\/houston-engine(?:\s|$)/.test(p.command));
    if (!engine) {
      if (Date.now() > deadline) fail("Timed out waiting for houston-engine process.");
      return;
    }
    try {
      const exe = readlinkSync(`/proc/${engine.pid}/exe`);
      const info = verifyPolicyBinary(exe, `Running houston-engine pid=${engine.pid}`);
      if (info.hash !== expectedHash) fail(`Running houston-engine hash mismatch: ${exe}`);
      clearInterval(timer);
    } catch (error) {
      fail(`Failed to verify running houston-engine pid=${engine.pid}: ${error}`);
    }
  }, 500);
}

function parentPid(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return Number(stat.slice(stat.lastIndexOf(") ") + 2).trim().split(/\s+/)[1]);
  } catch {
    return undefined;
  }
}

function descendants(processes, roots) {
  const byParent = new Map();
  for (const p of processes) {
    if (!byParent.has(p.ppid)) byParent.set(p.ppid, []);
    byParent.get(p.ppid).push(p);
  }
  const seen = new Map(roots.map((p) => [p.pid, p]));
  for (const p of seen.values()) {
    for (const child of byParent.get(p.pid) ?? []) seen.set(child.pid, child);
  }
  return [...seen.values()];
}

function shouldKill(command, workspaceRoot, devDataRoot) {
  const scoped = [workspaceRoot, devDataRoot, "houston-engine", ".houston/", "Houston data goes in"]
    .some((needle) => command.includes(needle));
  return scoped && killPatterns.some((pattern) => pattern.test(command));
}

function killPriority(command) {
  if (/\/houston-app(?:\s|$)/.test(command)) return 0;
  if (/pnpm(?:\s+\S+)*\s+tauri\s+dev(?:\s|$)/.test(command)) return 1;
  if (/tauri(?:\s+\S+)*\s+dev(?:\s|$)/.test(command)) return 2;
  if (/node .*\/vite\/bin\/vite\.js/.test(command)) return 3;
  if (/\/houston-engine(?:\s|$)/.test(command)) return 4;
  return 5;
}

function waitForExit(processes, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline && processes.some((p) => isAlive(p.pid))) {}
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function tryKill(pid, signal) {
  try {
    process.kill(pid, signal);
  } catch {}
}

function binaryInfo(path) {
  const buffer = readFileSync(path);
  return {
    size: statSync(path).size,
    hash: createHash("sha256").update(buffer).digest("hex"),
    hasPolicy: buffer.includes(Buffer.from(marker)),
  };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
