---
name: engineering-change-guidelines
description: Use when modifying, fixing, reviewing, or refactoring existing code. Read-only reviews report findings and evidence. Code changes use a lightweight workflow by default; escalate for blocking ambiguity, public interfaces, migrations, security, concurrency, data integrity, architecture, or material compatibility risk.
---

# Engineering Change Guidelines

Follow applicable `AGENTS.md` instructions for environment, investigation, safety, diff review, validation, and reporting. This skill only selects the process depth required for a code change.

## Read-only Review

Inspect the requested scope and report findings, evidence, and verification gaps. Keep implementation and plan-file creation for an explicitly authorized change task.

## Default: Lightweight

For authorized code changes, use this workflow unless an escalation condition applies:

1. Confirm the requested behavior and affected path.
2. For bugs, trace the root cause and relevant callers.
3. Define one concise success check.
4. Make the smallest complete change.
5. Follow `AGENTS.md` for diff review, validation, and reporting.

Do not create `implementation_plan.md` or emit phase templates.
Do not ask for clarification when a safe, obvious interpretation exists.

## Escalate Only When Needed

Use the full workflow when any condition applies:

- Missing information blocks safe implementation.
- The change affects public APIs, schemas, migrations, authentication, security, concurrency, or data integrity.
- The change alters architecture, or crosses modules with material compatibility, data-integrity, or architectural risk.
- Compatibility, release, or rollback requires an explicit plan.
- The user explicitly requests a formal plan or acceptance process.

Do not escalate only because the repository is large.

## Full Workflow

Proceed in order: `Spec -> Plan -> Execution -> Acceptance`.

### Spec

Confirm the goal, boundaries, affected scope, compatibility constraints, and acceptance criteria.

Emit the following only when missing information blocks safe implementation:

```text
MISSING_SPEC_DETECTED

- Concrete blocking item
```

### Plan

Record the plan in the response by default. Create or update `implementation_plan.md` when the user requests a persistent plan or the task requires a durable handoff. Include:

- affected files or modules
- implementation order
- validation steps
- compatibility and rollback risks

Remove unnecessary scope and abstraction before implementation.

### Execution

- Implement logically atomic changes.
- Resolve review findings before continuing.
- Expand validation only when the risk requires it.

### Acceptance

Report completed behavior, validation results, and unresolved risks or blocked checks.

Do not declare completion while required validation is failing.
