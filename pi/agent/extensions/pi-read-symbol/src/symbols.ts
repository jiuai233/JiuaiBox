import { execFile } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";

type Kind = { kind: string; field: string; functionValued?: boolean };

const TS_KINDS: Kind[] = [
	{ kind: "function_declaration", field: "name" },
	{ kind: "generator_function_declaration", field: "name" },
	{ kind: "class_declaration", field: "name" },
	{ kind: "abstract_class_declaration", field: "name" },
	{ kind: "method_definition", field: "name" },
	{ kind: "public_field_definition", field: "name", functionValued: true },
	{ kind: "interface_declaration", field: "name" },
	{ kind: "type_alias_declaration", field: "name" },
	{ kind: "enum_declaration", field: "name" },
	{ kind: "variable_declarator", field: "name", functionValued: true },
	{ kind: "method_signature", field: "name" },
	{ kind: "abstract_method_signature", field: "name" },
	{ kind: "function_signature", field: "name" },
];

const JS_KINDS: Kind[] = [
	{ kind: "function_declaration", field: "name" },
	{ kind: "generator_function_declaration", field: "name" },
	{ kind: "class_declaration", field: "name" },
	{ kind: "method_definition", field: "name" },
	{ kind: "variable_declarator", field: "name", functionValued: true },
];

export const LANGUAGES: { language: string; extensions: string[]; kinds: Kind[] }[] = [
	{
		language: "rust",
		extensions: [".rs"],
		kinds: [
			{ kind: "function_item", field: "name" },
			{ kind: "function_signature_item", field: "name" },
			{ kind: "struct_item", field: "name" },
			{ kind: "enum_item", field: "name" },
			{ kind: "union_item", field: "name" },
			{ kind: "trait_item", field: "name" },
			{ kind: "impl_item", field: "type" },
			{ kind: "mod_item", field: "name" },
			{ kind: "macro_definition", field: "name" },
			{ kind: "const_item", field: "name" },
			{ kind: "static_item", field: "name" },
			{ kind: "type_item", field: "name" },
		],
	},
	{
		language: "python",
		extensions: [".py", ".pyi"],
		kinds: [
			{ kind: "function_definition", field: "name" },
			{ kind: "class_definition", field: "name" },
		],
	},
	{ language: "typescript", extensions: [".ts", ".mts", ".cts"], kinds: TS_KINDS },
	{ language: "tsx", extensions: [".tsx"], kinds: TS_KINDS },
	{ language: "javascript", extensions: [".js", ".mjs", ".cjs", ".jsx"], kinds: JS_KINDS },
	{
		language: "go",
		extensions: [".go"],
		kinds: [
			{ kind: "function_declaration", field: "name" },
			{ kind: "method_declaration", field: "name" },
			{ kind: "type_spec", field: "name" },
		],
	},
];

const FUNCTION_VALUES = ["arrow_function", "function_expression", "class", "generator_function"];
export const MAX_MATCHES = 8;
export const MAX_LINES_PER_MATCH = 400;
export const MAX_OUTLINE = 300;
export const MAX_OUTPUT_CHARS = 60_000;

export interface Definition {
	file: string;
	startLine: number;
	endLine: number;
	name: string;
	label: string;
	language: string;
	attachedStartLine?: number;
}

export interface ReadSymbolResult {
	text: string;
	details: { mode: "lookup" | "outline"; path: string; name?: string; matches: number; shown: number };
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** ast-grep rules for every language; with a name, only definitions carrying that name match. */
export function buildRules(name?: string, languages = LANGUAGES): string {
	return languages
		.map(({ language, kinds }) => {
			const any = kinds.map(({ kind, field, functionValued }) => {
				const capture: Record<string, string> = { field, pattern: "$NAME" };
				if (name) capture.regex = field === "type" ? `(^|::)(?:&(?:mut\\s+)?)?${escapeRegex(name)}(<.*>)?$` : `^${escapeRegex(name)}$`;
				const all: object[] = [{ kind }, { has: capture }];
				if (functionValued && !name) all.push({ has: { field: "value", any: FUNCTION_VALUES.map((k) => ({ kind: k })) } });
				return { all };
			});
			const definition = { any };
			const owner = { all: [definition, { pattern: "$OWNER" }] };
			const rules = [JSON.stringify({ id: language, language, rule: definition })];
			let attachment: object | undefined;
			if (language === "python") {
				attachment = { all: [{ kind: "decorated_definition" }, { has: { field: "definition", ...owner } }] };
			} else if (language === "rust") {
				// Outer attributes and /// comments are siblings of the item they decorate.
				const attached = { any: [{ kind: "attribute_item" }, { all: [{ kind: "line_comment" }, { regex: "^///" }] }] };
				attachment = { all: [attached, { precedes: { ...owner, stopBy: { not: attached } } }] };
			} else if (["typescript", "tsx", "javascript"].includes(language)) {
				attachment = {
					all: [
						{ kind: "decorator" },
						{ any: [
							{ precedes: { ...owner, stopBy: { not: { kind: "decorator" } } } },
							{ inside: { ...owner, stopBy: "neighbor" } },
							{ inside: {
								all: [
									{ kind: "export_statement" },
									{ has: { field: "declaration", ...owner } },
									{ not: { has: { kind: "comment", stopBy: "neighbor" } } },
								],
								stopBy: "neighbor",
							} },
						] },
					],
				};
			}
			if (attachment) rules.push(JSON.stringify({ id: `${language}-attachment`, language, rule: attachment }));
			return rules.join("\n---\n");
		})
		.join("\n---\n");
}

export function languageOf(path: string) {
	const ext = extname(path).toLowerCase();
	return LANGUAGES.find((l) => l.extensions.includes(ext));
}

function astGrepCandidates(): string[] {
	const out: string[] = [];
	if (process.env.AST_GREP_BIN) out.push(process.env.AST_GREP_BIN);
	out.push("ast-grep", "sg");
	return out;
}

interface AstGrepOutput {
	stdout: string;
	stderr: string;
	exitCode: number;
}

function isAbortError(err: unknown): err is Error {
	if (!err || typeof err !== "object") return false;
	const e = err as { name?: string; code?: unknown };
	return e.name === "AbortError" || e.code === "ABORT_ERR";
}

function textOf(chunk: unknown): string {
	if (typeof chunk === "string") return chunk;
	if (chunk == null) return "";
	return String(chunk);
}

/** Parse ast-grep --json=compact. A parse failure names the exit code and stderr. */
export function parseAstGrepJson(stdout: string, stderr: string, exitCode: number): unknown[] {
	if (!stdout.trim()) return [];
	try {
		return JSON.parse(stdout);
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		const errText = stderr.trim() ? stderr.trim() : "(empty)";
		throw new Error(`ast-grep returned invalid JSON (exit ${exitCode}): ${detail}; stderr: ${errText}`);
	}
}

function runAstGrep(args: string[], cwd: string, signal?: AbortSignal): Promise<AstGrepOutput> {
	const candidates = astGrepCandidates();
	return new Promise((resolvePromise, reject) => {
		const attempt = (i: number) => {
			execFile(candidates[i], args, { cwd, maxBuffer: 64 * 1024 * 1024, timeout: 60_000, signal, windowsHide: true }, (err, stdout, stderr) => {
				// Cancellation must surface as the abort error. Do not parse a partial stdout.
				if (signal?.aborted || isAbortError(err)) {
					if (isAbortError(err)) return reject(err);
					if (signal?.reason instanceof Error) return reject(signal.reason);
				}
				if (err && (err as NodeJS.ErrnoException).code === "ENOENT" && i + 1 < candidates.length) return attempt(i + 1);
				if (err && (err as NodeJS.ErrnoException).code === "ENOENT")
					return reject(new Error("ast-grep is not installed or not on PATH (winget install ast-grep.ast-grep, or set AST_GREP_BIN)."));
				// Any subprocess error rejects. Matches are on stdout only when the exit code is 0.
				if (err) return reject(new Error(`ast-grep failed: ${textOf(stderr) || err.message}`));
				resolvePromise({ stdout: textOf(stdout), stderr: textOf(stderr), exitCode: 0 });
			});
		};
		attempt(0);
	});
}

function labelOf(text: string): string {
	const first = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
	const label = first.trim().replace(/\s*\{\s*$/, "");
	return label.length > 100 ? `${label.slice(0, 97)}...` : label;
}

export async function findDefinitions(opts: { cwd: string; target: string; name?: string; singleFile: boolean; signal?: AbortSignal }): Promise<Definition[]> {
	const languages = opts.singleFile ? LANGUAGES.filter((l) => l === languageOf(opts.target)) : LANGUAGES;
	const args = ["scan", "--inline-rules", buildRules(opts.name, languages), "--json=compact"];
	if (opts.singleFile) args.push("--no-ignore", "hidden", "--no-ignore", "dot", "--no-ignore", "vcs", "--no-ignore", "parent", "--no-ignore", "global");
	args.push(opts.target);
	const raw = await runAstGrep(args, opts.cwd, opts.signal);
	const matches = parseAstGrepJson(raw.stdout, raw.stderr, raw.exitCode) as any[];
	const seen = new Set<string>();
	const defs: Definition[] = [];
	const attachedStarts = new Map<string, number>();
	for (const m of matches) {
		if (m.ruleId.endsWith("-attachment")) {
			const owner = m.metaVariables.single.OWNER;
			const key = `${m.file}:${owner.range.start.line + 1}:${owner.range.end.line + 1}`;
			const start = m.range.start.line + 1;
			attachedStarts.set(key, Math.min(attachedStarts.get(key) ?? start, start));
			continue;
		}
		const def: Definition = {
			file: m.file,
			startLine: m.range.start.line + 1,
			endLine: m.range.end.line + 1,
			name: m.metaVariables?.single?.NAME?.text ?? "",
			label: labelOf(m.text ?? ""),
			language: m.ruleId,
		};
		const key = `${def.file}:${def.startLine}:${def.endLine}`;
		if (seen.has(key)) continue;
		seen.add(key);
		defs.push(def);
	}
	for (const def of defs) def.attachedStartLine = attachedStarts.get(`${def.file}:${def.startLine}:${def.endLine}`);
	defs.sort((a, b) => a.file.localeCompare(b.file) || a.startLine - b.startLine || b.endLine - a.endLine);
	return defs;
}

const baseName = (name: string) => {
	const segment = name.replace(/<.*$/, "").split("::").pop() ?? name;
	return segment.replace(/^&(?:mut\s+)?/, "");
};

/** Go methods belong to their receiver type. The type is the last identifier, so *pkg.Type matches Type. */
const goReceiver = (d: Definition) =>
	d.language === "go" ? /^func\s*\(\s*(?:\w+\s+)?\*?\s*([\w.]+)/.exec(d.label)?.[1]?.split(".").pop() : undefined;

const encloses = (o: Definition, d: Definition) =>
	o.file === d.file && o.startLine <= d.startLine && o.endLine >= d.endLine && !(o.startLine === d.startLine && o.endLine === d.endLine);

function display(file: string, cwd: string): string {
	const abs = isAbsolute(file) ? file : resolve(cwd, file);
	const rel = relative(cwd, abs);
	return (rel && !rel.startsWith("..") ? rel : abs).replace(/\\/g, "/");
}

function linesOf(file: string, cwd: string, cache: Map<string, string[]>): string[] {
	const abs = isAbsolute(file) ? file : resolve(cwd, file);
	let lines = cache.get(abs);
	if (!lines) {
		lines = readFileSync(abs, "utf8").split(/\r?\n/);
		cache.set(abs, lines);
	}
	return lines;
}

export function formatOutline(defs: Definition[], cwd: string, limit = MAX_OUTLINE): string {
	const out: string[] = [];
	const stack: Definition[] = [];
	for (const d of defs.slice(0, limit)) {
		while (stack.length && (stack[stack.length - 1].file !== d.file || stack[stack.length - 1].endLine < d.endLine)) stack.pop();
		const range = `${d.startLine}-${d.endLine}`.padEnd(11);
		out.push(`${"  ".repeat(stack.length + 1)}${range}${d.label}`);
		stack.push(d);
	}
	if (defs.length > limit) out.push(`  ... ${defs.length - limit} more definitions not shown`);
	return out.join("\n");
}

function formatBodies(defs: Definition[], cwd: string): string {
	const cache = new Map<string, string[]>();
	const parts: string[] = [];
	let total = 0;
	let shown = 0;
	for (const d of defs) {
		if (shown >= MAX_MATCHES || total >= MAX_OUTPUT_CHARS) break;
		const lines = linesOf(d.file, cwd, cache);
		const start = Math.min(d.startLine, d.attachedStartLine ?? d.startLine);
		const end = Math.min(d.endLine, start + MAX_LINES_PER_MATCH - 1);
		let body = lines.slice(start - 1, end).join("\n");
		if (end < d.endLine) body += `\n[truncated: showing lines ${start}-${end} of ${start}-${d.endLine}; read the rest with read offset ${end + 1}]`;
		const part = `${display(d.file, cwd)}:${start}-${d.endLine}\n${body}`;
		parts.push(part);
		total += part.length;
		shown++;
	}
	if (shown < defs.length) {
		parts.push(
			`${defs.length - shown} more definitions with this name:\n` +
				defs.slice(shown).map((d) => `  ${display(d.file, cwd)}:${d.startLine}-${d.endLine}  ${d.label}`).join("\n"),
		);
	}
	return parts.join("\n\n");
}

export async function readSymbol(opts: { cwd: string; path: string; name?: string; signal?: AbortSignal }): Promise<ReadSymbolResult> {
	const target = isAbsolute(opts.path) ? opts.path : resolve(opts.cwd, opts.path);
	const shownPath = display(target, opts.cwd);
	if (!existsSync(target)) throw new Error(`Path not found: ${opts.path}`);
	const singleFile = statSync(target).isFile();
	const supported = LANGUAGES.flatMap((l) => l.extensions).join(" ");
	if (singleFile && !languageOf(target)) {
		return {
			text: `read_symbol supports ${supported}; ${shownPath} is not one of them. Use read for this file.`,
			details: { mode: opts.name ? "lookup" : "outline", path: shownPath, name: opts.name, matches: 0, shown: 0 },
		};
	}
	const name = opts.name?.trim();
	if (!name) {
		if (!singleFile) throw new Error("Give a name to search a directory, or give a single file to list its definitions.");
		const defs = await findDefinitions({ cwd: opts.cwd, target, singleFile, signal: opts.signal });
		const text = defs.length ? `${shownPath}: ${defs.length} definitions\n${formatOutline(defs, opts.cwd)}` : `${shownPath}: no definitions found.`;
		return { text, details: { mode: "outline", path: shownPath, matches: defs.length, shown: Math.min(defs.length, MAX_OUTLINE) } };
	}

	const parts = name.split(/::|\./).filter(Boolean);
	const leaf = parts[parts.length - 1];
	let defs = await findDefinitions({ cwd: opts.cwd, target, name: leaf, singleFile, signal: opts.signal });
	if (parts.length > 1 && defs.length) {
		const owners = new Map<string, Definition[]>();
		for (const owner of new Set(parts.slice(0, -1)))
			owners.set(owner, await findDefinitions({ cwd: opts.cwd, target, name: owner, singleFile, signal: opts.signal }));
		// parts[i] must enclose d, parts[i - 1] must enclose that owner, and so on outward.
		const ownedBy = (d: Definition, i: number): boolean =>
			i < 0 ||
			(i === 0 && goReceiver(d) === parts[0]) ||
			(owners.get(parts[i]) ?? []).some((o) => baseName(o.name) === parts[i] && encloses(o, d) && ownedBy(o, i - 1));
		defs = defs.filter((d) => ownedBy(d, parts.length - 2));
	}
	if (!defs.length) {
		let text = `No definition named ${name} in ${shownPath}.`;
		if (singleFile) {
			const all = await findDefinitions({ cwd: opts.cwd, target, singleFile, signal: opts.signal });
			text += all.length ? ` Definitions in this file:\n${formatOutline(all, opts.cwd, 80)}` : " The file has no definitions read_symbol recognizes.";
		} else {
			text += " Use grep to locate it, then read_symbol on that file.";
		}
		return { text, details: { mode: "lookup", path: shownPath, name, matches: 0, shown: 0 } };
	}
	return {
		text: formatBodies(defs, opts.cwd),
		details: { mode: "lookup", path: shownPath, name, matches: defs.length, shown: Math.min(defs.length, MAX_MATCHES) },
	};
}
