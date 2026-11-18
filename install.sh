#!/usr/bin/env bash
# Installs herdr-preview into Herdr desktop: the hp-* mods, the "preview" layout,
# and the hp-browser / hp-preview commands. Run it again to update.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
app_home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
bin_dir="${HERDR_PREVIEW_BIN:-$HOME/.local/bin}"

if [ ! -d "$app_home" ]; then
  echo "Herdr desktop's home ($app_home) was not found. Install and open Herdr first: https://herdr.dev" >&2
  exit 1
fi
if ! command -v terminal-browser >/dev/null 2>&1; then
  echo "terminal-browser is not installed. Install it first:" >&2
  echo "  brew install terminal-browser" >&2
  echo "  # or: curl -fsSL https://terminal-browser.sh/install | bash" >&2
  exit 1
fi

running=false
if command -v herdr-app >/dev/null 2>&1 && herdr-app status >/dev/null 2>&1; then running=true; fi

# Herdr drops a layout terminal block whose program ends. Restarting the panel's
# program (to pick up a new hp-browser) happens with the preview layout hidden.
if $running && herdr-app status | grep -q '"layout": "preview"'; then
  herdr-app do layout.switch --name main >/dev/null
fi
if command -v hc >/dev/null 2>&1; then hc kill hp-preview >/dev/null 2>&1 || true; fi

mkdir -p "$app_home/mods" "$app_home/layouts" "$bin_dir"
for mod in "$here"/mods/hp-*; do
  name="$(basename "$mod")"
  rm -rf "${app_home:?}/mods/$name"
  cp -R "$mod" "$app_home/mods/$name"
done

layout="$app_home/layouts/preview.json"
if [ -f "$layout" ] && ! cmp -s "$here/layouts/preview.json" "$layout"; then
  cp "$layout" "$layout.bak"
fi
cp "$here/layouts/preview.json" "$layout"

install -m 755 "$here/bin/hp-browser" "$bin_dir/hp-browser"
install -m 755 "$here/bin/hp-preview" "$bin_dir/hp-preview"

# The panel's terminal must exist before the layout first shows it.
if command -v hc >/dev/null 2>&1; then
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    hc run --bg --no-parent --name hp-preview --label herdr-preview=1 --cwd "$HOME" -- "$bin_dir/hp-browser" >/dev/null 2>&1 && break
    sleep 0.2
  done
fi

echo "Installed herdr-preview into $app_home"
if $running; then
  herdr-app do layout.switch --name preview >/dev/null && echo "Switched Herdr to the \"preview\" layout."
else
  echo "Open Herdr and pick the \"preview\" layout (Settings → Look)."
fi
