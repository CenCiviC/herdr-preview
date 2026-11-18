// herdr-preview: a Preview panel beside Files and Changes.
//
// The panel is a column of two blocks (see layouts/preview.json):
//   preview-bar   this mod: file name, Reload, Browser, Close
//   preview-view  a terminal block bound to the terminal *named* "hp-preview"
//
// The layout never changes. Previewing a file replaces the hp-preview terminal:
// the old one is killed and a new one with the same name runs bin/hp-browser,
// which starts terminal-browser (real Chromium, drawn with kitty graphics).
// With nothing to show, hp-browser runs in idle mode and prints a hint.
//
// Requests come from Files (hp-files) through shared("hp-preview.request"), and
// from the `hp-preview open <file>` command through request.json in the cache.
import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import {
  exec, hc, readTextFile, writeTextFile, watchFolder, theme, home, appHome,
  shared, setShared, terminals, run,
} from "herdr";

const NAME = "hp-preview";
const REQUEST = "hp-preview.request";
const MD = new Set(["md", "markdown", "mdown", "mkd", "mdx"]);
const FRESH_MS = 10000;

const ext = (p) => (p.includes(".") ? p.split(".").pop().toLowerCase() : "");
const dirname = (p) => p.replace(/\/[^/]*$/, "") || "/";
const basename = (p) => p.split("/").pop();
const bin = () => `${home()}/.local/bin/hp-browser`;

// Perceived lightness of a #rrggbb theme color.
function isLight(hex) {
  const m = /^#?([0-9a-f]{6})/i.exec(hex ?? "");
  if (!m) return true;
  const n = parseInt(m[1], 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.5;
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fileUrl = (p) => "file://" + p.split("/").map(encodeURIComponent).join("/");

async function vendor(name) {
  return (await readTextFile(`${appHome()}/mods/hp-preview/vendor/${name}`)) ?? "";
}

// A self-contained page: the Markdown is embedded as JSON and rendered by marked
// in the page; <base> makes relative links and images resolve next to the source.
async function markdownPage(source) {
  const text = (await readTextFile(source)) ?? "";
  const light = isLight(theme().background);
  const [marked, css] = await Promise.all([
    vendor("marked.min.js"),
    vendor(light ? "github-markdown-light.css" : "github-markdown-dark.css"),
  ]);
  const safe = (s) => s.replace(/<\/script/gi, "<\\/script");
  const bg = light ? "#ffffff" : "#0d1117";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<base href="${escapeHtml(fileUrl(dirname(source)))}/">
<title>${escapeHtml(basename(source))}</title>
<style>${css}
html,body{margin:0;background:${bg}}
.markdown-body{box-sizing:border-box;max-width:980px;margin:0 auto;padding:32px 40px}
@media (max-width:640px){.markdown-body{padding:16px}}
</style></head>
<body><article class="markdown-body" id="content"></article>
<script>${safe(marked)}</script>
<script>
const source = ${safe(JSON.stringify(text))};
document.getElementById("content").innerHTML = marked.parse(source, { gfm: true });
</script></body></html>`;
}

async function cacheDir() {
  const dir = `${home()}/Library/Caches/herdr-preview`;
  await exec("mkdir", ["-p", dir]);
  return dir;
}

async function writeFile(path, text) {
  const before = await readTextFile(path).catch(() => null);
  if (before === text) return;
  await writeTextFile(path, text, before);
}

const previewTerminal = () => terminals().find((t) => t.name === NAME && t.state !== "finished");

export default class Preview extends View {
  init(_props, cx) {
    // Requests from before this copy started are history, unless they are what
    // just opened the panel.
    const request = shared(REQUEST);
    this.handled = request?.seq && Date.now() - request.seq > FRESH_MS ? request.seq : 0;
    this.file = null;
    this.busy = false;
    this.status = "";
    this.lastStart = 0;
    cx.timer.every(250, (cx) => this.tick(cx));
    this.listen(cx);
  }

  tick(cx) {
    if (this.busy) return;
    const request = shared(REQUEST);
    if (request?.seq && request.seq > this.handled) {
      this.handled = request.seq;
      this.start(request.file, cx);
      return;
    }
    // A fresh core has no hp-preview terminal: start one (checked every few seconds).
    if (!previewTerminal() && Date.now() - this.lastStart > 3000 && !this.checking) {
      this.checking = true;
      cx.spawn(async (cx) => {
        try { await this.ensureTerminal(); } catch (e) { this.status = `Preview failed: ${e}`; }
        finally { this.checking = false; this.lastStart = Date.now(); cx.notify(); }
      });
    }
  }

  // `hp-preview open <file>` writes request.json; mod commands take no arguments.
  listen(cx) {
    cx.spawn(async (cx) => {
      const dir = await cacheDir();
      const path = `${dir}/request.json`;
      const read = async () => {
        try { return JSON.parse((await readTextFile(path)) ?? "null"); } catch { return null; }
      };
      const first = await read();
      this.cliSeq = first?.seq && Date.now() - first.seq > FRESH_MS ? first.seq : 0;
      for (let initial = true; ; initial = false) {
        if (!initial) {
          let changed;
          try { changed = await watchFolder(dir); } catch { return; }
          if (changed?.length && !changed.some((p) => p === path || p === dir)) continue;
        }
        const request = await read();
        if (!request?.seq || request.seq <= this.cliSeq) continue;
        this.cliSeq = request.seq;
        setShared(REQUEST, { file: request.action === "close" ? null : request.file, seq: Date.now() });
        cx.notify();
      }
    });
  }

  async target(file) {
    if (!MD.has(ext(file))) return file;
    const page = `${await cacheDir()}/${basename(file).replace(/[^\w.-]+/g, "_")}-${hash(file)}.html`;
    await writeFile(page, await markdownPage(file));
    return page;
  }

  // Point the panel at `file` (null: the idle hint). bin/hp-browser, running in
  // the hp-preview terminal, picks the state file up and restarts terminal-browser.
  start(file, cx) {
    this.busy = true;
    this.status = file ? "Rendering…" : "";
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await this.ensureTerminal();
        const target = file ? await this.target(file) : "";
        await writeFile(`${await cacheDir()}/target`, `${Date.now()}\t${target}`);
        this.file = file;
        this.status = "";
        if (file) this.watch(file, cx);
      } catch (e) {
        this.status = `Preview failed: ${e}`;
      } finally {
        this.lastStart = Date.now();
        this.busy = false;
        cx.notify();
      }
    });
  }

  // The panel's terminal block shows the terminal named hp-preview. Herdr drops
  // a layout terminal block whose program ends, so hp-browser never exits; this
  // only starts it when it is missing (a fresh core), then re-attaches the block,
  // which attaches by name once, when it shows.
  async ensureTerminal() {
    const r = await hc(["ls", "--json"]);
    const live = JSON.parse(r.stdout || "{}").terminals ?? [];
    if (live.some((t) => t.name === NAME)) return;
    const run1 = await hc(["run", "--json", "--bg", "--no-parent", "--name", NAME, "--label", "herdr-preview=1",
      "--cwd", home(), "--", bin()]);
    if (run1.code !== 0) throw new Error((run1.stderr || run1.stdout || "hc run failed").trim());
    run("layout.hide", { id: "preview-view" });
    await exec("sleep", ["0.2"]);
    run("layout.show", { id: "preview-view" });
  }

  // Re-render when the previewed file changes on disk.
  watch(file, cx) {
    const dir = dirname(file);
    if (this.watching === dir) return;
    this.watching = dir;
    cx.spawn(async (cx) => {
      while (this.watching === dir) {
        let changed;
        try { changed = await watchFolder(dir); } catch { this.watching = null; return; }
        const current = this.file;
        if (!current || dirname(current) !== dir) continue;
        if (changed?.length && !changed.includes(current)) continue;
        this.request(current, cx);
      }
    });
  }

  request(file, cx) {
    setShared(REQUEST, { file, seq: Date.now() });
    cx.notify();
  }

  render(_cx) {
    const t = theme();
    const file = this.file;
    const button = (id, label, onClick) => h_flex().id(id).h(24).px(8).items_center().rounded(6).flex_none()
      .text_size(12).text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => onClick(cx)).child(label);
    return h_flex().id("hp-bar").size_full().px(12).gap(6).items_center().bg(t.background)
      .border_b(1).border_color(t.border).text_color(t.foreground).text_size(13)
      .child(div().font_semibold().flex_none().child("Preview"))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim)
        .child(this.status || (file ? basename(file) : "")))
      .when(Boolean(file), (el) => el
        .child(button("hp-reload", "Reload", (cx) => this.request(file, cx)))
        .child(button("hp-external", "Browser", () => exec("open", [file]).catch(() => {})))
        .child(button("hp-close", "Close", (cx) => { this.watching = null; this.request(null, cx); })));
  }
}
