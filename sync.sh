#!/bin/sh
# Copy the LiveView mod from Claude's mods folder into this repo.
SRC="$HOME/.claude/mods/live-view"
[ -d "$SRC" ] || SRC="$(ls -d "$HOME"/.claude/dev-mods/*/live-view | head -1)"
rsync -a --delete --exclude '.claude-plugin/types' --exclude '.claude-plugin/marketplace.json' --exclude CLAUDE.md --exclude node_modules "$SRC"/ "$(dirname "$0")/live-view/"
