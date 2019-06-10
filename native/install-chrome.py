#!/usr/bin/env python3

import json
import os
import sys

XDG_CONFIG_HOME = os.environ.get("XDG_CONFIG_HOME",
                                 default=os.path.expanduser("~/.config"))

BROWSERS = [
    os.path.join(XDG_CONFIG_HOME, "chromium"),
    os.path.join(XDG_CONFIG_HOME, "google-chrome"),
    os.path.join(XDG_CONFIG_HOME, "opera"),
    os.path.join(XDG_CONFIG_HOME, "BraveSoftware/Brave-Browser"),
]


def die(msg):
    print(msg, file=sys.stderr)
    sys.exit(1)


def main(args):
    if len(args) < 1:
        die("You must provide at least the extension ID")
    elif len(args) < 2:
        args.append(os.path.expanduser("~/bin/chrome-mpris2"))

    ext_id = args[0]
    prog_path = args[1]

    # Chrome's extension IDs are in hexadecimal but using a-p, referred
    # internally as "mpdecimal".            https://stackoverflow.com/a/2050916
    if not all(97 <= ord(c) <= 112 for c in ext_id):
        die("Not valid extension ID")

    # Check that python-gobject is available.  This is done because it's hard
    # to see if chrome-mpris2 fails with an import error; you'd need to check
    # the X log.  Of course it's possible that any dependencies met during
    # installation are unavailable later but what can you do.
    try:
        from gi.repository import GLib, Gio
    except ImportError:
        die("Required dependency python-gobject not found")

    # Before that, Gio couldn't publish DBus objects (introspection bug)
    if (GLib.MAJOR_VERSION, GLib.MINOR_VERSION) < (2, 46):
        die("Your GLib version is too old")

    manifest = {
        "name": "org.mpris.browser_host",
        "description": "A DBus service",
        "path": prog_path,
        "type": "stdio",
        "allowed_origins": [
            "chrome-extension://" + ext_id + "/",
        ]
    }

    for browser in BROWSERS:
        if not os.path.exists(browser):
            continue
        message_hosts = os.path.join(browser, "NativeMessagingHosts")
        manifest_path = os.path.join(message_hosts, "org.mpris.browser_host.json")

        os.makedirs(message_hosts, exist_ok=True)
        with open(manifest_path, "w") as f:
            json.dump(manifest, f)


if __name__ == "__main__":
    main(sys.argv[1:])
