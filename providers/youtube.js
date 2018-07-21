"use strict";

// Lifesaver: https://stackoverflow.com/a/34100952

class Playlist {
    constructor({ loop=false, shuffle=false }={}) {
        this.id = "";
        this.index = -1;
        this.length = 0;
        this.loop = loop;
        this.shuffle = shuffle;
    }
}


class EventObserver {
    constructor(element, event, handler) {
        this.element = element;
        this.event = event;
        this.handler = handler

        element.addEventListener(event, this.handler);
    }

    disconnect() {
        this.element.removeEventListener(this.event, this.handler);
    }
}


let videoElement;

let video;
let playlist = new Playlist();

let prevUrl;
let observers = [];

function isVideo(url=location) {
    return url.pathname.startsWith("/watch");
}

function loopStatus() {
    if (videoElement.loop)
        return "Track";
    if (playlist.length && playlist.loop)
        return "Playlist";
    return "None";
}

function enterVideo() {
    let video = {
        id: (new URL(location)).searchParams.get("v"),
        "xesam:url": location.href,
        "xesam:title": $("title").text().slice(0, -10),
    };
    video["mpris:artUrl"] = `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;

    const eventHandlers = {
        play() { update({ PlaybackStatus: "Playing" }); },
        playing() { update({ PlaybackStatus: "Playing" }); },
        pause() { update({ PlaybackStatus: "Paused" }); },
        ended() { update({ PlaybackStatus: "Stopped" }); },

        // when a seek operation completes
        // FIXME: it seems that YouTube is "sending" too many seeked events
        // e.g., according to mpris Playing from the beginning after being
        // Stopped should not be considered a Seek, yet YouTube does send a
        // seeked event and we propagate that to DBus as well
        seeked(e) { update({ seekedTo: Math.trunc(e.target.currentTime * 1e6)  }); },

        // when the playback speed changes
        ratechange(e) { update({ Rate: e.target.playbackRate }); },

        // a change in the duration of the media
        durationchange(e) { update({ "mpris:length": Math.trunc(e.target.duration * 1e6)  }); },

        // when the audio volume changes or is muted
        volumechange(e) { update({ Volume: e.target.muted ? 0.0 : e.target.volume }); },
    };

    videoElement = $("video").get(0);
    for (let [event, handler] of Object.entries(eventHandlers))
        observers.push(new EventObserver(videoElement, event, handler));

    const loopObserver = new MutationObserver(muts => {
        muts.forEach(m => update({ LoopStatus: loopStatus() }));
    });
    loopObserver.observe(videoElement, {
        subtree: false,
        attributes: true,
        attributeFilter: ["loop"],
    });
    observers.push(loopObserver);

    observers.push(new EventObserver(document, "webkitfullscreenchange", e => {
        // We'll assume that it's the video that was made fullscreen.
        update({ Fullscreen: !!document.webkitFullscreenElement });
    }));

    // Playlist related
    playlist = new Playlist(playlist);

    let pl = $("#playlist"),
        plHeader = pl.find(".header");
    if (plHeader.length) {
        playlist.id = (new URL(location)).searchParams.get("list")
        playlist.title = plHeader.find(".title").text();

        const indexMessage = plHeader.find(".index-message").text().split(" / ");
        playlist.index = Number.parseInt(indexMessage[0]) - 1;
        playlist.length = Number.parseInt(indexMessage[1]);
    }

    if (playlist.length) {
        const loopButton = $("#playlist-actions a").get(0);
        observers.push(new EventObserver(loopButton, "click", () => {
            playlist.loop = !playlist.loop
            update({ LoopStatus: loopStatus() });
        }));

        const shuffleButton = $("#playlist-actions a").get(1);
        observers.push(new EventObserver(shuffleButton, "click", () => {
            playlist.shuffle = !playlist.shuffle
            update({ Shuffle: playlist.shuffle });
        }));
    }

    video.LoopStatus = loopStatus();
    video.Shuffle = playlist.shuffle;

    // It looks like YouTube does not always set the volume of the <video> to
    // 1, even if the player says that it is max.  I don't know why they do
    // that, but let's respect it by lying to MPRIS!
    video.Volume = 1;

    video.CanGoNext = playlist.index < playlist.length - 1;
    video.CanGoPrevious = playlist.index > 0;

    video.Rate = videoElement.playbackRate;

    update(video);
}


const COMMANDS = {
    query(attr) {
        switch (attr) {
        case "Position":
            update({ Position: Math.trunc(videoElement.currentTime * 1e6) });
            break;
        }
    },

    Play() {
        videoElement.play();
    },
    Pause() {
        videoElement.pause();
    },
    PlayPause() {
        if (videoElement.paused || videoElement.ended) {
            videoElement.play();
        } else {
            videoElement.pause();
        }
    },
    Stop() {
        videoElement.currentTime = videoElement.duration;
    },

    Next() {
        if (playlist.length && playlist.index < playlist.length - 1)
            $(".ytp-next-button").get(0).click();
    },
    Prev() {
        if (playlist.length && playlist.index > 0) {
            if (videoElement.currentTime > 2)
                // if the video is past its 2nd second pressing prev will start
                // it from the beginning again, so we need to press twice with
                // a bit of a delay between
                setTimeout(() => $(".ytp-prev-button").get(0).click(), 100);
            $(".ytp-prev-button").get(0).click();
        }
    },

    Seek(offset) {
        videoElement.currentTime += offset / 1e6;
        if (videoElement.currentTime >= videoElement.duration)
            this.Next();
    },
    SetPosition({ id, position }) {
        // TODO: perhaps store the ID somewhere?
        if (id === (new URL(location)).searchParams.get("v"))
            videoElement.currentTime = position / 1e6;
    },

    Rate(what) {
        if (what > 0)
            videoElement.playbackRate = what;
    },

    Volume(notMute) {
        if ((!notMute && !videoElement.muted) || (notMute && videoElement.muted))
            $(".ytp-mute-button").get(0).click();
    },
    Fullscreen() { },

    Shuffle(yes) {
        if ((yes && !playlist.shuffle) || (!yes && playlist.shuffle))
            $("#playlist-actions a").get(1).click();
    },
    LoopStatus(how) {
        switch (how) {
        case "None":
            setLoop(false);
            setPlaylistLoop(false);
            break;

        case "Track":
            setLoop(true);
            break;

        case "Playlist":
            if (!playlist.length)
                return;
            setLoop(false);
            setPlaylistLoop(true);
            break;
        }
    }
}

function setPlaylistLoop(yes) {
    if (playlist.length && ((yes && !playlist.loop) || (!yes && playlist.loop)))
        $("#playlist-actions a").get(0).click();
}

function setLoop(yes) {
    if ((yes && videoElement.loop) || (!yes && !videoElement.loop))
        return;

    const rightClick = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        buttons: 2
    });

    // fake right click for the menu to show up
    videoElement.dispatchEvent(rightClick);
    // then click on the "Loop" button
    $(".ytp-contextmenu .ytp-menuitem").get(3).click();
}

function setPlaybackRate(rate) {
    const closestRate = Math.ceil(rate * 4);

    // first make the settings menu appear
    $(".ytp-settings-button").get(0).click();
    // then the "speed" submenu
    $(".ytp-settings-menu .ytp-menuitem").get(1).click();

    // set a timeout because of animation delays
    setTimeout(() => {
        // select the closest speed
        $(".ytp-settings-menu .ytp-menuitem").get(closestRate - 1).click();
        // and close the settings menu again
        $(".ytp-settings-button").get(0).click();
    }, 300);
}


const port = chrome.runtime.connect();
port.onMessage.addListener(({ cmd, data }) => {
    console.log("COMMAND", cmd);
    if (videoElement)
        COMMANDS[cmd](data);
});

function update(change) {
    port.postMessage({
        source: "youtube", type: "update", data: change,
    });
}

function quit() {
    port.postMessage({
        source: "youtube", type: "quit",
    });
}


window.addEventListener("DOMContentLoaded", e => {
    console.log({source: "youtube", type: e.type, url: location.href});

    prevUrl = new URL(location);
});

// When navigating between YouTube pages of different types.
// window.addEventListener("yt-page-type-changed", e => {
//     console.log({source: "youtube", type: e.type, url: location.href});
// });

// When a YouTube page finished loading.
// There's also "yt-navigate-start" which fires too early or not at all for
// cached pages; and "yt-navigate-finish" which also fires early.
window.addEventListener("yt-page-data-updated", e => {
    console.log({source: "youtube", type: e.type, url: location.href});

    observers.forEach(obs => obs.disconnect());
    observers = [];

    const nextUrl = new URL(location);

    if (!isVideo() && isVideo(prevUrl)) {
        videoElement = null;
        quit()
    }

    if (!isVideo() || (isVideo(prevUrl) && playlist.id !== nextUrl.searchParams.get("list")))
        playlist = new Playlist();

    if (isVideo())
        enterVideo();

    prevUrl = nextUrl;
});
