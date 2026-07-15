## CodeGraph

When the actual project root contains `.codegraph/`, use CodeGraph before
grep/find or raw source reads.

- Default to one `codegraph_explore` call for architecture, unknown locations,
  related symbols, bugs, and call flows.
- For an exact known file range, use `codegraph_node(file, offset, limit)` when
  already exposed, or:
  `codegraph node --file <file> --offset <line> --limit <count>`.
- For symbol locations only, MCP uses `codegraph_search`; the CLI equivalent is
  `codegraph query`, never `codegraph search`.
- Use callers/callees/impact only when that targeted result is actually needed.
  Do not chain search -> node -> grep for information already returned by
  `codegraph_explore`.
- Treat CodeGraph source as authoritative unless it reports staleness,
  unsupported coverage, or insufficient results. Do not redundantly verify it
  with grep/read.
- After edits, allow auto-sync briefly. If a staleness warning remains, run
  `codegraph sync`; if only specific files are flagged, read only those files.
- In monorepos or nested repositories, confirm which indexed project root
  covers the target and verify it with `codegraph status`. Use `projectPath`
  or CLI `--path` when querying another indexed root. Do not assume a parent
  index includes nested repositories.
- If no index exists, do not initialize one automatically; use bounded `rg`,
  `Select-String`, or targeted reads.
- Keep CodeGraph output bounded: use `maxFiles` / CLI `--max-files` for
  `codegraph_explore`, `limit` / CLI `--limit` for symbol queries, and
  `offset` + `limit` for known file ranges. Start narrow and expand only when
  the returned evidence is insufficient.

Please handle code investigation and implementation in small, recoverable,
low-output stages.

## Investigation

The main thread owns planning, evidence synthesis, root-cause decisions, edits, and final validation conclusions.

Do simple or sequential investigation in the main thread. Do not create a subagent merely to read a known file or line range.

Use read-only subagents only for independent, clearly bounded questions. Each subagent must:

- investigate one concrete question;
- stay within an explicit scope;
- never modify files;
- return concise findings with paths, lines, and symbols;
- separate evidence from inference;
- say when evidence is insufficient.

Investigate before editing.
 Confirm the observed behavior, supporting evidence, likely root cause, modification scope, and remaining uncertainty.

Do not mix unresolved investigation with broad refactors, API changes, bulk formatting, renaming, or unrelated cleanup.

## Workspace Safety

Before editing, inspect `git status` and relevant diffs.

Do not overwrite, revert, or delete the user's existing work. Do not use destructive Git commands. Preserve pre-existing changes and keep edits minimal.

## Unexpected Errors

If a command, tool, path, permission, dependency, CodeGraph query, test, or build fails, you may immediately use a safe bounded alternative.

Always tell the user:

- what failed;
- the concise error;
- whether it caused side effects;
- what alternative was used;
- whether the alternative has weaker coverage.

Never hide failures, silently repeat the same broken approach, silently increase permissions, or present partial fallback results as complete validation.

Stop and explain before using a fallback that significantly increases risk, scope, or side effects.

## Output Control

Keep searches and reads bounded. Prefer scoped paths, file filters, result limits, line ranges, `rg -l`, `rg -c`, `head`, `tail`, and `Select-Object -First`.

Avoid unrestricted recursive searches, full large-file reads, dependency-directory scans, and complete build or test logs.

Keep direct output under about 100 lines by default. Write large logs or generated output to a file and report only its path, size or counts, key excerpts, and conclusions.

## Changes and Validation

Keep changes small and limited to the confirmed problem. Do not refactor unrelated code or introduce unsupported abstractions.

After editing, inspect the diff for unintended files, overwritten user changes, formatting noise, debug code, and temporary files.

Run the smallest relevant validation first. Expand only when necessary. Do not run full-repository tests, full builds, or all end-to-end tests by default.

Clearly distinguish:

- passed checks;
- failed checks;
- fallback checks;
- blocked checks;
- checks not run;
- remaining manual verification.

## Progress and Reporting

Use `CODEX_PROGRESS.md` only for substantial multi-stage work, cross-thread handoff, explicit user requests, or repositories that already use it.

At the end of an important stage, briefly report:

- completed work;
- key evidence and conclusion;
- modified files;
- validation;
- unexpected errors and fallbacks;
- unresolved issues;
- next step.

Stop expanding the task when investigation drifts, failures repeat, output grows, evidence is insufficient, or the next step is a separate or significantly riskier task.
