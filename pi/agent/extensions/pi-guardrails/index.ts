import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  analyzeEditVolume,
  checkBashCommand,
  computeSnapshotHash,
  detectVerifyPlan,
  isSourceFile,
  isVerifyCommandSatisfied,
  normalizeErrorSignature,
  parseGitStatusPorcelain,
} from "./logic.ts";

async function getGitSnapshot(
  pi: ExtensionAPI,
  cwd: string,
): Promise<{ isGit: boolean; gitRoot: string; changedSourceFiles: string[]; hash: string | null }> {
  try {
    const top = await pi.exec("git", ["rev-parse", "--show-toplevel"], { cwd, timeout: 5000 });
    const gitRoot = top.stdout.trim();
    if (top.code !== 0 || !gitRoot) {
      return { isGit: false, gitRoot: cwd, changedSourceFiles: [], hash: null };
    }
    const status = await pi.exec("git", ["status", "--porcelain", "-uall"], { cwd: gitRoot, timeout: 10000 });
    if (status.code !== 0) return { isGit: false, gitRoot, changedSourceFiles: [], hash: null };
    const entries = parseGitStatusPorcelain(status.stdout).filter((entry) => !entry.deleted && isSourceFile(entry.path));
    const repoRelativeFiles = entries.map((entry) => entry.path);
    const cwdRelativeFiles = entries.map((entry) => relative(cwd, resolve(gitRoot, entry.path)) || entry.path);
    return {
      isGit: true,
      gitRoot,
      changedSourceFiles: cwdRelativeFiles,
      hash: computeSnapshotHash(gitRoot, repoRelativeFiles),
    };
  } catch {
    return { isGit: false, gitRoot: cwd, changedSourceFiles: [], hash: null };
  }
}

function probeNonGitDirectory(cwd: string): string[] {
  const probes: string[] = [];
  if (existsSync(resolve(cwd, ".pi/verify.json")) || existsSync(resolve(cwd, "package.json"))) probes.push("__probe__.ts");
  if (existsSync(resolve(cwd, "Cargo.toml"))) probes.push("__probe__.rs");
  if (existsSync(resolve(cwd, "go.mod"))) probes.push("__probe__.go");
  return probes;
}

export default function piGuardrails(pi: ExtensionAPI): void {
  let verifiedBaselineHash: string | null = null;
  let retryCount = 0;
  let lastErrorSignature: string | null = null;
  let sawWriteOrBash = false;
  let sawBash = false;
  const editedPaths = new Set<string>();
  let passedVerifyHash: string | null = null;
  let passedNonGitThisTurn = false;
  const pendingInputs = new Map<string, Record<string, unknown>>();

  const resetTurnTracking = () => {
    retryCount = 0;
    lastErrorSignature = null;
    sawWriteOrBash = false;
    sawBash = false;
    editedPaths.clear();
    passedVerifyHash = null;
    passedNonGitThisTurn = false;
    pendingInputs.clear();
  };

  const initSession = async (_event: unknown, ctx: ExtensionContext) => {
    resetTurnTracking();
    const snap = await getGitSnapshot(pi, ctx.cwd);
    verifiedBaselineHash = snap.isGit ? snap.hash : null;
  };

  pi.on("session_start", initSession);

  pi.on("input", (event, ctx) => {
    retryCount = 0;
    lastErrorSignature = null;
    passedVerifyHash = null;
    passedNonGitThisTurn = false;
    if (!event.streamingBehavior || ctx.isIdle()) {
      sawWriteOrBash = false;
      sawBash = false;
      editedPaths.clear();
      pendingInputs.clear();
    }
  });

  pi.on("tool_call", (event) => {
    pendingInputs.set(event.toolCallId, event.input);
    if (event.toolName === "bash") {
      const cmd = (event.input as { command?: unknown }).command;
      const reason = typeof cmd === "string" ? checkBashCommand(cmd) : null;
      if (reason) {
        pendingInputs.delete(event.toolCallId);
        return { block: true, reason };
      }
    }
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    const input = pendingInputs.get(event.toolCallId);
    pendingInputs.delete(event.toolCallId);
    if (event.isError) return;

    if (event.toolName === "write" || event.toolName === "edit") {
      sawWriteOrBash = true;
      passedNonGitThisTurn = false;
      if (typeof input?.path === "string") {
        const rel = relative(ctx.cwd, resolve(ctx.cwd, input.path));
        editedPaths.add(rel && !rel.startsWith("..") ? rel : input.path);
      }
    } else if (event.toolName === "bash") {
      sawWriteOrBash = true;
      sawBash = true;
      if (typeof input?.command === "string" && input.command.trim()) {
        const snap = await getGitSnapshot(pi, ctx.cwd);
        if (snap.isGit && snap.hash !== null) {
          const plan = detectVerifyPlan(ctx.cwd, snap.changedSourceFiles);
          if (plan && isVerifyCommandSatisfied(input.command, plan.cmd, ctx.cwd)) {
            passedVerifyHash = snap.hash;
          }
        } else {
          const changed = [...editedPaths].filter(isSourceFile);
          const plan = detectVerifyPlan(ctx.cwd, changed.length > 0 ? changed : probeNonGitDirectory(ctx.cwd));
          if (plan && isVerifyCommandSatisfied(input.command, plan.cmd, ctx.cwd)) {
            passedNonGitThisTurn = true;
          }
        }
      }
    }
  });

  pi.on("tool_result", (event, ctx) => {
    if (event.isError || (event.toolName !== "write" && event.toolName !== "edit")) return;
    const rawPath = typeof event.input.path === "string" ? event.input.path : undefined;
    if (!rawPath) return;
    const rel = relative(ctx.cwd, resolve(ctx.cwd, rawPath));
    editedPaths.add(rel && !rel.startsWith("..") ? rel : rawPath);

    let content: string;
    try {
      content = readFileSync(resolve(ctx.cwd, rawPath), "utf8");
    } catch {
      return;
    }

    let addedText: string | undefined;
    let removedText: string | undefined;
    if (event.toolName === "write") {
      addedText = typeof event.input.content === "string" ? event.input.content : content;
    } else if (Array.isArray(event.input.edits)) {
      const edits = event.input.edits as Array<{ oldText?: unknown; newText?: unknown }>;
      addedText = edits.map((e) => (typeof e?.newText === "string" ? e.newText : "")).filter(Boolean).join("\n");
      removedText = edits.map((e) => (typeof e?.oldText === "string" ? e.oldText : "")).filter(Boolean).join("\n");
    }

    const reminder = analyzeEditVolume(rawPath, content, addedText, removedText);
    if (!reminder) return;
    return {
      content: [...event.content, { type: "text", text: reminder }],
      ...(event.structuredContent !== undefined ? { structuredContent: event.structuredContent } : {}),
    };
  });

  pi.on("agent_before_settle", async (event, ctx) => {
    if (!sawWriteOrBash || event.outcome === "aborted" || ctx.signal?.aborted) return;

    const snap = await getGitSnapshot(pi, ctx.cwd);
    const currentHash = snap.hash;
    let changedSourceFiles: string[];

    if (snap.isGit) {
      if (currentHash !== null && (currentHash === verifiedBaselineHash || currentHash === passedVerifyHash)) {
        verifiedBaselineHash = currentHash;
        sawWriteOrBash = false;
        sawBash = false;
        retryCount = 0;
        lastErrorSignature = null;
        return;
      }
      changedSourceFiles = snap.changedSourceFiles;
    } else {
      if (passedNonGitThisTurn) {
        sawWriteOrBash = false;
        sawBash = false;
        retryCount = 0;
        lastErrorSignature = null;
        editedPaths.clear();
        return;
      }
      changedSourceFiles = [...editedPaths].filter(isSourceFile);
      if (changedSourceFiles.length === 0 && sawBash) {
        changedSourceFiles = probeNonGitDirectory(ctx.cwd);
      }
    }

    const plan = detectVerifyPlan(ctx.cwd, changedSourceFiles);
    if (!plan) return;

    let res;
    try {
      res = await pi.exec("sh", ["-c", plan.cmd], {
        cwd: ctx.cwd,
        timeout: plan.timeoutMs,
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      });
    } catch {
      return;
    }

    if (ctx.signal?.aborted) return;
    if (res.killed && !res.truncated) {
      if (ctx.hasUI) ctx.ui.notify(`护栏静态检查超时已放行：${plan.cmd}`, "warning");
      sawWriteOrBash = false;
      sawBash = false;
      return;
    }

    if (res.code === 0) {
      if (currentHash !== null) {
        verifiedBaselineHash = currentHash;
        passedVerifyHash = currentHash;
      }
      retryCount = 0;
      lastErrorSignature = null;
      sawWriteOrBash = false;
      sawBash = false;
      editedPaths.clear();
      return;
    }

    const combined = [res.stdout, res.stderr].filter(Boolean).join("\n").trim();
    const snippet = combined.length > 2500 ? `${combined.slice(0, 2500)}\n...(输出已截断)` : combined || `退出码 ${res.code}`;
    const sig = normalizeErrorSignature(`${res.stdout}\n${res.stderr}`);

    if (retryCount >= 2 || (lastErrorSignature !== null && sig === lastErrorSignature)) {
      const reason = lastErrorSignature !== null && sig === lastErrorSignature ? "连续两次报错一致" : `已自动重试 ${retryCount} 次仍未通过`;
      sawWriteOrBash = false;
      sawBash = false;
      return {
        entries: [
          ...event.entries,
          {
            type: "custom_message",
            customType: "pi-guardrails",
            content: `[护栏熔断] 静态检查（\`${plan.cmd}\`）未通过（${reason}），已停止自动重试：\n\`\`\`\n${snippet}\n\`\`\``,
            display: true,
          },
        ],
      };
    }

    retryCount++;
    lastErrorSignature = sig;
    return {
      entries: [
        ...event.entries,
        {
          type: "custom_message",
          customType: "pi-guardrails",
          content: `[护栏校验失败] 执行 \`${plan.cmd}\` 未通过（第 ${retryCount}/2 次自动重试），请修复以下报错：\n\`\`\`\n${snippet}\n\`\`\``,
          display: false,
        },
      ],
      continue: true,
    };
  });
}
