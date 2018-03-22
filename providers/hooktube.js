"use strict";

let videoElement = null;


function isVideo(url=location) {
    return url.pathname.startsWith("/watch");
}

function loopStatus() {
    return videoElement.loop ? "Track" : "None";
}

function enterVideo() {
    let video = {
        id: (new URL(location)).searchParams.get("v"),
        url: location.href,
        duration: (videoElement.duration * 10e6) || 0,
        title: document.getElementById("video-title").textContent,
        PlaybackStatus: "Playing"
    };
    video.thumb = "https://i.ytimg.com/vi/" + video.id +"/hqdefault.jpg";

    const eventHandlers = {
        play()      { update({PlaybackStatus: "Playing"}); },
        playing()   { update({PlaybackStatus: "Playing"}); },
        pause()     { update({PlaybackStatus: "Paused"}); },
        ended()     { update({PlaybackStatus: "Stopped"}); },

        // when the playback speed changes
        ratechange(e) { update({ Rate: e.target.playbackRate }); },

        // when the audio volume changes or is muted
        volumechange(e) { update({Volume: e.target.muted ? 0.0 : e.target.volume}); },

        // a change in the duration of the media
        durationchange(e) { update({duration: Math.trunc(e.target.duration * 1e6)}); },

        // when a seek operation completes
        seeked(e) { update({seekedTo: Math.trunc(e.target.currentTime * 1e6)}); },
    };

    for (let [event, handler] of Object.entries(eventHandlers))
        videoElement.addEventListener(event, handler);

    const loopObserver = new MutationObserver(muts => {
        muts.forEach(m => update({ LoopStatus: loopStatus() }));
        console.log("looping changed");
    });
    loopObserver.observe(videoElement, {
        attributes: true,
        subtree: false,
        attributeFilter: ["loop"],
    });

    document.addEventListener("webkitfullscreenchange", e => {
        // We'll assume that it's the video that was made fullscreen.
        update({ Fullscreen: !!document.webkitFullscreenElement });
    });

    video.LoopStatus = loopStatus();
    video.Volume = videoElement.volume;
    video.Rate = videoElement.playbackRate;

    update(video);
}

const COMMANDS = {
    query(attr) {
        switch (attr) {
        case "position":
            update({ position: Math.trunc(videoElement.currentTime *1e6) });
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

    Next() { },
    Prev() { },

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
        videoElement.muted = !notMute;
    },
    Fullscreen() { },

    Shuffle(yes) { },
    LoopStatus(how) {
        setLoop(how !== "None");
    }
};

function setLoop(yes) {
    if ((yes && videoElement.loop) || (!yes && !videoElement.loop))
        return;

    document.getElementById("video-loop").click();
}


const port = chrome.runtime.connect();
port.onMessage.addListener(({ cmd, data }) => {
    console.log("COMMAND", cmd);
    if (videoElement)
        COMMANDS[cmd](data);
});

function update(change) {
    port.postMessage({
        source: "hooktube", type: "update", data: change,
    });
}

function quit() {
    port.postMessage({
        source: "youtube", type: "quit",
    });
}

window.addEventListener("load", () => {
    const videoSourcElement = document.getElementById("video-source");
    if (videoSourcElement == null)
        return;

    const videoObserver = new MutationObserver(muts => {
        muts.forEach(mut => {
            for (let node of mut.addedNodes) {
                if (node.id === "player-obj") {
                    videoElement = node;
                    enterVideo();
                    break;
                }
            }
        });
    });
    videoObserver.observe(videoSourcElement, { childList: true });
});

window.addEventListener("unload", () => {
    if (isVideo())
        quit();
});
