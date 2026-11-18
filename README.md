# herdr-preview

A **Preview** panel for [Herdr](https://herdr.dev) desktop, next to Files and Changes.
It renders `.html`, `.md` and `.svg` files with real Chromium, right inside Herdr,
and re-renders them every time you save.

[한국어 설명은 아래에 있어요.](#한국어)

```
┌ tabs ───────────────────────────── + │ Files │ Changes │ Preview ┐
│                                      │ Preview  README.md  Reload │
│   your agent / terminal              │ ┌────────────────────────┐ │
│                                      │ │  rendered page         │ │
│                                      │ │  (Chromium)            │ │
│                                      │ └────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

## How it works

Herdr's mods can't embed a web view, but Herdr's terminals speak the kitty
graphics protocol. [terminal-browser](https://github.com/zenbu-labs/terminal-browser)
runs Chromium (Electron, offscreen) and draws it into a terminal. herdr-preview
puts one long-lived terminal in a new panel and drives terminal-browser in it.

| Piece | What it does |
|---|---|
| `mods/hp-preview` | The panel's header (file name, Reload, Browser, Close). Renders Markdown to a GitHub-styled HTML page, watches the file, tells the panel what to show. |
| `bin/hp-browser` | Runs in the panel's terminal and never exits (Herdr removes a layout terminal block whose program ends). Starts and restarts terminal-browser on the requested file. |
| `bin/hp-preview` | `hp-preview open <file>` / `hp-preview close` from any shell or agent. |
| `mods/hp-files` | Herdr's Files panel plus a **Preview** button for `.html`/`.md`/`.svg` files. |
| `mods/hp-tabs` | Herdr's tab bar plus the **Preview** panel button. |
| `layouts/preview.json` | Herdr's main layout with the panels above. |

## Requirements

- Herdr desktop on macOS (tested with 0.1.16)
- [terminal-browser](https://github.com/zenbu-labs/terminal-browser): `brew install terminal-browser`

## Install

```sh
git clone https://github.com/CenCiviC/herdr-preview.git
cd herdr-preview
./install.sh
```

The installer copies the mods and the `preview` layout into `~/.config/herdr-app`,
puts `hp-browser` and `hp-preview` in `~/.local/bin`, starts the panel's terminal
and switches Herdr to the `preview` layout. Run it again to update.
`./uninstall.sh` removes everything and switches back to `main`.

## Use

- **Files → open an `.html` or `.md` file → Preview.** The panel switches to Preview.
- **From a terminal or an agent:** `hp-preview open docs/plan.html` (a URL works too: `hp-preview open http://localhost:3000`)
- Saving the file re-renders it. **Reload** forces it, **Browser** opens the file
  in your default browser, **Close** clears the panel.
- Click inside the page to scroll, click links, and use the page (it is a real browser).

## Tuning

`hp-browser` reads `~/.config/herdr-preview/env` (a shell file) before starting
terminal-browser. Useful settings:

```sh
# Herdr reports its terminal size in logical pixels; herdr-preview renders at 1x
# so pages show at normal size. 2 renders sharper but twice as large.
PIXEL_DISPLAY_SCALE=1
# How frames reach Herdr: auto (default), shared, file or inline.
TERMINAL_BROWSER_FRAMES=auto
# How frames are sent: auto (default) or full. "patched" draws wrong in Herdr desktop 0.1.16.
TERMINAL_BROWSER_PRESENT=auto
```

Delete the file to go back to the defaults. Changes apply to the next preview.

## Notes

- herdr-preview sets `TERMINAL_BROWSER_NO_TELEMETRY=1` for the browsers it starts.
- The `preview` layout is a copy of Herdr's `main` layout. If a Herdr update changes
  `main`, re-run `./install.sh` after updating this repo.
- Markdown is rendered with [marked](https://github.com/markedjs/marked) and
  [github-markdown-css](https://github.com/sindresorhus/github-markdown-css), bundled,
  so it works offline.

---

## 한국어

[Herdr](https://herdr.dev) 데스크톱의 Files, Changes 옆에 **Preview** 패널을 추가해요.
`.html`, `.md`, `.svg` 파일을 Herdr 안에서 실제 Chromium으로 렌더링하고, 저장할 때마다 다시 그려요.

### 설치

```sh
brew install terminal-browser
git clone https://github.com/CenCiviC/herdr-preview.git
cd herdr-preview
./install.sh
```

### 사용법

- **Files에서 `.html`이나 `.md` 파일을 열고 Preview 버튼을 누르면** 오른쪽 패널이 Preview로 바뀌어요.
- **터미널이나 에이전트에서는** `hp-preview open <파일>`로 열 수 있어요.
- 파일을 저장하면 자동으로 다시 렌더링돼요. Reload는 강제로 새로고침, Browser는 기본 브라우저로 열기, Close는 패널 비우기예요.
- 실제 브라우저라서 패널 안에서 스크롤, 링크 클릭, JS 동작이 모두 돼요.

### 동작 방식

Herdr의 mod는 웹뷰를 쓸 수 없지만, Herdr 터미널은 Kitty 그래픽 프로토콜을 지원해요.
terminal-browser가 Chromium 화면을 터미널에 직접 그리기 때문에, Preview 패널에 상주 터미널을 하나 두고
그 안에서 terminal-browser를 띄우는 방식이에요.

## License

Apache-2.0. See `NOTICE` for bundled third-party code.
