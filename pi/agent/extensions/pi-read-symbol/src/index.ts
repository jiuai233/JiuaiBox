import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readSymbol } from "./symbols.ts";

export default function piReadSymbol(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "read_symbol",
		label: "Read Symbol",
		description:
			"Read the complete definition of a function, method, class, struct, enum, trait, impl block, interface or type by name, with its line range; or, given only a file, list that file's definitions with line ranges. Supports Rust, Python, TypeScript/TSX, JavaScript and Go (via ast-grep).",
		promptSnippet: "Read a whole function/class/impl by name, or list a file's definitions",
		promptGuidelines: [
			"To read a whole function, method, class or impl block, use read_symbol with its name instead of grep context lines or guessed read offsets. grep finds where something is; read_symbol reads it.",
			"Call read_symbol with only a file path to see the file's definitions and their line ranges before reading a large file.",
			"When several definitions share a name, qualify it: Type::method or Class.method.",
		],
		parameters: Type.Object({
			path: Type.String({ description: "File, or directory to search when a name is given" }),
			name: Type.Optional(Type.String({ description: "Definition name, optionally qualified (Type::method, Class.method). Omit to list the file's definitions." })),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const result = await readSymbol({ cwd: ctx.cwd, path: params.path, name: params.name, signal });
			return { content: [{ type: "text", text: result.text }], details: result.details };
		},
	});
}
