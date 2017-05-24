var connections = 0;
var programPort = null;

chrome.runtime.onConnect.addListener(function(port) {
    if (!connections++)
        programPort = chrome.runtime.connectNative("org.mpris.chrome_host");

    function passMessage(msg) {
        if (msg.tabId == port.sender.tab.id || msg.tabId < 0)
            port.postMessage(msg);
    };
    programPort.onMessage.addListener(passMessage);

    port.onMessage.addListener(function(msg) {
        msg.tabId = port.sender.tab.id;
        programPort.postMessage(msg);
    });
    port.onDisconnect.addListener(function() {
        programPort.onMessage.removeListener(passMessage);
        if (!--connections)
            programPort.disconnect();
    });
});
