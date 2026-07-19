## Windows Shell

Default environment: Windows 11 with PowerShell 7 (`pwsh`).

- Use PowerShell syntax; use Bash only after confirming a Linux shell.
- Prefer single quotes for complex `rg` patterns. Use `rg -g` for file globs; expand wildcard directories first.
- Pipe multiline Python via a PowerShell here-string to `python -`; never use Bash heredocs.
- Wrap `foreach` / `if` output in `$()` / `@()` or assign it before piping.
- Report shell/environment mismatches or command failures immediately; never switch shells or syntax silently.

## CodeGraph

When the actual project root contains `.codegraph/`, use CodeGraph before grep/find or raw source reads.

- Start with one bounded `codegraph_explore` for architecture, unknown locations, related symbols, bugs, or flows.
- Read an exact range with `codegraph_node(file, offset, limit)` or `codegraph node --file <file> --offset <line> --limit <count>`.
- For symbol locations only, use MCP `codegraph_search` or CLI `codegraph query`; never `codegraph search`.
- Use callers/callees/impact only when needed. Do not re-query information already returned by `codegraph_explore`.
- Trust CodeGraph unless it reports stale, unsupported, or insufficient coverage; do not redundantly verify with grep/read.
- After edits, allow auto-sync briefly. If still stale, run `codegraph sync`; read only specifically flagged files.
- In monorepos/nested repositories, verify the indexed root with `codegraph status`; use `projectPath` or `--path` explicitly.
- If no index exists, do not initialize one; use bounded `rg`, `Select-String`, or targeted reads.
- Bound output with `maxFiles` / `--max-files`, `limit` / `--limit`, and `offset` + `limit`. Expand only when evidence is insufficient.

## Investigation and Workspace Safety

- Work in small, recoverable, low-output stages. The main thread owns planning, evidence synthesis, root-cause decisions, edits, and final validation.
- Keep simple/sequential investigation in the main thread; never spawn a subagent just to read known files or lines.
- Use read-only subagents only for independent, bounded questions. They must not edit, must separate evidence from inference, and must return concise paths/lines/symbols or state that evidence is insufficient.
- Before editing, confirm behavior, evidence, likely root cause, scope, and uncertainty; inspect `git status` and relevant diffs.
- Preserve existing work. Never use destructive Git commands or mix unresolved investigation with broad refactors, API changes, formatting, renaming, or cleanup.

## Unexpected Errors

On any command, tool, path, permission, dependency, CodeGraph, test, or build failure, immediately report what failed, the concise error, side effects, the fallback used, and whether coverage is weaker.

Safe bounded fallbacks may proceed. Never hide failures, silently repeat the same approach, silently escalate permissions, or present partial results as complete. Stop before any fallback that materially increases risk, scope, or side effects.

## Output, Changes, and Validation

- Bound searches and reads with scoped paths, filters, limits, line ranges, `rg -l`, `rg -c`, and `Select-Object -First`. Avoid unrestricted recursion, dependency scans, large-file dumps, and full logs.
- Keep direct output under about 100 lines. Put large logs/generated output in a file and report its path, size/counts, key excerpts, and conclusions.
- Make only confirmed, minimal changes; avoid unrelated refactors and unsupported abstractions.
- After editing, inspect the diff for unintended files, overwritten work, formatting noise, debug code, and temporary files.
- Run the smallest relevant validation first; expand only when needed. Do not default to full-repository builds/tests/E2E.
- Distinguish passed, failed, fallback, blocked, and unrun checks, plus remaining manual verification.

## Progress and Reporting

Use `CODEX_PROGRESS.md` only for substantial multi-stage work, cross-thread handoff, explicit requests, or repositories already using it.

At important stage boundaries, briefly report completed work, evidence/conclusion, modified files, validation, failures/fallbacks, unresolved issues, and next step. Stop when investigation drifts, failures repeat, output grows, evidence is insufficient, or the next step is separate or materially riskier.

## Git Commit Style

Use `<type>: <中文描述>` with one of:

- `feat`: 新增功能
- `fix`: 修复普通缺陷
- `hotfix`: 修复生产环境紧急问题
- `refactor`: 重构代码，不改变业务行为
- `test`: 新增或调整测试
- `docs`: 修改文档
- `chore`: 依赖、构建、配置等维护工作
- `perf`: 性能优化
- `style`: 仅格式调整，不改变逻辑
