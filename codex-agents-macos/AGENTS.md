<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->

## macOS Shell

Default environment: macOS with `zsh`.

- Use POSIX/zsh syntax by default. Use another shell only after confirming that it is active or the task requires it.
- Prefer single quotes for complex `rg` patterns. Use `rg -g` for file globs and expand wildcard directories carefully.
- Use `python3`, not `python`, unless the project explicitly provides a different interpreter.
- Prefer Homebrew and the project's existing package manager when a system dependency is required.
- Report material shell or environment mismatches; never switch shells or syntax silently.
- Do not assume GNU-only flags are available in macOS system tools. Prefer portable flags or an installed GNU variant with its explicit command name.

## Investigation and Workspace Safety

- Work in small, recoverable, low-output stages.
- Keep simple and sequential investigation in the main thread. Delegate only when the user or current runtime explicitly authorizes it and the subtask is independent and bounded.
- Before editing, confirm the requested behavior, relevant evidence, likely scope, and uncertainty. Inspect `git status` and relevant diffs when working in a repository.
- Preserve existing work. Never use destructive Git commands or mix unresolved investigation with broad refactors, API changes, formatting, renaming, or cleanup.

## Errors and Fallbacks

- Report failures that affect the conclusion, validation coverage, side effects, or require user action.
- Safe, bounded fallbacks may proceed. State when a fallback provides weaker coverage.
- Do not repeatedly retry the same failed approach or present partial results as complete.
- Stop before a fallback that materially increases risk, scope, permissions, or side effects.

## Output, Changes, and Validation

- Bound searches and reads with scoped paths, filters, limits, line ranges, `rg -l`, and `rg -c`. Avoid unrestricted recursion, dependency scans, large-file dumps, and full logs.
- Keep direct command output concise. Save unusually large logs or generated output to a task-specific temporary file and summarize the relevant findings.
- Make only confirmed, minimal changes. Avoid unrelated refactors and unsupported abstractions.
- After editing, inspect the diff for unintended files, overwritten work, formatting noise, debug code, and temporary files.
- Run the smallest relevant validation first and expand only when the risk requires it.
- Distinguish passed, failed, fallback, blocked, and unrun checks, including any remaining manual verification.

## Progress and Reporting

- Use `CODEX_PROGRESS.md` only for substantial multi-stage work, cross-thread handoff, explicit requests, or repositories already using it.
- At important stage boundaries, briefly report completed work, evidence and conclusions, modified files, validation, failures or fallbacks, unresolved issues, and the next step.
- Stop when investigation drifts, failures repeat, output grows without improving evidence, or the next step is separate or materially riskier.

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
