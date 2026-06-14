globalThis.name = chrome.runtime.getManifest().short_name;

globalThis.port = chrome.runtime.connectNative(globalThis.name);
port.onMessage.addListener((message) => console.log(message));
port.onDisconnect.addListener((p) => console.log(chrome.runtime.lastError));
port.postMessage(new Array(209715));

chrome.runtime.onInstalled.addListener((reason) => {
  console.log(reason);
});
