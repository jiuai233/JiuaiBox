import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { extname, posix, resolve } from "node:path";

const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".py", ".rs", ".go", ".css", ".html", ".json",
]);
const DOC_EXTENSIONS = new Set([".md", ".markdown", ".mdx", ".txt", ".rst"]);
const COMMIT_SUBJECT_RE = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)：(\S.*)$/;
const HAN_RE = /[\u4e00-\u9fff]/;
const SUDO_ARG_FLAGS = new Set(["-u", "-g", "-C", "-D", "-R", "-T", "-h", "-p", "-r", "-t"]);
const ENV_ARG_FLAGS = new Set(["-u", "-C", "-S"]);

function extractSubst(src: string, start: number): { inner: string; end: number } {
  let depth = 1, i = start;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === "\\") { i += 2; continue; }
    if (c === "'") { const e = src.indexOf("'", i + 1); i = e === -1 ? src.length : e + 1; continue; }
    if (c === '"') { i++; while (i < src.length && src[i] !== '"') i += src[i] === "\\" ? 2 : 1; if (i < src.length) i++; continue; }
    if (c === "(") depth++; else if (c === ")") depth--;
    i++;
  }
  return { inner: src.slice(start, Math.max(start, i - 1)), end: i };
}

function readBacktick(src: string, start: number): { inner: string; end: number } {
  let j = start;
  while (j < src.length && src[j] !== "`") j += src[j] === "\\" ? 2 : 1;
  return { inner: src.slice(start, j), end: Math.min(src.length, j + 1) };
}

function parseShellPipelines(script: string): { pipelines: string[][][]; nested: string[] } {
  const pipelines: string[][][] = [], nested: string[] = [], heredocs: { delim: string; stripTabs: boolean }[] = [];
  let curPipe: string[][] = [], curCmd: string[] = [], tok = "", hasTok = false, i = 0;
  const pushTok = () => { if (hasTok) { curCmd.push(tok); tok = ""; hasTok = false; } };
  const pushCmd = () => { pushTok(); if (curCmd.length) { curPipe.push(curCmd); curCmd = []; } };
  const pushPipe = () => { pushCmd(); if (curPipe.length) { pipelines.push(curPipe); curPipe = []; } };

  while (i < script.length) {
    const ch = script[i];
    if (ch === "'") {
      hasTok = true;
      const end = script.indexOf("'", i + 1);
      tok += end === -1 ? script.slice(i + 1) : script.slice(i + 1, end);
      i = end === -1 ? script.length : end + 1;
    } else if (ch === '"') {
      hasTok = true; i++;
      while (i < script.length && script[i] !== '"') {
        if (script[i] === "\\" && i + 1 < script.length) { if (script[i + 1] !== "\n") tok += script[i + 1]; i += 2; }
        else if (script[i] === "$" && script[i + 1] === "(") { const s = extractSubst(script, i + 2); nested.push(s.inner); tok += `$(${s.inner})`; i = s.end; }
        else if (script[i] === "`") { const b = readBacktick(script, i + 1); nested.push(b.inner); tok += `\`${b.inner}\``; i = b.end; }
        else tok += script[i++];
      }
      i++;
    } else if (ch === "\\" && i + 1 < script.length) {
      if (script[i + 1] !== "\n") { hasTok = true; tok += script[i + 1]; }
      i += 2;
    } else if (ch === "$" && script[i + 1] === "(") {
      hasTok = true; const s = extractSubst(script, i + 2); nested.push(s.inner); tok += `$(${s.inner})`; i = s.end;
    } else if (ch === "`") {
      hasTok = true; const b = readBacktick(script, i + 1); nested.push(b.inner); tok += `\`${b.inner}\``; i = b.end;
    } else if (ch === "#" && !hasTok) {
      const nl = script.indexOf("\n", i); i = nl === -1 ? script.length : nl;
    } else if (ch === "<" && script[i + 1] === "<" && script[i + 2] !== "<") {
      pushTok(); i += 2;
      const stripTabs = script[i] === "-"; if (stripTabs) i++;
      while (script[i] === " " || script[i] === "\t") i++;
      let delim = "";
      while (i < script.length && !/[\s;&|<>()]/.test(script[i])) {
        if (script[i] === "'" || script[i] === '"') { const q = script[i++]; while (i < script.length && script[i] !== q) delim += script[i++]; i++; }
        else if (script[i] === "\\" && i + 1 < script.length) { delim += script[i + 1]; i += 2; }
        else delim += script[i++];
      }
      if (delim) heredocs.push({ delim, stripTabs });
    } else if ((ch === "&" && script[i + 1] === ">") || ((ch === ">" || ch === "<") && script[i + 1] === "&")) {
      pushTok(); i += 2 + (script[i + 2] === ">" ? 1 : 0);
    } else if (ch === ">" || ch === "<") {
      pushTok(); i += script[i + 1] === ch ? 2 : 1;
    } else if (ch === "\n") {
      pushPipe(); i++;
      while (heredocs.length > 0 && i < script.length) {
        const hd = heredocs.shift()!;
        while (i < script.length) {
          const nl = script.indexOf("\n", i);
          const line = (nl === -1 ? script.slice(i) : script.slice(i, nl)).replace(/\r$/, "");
          i = nl === -1 ? script.length : nl + 1;
          if ((hd.stripTabs ? line.replace(/^\t+/, "") : line) === hd.delim) break;
        }
      }
    } else if (ch === ";" || ch === "(" || ch === ")") { pushPipe(); i++; }
    else if (ch === "|") { if (script[i + 1] === "|") { pushPipe(); i += 2; } else { pushCmd(); i += script[i + 1] === "&" ? 2 : 1; } }
    else if (ch === "&") { pushPipe(); i += script[i + 1] === "&" ? 2 : 1; }
    else if (ch === " " || ch === "\t" || ch === "\r") { pushTok(); i++; }
    else { hasTok = true; tok += ch; i++; }
  }
  pushPipe();
  return { pipelines, nested };
}

function unwrapCommand(tokens: string[]): string[] {
  let i = 0;
  while (i < tokens.length) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) { i++; continue; }
    const base = posix.basename(tokens[i]);
    if (["command", "nohup", "time", "env", "sudo"].includes(base)) {
      i++;
      while (i < tokens.length) {
        const t = tokens[i];
        if (t === "--") { i++; break; }
        if ((base === "sudo" && SUDO_ARG_FLAGS.has(t)) || (base === "env" && ENV_ARG_FLAGS.has(t))) { i += 2; continue; }
        if (t.startsWith("-") || (base === "env" && /^[A-Za-z_][A-Za-z0-9_]*=/.test(t))) { i++; continue; }
        break;
      }
      continue;
    }
    break;
  }
  return tokens.slice(i);
}

function checkGitTokens(args: string[]): string | null {
  let i = 0;
  while (i < args.length && args[i].startsWith("-")) {
    i += ["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env"].includes(args[i]) ? 2 : 1;
  }
  const sub = args[i], rest = args.slice(i + 1);
  if (sub === "commit") {
    const messages: string[] = [];
    for (let j = 0; j < rest.length; j++) {
      const a = rest[j];
      if (a === "--") break;
      if (a === "--no-verify" || a === "-n") return "禁止使用 --no-verify 或 -n 绕过 Git 提交检查。";
      if (["-F", "--file", "-c", "-C", "-t", "--author", "--date", "--cleanup", "--pathspec-from-file"].includes(a)) { j++; continue; }
      if (a === "-m" || a === "--message" || /^-[a-zA-Z]*m$/.test(a)) {
        if (a !== "--message" && a.length > 2 && a.slice(1, -1).includes("n")) return "禁止使用 --no-verify 或 -n 绕过 Git 提交检查。";
        if (j + 1 < rest.length) messages.push(rest[++j]);
      } else if (a.startsWith("--message=")) messages.push(a.slice(10));
      else if (a.startsWith("-m") && a.length > 2) messages.push(a.slice(2));
      else if (/^-[a-zA-Z]{2,}$/.test(a) && !/^-(F|c|C|t|S|u)/.test(a) && a.includes("n")) {
        return "禁止使用 --no-verify 或 -n 绕过 Git 提交检查。";
      }
    }
    const msg = messages[0];
    if (msg && !/^\$(?:\(|[A-Za-z_{])|^`/.test(msg)) {
      const m = COMMIT_SUBJECT_RE.exec(msg.split(/\r?\n/, 1)[0]);
      if (!m || !HAN_RE.test(m[2])) {
        return "Git 提交信息格式不合规：需匹配「类型：中文描述」（全角冒号、无 scope，且描述包含中文）。";
      }
    }
  } else if (sub === "push") {
    let hasRepo = false, endFlags = false;
    const pos: string[] = [];
    for (let j = 0; j < rest.length; j++) {
      const a = rest[j];
      if (!endFlags && a === "--") { endFlags = true; continue; }
      if (!endFlags && a.startsWith("-")) {
        if (a === "--repo" || a.startsWith("--repo=")) hasRepo = true;
        if (["-o", "--push-option", "--repo", "--receive-pack", "--exec"].includes(a)) j++;
        continue;
      }
      pos.push(a);
    }
    for (const spec of pos.slice(hasRepo ? 0 : 1)) {
      const clean = spec.replace(/^\+/, "");
      const dst = (clean.includes(":") ? clean.slice(clean.indexOf(":") + 1) : clean).replace(/^refs\/heads\//, "");
      if (dst === "main" || dst === "master") return `禁止直接推送到 ${dst} 主干分支，请推送到功能或修复分支。`;
    }
  }
  return null;
}

export function checkBashCommand(command: string, depth = 0): string | null {
  if (!command.trim() || depth > 4) return null;
  const { pipelines, nested } = parseShellPipelines(command);
  for (const pipeline of pipelines) {
    let sawFind = false;
    for (const rawTokens of pipeline) {
      const tokens = unwrapCommand(rawTokens);
      if (!tokens.length) continue;
      const bin = posix.basename(tokens[0]), args = tokens.slice(1);
      if (bin === "sh" || bin === "bash" || bin === "zsh") {
        const cIdx = args.findIndex((a) => a === "-c" || /^-[a-zA-Z]*c$/.test(a));
        if (cIdx !== -1 && args[cIdx + 1]) {
          const err = checkBashCommand(args[cIdx + 1], depth + 1);
          if (err) return err;
        }
      }
      if (bin === "git") { const err = checkGitTokens(args); if (err) return err; }
      if (bin === "killall") return "禁止使用 killall 模糊杀进程，请按启动时记录的 PID 精准 kill。";
      if (bin === "pkill") {
        for (const a of args) {
          if (a === "--") break;
          if (a === "-f" || a === "--full" || (/^-[a-zA-Z0-9]{2,}$/.test(a) && !/^-(g|G|P|s|t|u|U|F)/.test(a) && a.includes("f"))) {
            return "禁止使用 pkill -f 模糊杀进程，请按启动时记录的 PID 精准 kill。";
          }
        }
      }
      if (bin === "grep" || bin === "egrep") {
        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          if (a === "--") break;
          if (["-e", "-f", "-m", "-A", "-B", "-C", "--regexp", "--file"].includes(a)) { i++; continue; }
          if (a === "-r" || a === "-R" || a === "--recursive" || a === "--dereference-recursive" || (/^-[a-zA-Z]{2,}$/.test(a) && /[rR]/.test(a))) {
            return "禁止使用递归 grep 搜索代码，请改用 rg。";
          }
        }
      }
      if (bin === "find") sawFind = true;
      if (sawFind && bin === "xargs") {
        let target = "echo";
        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          if (a === "--") { target = args[i + 1] ? posix.basename(args[i + 1]) : "echo"; break; }
          if (["-I", "-L", "-n", "-P", "-s", "-E", "-a", "-d"].includes(a)) { i++; continue; }
          if (!a.startsWith("-")) { target = posix.basename(a); break; }
        }
        if (target === "grep" || target === "egrep" || target === "fgrep") {
          return "禁止使用 find | xargs grep 搜索代码，请改用 rg。";
        }
      }
    }
  }
  for (const sub of nested) { const err = checkBashCommand(sub, depth + 1); if (err) return err; }
  return null;
}

export function isSourceFile(filePath: string): boolean {
  return SOURCE_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function unquoteGitPath(raw: string): string {
  if (!raw.startsWith('"') || !raw.endsWith('"')) return raw;
  const inner = raw.slice(1, -1), bytes: number[] = [];
  const esc: Record<string, number> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, "\\": 92 };
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "\\" && i + 1 < inner.length) {
      const n = inner[i + 1];
      if (n >= "0" && n <= "7") {
        let oct = n; i++;
        while (oct.length < 3 && i + 1 < inner.length && inner[i + 1] >= "0" && inner[i + 1] <= "7") oct += inner[++i];
        bytes.push(parseInt(oct, 8));
      } else { i++; bytes.push(esc[n] ?? n.charCodeAt(0)); }
    } else bytes.push(...Buffer.from(inner[i], "utf8"));
  }
  return Buffer.from(bytes).toString("utf8");
}

export function parseGitStatusPorcelain(output: string): { path: string; status: string; deleted: boolean }[] {
  const results: { path: string; status: string; deleted: boolean }[] = [];
  for (const rawLine of output.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line.length < 4 || line[2] !== " ") continue;
    const rawStatus = line.slice(0, 2), rest = line.slice(3);
    let path = rest;
    if (/[RC]/.test(rawStatus)) {
      if (rest.startsWith('"')) {
        let i = 1;
        while (i < rest.length && rest[i] !== '"') i += rest[i] === "\\" ? 2 : 1;
        path = rest.slice(i + 1, i + 5) === " -> " ? rest.slice(i + 5) : rest;
      } else {
        const idx = rest.indexOf(" -> ");
        if (idx !== -1) path = rest.slice(idx + 4);
      }
    }
    results.push({ path: unquoteGitPath(path), status: rawStatus.trim() || rawStatus, deleted: rawStatus.includes("D") });
  }
  return results;
}

export function computeSnapshotHash(cwd: string, files: string[]): string {
  const hash = createHash("sha256");
  for (const file of [...new Set(files)].sort()) {
    try {
      const buf = readFileSync(resolve(cwd, file));
      hash.update(`F\0${file}\0${buf.byteLength}\0`);
      hash.update(buf);
    } catch {
      hash.update(`M\0${file}\0`);
    }
  }
  return hash.digest("hex");
}

export function detectVerifyPlan(
  cwd: string,
  changedSourceFiles: string[],
): { cmd: string; timeoutMs: number; source: "config" | "auto" } | null {
  if (changedSourceFiles.length === 0) return null;
  const cfgPath = resolve(cwd, ".pi/verify.json");
  if (existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(readFileSync(cfgPath, "utf8")) as { cmd?: unknown; timeoutMs?: unknown };
      if (typeof cfg?.cmd === "string" && cfg.cmd.trim()) {
        const timeoutMs = typeof cfg.timeoutMs === "number" && Number.isFinite(cfg.timeoutMs) && cfg.timeoutMs > 0 ? cfg.timeoutMs : 30000;
        return { cmd: cfg.cmd.trim(), timeoutMs, source: "config" };
      }
    } catch { /* ignore */ }
  }
  const pkgPath = resolve(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, unknown> };
      const pm = existsSync(resolve(cwd, "pnpm-lock.yaml")) ? "pnpm"
        : existsSync(resolve(cwd, "bun.lockb")) || existsSync(resolve(cwd, "bun.lock")) ? "bun"
        : existsSync(resolve(cwd, "yarn.lock")) ? "yarn" : "npm";
      const cmds: string[] = [];
      if (typeof pkg.scripts?.check === "string" && pkg.scripts.check.trim()) cmds.push(`${pm} run check`);
      else if (typeof pkg.scripts?.typecheck === "string" && pkg.scripts.typecheck.trim()) cmds.push(`${pm} run typecheck`);
      if (typeof pkg.scripts?.lint === "string" && pkg.scripts.lint.trim()) cmds.push(`${pm} run lint`);
      if (cmds.length > 0) return { cmd: cmds.join(" && "), timeoutMs: 30000, source: "auto" };
    } catch { /* ignore */ }
  }
  if (existsSync(resolve(cwd, "Cargo.toml")) && changedSourceFiles.some((f) => f.toLowerCase().endsWith(".rs"))) {
    return { cmd: "cargo check", timeoutMs: 30000, source: "auto" };
  }
  if (["pyproject.toml", "ruff.toml", ".ruff.toml"].some((f) => existsSync(resolve(cwd, f)))) {
    const pyFiles = changedSourceFiles.filter((f) => f.toLowerCase().endsWith(".py") && existsSync(resolve(cwd, f)));
    if (pyFiles.length > 0) {
      return { cmd: `ruff check ${pyFiles.map((p) => `'${p.replace(/'/g, "'\\''")}'`).join(" ")}`, timeoutMs: 30000, source: "auto" };
    }
  }
  if (existsSync(resolve(cwd, "go.mod")) && changedSourceFiles.some((f) => f.toLowerCase().endsWith(".go"))) {
    return { cmd: "go vet ./...", timeoutMs: 30000, source: "auto" };
  }
  return null;
}

export function isVerifyCommandSatisfied(bashCommand: string, verifyCmd: string, cwd: string): boolean {
  const cmd = bashCommand.trim();
  const target = verifyCmd.trim();
  if (!cmd || !target) return false;
  if (cmd === target) return true;
  const targetParts = target.split(/\s*&&\s*/).map((s) => s.trim()).filter(Boolean);
  const cmdParts = cmd.split(/\s*&&\s*/).map((s) => s.trim()).filter(Boolean);
  if (targetParts.length > 0 && targetParts.every((part) => cmdParts.includes(part))) return true;
  const pkgPath = resolve(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, unknown> };
      const testScript = typeof pkg.scripts?.test === "string" ? pkg.scripts.test : "";
      if (testScript && /^(npm|pnpm|bun|yarn)\s+(?:run\s+)?test(?:\s|$)/.test(cmd)) {
        const testParts = testScript.split(/\s*&&\s*/).map((s) => s.trim()).filter(Boolean);
        if (targetParts.every((part) => testParts.includes(part))) return true;
      }
    } catch { /* ignore */ }
  }
  return false;
}

const isCommentLine = (line: string): boolean => {
  const t = line.trimStart();
  return t.startsWith("//") || t.startsWith("/*") || t.startsWith("* ") || t === "*" || (t.startsWith("#") && !t.startsWith("#[") && !t.startsWith("#!["));
};

export function analyzeEditVolume(filePath: string, content: string, addedText?: string, removedText?: string): string | null {
  const split = (s: string) => (s ? s.replace(/\r?\n$/, "").split(/\r?\n/) : []);
  const warnings: string[] = [];
  const totalLines = split(content).length;
  if (totalLines > 600) warnings.push(`文件 ${filePath} 当前共 ${totalLines} 行（超过 600 行），建议精简拆分。`);
  if (addedText && !DOC_EXTENSIONS.has(extname(filePath).toLowerCase())) {
    const addedLines = split(addedText);
    const removedLines = removedText ? split(removedText) : [];
    const netAdded = addedLines.length - removedLines.length;
    const netComments = addedLines.filter(isCommentLine).length - removedLines.filter(isCommentLine).length;
    if (netAdded >= 15 && netComments / netAdded > 0.5) {
      warnings.push(`本次向 ${filePath} 净增 ${netAdded} 行，其中注释净增 ${netComments} 行（超过 50%），请避免冗余注释。`);
    }
  }
  return warnings.length > 0 ? `[护栏提醒] ${warnings.join(" ")}` : null;
}

export function normalizeErrorSignature(output: string): string {
  return output
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/g, "<TIME>")
    .replace(/\b\d{2}:\d{2}:\d{2}(?:\.\d+)?\b/g, "<TIME>")
    .replace(/\b\d+(?:\.\d+)?\s*(?:ms|s|sec|secs|seconds|m|min|mins)\b/gi, "<DUR>")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}
