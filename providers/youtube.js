"use strict";

// Lifesaver: https://stackoverflow.com/a/34100952

class Playlist {
    constructor({ loop=false, shuffle=false }={}) {
        this.id = "";
        this.index = -1;
        this.content = [];
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


function isVideo(url=location) {
    return url.pathname.startsWith("/watch");
}

function loopStatus() {
    if (videoElement.hasAttribute("loop"))
        return "Track";
    if (playlist.content.length && playlist.loop)
        return "Playlist";
    return "None";
}


function enterVideo() {
    let video = {
        id: document.querySelector("[itemprop=videoId]").content,
        url: document.querySelector("[itemprop=url]").href,
        title: document.querySelector("[itemprop=name]").content,
        thumb: document.querySelector("[itemprop=thumbnailUrl]").href,
    };

    const eventHandlers = {
        play()    { update({PlaybackStatus: "Playing"}); },
        playing() { update({PlaybackStatus: "Playing"}); },
        pause() { update({PlaybackStatus: "Paused"}); },
        ended() { update({PlaybackStatus: "Stopped"}); },

        // when the playback speed changes
        ratechange(e) { update({ Rate: e.target.playbackRate }); },

        // when the audio volume changes or is muted
        volumechange(e) { update({Volume: e.target.muted ? 0.0 : e.target.volume}); },

        // a change in the duration of the media
        durationchange(e) { update({duration: Math.trunc(e.target.duration * 1e6)}); },

        // when a seek operation completes
        // TODO: it seems that YouTube is "sending" too many seeked events e.g.,
        // according to mpris Playing from the beginning after being Stopped should
        // not be considered a Seek, yet YouTube does send a seeked event and we
        // propagate that to DBus as well
        seeked(e) { update({seekedTo: Math.trunc(e.target.currentTime * 1e6)}); },
    };

    videoElement = document.querySelector("video");
    for (let [event, handler] of Object.entries(eventHandlers))
        observers.push(new EventObserver(videoElement, event, handler));

    const loopObserver = new MutationObserver(muts => {
        muts.forEach(m => update({ LoopStatus: loopStatus() }));
    });
    loopObserver.observe(videoElement, {
        attributes: true,
        subtree: false,
        attributeFilter: ["loop"],
    });
    observers.push(loopObserver);

    observers.push(new EventObserver(document, "webkitfullscreenchange", e => {
        // We'll assume that it's the video that was made fullscreen.
        update({ Fullscreen: !!document.webkitFullscreenElement });
    }));

    // Playlist related
    playlist = new Playlist(playlist);

    let pl = document.querySelector("#player-playlist"),
        plHeader = pl.querySelector(".playlist-header-content"),
        plNodeList = pl.querySelectorAll("#playlist-autoscroll-list li");
    if (plHeader) {
        playlist.id = plHeader.dataset.fullListId;
        playlist.title = plHeader.dataset.listTitle;
    }
    playlist.content = Array.from(plNodeList, li => ({
            id: li.dataset.videoId,
            title: li.dataset.videoTitle,
            link: li.querySelector("a"),
    }));
    playlist.index = playlist.content.map(v => v.id).indexOf(video.id);

    if (playlist.content.length) {
        const loopButton = document.querySelector(".toggle-loop");
        observers.push(new EventObserver(loopButton, "click", () => {
            playlist.loop = !playlist.loop
            update({ LoopStatus: loopStatus() });
        }));

        const shuffleButton = document.querySelector(".shuffle-playlist");
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

    video.CanGoNext = playlist.content.length && playlist.index < playlist.content.length - 1;
    video.CanGoPrevious = playlist.content.length && playlist.index > 0;

    video.Rate = videoElement.playbackRate;

    port.postMessage({
        source: "youtube", type: "change", data: video
    });
}


const COMMANDS = {
    query(attr) {
        switch (attr) {
        case "position":
            update({ position: Math.trunc(videoElement.currentTime * 1e6) });
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

    playAt(index) {
        if (playlist.content.length > index) {
            let v = playlist.content[index];
            if (v) v.link.click();
        }
    },
    Next() {
        this.playAt(playlist.index + 1);
    },
    Prev() {
        this.playAt(playlist.index - 1);
    },

    Seek(offset) {
        videoElement.currentTime += offset / 1e6;
        if (videoElement.currentTime >= videoElement.duration)
            this.Next();
    },
    SetPosition({ id, position }) {
        // TODO: perhaps store the ID somewhere?
        if (id === document.querySelector("[itemprop=videoId]").content)
            videoElement.currentTime = position / 1e6;
    },

    Rate(what) {
        if (what > 0)
            setPlaybackRate(what);
    },

    Volume() { },
    Fullscreen() { },

    Shuffle(yes) {
        if ((yes && !playlist.shuffle) || (!yes && playlist.shuffle))
            document.querySelector(".shuffle-playlist").click();
    },
    LoopStatus(how) {
        switch (how) {
        case "None":
            setLoopTrack(false);
            setLoopPlaylist(false);
            break;

        case "Track":
            setLoopTrack(true);
            break;

        case "Playlist":
            if (!playlist.content.length)
                return;
            setLoopTrack(false);
            setLoopPlaylist(true);
            break;
        }
    }
}

function setLoopTrack(yes) {
    if ((yes && videoElement.loop) || (!yes && !videoElement.loop))
        return;

    const rightClick = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        view: window,
        buttons: 2
    });

    // fake right click for the menu to show up
    videoElement.dispatchEvent(rightClick);
    // then click on the "Loop" button
    document.querySelector(".ytp-contextmenu .ytp-menuitem:nth-child(4)").click();
}

function setLoopPlaylist(yes) {
    if ((yes && !playlist.loop) || (!yes && playlist.loop))
        document.querySelector(".toggle-loop").click();
}

function setPlaybackRate(rate) {
    if (!videoElement) return;

    let closestRate = Math.ceil(rate * 4);
    // first make the settings menu appear
    document.querySelector(".ytp-settings-button").click();
    // then the "speed" menu
    document.querySelector(".ytp-settings-menu .ytp-menuitem:nth-child(3)").click();

    setTimeout(() => {
        document.querySelector(`.ytp-settings-menu .ytp-menuitem:nth-child(${closestRate})`).click();
        // and close the settings menu again
        setTimeout(() => document.querySelector(".ytp-settings-button").click(), 300);
    }, 300);
}


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


const port = chrome.runtime.connect();
port.onMessage.addListener(({ cmd, data }) => {
    console.log("COMMAND", cmd);
    if (videoElement)
        COMMANDS[cmd](data);
});

let videoElement;
let playlist = new Playlist();
let observers = [];


document.addEventListener("DOMContentLoaded", e => {
    console.log({source: "youtube", type: e.type, url: location.href});

    if (isVideo()) enterVideo();
});

// https://youtube.github.io/spfjs/documentation/events/
document.addEventListener("spfrequest", e => {
    console.log({source: "youtube", type: e.type, data: e.detail});

    observers.forEach(obs => obs.disconnect());
    observers = [];

    const prevUrl = new URL(e.detail.previous);
    const nextUrl = new URL(e.detail.url);

    if (!isVideo(nextUrl) && isVideo(prevUrl)) {
        videoElement = null;
        quit();
    }

    if (!isVideo(nextUrl) || (isVideo(prevUrl) && prevUrl.searchParams.get("list") !== nextUrl.searchParams.get("list")))
        playlist = new Playlist();
});

document.addEventListener("spfdone", e => {
    console.log({source: "youtube", type: e.type, url: location.href});

    if (isVideo()) enterVideo();
});

// window.addEventListener("unload", function() {
//     if (isVideo())
//         quit();
// });
