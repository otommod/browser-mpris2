#!/bin/sh

TARGET="org.mpris.chrome_host.json"
PROGRAM="$HOME/bin/chrome-mpris2"

curdir="$PWD/$(dirname "$0")"
escaped=$(printf '%s' "$PROGRAM" | sed 's#|#\|#g'; printf x)

msghosts="${XDG_CONFIG_HOME:-$HOME/.config}/chromium/NativeMessagingHosts"
mkdir -p "$msghosts"

sed "s|%PATH%|${escaped%x}|" "$curdir/$TARGET" >"$msghosts/$TARGET"
