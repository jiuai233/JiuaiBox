## CodeGraph
﻿
In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:
﻿
- **MCP tools** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them. `codegraph_node` returns one symbol's source + callers, or reads a whole file with line numbers. If the tools are listed but deferred, load them by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` and `codegraph node <symbol-or-file>` print the same output.
﻿
If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
﻿
Please handle code investigation and implementation in small, recoverable, low-output stages.
﻿
## CodeGraph Selection
﻿
Use the narrowest suitable operation:
﻿
- Known file and lines: `codegraph_node(file, offset, limit)`.
- Known symbol: `codegraph_node(symbol, file?, line?)`; use `includeCode` when needed.
- Unknown location, related symbols, or call flow: `codegraph_explore`.
- Locations only: `codegraph_search`.
- Callers, callees, or impact: the corresponding targeted tool.
﻿
Do not use `codegraph_explore` or read a whole file when an exact file range is known. `offset` is 1-based; `limit = end - start + 1`.
﻿
If CodeGraph is unavailable, stale, or insufficient, report that and use bounded `rg`, `Select-String`, or targeted reads.
﻿
## Investigation
﻿
The main thread owns planning, evidence synthesis, root-cause decisions, edits, and final validation conclusions.
﻿
Do simple or sequential investigation in the main thread. Do not create a subagent merely to read a known file or line range.
﻿
Use read-only subagents only for independent, clearly bounded questions. Each subagent must:
﻿
- investigate one concrete question;
- stay within an explicit scope;
- never modify files;
- return concise findings with paths, lines, and symbols;
- separate evidence from inference;
- say when evidence is insufficient.
﻿
Investigate before editing.
 Confirm the observed behavior, supporting evidence, likely root cause, modification scope, and remaining uncertainty.
﻿
Do not mix unresolved investigation with broad refactors, API changes, bulk formatting, renaming, or unrelated cleanup.
﻿
## Workspace Safety
﻿
Before editing, inspect `git status` and relevant diffs.
﻿
Do not overwrite, revert, or delete the user's existing work. Do not use destructive Git commands. Preserve pre-existing changes and keep edits minimal.
﻿
## Unexpected Errors
﻿
If a command, tool, path, permission, dependency, CodeGraph query, test, or build fails, you may immediately use a safe bounded alternative.
﻿
Always tell the user:
﻿
- what failed;
- the concise error;
- whether it caused side effects;
- what alternative was used;
- whether the alternative has weaker coverage.
﻿
Never hide failures, silently repeat the same broken approach, silently increase permissions, or present partial fallback results as complete validation.
﻿
Stop and explain before using a fallback that significantly increases risk, scope, or side effects.
﻿
## Output Control
﻿
Keep searches and reads bounded. Prefer scoped paths, file filters, result limits, line ranges, `rg -l`, `rg -c`, `head`, `tail`, and `Select-Object -First`.
﻿
Avoid unrestricted recursive searches, full large-file reads, dependency-directory scans, and complete build or test logs.
﻿
Keep direct output under about 100 lines by default. Write large logs or generated output to a file and report only its path, size or counts, key excerpts, and conclusions.
﻿
## Changes and Validation
﻿
Keep changes small and limited to the confirmed problem. Do not refactor unrelated code or introduce unsupported abstractions.
﻿
After editing, inspect the diff for unintended files, overwritten user changes, formatting noise, debug code, and temporary files.
﻿
Run the smallest relevant validation first. Expand only when necessary. Do not run full-repository tests, full builds, or all end-to-end tests by default.
﻿
Clearly distinguish:
﻿
- passed checks;
- failed checks;
- fallback checks;
- blocked checks;
- checks not run;
- remaining manual verification.
﻿
## Progress and Reporting
﻿
Use `CODEX_PROGRESS.md` only for substantial multi-stage work, cross-thread handoff, explicit user requests, or repositories that already use it.
﻿
At the end of an important stage, briefly report:
﻿
- completed work;
- key evidence and conclusion;
- modified files;
- validation;
- unexpected errors and fallbacks;
- unresolved issues;
- next step.
﻿
Stop expanding the task when investigation drifts, failures repeat, output grows, evidence is insufficient, or the next step is a separate or significantly riskier task.