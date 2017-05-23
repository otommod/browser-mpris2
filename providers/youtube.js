"use strict";

const EVENTS = [
    "play",           // playback of the media starts after having been paused
    "playing",        // playback begins for the first time, unpauses or restarts
    "pause",          // playback is paused
    "ended",          // playback completes
    "volumechange",   // when the audio volume changes or is muted
    "timeupdate",     // the element's `currentTime' attribute has changed
    "durationchange", // a change in the duration of the media

];

function isVideo() {
    return window.location.pathname.startsWith("/watch");
}

function handler(e) {
    switch (e.type) {
        case "play":
        case "playing":
            update({state: "Playing"});
            break;
        case "pause":
            update({state: "Paused"});
            break;
        case "ended":
            update({state: "Stopped"});
            break;

        case "volumechange":
            update({volume: e.target.muted ? 0.0 : e.target.volume})
            break;

        // case "timeupdate":
        //     update({position: e.target.currentTime});
        //     break;

        case "durationchange":
            update({duration: e.target.duration * 1e6});
            break;
    }
}

function enterVideo() {
    let video = {
        id: document.querySelector("[itemprop=videoId]").content,
        url: document.querySelector("[itemprop=url]").href,
        title: document.querySelector("[itemprop=name]").content,
        thumb: document.querySelector("[itemprop=thumbnailUrl]").href,
    };

    let playlist = {};

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
    EVENTS.forEach(function(event) {
        videoElement.addEventListener(event, handler);
    });

    video.volume = videoElement.volume;

    video.hasNext = playlist.content.length && playlist.index < playlist.content.length - 1;
    video.hasPrev = playlist.content.length && playlist.index > 0;

    port.postMessage({
        source: "youtube", type: "change", data: video
    })
}

function exitVideo() {
    port.postMessage({
        source: "youtube", type: "quit",
    });

    EVENTS.forEach(function(event) {
        videoElement.removeEventListener(event, handler);
    });
    videoElement = null;
}

const COMMANDS = {
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
        var v = playlist.content[index];
        if (v) v.link.click();
    },
    next() {
        COMMANDS.playAt(playlist.index + 1);
    },
    prev() {
        COMMANDS.playAt(playlist.index - 1);
    }
}

function update(change) {
    port.postMessage({
        source: "youtube", type: "update", data: change,
    });
}


var port = chrome.runtime.connect();
port.onMessage.addListener(({ cmd, data }) => {COMMANDS[cmd](data); console.log(cmd, data); });

var videoElement;

// document.addEventListener("DOMContentLoaded", function() {
//     if (isVideo()) enterVideo();

//     // Install a MutationObserver to track page changes.
//     // YouTube doesn't play fair, you never really navigate from page to page,
//     // it just changes the DOM in-place, using spfjs.  A page change is
//     // indicated by the change of the `data-spf-name` attribute of the body.
//     var observer = new MutationObserver(function(mutations) {
//         mutations.forEach(function(mutation) {
//             // Navigated away from a video page.
//             // if (mutation.oldValue == "watch")
//             //     exitVideo();

//             // By the time the mutation is fired, window.location has already
//             // been changed to that of the new page, so the following correctly
//             // identifies if the new page is a video or not.
//             if (isVideo())
//                 enterVideo();
//         });
//     });
//     observer.observe(document.body, {
//         attributes: true,                   // observe mutations to attributes
//         attributeOldValue: true,            // include old attribute value
//         subtree: false,                     // don't observe descendants
//         attributeFilter: ["data-spf-name"]  // only observe these attributes
//     });
// });
window.addEventListener("unload", function() {
    if (isVideo()) exitVideo();
});

// https://youtube.github.io/spfjs/documentation/events/

document.addEventListener("spfrequest", e => {
        port.postMessage({
            source: "youtube", type: e.type, data: e.detail,
        });
    const prevUrl = new URL(e.detail.previous);
    const nextUrl = new URL(e.detail.url);

    if (prevUrl.pathname.startsWith("/watch") && !nextUrl.pathname.startsWith("/watch"))
        exitVideo();
});

document.addEventListener("spfdone", process);
document.addEventListener("DOMContentLoaded", process);

function process(event) {
    if (!location.pathname.startsWith("/watch"))
        return;

    enterVideo();
}
