import { statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const inline = new RegExp([
  String.raw`!?\[(?:\\.|[^\]\\])*\](?:\(((?:\\.|\([^()]*\)|[^()\\])*)\)|\[[^\]]*\])?`,
  String.raw`<[^<>]+>|(?:[a-z][a-z\d+.-]*://|mailto:)[^\s<>\x60]+`,
  String.raw`(?<!\x60)(?<ticks>\x60+)(?!\x60)(.+?)\k<ticks>(?!\x60)`,
  String.raw`(?<![\p{L}\p{N}_@.+%~:/\\-])([\p{L}\p{N}_@.+%-]+(?:/[\p{L}\p{N}_@.+%-]+)*(?::\d+(?::\d+)?)?)(?![\p{L}\p{N}_@.+%:/\\-])`,
].join("|"), "giu");

function linkPaths(markdown: string, cwd: string): string {
  const urls = new Map<string, string | undefined>();
  function urlFor(label: string) {
    const name = label.replace(/:\d+(?::\d+)?$/, "");
    if (!name || isAbsolute(name) || /[:\\\p{Cc}]/u.test(name)) return;
    if (!urls.has(name)) {
      const path = resolve(cwd, name);
      const fromRoot = relative(cwd, path);
      const inProject = fromRoot && fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`);
      const exists = inProject && statSync(path, { throwIfNoEntry: false })?.isFile();
      urls.set(name, exists ? pathToFileURL(path).href : undefined);
    }
    return urls.get(name);
  }

  function webUrlFor(label: string) {
    if (!/^https?:\/\/[^\s<>\p{Cc}]+$/iu.test(label)) return;
    try {
      const url = new URL(label);
      if ((url.protocol === "http:" || url.protocol === "https:") && url.hostname) return label;
    } catch {}
  }

  function urlForDestination(raw: string) {
    const target = raw.trim();
    const wrapped = target.startsWith("<") && target.endsWith(">");
    const path = wrapped ? target.slice(1, -1) : target;
    if ((!wrapped && /\s/.test(path)) || /[?#]/.test(path)) return;
    let decoded: string;
    try { decoded = decodeURIComponent(path); } catch { return; }
    if (decoded.startsWith("//")) return;
    return isAbsolute(decoded)
      ? urlFor(relative(cwd, decoded)) ?? urlFor(decoded.slice(1))
      : urlFor(decoded);
  }

  let fence = "";
  return markdown.split("\n").map((line) => {
    const block = line.replace(/^(?: {0,3}> ?)+/, "");
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(block);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = "";
      return line;
    }
    if (marker) {
      fence = marker[1];
      return line;
    }
    if (/^(?: {4}|\t| {0,3}\[[^\]]+\]:)/.test(block)) return line;

    return line.replace(inline, (raw, destination, _ticks, code, plain) => {
      if (destination !== undefined && !raw.startsWith("!")) {
        const href = urlForDestination(destination);
        if (href) return `${raw.slice(0, -destination.length - 1)}<${href}>)`;
      }
      if (!code && (!plain || !/[./]/.test(plain))) return raw;
      const label = code?.trim() ?? plain.replace(/\.+$/, "");
      const href = urlFor(label) ?? (code ? webUrlFor(label) : undefined);
      if (!href) return raw;
      const text = label.replace(/[\\[\]`*_]/g, "\\$&");
      return `[${text}](<${href}>)${plain ? plain.slice(label.length) : ""}`;
    });
  }).join("\n");
}

export default function (pi: ExtensionAPI) {
  let cwd = process.cwd();
  pi.on("session_start", (_event, ctx) => { cwd = ctx.cwd; });
  pi.registerMarkdownTransformer((markdown, { isStreaming }) =>
    isStreaming ? markdown : linkPaths(markdown, cwd), { messageTypes: ["assistant"] });
}
