# chrome-mpris2
Implements the MPRIS2 interface for Chrome.

Currently, the following sites are supported with almost all of the capabilities MPRIS2 allows:
* [YouTube](https://youtube.com)

So, only YouTube because that's the one that I personally care about.  Pull requests are welcome.

## Installation
1. First, in Chrome, go to `Tools > Extensions` (or `chrome://extensions`), enable `Developer mode` and `Load unpacked extension...` with the root of this repo.  Notice, the extension ID.
2. Next, place [chrome-mpris2](native/chrome-mpris2) somewhere in your `$PATH` and run [install.py](native/install.py) giving it the extension ID and optionally the path (not just the directory) of your just-installed chrome-mpris2 (defaults to `~/bin/chrome-mpris2`).  This will check that you have all the dependencies and tell Chrome about chrome-mpris2 (so that the plugin can use it).
3. ???
4. Profit

If on GNOME or similar you should be able to take advantage of your new powers immediately.  Otherwise, you can use something like [playerctl](https://github.com/acrisci/playerctl), perhaps bind it to a key or `XF86AudioPlay` and the like if your keyboard has them.
