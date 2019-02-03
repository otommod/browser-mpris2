"use strict";

// https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
function generateUUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
        var r = Math.random()*16|0, v = c == "x" ? r : (r&0x3|0x8);
        return v.toString(16);
    });
}

function monkeypatchCreateElement() {
    const messageID = generateUUID();

    window.addEventListener("message", msg => {
        if (msg.source !== window)
            return;
        if (msg.data.id !== messageID)
            return;

        delete msg.data.id;
        msg.data.source = "soundcloud";
        if (msg.data.type === "durationchange") {
            // SoundCloud sets blobs as src; if you seek past what's currently
            // downloaded, a new blob is created, its duration the time
            // remaining in the song from the point where you seeked.  Not
            // cool.
        } else {
            port.postMessage(msg.data);
        }
    });

    // SoundCloud creates an <audio> element to play, well, audio but it never
    // places it on the DOM.  However, we need to access it in order to set our
    // event listeners.  So we monkeypatch document.createElement to detect
    // when <audio> elements are created.
    const injectedScript = document.createElement("script");
    injectedScript.textContent = `(function() {
        function sendMessage(type, args) {
            window.postMessage({ id: "${messageID}", type, args }, "*");
        }
        function changed(newValues) { sendMessage("changed", [newValues]); }
        function seeked(position) { sendMessage("seeked", [position]); }
        function durationchange(duration) { sendMessage("durationchange", [duration]); }

        const oldCreateElement = document.createElement;
        document.createElement = function(tagName, ...args) {
            const createdTag = oldCreateElement.call(this, tagName, ...args);
            if (typeof tagName === "string" && tagName.toLowerCase() === "audio") {
                console.log("<audio>", createdTag);

                const eventHandlers = {
                    play() { changed({ PlaybackStatus: "Playing" }); },
                    playing() { changed({ PlaybackStatus: "Playing" }); },
                    pause() { changed({ PlaybackStatus: "Paused" }); },
                    ended() { changed({ PlaybackStatus: "Stopped" }); },

                    // when the media has become empty e.g. if it's reloaded
                    // SoundCloud seems to load a new blob on pause and that
                    // stops the pause event from firing, since the media is
                    // reloaded and autoplay is not set so it just doesn't
                    // start which is different from pausing
                    emptied() { changed({ PlaybackStatus: "Paused" }); },

                    // when a seek operation completes
                    seeked(e) { seeked(Math.trunc(e.target.currentTime * 1e6)); },

                    // when the playback speed changes
                    ratechange(e) { changed({ Rate: e.target.playbackRate }); },

                    // a change in the duration of the media
                    durationchange(e) { durationchange(e.target.duration); },

                    // when the audio volume changes or is muted
                    volumechange(e) { changed({ Volume: e.target.muted ? 0.0 : e.target.volume }); },

                };

                // we could control playback directly through the element since
                // we have a reference to it but that skips some kind of
                // buffering logic so sometimes it just doesn't work

                for (let [event, handler] of Object.entries(eventHandlers))
                    createdTag.addEventListener(event, handler);
            }
            return createdTag;
        };
    })();`;
    document.documentElement.appendChild(injectedScript);
    injectedScript.remove();
}


function setupEventListeners() {
    // We need to monitor the state of the queue.  To do that, We need to make
    // sure that the queue window if fully populated.  It takes some time to do
    // that from when you first click.
    document.querySelector(".playbackSoundBadge__showQueue").click();
    const queueItemsContainer = document.querySelector(".queue__itemsContainer");
    const queueCreationObserver = new MutationObserver(muts => {
        // const addedNodes = muts.flatMap(m => m.addedNodes);
        const addedNodes = muts.reduce((acc, m) => [...acc, ...m.addedNodes], []);
        addedNodes.forEach(n => {
            if (!n.classList.contains("queue__fallback"))
                return;

            // when we're sure the window is constructed we close it
            sendCanChangeSongProps();
            queueCreationObserver.disconnect();
            document.querySelector(".playbackSoundBadge__showQueue").click();

            // we then watch out for clicks on the "autoplay station" button
            const queueFallbackToggle = document.querySelector(".queueFallback__toggle input");
            queueFallbackToggle.addEventListener("click", e =>
                sendCanChangeSongProps());

            // as well as any changes in the queue contents themselves
            const queueObserver = new MutationObserver(muts => {
                // either something was added, removed or reordered
                sendCanChangeSongProps();
            });
            queueObserver.observe(queueItemsContainer, {
                childList: true
            });
        });
    });
    queueCreationObserver.observe(queueItemsContainer, {
        childList: true,
    });

    const shuffleControl = document.querySelector(".shuffleControl");
    shuffleControl.addEventListener("click", e =>
        changed({ Shuffle: shuffleControl.classList.contains("m-shuffling") }));

    const repeatControl = document.querySelector(".repeatControl");
    repeatControl.addEventListener("click", e =>
        changed({ LoopStatus: getLoopStatus() }));

    const soundBadgeObserver = new MutationObserver(muts => {
        // we don't look into what's changed too much; we just send everything
        sendPlayerProps();
    });
    soundBadgeObserver.observe(document.querySelector(".playbackSoundBadge"), {
        subtree: true,
        childList: true,
    });
}

function sendPlayerProps() {
    const shuffleControl = document.querySelector(".shuffleControl");
    const volumeSliderWrapper = document.querySelector(".volume__sliderWrapper");
    const titleLink = document.querySelector(".playbackSoundBadge__titleLink");
    const lightLink = document.querySelector(".playbackSoundBadge__lightLink");
    const avatar = document.querySelector(".playbackSoundBadge__avatar span");

    changed({
        LoopStatus: getLoopStatus(),
        Shuffle: shuffleControl.classList.contains("m-shuffling"),

        Metadata: {
            "mpris:trackid": titleLink.getAttribute("href"),
            "mpris:length": getDuration(),
            "mpris:artUrl": avatar.style.backgroundImage.slice(5, -2),
            // "xesam:url": titleLink.getAttribute("href"),
            "xesam:title": titleLink.getAttribute("title"),
            "xesam:artist": [lightLink.getAttribute("title")],
        },

        Volume: volumeSliderWrapper.getAttribute("aria-valuenow") * 1,
    });
}

function sendCanChangeSongProps() {
    const queueFallbackToggle = document.querySelector(".queueFallback__toggle input");
    const queueItemViewArray = Array.from(document.querySelectorAll(".queueItemView"));

    changed({
        CanGoPrevious: queueItemViewArray.some(n => n.classList.contains("m-dimmed")),
        CanGoNext: (
            queueItemViewArray.some(n => n.classList.contains("m-upcoming"))
            || queueFallbackToggle.checked),
    });
}


function isPlaying() {
    const playControl = document.querySelector(".playControl");
    return playControl.classList.contains("playing");
}

function getPosition() {
    const progressWrapper = document.querySelector(".playbackTimeline__progressWrapper");
    return Math.trunc(progressWrapper.getAttribute("aria-valuenow") * 1e6);
}

function getDuration() {
    const progressWrapper = document.querySelector(".playbackTimeline__progressWrapper");
    return Math.trunc(progressWrapper.getAttribute("aria-valuemax") * 1e6);
}

function getLoopStatus() {
    const repeatControl = document.querySelector(".repeatControl");
    if (repeatControl.classList.contains("m-all")) {
        return "Playlist";
    } else if (repeatControl.classList.contains("m-one")) {
        return "Track";
    } else {
        return "None";
    }
}


const COMMANDS = {
    Get(_, propName) {
        switch (propName) {
        case "Position":
            return getPosition();
        }
    },

    Set(_, propName, newValue) {
        switch (propName) {
        case "Rate":
            // the soundcloud UI doesn't expose any rate controls so I don't think
            // it'd be a good idea to expose them through MPRIS; users couldn't
            // change them back from the webpage
            break;

        case "Volume":
            // TODO: set the volume
            const isMuted = document.querySelector(".volume").classList.contains("muted");
            if ((!newValue && !isMuted) || (newValue && isMuted))
                document.querySelector(".volume__button").click();
            break;

        case "Shuffle":
            const shuffleControl = document.querySelector(".shuffleControl");
            const isShuffling = shuffleControl.classList.contains("m-shuffling");
            if ((newValue && !isShuffling) || (!newValue && isShuffling))
                shuffleControl.click();
            break;

        case "LoopStatus":
            let maxLoops = 5;
            while (newValue !== getLoopStatus() && maxLoops-- > 0)
                document.querySelector(".repeatControl").click();
            break;
        }
    },

    Play() {
        !isPlaying() && document.querySelector(".playControl").click();
    },
    Pause() {
        isPlaying() && document.querySelector(".playControl").click();
    },
    PlayPause() {
        isPlaying() ? this.Pause() : this.Play();
    },
    Stop() {
        // this is the most we can do
        this.Pause();
    },

    Next() {
        const skipControl = document.querySelector(".skipControl__next");
        skipControl.click();
    },
    Previous() {
        const skipControl = document.querySelector(".skipControl__previous");
        if (getPosition() > 5e6)
            // if the song is past its 5th second pressing previous will start
            // it from the beginning again, so we need to press twice
            skipControl.click();
        skipControl.click();
    },

    // we don't support seeking, I couldn't get it to work
    Seek(offset) { },
    SetPosition(id, position) { },
}

const port = chrome.runtime.connect();
port.onMessage.addListener(cmd => {
    console.log("MethodCall", cmd);

    const result = COMMANDS[cmd.method](...cmd.args);
    methodReturn(cmd.method, result);
});

function changed(newValues) {
    port.postMessage({
        source: "soundcloud", type: "changed", args: [newValues],
    });
}

function seeked(position) {
    port.postMessage({
        source: "soundcloud", type: "seeked", args: [position],
    });
}

function methodReturn(method, args) {
    port.postMessage({
        source: "soundcloud", type: "return", method, args
    });
}


// we don't wait for DOMContentLoaded; we need to make sure that we capture
// any potential creation of elements
monkeypatchCreateElement();

window.addEventListener("load", e => {
    const playControls = document.querySelector(".playControls");
    if (playControls.classList.contains("m-visible"))
        sendPlayerProps();
    setupEventListeners();
});
