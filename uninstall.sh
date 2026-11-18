#!/usr/bin/env bash
# Removes herdr-preview and switches Herdr back to its main layout.
set -euo pipefail
app_home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
bin_dir="${HERDR_PREVIEW_BIN:-$HOME/.local/bin}"
if command -v herdr-app >/dev/null 2>&1 && herdr-app status >/dev/null 2>&1; then
  herdr-app do layout.switch --name main >/dev/null || true
fi
for name in hp-files hp-tabs hp-preview; do rm -rf "${app_home:?}/mods/$name"; done
rm -f "$app_home/layouts/preview.json" "$bin_dir/hp-browser" "$bin_dir/hp-preview"
echo "Removed herdr-preview."
