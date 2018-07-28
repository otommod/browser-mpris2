"use strict";

let videoElement = null;


function isVideo(url=location) {
    return url.pathname.startsWith("/watch");
}

function loopStatus() {
    return videoElement.loop ? "Track" : "None";
}

function enterVideo() {
    const id = (new URL(location)).searchParams.get("v");
    let video = {
        Metadata: {
            "mpris:trackid": id,
            "mpris:length": (videoElement.duration * 10e6) || 0,
            "mpris:artUrl": `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            "xesam:url": location.href,
            "xesam:title": document.getElementById("video-title").textContent,
        },
        PlaybackStatus: "Playing",
    };

    const eventHandlers = {
        play()      { changed({ PlaybackStatus: "Playing" }); },
        playing()   { changed({ PlaybackStatus: "Playing" }); },
        pause()     { changed({ PlaybackStatus: "Paused" }); },
        ended()     { changed({ PlaybackStatus: "Stopped" }); },

        // when the playback speed changes
        ratechange(e) { changed({ Rate: e.target.playbackRate }); },

        // when the audio volume changes or is muted
        volumechange(e) { changed({ Volume: e.target.muted ? 0.0 : e.target.volume }); },

        // a change in the duration of the media
        // durationchange(e) { update({ "mpris:length": Math.trunc(e.target.duration * 1e6) }); },

        // when a seek operation completes
        seeked(e) { seeked(Math.trunc(e.target.currentTime * 1e6)); },
    };

    for (let [event, handler] of Object.entries(eventHandlers))
        videoElement.addEventListener(event, handler);

    const loopObserver = new MutationObserver(muts => {
        muts.forEach(m => changed({ LoopStatus: loopStatus() }));
    });
    loopObserver.observe(videoElement, {
        attributes: true,
        subtree: false,
        attributeFilter: ["loop"],
    });

    document.addEventListener("webkitfullscreenchange", e => {
        // We'll assume that it's the video that was made fullscreen.
        changed({ Fullscreen: !!document.webkitFullscreenElement });
    });

    video.LoopStatus = loopStatus();
    video.Volume = videoElement.volume;
    video.Rate = videoElement.playbackRate;

    changed(video);
}
const COMMANDS = {
    Get(_, propName) {
        switch (propName) {
        case "Position":
            return Math.trunc(videoElement.currentTime * 1e6);
        }
    },

    Set(_, propName, newValue) {
        switch (propName) {
        case "Rate":
            if (newValue > 0)
                videoElement.playbackRate = newValue;
            break;

        case "Volume":
            // we only mute (if needed); see the other comment on volume
            videoElement.muted = !newValue;
            break;

        case "LoopStatus":
            setLoop(newValue !== "None");
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
    Previous() { },

    Seek(offset) {
        videoElement.currentTime += offset / 1e6;
    },
    SetPosition(id, position) {
        // TODO: perhaps store the ID somewhere?
        if (id === (new URL(location)).searchParams.get("v"))
            videoElement.currentTime = position / 1e6;
    },
}

function setLoop(yes) {
    if ((yes && videoElement.loop) || (!yes && !videoElement.loop))
        return;

    document.getElementById("video-loop").click();
}


const port = chrome.runtime.connect();
port.onMessage.addListener(cmd => {
    console.log("MethodCall", cmd);
    if (videoElement) {
        const result = COMMANDS[cmd.method](...cmd.args);
        methodReturn(cmd.method, result);
    }
});

function changed(newValues) {
    port.postMessage({
        source: "hooktube", type: "changed", args: [newValues],
    });
}

function seeked(position) {
    port.postMessage({
        source: "hooktube", type: "seeked", args: [position],
    });
}

function methodReturn(method, args) {
    port.postMessage({
        source: "hooktube", type: "return", method, args
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
