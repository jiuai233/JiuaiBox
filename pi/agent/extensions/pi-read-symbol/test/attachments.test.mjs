import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSymbol } from "../src/symbols.ts";

const cwd = mkdtempSync(join(tmpdir(), "read-symbol-attachments-"));
after(() => rmSync(cwd, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
const read = async (path, name, source) => {
	writeFileSync(join(cwd, path), source);
	return readSymbol({ cwd, path, name });
};

// Compare the entire source slice, so losing either an attachment or the body fails.
function fullSource(result, path) {
	const source = readFileSync(join(cwd, path), "utf8").trimEnd();
	assert.equal(result.details.matches, 1);
	assert.equal(result.text, `${path}:1-${source.split("\n").length}\n${source}`);
}

test("Python: a previous definition's docstring is not a decorator of the next definition", async () => {
	const r = await read("docstring.py", "later", 'def earlier():\n    """Example syntax:\n    @decorator(\n    """\n    return 1\n\ndef later():\n    return 2\n');
	assert.equal(r.details.matches, 1);
	assert.equal(r.text, "docstring.py:7-8\ndef later():\n    return 2");
});

test("Python: triple-quoted decorator arguments preserve the complete decorated definition", async () => {
	const r = await read("triple.py", "triple", '@decorate(\n    text="""Some ", then ) and text\n    second line""",\n)\ndef triple():\n    return 1\n');
	fullSource(r, "triple.py");
});

test("Python: decorators longer than 80 lines use the existing definition output bound", async () => {
	const options = Array.from({ length: 85 }, (_, i) => `    option_${i}=${i},`).join("\n");
	const r = await read("long.py", "long_decorated", `@decorate(\n${options}\n)\ndef long_decorated():\n    return 1\n`);
	fullSource(r, "long.py");
});

test("Rust: block-comment brackets, stacked attributes and intervening blank lines are preserved", async () => {
	const r = await read("block.rs", "Block", "#[custom(\n    /* a comment with ) ] */\n    value\n)]\n\n/// A block.\n#[derive(Debug)]\n\nstruct Block;\n");
	fullSource(r, "block.rs");
});

test("Rust: lifetime tokens cannot attach an earlier item's attribute to a later function", async () => {
	const r = await read("lifetime.rs", "later", "#[borrow('a)]\nstruct First<'a> { value: &'a str }\n\nfn later() {}\n");
	assert.equal(r.details.matches, 1);
	assert.equal(r.text, "lifetime.rs:4-4\nfn later() {}");
	const first = await readSymbol({ cwd, path: "lifetime.rs", name: "First" });
	assert.match(first.text, /^lifetime\.rs:1-2\n#\[borrow\('a\)\]/);
});

test("TS/TSX/JS: multiline class and method decorator nodes belong to the selected definition", async () => {
	const source = "@decorate({\n    text: `) ]`,\n})\n\n@other\nexport class Svc {\n    @method(\n        /* ) ] */ 1,\n    )\n\n    @second\n    run() {}\n\n    later() {}\n}\n";
	for (const extension of ["ts", "tsx", "js"]) {
		const path = `decorators.${extension}`;
		const r = await read(path, "Svc", source);
		fullSource(r, path);
		const method = await readSymbol({ cwd, path, name: "Svc.run" });
		assert.equal(method.details.matches, 1);
		assert.equal(method.text, `${path}:7-12\n${source.split("\n").slice(6, 12).join("\n")}`);
		const later = await readSymbol({ cwd, path, name: "Svc.later" });
		assert.equal(later.details.matches, 1);
		assert.equal(later.text, `${path}:14-14\n    later() {}`);
	}
});
