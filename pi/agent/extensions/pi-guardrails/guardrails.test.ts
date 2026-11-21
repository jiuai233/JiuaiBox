import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import piGuardrails from "./index.ts";
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

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function initGitRepo(dir: string): void {
  execFileSync("git", ["init"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir, stdio: "ignore" });
}

test("checkBashCommand 拦截违规命令并放行合法操作", () => {
  assert.match(checkBashCommand("git commit --no-verify -m 'feat：测试'") ?? "", /no-verify/);
  assert.match(checkBashCommand("git commit -n -m 'feat：测试'") ?? "", /no-verify/);
  assert.match(checkBashCommand("git push origin main") ?? "", /main/);
  assert.match(checkBashCommand("git push -f origin HEAD:master") ?? "", /master/);
  assert.match(checkBashCommand('git commit -m "feat: english colon"') ?? "", /全角冒号/);
  assert.match(checkBashCommand('git commit -m "feat：english only"') ?? "", /中文/);
  assert.match(checkBashCommand("pkill -f vite") ?? "", /pkill -f/);
  assert.match(checkBashCommand("killall node") ?? "", /killall/);
  assert.match(checkBashCommand("grep -rn foo src/") ?? "", /rg/);
  assert.match(checkBashCommand("find src -name '*.ts' | xargs grep foo") ?? "", /rg/);
  assert.match(checkBashCommand('bash -lc "git push origin main"') ?? "", /main/);

  assert.equal(checkBashCommand('git commit -m "feat：增加护栏校验规则"'), null);
  assert.equal(checkBashCommand('git commit -am "fix：修复未跟踪文件哈希"'), null);
  assert.equal(checkBashCommand("git push -u origin feat/guardrails"), null);
  assert.equal(checkBashCommand("rg -n foo src/"), null);
  assert.equal(checkBashCommand("kill -TERM 12345"), null);
  assert.equal(checkBashCommand("echo 'git commit --no-verify && pkill -f x'"), null);
  assert.equal(checkBashCommand("grep foo README.md # grep -r"), null);
});

test("parseGitStatusPorcelain 与 computeSnapshotHash 覆盖未跟踪新文件与重命名", () => {
  const statusOut = [
    "?? src/new-file.ts",
    " M src/existing.ts",
    "D  src/removed.ts",
    "R  src/old.ts -> src/renamed.ts",
    '?? "src/带 空格.ts"',
  ].join("\n");
  const parsed = parseGitStatusPorcelain(statusOut);
  assert.deepEqual(parsed, [
    { path: "src/new-file.ts", status: "??", deleted: false },
    { path: "src/existing.ts", status: "M", deleted: false },
    { path: "src/removed.ts", status: "D", deleted: true },
    { path: "src/renamed.ts", status: "R", deleted: false },
    { path: "src/带 空格.ts", status: "??", deleted: false },
  ]);

  const dir = makeTempDir("guardrails-hash-");
  try {
    writeFileSync(join(dir, "untracked.ts"), "export const x = 1;\n");
    const h1 = computeSnapshotHash(dir, ["untracked.ts"]);
    writeFileSync(join(dir, "untracked.ts"), "export const x = 2;\n");
    const h2 = computeSnapshotHash(dir, ["untracked.ts"]);
    assert.notEqual(h1, h2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectVerifyPlan 优先级与不自动跑 test 规则", () => {
  assert.equal(isSourceFile("README.md"), false);
  assert.equal(isSourceFile("src/app.ts"), true);

  const dir = makeTempDir("guardrails-plan-");
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      scripts: { check: "tsc --noEmit", lint: "eslint .", test: "node --test" },
    }));
    writeFileSync(join(dir, "pnpm-lock.yaml"), "");
    assert.equal(detectVerifyPlan(dir, []), null);
    assert.deepEqual(detectVerifyPlan(dir, ["src/a.ts"]), {
      cmd: "pnpm run check && pnpm run lint",
      timeoutMs: 30000,
      source: "auto",
    });

    mkdirSync(join(dir, ".pi"), { recursive: true });
    writeFileSync(join(dir, ".pi/verify.json"), JSON.stringify({ cmd: "pnpm run check", timeoutMs: 12000 }));
    assert.deepEqual(detectVerifyPlan(dir, ["src/a.ts"]), {
      cmd: "pnpm run check",
      timeoutMs: 12000,
      source: "config",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const pyDir = makeTempDir("guardrails-py-");
  try {
    writeFileSync(join(pyDir, "pyproject.toml"), "[project]\nname = 'demo'\n");
    writeFileSync(join(pyDir, "app.py"), "x = 1\n");
    const plan = detectVerifyPlan(pyDir, ["app.py", "missing.py", "notes.md"]);
    assert.deepEqual(plan, { cmd: "ruff check 'app.py'", timeoutMs: 30000, source: "auto" });
  } finally {
    rmSync(pyDir, { recursive: true, force: true });
  }
});

test("isVerifyCommandSatisfied 与 analyzeEditVolume 边界校验", () => {
  const dir = makeTempDir("guardrails-sat-");
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      scripts: { check: "tsc --noEmit", lint: "eslint .", test: "npm run check && npm run lint && node --test" },
    }));
    assert.equal(isVerifyCommandSatisfied("npm run check && npm run lint", "npm run check && npm run lint", dir), true);
    assert.equal(isVerifyCommandSatisfied("npm test", "npm run check && npm run lint", dir), true);
    assert.equal(isVerifyCommandSatisfied("npm run check", "npm run check && npm run lint", dir), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const longFile = Array.from({ length: 601 }, (_, i) => `const v${i} = ${i};`).join("\n");
  assert.match(analyzeEditVolume("src/big.ts", longFile) ?? "", /超过 600 行/);

  const heavyComments = Array.from({ length: 16 }, (_, i) => (i < 10 ? `// reason ${i}` : `const a${i} = ${i};`)).join("\n");
  assert.match(analyzeEditVolume("src/a.ts", heavyComments, heavyComments) ?? "", /注释净增/);
  assert.equal(analyzeEditVolume("src/a.ts", heavyComments, heavyComments, heavyComments), null);
  assert.equal(analyzeEditVolume("docs/guide.md", heavyComments, heavyComments), null);
});

test("piGuardrails 端到端状态机：bash 改未跟踪新文件触发打回、防重跑、熔断与子目录适配", async () => {
  const repo = makeTempDir("guardrails-e2e-");
  try {
    initGitRepo(repo);
    const subDir = join(repo, "packages/app");
    mkdirSync(join(subDir, ".pi"), { recursive: true });
    writeFileSync(join(subDir, ".pi/verify.json"), JSON.stringify({ cmd: "node --check bad.mjs", timeoutMs: 5000 }));
    writeFileSync(join(subDir, "README.md"), "# demo\n");
    execFileSync("git", ["add", "."], { cwd: repo, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "chore：初始化测试仓库"], { cwd: repo, stdio: "ignore" });

    const handlers = new Map<string, Array<(event: any, ctx: any) => Promise<any> | any>>();
    const notices: string[] = [];
    let verifyExecCount = 0;
    const mockPi = {
      on(name: string, fn: (event: any, ctx: any) => any) {
        const list = handlers.get(name) ?? [];
        list.push(fn);
        handlers.set(name, list);
      },
      async exec(cmd: string, args: string[], opts?: { cwd?: string; timeout?: number }) {
        if (cmd === "sh" && args[0] === "-c") verifyExecCount++;
        const res = spawnSync(cmd, args, { cwd: opts?.cwd, timeout: opts?.timeout, encoding: "utf8" });
        return {
          stdout: res.stdout ?? "",
          stderr: res.stderr ?? "",
          code: res.status ?? 1,
          killed: res.signal !== null,
          truncated: false,
        };
      },
    } as unknown as ExtensionAPI;

    piGuardrails(mockPi);

    let idle = true;
    const ctx = {
      cwd: subDir,
      hasUI: true,
      isIdle: () => idle,
      signal: undefined,
      ui: { notify: (msg: string) => notices.push(msg) },
    } as unknown as ExtensionContext;

    const emit = async (name: string, event: any) => {
      let last: any;
      for (const fn of handlers.get(name) ?? []) last = await fn(event, ctx);
      return last;
    };

    await emit("session_start", { type: "session_start", reason: "startup" });
    await emit("input", { type: "input", text: "用 bash 写个脚本", source: "interactive" });

    const blocked = await emit("tool_call", { type: "tool_call", toolCallId: "t0", toolName: "bash", input: { command: "git push origin main" } });
    assert.equal(blocked.block, true);

    await emit("tool_call", { type: "tool_call", toolCallId: "t1", toolName: "bash", input: { command: "echo 'const x = ;' > bad.mjs" } });
    writeFileSync(join(subDir, "bad.mjs"), "const x = ;\n");
    await emit("tool_execution_end", { type: "tool_execution_end", toolCallId: "t1", toolName: "bash", isError: false, result: {} });

    const settle1 = await emit("agent_before_settle", { type: "agent_before_settle", entries: [], continue: false, outcome: "completed" });
    assert.equal(settle1.continue, true);
    assert.match(settle1.entries[0].content, /第 1\/2 次自动重试/);

    // Same failure signature without changing code trips circuit breaker immediately.
    const settle2 = await emit("agent_before_settle", { type: "agent_before_settle", entries: [], continue: false, outcome: "completed" });
    assert.equal(settle2.continue, undefined);
    assert.equal(settle2.entries[0].display, true);
    assert.match(settle2.entries[0].content, /连续两次报错一致/);

    // Fix untracked file -> passes and updates verified baseline.
    await emit("input", { type: "input", text: "修好了", source: "interactive" });
    await emit("tool_call", { type: "tool_call", toolCallId: "t2", toolName: "bash", input: { command: "echo 'export const x = 1;' > bad.mjs" } });
    writeFileSync(join(subDir, "bad.mjs"), "export const x = 1;\n");
    await emit("tool_execution_end", { type: "tool_execution_end", toolCallId: "t2", toolName: "bash", isError: false, result: {} });
    const settle3 = await emit("agent_before_settle", { type: "agent_before_settle", entries: [], continue: false, outcome: "completed" });
    assert.equal(settle3, undefined);
    assert.equal(verifyExecCount, 3);

    // Next turn runs read-only bash without modifying files -> hash unchanged -> skips verification.
    await emit("input", { type: "input", text: "看看目录", source: "interactive" });
    await emit("tool_call", { type: "tool_call", toolCallId: "t3", toolName: "bash", input: { command: "ls" } });
    await emit("tool_execution_end", { type: "tool_execution_end", toolCallId: "t3", toolName: "bash", isError: false, result: {} });
    const settle4 = await emit("agent_before_settle", { type: "agent_before_settle", entries: [], continue: false, outcome: "completed" });
    assert.equal(settle4, undefined);
    assert.equal(verifyExecCount, 3);
    assert.equal(notices.length, 0);
    assert.notEqual(normalizeErrorSignature("12ms failed"), "");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
