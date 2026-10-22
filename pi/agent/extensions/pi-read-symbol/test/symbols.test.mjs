import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readSymbol, parseAstGrepJson, MAX_LINES_PER_MATCH } from "../src/symbols.ts";

const cwd = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const read = (path, name) => readSymbol({ cwd, path, name });

test("Rust: a qualified name picks the method inside the named impl, with its full body", async () => {
	const r = await read("sample.rs", "Point::matched");
	assert.equal(r.details.matches, 1);
	assert.match(r.text, /^sample\.rs:14-16\n    fn matched\(&self\) -> bool \{\n        self\.x > 0\n    \}$/);
	const both = await read("sample.rs", "matched");
	assert.equal(both.details.matches, 2);
});

test("Rust: a type name returns the struct with its doc comment and attributes, and every impl of it", async () => {
	const r = await read("sample.rs", "Point");
	assert.equal(r.details.matches, 3);
	assert.ok(r.text.startsWith("sample.rs:3-7\n/// A point.\n#[derive(Debug, Clone)]\npub struct Point {"));
	assert.match(r.text, /sample\.rs:9-17\nimpl Point \{/);
	assert.match(r.text, /sample\.rs:27-31\nimpl fmt::Display for Point \{/);
});

test("Rust: the outline nests methods under their impl and skips local variables", async () => {
	const r = await read("sample.rs");
	assert.equal(r.details.mode, "outline");
	assert.match(r.text, /\n  9-17       impl Point\n    10-12      pub fn new\(x: i32\) -> Self\n    14-16      fn matched\(&self\) -> bool\n/);
	assert.doesNotMatch(r.text, /helper/);
});

test("Python: decorators come with the definition; Class.method is resolved", async () => {
	const greet = await read("sample.py", "Greeter.greet");
	assert.equal(greet.details.matches, 1);
	assert.ok(greet.text.startsWith("sample.py:14-16\n    @functools.lru_cache(maxsize=None)\n    def greet(self):"));
	const cached = await read("sample.py", "cached");
	assert.ok(cached.text.startsWith("sample.py:19-21\n@functools.cache\ndef cached():"));
});

test("TypeScript: methods, arrow-function constants and plain constants", async () => {
	const area = await read("sample.ts", "Square.area");
	assert.ok(area.text.startsWith("sample.ts:8-10\n  area(): number {"));
	const dbl = await read("sample.ts", "double");
	assert.match(dbl.text, /^sample\.ts:13-13\nexport const double = \(x: number\): number => x \* 2;$/);
	const limit = await read("sample.ts", "LIMIT");
	assert.equal(limit.details.matches, 1);
	const outline = await read("sample.ts");
	assert.match(outline.text, /double/);
	assert.doesNotMatch(outline.text, /LIMIT/);
});

test("Go: methods and type declarations", async () => {
	const inc = await read("sample.go", "Inc");
	assert.ok(inc.text.startsWith("sample.go:7-9\nfunc (c *Counter) Inc() {"));
	const counter = await read("sample.go", "Counter");
	assert.ok(counter.text.startsWith("sample.go:3-5\ntype Counter struct {"));
});

test("Go: Type.method resolves through the receiver, which sits outside the type declaration", async () => {
	const inc = await read("sample.go", "Counter.Inc");
	assert.equal(inc.details.matches, 1);
	assert.ok(inc.text.startsWith("sample.go:7-9\nfunc (c *Counter) Inc() {"));
	assert.equal((await read("sample.go", "Other.Inc")).details.matches, 0);
});

test("every segment of a qualified name must enclose the next one", async () => {
	assert.equal((await read("sample.rs", "Nonexistent::Point::matched")).details.matches, 0);
	const dir = mkdtempSync(join(tmpdir(), "read-symbol-"));
	writeFileSync(join(dir, "nested.rs"), "mod geo {\n    pub struct Point;\n    impl Point {\n        pub fn matched(&self) -> bool {\n            true\n        }\n    }\n}\n\nstruct Point;\nimpl Point {\n    fn matched(&self) -> bool {\n        false\n    }\n}\n");
	const r = await readSymbol({ cwd: dir, path: "nested.rs", name: "geo::Point::matched" });
	assert.equal(r.details.matches, 1);
	assert.ok(r.text.startsWith("nested.rs:4-6\n        pub fn matched(&self) -> bool {"));
});

test("an unknown name returns the file's outline; unsupported files and directories without a name are explained", async () => {
	const miss = await read("sample.rs", "nosuch");
	assert.equal(miss.details.matches, 0);
	assert.match(miss.text, /^No definition named nosuch in sample\.rs\. Definitions in this file:\n/);
	assert.match(miss.text, /pub fn top_level\(\) -> usize/);
	const md = await read("notes.md", "x");
	assert.match(md.text, /is not one of them\. Use read for this file\./);
	await assert.rejects(read(".", undefined), /Give a name to search a directory/);
	await assert.rejects(read("missing.rs", "x"), /Path not found/);
});

test("a directory search finds the definition in whichever file has it", async () => {
	const r = await read(".", "total");
	assert.equal(r.details.matches, 1);
	assert.ok(r.text.startsWith("sample.ts:17-19\nexport function total("));
});

test("TypeScript signatures: interface method, declare function, overloads, and abstract method", async () => {
	const shape = await read("sample.ts", "Shape.area");
	assert.equal(shape.details.matches, 1);
	assert.match(shape.text, /area\(\): number;/);
	assert.doesNotMatch(shape.text, /return this\.side/);
	const openFn = await read("sample.ts", "open");
	assert.equal(openFn.details.matches, 1);
	assert.match(openFn.text, /declare function open\(path: string\): void;/);
	const overloads = await read("sample.ts", "read");
	assert.equal(overloads.details.matches, 3);
	assert.match(overloads.text, /function read\(path: string\): string;/);
	assert.match(overloads.text, /function read\(path: string, encoding: string\): string;/);
	const run = await read("sample.ts", "Base.run");
	assert.equal(run.details.matches, 1);
	assert.match(run.text, /abstract run\(\): void;/);
});

test("Rust: a trait method without a body is readable by qualified name", async () => {
	const draw = await read("sample.rs", "Draw.draw");
	assert.equal(draw.details.matches, 1);
	assert.match(draw.text, /fn draw\(&self\);/);
});

test("Rust: impl &Type and impl &mut Type match the qualified method name", async () => {
	const method = await read("sample.rs", "Foo::method");
	assert.equal(method.details.matches, 1);
	assert.match(method.text, /fn method\(&self\) -> bool/);
	const methodMut = await read("sample.rs", "Foo::method_mut");
	assert.equal(methodMut.details.matches, 1);
	assert.match(methodMut.text, /fn method_mut\(&mut self\)/);
});

test("Go: a package-qualified receiver matches Type.Method", async () => {
	const box = await read("sample.go", "Box.Inc");
	assert.equal(box.details.matches, 1);
	assert.match(box.text, /func \(c \*other\.Box\) Inc\(\)/);
	assert.equal((await read("sample.go", "Counter.Inc")).details.matches, 1);
});

test("multi-line decorators, multi-line attributes, and blank lines between decorators are included", async () => {
	const foo = await read("multi.py", "foo");
	assert.equal(foo.details.matches, 1);
	assert.match(foo.text, /^multi\.py:\d+-\d+\n@decorator\(\n    a=1,\n\n    b=2,\n\)\ndef foo\(\):/);
	const struct = await read("multi.rs", "Foo");
	assert.equal(struct.details.matches, 1);
	assert.match(struct.text, /^multi\.rs:\d+-\d+\n#\[derive\(\n    Debug,\n    Clone,\n\)\]\nstruct Foo \{/);
	const bar = await read("gap.py", "bar");
	assert.equal(bar.details.matches, 1);
	assert.match(bar.text, /^gap\.py:\d+-\d+\n@first\n\n@second\n\ndef bar\(\):/);
});

test("ordinary comments and unrelated blank lines are not attached to the definition", async () => {
	const dir = mkdtempSync(join(tmpdir(), "read-symbol-comment-"));
	try {
		writeFileSync(join(dir, "c.ts"), "// keep out\n\nexport function kept(): void {}\n");
		writeFileSync(join(dir, "stop.ts"), "@dec\n// stop\nexport function stopped(): void {}\n");
		const kept = await readSymbol({ cwd: dir, path: "c.ts", name: "kept" });
		assert.equal(kept.details.matches, 1);
		assert.doesNotMatch(kept.text, /keep out/);
		assert.match(kept.text, /^c\.ts:\d+-\d+\nexport function kept\(\)/);
		const stopped = await readSymbol({ cwd: dir, path: "stop.ts", name: "stopped" });
		assert.equal(stopped.details.matches, 1);
		assert.doesNotMatch(stopped.text, /@dec/);
		assert.doesNotMatch(stopped.text, /\/\/ stop/);
		assert.match(stopped.text, /export function stopped\(\)/);
	} finally {
		try {
			rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
		} catch (err) {
			if (err?.code !== "EPERM" && err?.code !== "EBUSY") throw err;
		}
	}
});

test("invalid ast-grep JSON reports stderr and the exit code", () => {
	assert.throws(() => parseAstGrepJson("{not", "warn: partial", 0), (err) => {
		assert.equal(err.name, "Error");
		assert.match(err.message, /exit 0/);
		assert.match(err.message, /stderr: warn: partial/);
		return true;
	});
	assert.deepEqual(parseAstGrepJson("   ", "ignored", 3), []);
});

test("aborting a scan rejects with the abort error, not a JSON parse error", { timeout: 60_000 }, async () => {
	const dir = mkdtempSync(join(tmpdir(), "read-symbol-abort-"));
	try {
		for (let i = 0; i < 500; i++) writeFileSync(join(dir, `f${i}.rs`), `fn item_${i}() -> i32 {\n    ${i}\n}\n`.repeat(20));
		const controller = new AbortController();
		const pending = readSymbol({ cwd: dir, path: ".", name: "item_0", signal: controller.signal });
		setTimeout(() => controller.abort(), 20);
		await assert.rejects(pending, (err) => {
			assert.equal(err.name, "AbortError");
			assert.notEqual(err.name, "SyntaxError");
			assert.ok(!(err instanceof SyntaxError));
			return true;
		});
	} finally {
		try {
			rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
		} catch (err) {
			if (err?.code !== "EPERM" && err?.code !== "EBUSY") throw err;
		}
	}
});

test("very long definitions are cut with a pointer to the rest", async () => {
	const dir = mkdtempSync(join(tmpdir(), "read-symbol-"));
	const body = Array.from({ length: MAX_LINES_PER_MATCH + 50 }, (_, i) => `    let v${i} = ${i};`).join("\n");
	writeFileSync(join(dir, "long.rs"), `fn long() {\n${body}\n}\n`);
	const r = await readSymbol({ cwd: dir, path: "long.rs", name: "long" });
	assert.match(r.text, new RegExp(`\\[truncated: showing lines 1-${MAX_LINES_PER_MATCH} of 1-${MAX_LINES_PER_MATCH + 52}; read the rest with read offset ${MAX_LINES_PER_MATCH + 1}\\]$`));
});
