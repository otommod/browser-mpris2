"use strict";

var EVENTS = [
    "play",           // playback of the media starts after having been paused
    "playing",        // playback begins for the first time, unpauses or restarts
    "pause",          // playback is paused
    "ended",          // playback completes
    // "timeupdate",     // the element's `currentTime' attribute has changed
    "durationchange", // a change in the duration of the media

];

function isVideo() {
    return window.location.pathname.includes("watch");
}

function handler(e) {
    switch (e.type) {
        case "play":
        case "playing":
            video.state = "playing";
            break;
        case "pause":
            video.state = "paused";
            break;
        case "ended":
            video.state = "stopped";
            break;

        case "timeupdate":
            video.position = e.target.currentTime;
            break;
        case "durationchange":
            video.duration = e.target.duration;
            break;
    }

    info();
}

function enterVideo() {
    video.id = document.querySelector("[itemprop=videoId]").content;
    video.title = document.querySelector("[itemprop=name]").content;

    // Playlist related
    var pl = document.querySelector("#player-playlist"),
        plHeader = pl.querySelector(".playlist-header-content"),
        plNodeList = pl.querySelectorAll("#playlist-autoscroll-list li");
    if (plHeader) {
        playlist.id = plHeader.getAttribute("data-full-list-id");
        playlist.title = plHeader.getAttribute("data-list-title");
    }
    playlist.content = Array.prototype.map.call(plNodeList, function(li) {
        return {
            id: li.getAttribute("data-video-id"),
            title: li.getAttribute("data-video-title"),
            link: li.querySelector("a"),
        };
    });
    playlist.index = playlist.content.map(function(v) {
        return v.id;
    }).indexOf(video.id);

    videoElement = document.querySelector("video");
    EVENTS.forEach(function(event) {
        videoElement.addEventListener(event, handler);
    });
}

function exitVideo() {
    port.postMessage({
        source: ["youtube"], command: "destroy", id: video.id
    });

    video.id = video.title = null;
    playlist.id = playlist.title = null;
    playlist.content = [];

    EVENTS.forEach(function(event) {
        videoElement.removeEventListener(event, handler);
    });
    videoElement = null;
}

function play() {
    if (videoElement) videoElement.play();
}
function pause() {
    if (videoElement) videoElement.pause();
}

function playAt(index) {
    var v = playlist.content[index];
    if (v) v.link.click();
}
function next() {
    playAt(playlist.index + 1);
}
function prev() {
    playAt(playlist.index - 1);
}

function info() {
    port.postMessage({
        source: ["youtube"], id: video.id, video: video, playlist: playlist
    });
}


var port = chrome.runtime.connect();
port.onMessage.addListener(function(msg) {
    window[msg.command]();
});

var videoElement;
var video = {
    id: null,
    title: null,
    state: "",
    position: 0,
    duration: 0
};
var playlist = {
    id: null,
    title: null,
    content: [],
    index: 0
};

document.addEventListener("DOMContentLoaded", function() {
    if (isVideo()) enterVideo();

    // Install a MutationObserver to track page changes.
    // YouTube doesn't play fair, you never really navigate from page to page,
    // it just changes the DOM in-place, using spfjs.  A page change is
    // indicated by the change of the `data-spf-name` attribute of the body.
    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            // Navigated away from a video page.
            if (mutation.oldValue == "watch")
                exitVideo();

            // By the time the mutation is fired, window.location has already
            // been changed to that of the new page, so the following correctly
            // identifies if the new page is a video or not.
            if (isVideo())
                enterVideo();
        });
    });
    observer.observe(document.body, {
        attributes: true,                   // observe mutations to attributes
        attributeOldValue: true,            // include old attribute value
        subtree: false,                     // don't observe descendants
        attributeFilter: ["data-spf-name"]  // only observe these attributes
    });
});
window.addEventListener("unload", function() {
    if (isVideo()) exitVideo();
});
