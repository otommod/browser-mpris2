# browser-mpris2
Implements the MPRIS2 interface for Chromium-based (Chrome, Opera, Brave) and Firefox browsers.

Currently, the following sites are supported with almost all of the capabilities MPRIS2 allows:
* [YouTube](https://youtube.com)
* [SoundCloud](https://soundcloud.com)

Pull requests are welcome.

## Installation (for Chromium-based)
1. First, in the browser, go to `Tools > Extensions` (or `about://extensions`), enable `Developer mode` and `Load unpacked extension...` with the root of this repo.  Notice, the extension ID.
2. Next, place [chrome-mpris2](native/chrome-mpris2) somewhere in your `$PATH` and run [install-chrome.py](native/install-chrome.py) giving it the extension ID and optionally the path (not just the directory) of your just-installed chrome-mpris2 (defaults to `~/bin/chrome-mpris2`).  This will check that you have all the dependencies and tell the browser about chrome-mpris2 (so that the plugin can use it).
3. ???
4. Profit

If on GNOME or similar you should be able to take advantage of your new powers immediately.  Otherwise, you can use something like [playerctl](https://github.com/acrisci/playerctl), perhaps bind it to a key or `XF86AudioPlay` and the like if your keyboard has them.
## Similar Projects
* [plasma-browser-integration](https://github.com/KDE/plasma-browser-integration)
  It's more general as it works on `<audio>` and `<video>` elements, though it misses out on some of the more "advanced" capabilities, such as cover art support.
* [shwsh/web-mpris2](https://github.com/shwsh/web-mpris2)
  A port of this extension to Tampermonkey/Greasemonkey (and WebSockets).

## TODO
* Support the (supposedly experimental) [Media Session API](https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API) that sites can use to set metadata.  plasma-browser-integration uses where available.
