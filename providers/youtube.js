"use strict";

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


const EVENTS = {
    // playback of the media starts after having been paused
    play()    { update({state: "Playing"}); },
    // playback begins for the first time, unpauses or restarts
    playing() { update({state: "Playing"}); },
    // playback is paused
    pause() { update({state: "Paused"}); },
    // playback completes
    ended() { update({state: "Stopped"}); },

    // when the playback speed changes
    ratechange(e) { update({ rate: e.target.playbackRate }); },

    // when the audio volume changes or is muted
    volumechange(e) { update({volume: e.target.muted ? 0.0 : e.target.volume}); },

    // a change in the duration of the media
    durationchange(e) { update({duration: Math.trunc(e.target.duration * 1e6)}); },

    // when a seek operation completes
    // TODO: it seems that YouTube is "sending" too many seeked events e.g.,
    // according to mpris Playing from the beginning after being Stopped should
    // not be considered a Seek, yet YouTube does send a seeked event and we
    // propagate that to DBus as well
    seeked(e) { update({seekedTo: Math.trunc(e.target.currentTime * 1e6)}); },

    // the element's `currentTime' attribute has changed
    // timeupdate(e) { update({position: e.target.currentTime}); },
};

function isVideo(url) {
    return (url || location).pathname.startsWith("/watch");
}

function loopStatus() {
    if (videoElement.hasAttribute("loop"))
        return "Track";
    if (playlist.content.length && playlistLooping)
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

    observers.push(new EventObserver(document, "webkitfullscreenchange", e => {
        // We'll assume that it's the video that was made fullscreen.
        update({ fullscreen: !!document.webkitFullscreenElement });
    }));

    playlist = {};

    // Playlist related
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

    videoElement = document.querySelector("video");
    for (let [event, handler] of Object.entries(EVENTS))
        observers.push(new EventObserver(videoElement, event, handler));

    if (playlist.content.length) {
        const loopButton = document.querySelector(".toggle-loop");
        observers.push(new EventObserver(loopButton, "click", () => {
            playlistLooping = !playlistLooping
            update({ loop: loopStatus() });
        }));

        const shuffleButton = document.querySelector(".shuffle-playlist");
        observers.push(new EventObserver(shuffleButton, "click", () => {
            playlistShuffling = !playlistShuffling
            update({ shuffle: playlistShuffling });
        }));
    }

    const loopObserver = new MutationObserver(muts => {
        muts.forEach(m => update({ loop: loopStatus() }));
    });
    loopObserver.observe(videoElement, {
        attributes: true,
        subtree: false,
        attributeFilter: ["loop"],
    });
    observers.push(loopObserver);

    video.loop = loopStatus();
    video.shuffle = playlistShuffling;

    // It looks like YouTube does not always set the volume of the video
    // element to 1, even if the player says that it is max.  Since they
    // probably have a good reason to do that, let's not fuck things up by
    // setting it too high, even if the user requested it.  In order to do
    // that, we're always gon' lie!
    video.volume = 1;

    video.hasNext = playlist.content.length && playlist.index < playlist.content.length - 1;
    video.hasPrev = playlist.content.length && playlist.index > 0;

    video.rate = videoElement.playbackRate;

    // TODO: these belong elsewhere
    video.minRate = 0.25;
    video.maxRate = 2;

    port.postMessage({
        source: "youtube", type: "change", data: video
    });
}

function exitVideo() {
    port.postMessage({
        source: "youtube", type: "quit",
    });

    observers.forEach(obs => obs.disconnect());
    observers = [];

    videoElement = null;
    playlist = {};
    playlistLooping = false;
    playlistShuffling = false;
}

const COMMANDS = {
    query(attr) {
        switch (attr) {
        case "position":
            update({ position: Math.trunc(videoElement.currentTime * 1e6) });
            break;
        }
    },

    play() {
        if (videoElement) videoElement.play();
    },
    pause() {
        if (videoElement) videoElement.pause();
    },
    playpause() {
        if (!videoElement) return;
        if (videoElement.paused || videoElement.ended) videoElement.play();
        else videoElement.pause();
    },
    stop() {
        if (videoElement) videoElement.currentTime = videoElement.duration;
    },

    playAt(index) {
        if (playlist.content.length > index) {
            let v = playlist.content[index];
            if (v) v.link.click();
        }
    },
    next() {
        this.playAt(playlist.index + 1);
    },
    prev() {
        this.playAt(playlist.index - 1);
    },

    seekBy(offset) {
        if (!videoElement) return;
        videoElement.currentTime += offset / 1e6;
        if (videoElement.currentTime >= videoElement.duration)
            this.next();
    },
    setPosition({ id, position }) {
        // TODO: perhaps store the ID somewhere?
        if (videoElement && id === document.querySelector("[itemprop=videoId]").content)
            videoElement.currentTime = position / 1e6;
    },

    rate(what) {
        if (videoElement && what > 0) setPlaybackRate(what);
    },

    volume() { },
    fullscreen() { },

    shuffle(yes) {
        if (!videoElement) return;
        if (!yes !== !playlistShuffling)
            document.querySelector(".shuffle-playlist").click();
    },
    loop(how) {
        if (!videoElement) return;
        switch (how) {
        case "None":
            setLoopPlaylist(false);
            setLoopTrack(false);
            break;

        case "Track":
            setLoopTrack(true);
            break;

        case "Playlist":
            if (!playlist.content.length)
                return;
            setLoopPlaylist(true);
            setLoopTrack(false);
            break;
        }
    }
}

function setLoopTrack(loop) {
    if (!videoElement) return;

    // if what we want to happen is already happening we're done
    if (!!loop == videoElement.hasAttribute("loop"))
        return;

    const e = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        view: window,
        buttons: 2
    });

    // fake right click for the menu to show up
    videoElement.dispatchEvent(e);
    // then click on the "Loop" button
    document.querySelector(".ytp-contextmenu .ytp-menuitem:nth-child(4)").click();
}

function setLoopPlaylist(loop) {
    if (!videoElement) return;

    // only if our looping status differs from the requested should we click
    if (!loop != !playlistLooping)
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

    // var obs = new MutationObserver(function(ms) {
    //     ms.forEach(function(m) {
    //         if (m.oldValue.includes("ytp-popup-animating")) {
    //         }
    //     });
    // });

    // obs.observe(document.querySelector(".ytp-settings-menu"), {
    //      attributes: true,                   // observe mutations to attributes
    //      attributeOldValue: true,            // include old attribute value
    //      subtree: false,                     // don't observe descendants
    //      attributeFilter: ["class"]  // only observe these attributes
    //  });

    // and finally select the appropriate "speed"
    // document.querySelector(`.ytp-settings-menu .ytp-menuitem:nth-child(${closestRate})`).click();
}


function update(change) {
    port.postMessage({
        source: "youtube", type: "update", data: change,
    });
}


const port = chrome.runtime.connect();
port.onMessage.addListener(({ cmd, data }) => {
    console.log("COMMAND", cmd);
    COMMANDS[cmd](data);
});

var videoElement;
var observers = [];
var playlist;
var playlistLooping = false;
var playlistShuffling = false;

// https://youtube.github.io/spfjs/documentation/events/

document.addEventListener("spfrequest", e => {
    port.postMessage({
        source: "youtube", type: e.type, data: e.detail,
    });

    const prevUrl = new URL(e.detail.previous);
    const nextUrl = new URL(e.detail.url);

    if (isVideo(prevUrl) && !isVideo(nextUrl))
        exitVideo();

    if (isVideo(prevUrl) && isVideo(nextUrl) && prevUrl.searchParams.get("list") !== nextUrl.searchParams.get("list")) {
        playlistLooping = false;
        playlistShuffling = false;
    }

    observers.forEach(obs => obs.disconnect());
    observers = [];
});

function process(e) {
    port.postMessage({
        source: "youtube", type: e.type, url: location.href
    });

    if (isVideo()) enterVideo();
}

document.addEventListener("spfdone", process);
document.addEventListener("DOMContentLoaded", process);

window.addEventListener("unload", function() {
    if (isVideo()) exitVideo();
});
