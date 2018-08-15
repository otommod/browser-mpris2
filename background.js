let connections = 0;
let programPort = null;

chrome.runtime.onConnect.addListener(function(port) {
    if (!connections++)
        programPort = chrome.runtime.connectNative("org.mpris.browser_host");

    function passMessage(msg) {
        if (msg.tabId === port.sender.tab.id || msg.tabId < 0)
            port.postMessage(msg);
    };
    programPort.onMessage.addListener(passMessage);

    port.onMessage.addListener(function(msg) {
        msg.tabId = port.sender.tab.id;
        programPort.postMessage(msg);
    });
    port.onDisconnect.addListener(function() {
        programPort.postMessage({ type: "quit", tabId: port.sender.tab.id });
        programPort.onMessage.removeListener(passMessage);
        if (!--connections)
            programPort.disconnect();
    });
});
