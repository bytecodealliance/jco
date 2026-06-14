### Install dependencies

```shell
bun install --cache-dir ./.bun-cache @bytecodealliance/componentize-js
```

```shell
cargo bininstall wkg
wkg wit fetch -d . --cache ./.wit-cache
```

### Compile to WASM

```shell
bun x componentize-js nm_compoentize_js.js --wit . --world-name native-messaging-componentize-js -d http -d fetch-event --out nm_componentize_js.wasm
```

Using `jco`

```shell
bun x jco componentize nm_componentize_js.js --wit . --world-name native-messaging-componentize-js -d http -d fetch-event --out nm_jco.wasm

```

### Installation and usage on Chrome and Chromium

1. Navigate to `chrome://extensions`.
2. Toggle `Developer mode`.
3. Click `Load unpacked`.
4. Select `native-messaging` folder.
5. Note the generated extension ID.
6. Open `nm_componentize_js.json` in a text editor, set `"path"` to absolute path of `nm_componentize_js.sh` and `chrome-extension://<ID>/` using ID from 5 in `"allowed_origins"` array, and set `nm_componentize_js.sh` permission to executable. When compiled with `jco` adjust the file name executed by `wasmtime` in `nm_componentize_js.sh` to `nm_jco.wasm`. 
7. Copy the file to Chrome or Chromium configuration folder, e.g., Chromium on Linux `~/.config/chromium/NativeMessagingHosts`; Chrome Dev Channel on Linux `~/.config/google-chrome-unstable/NativeMessagingHosts`.
8. To test click `service worker` link in panel of unpacked extension which is DevTools for `background.js` in MV3 `ServiceWorker`, observe echo'ed message from Bun Native Messaging host. To disconnect run `port.disconnect()`.

The Native Messaging host echoes back the message passed. 



### Examples


The maximum message length sent from the client to the host in one message is 64 MiB of JSON. The host can only send 1 MiB of valid JSON back to the client per message. This host is implemented to handle JSON `Array` messages from the client over 1 MiB; since a JSON `Array` is similar in structure to a `Uint8Array` (essentially any data type can be converted to a `u8` type and written to a `Uint8Array`) facilitating streaming data back and forth between browser and native applications.


Round trip 64 MiB of JSON, disconnect the host (terminate the process) after all bytes are echoed. Connecting to the host with `connectNative()` keeps the host alive for the life of the tab/window/browser process. Once `connectNative()` is executed, the host can send messages and stream data to the client, without the client necessarily needing to send any messages to the host.  `disconnect()` disconnects the client from the host and terminates the native process.

```javascript
var data = Array(209715*64);
var len = data.length;
var n = 0;
var port = chrome.runtime.connectNative("nm_componentize_js");
port.onMessage.addListener((message) => {
  n += message.length;
  if (n === len) {
    console.log({n, len});
    port.disconnect();
  }
});
port.onDisconnect.addListener((_) => {
  console.log("Disconnected");
  if (chrome.runtime.lastError) {
    console.log(chrome.runtime.lastError);
  }
});
port.postMessage(data);
data.length = 0;
```

Using `sendNativeMessage` sends one message at a time, the callback receives the message from the host, and then the process exits. Send arbitrary command to the host to execute and send results back, e.g., a REPL (requires modification of the base echo/roundtrip example host `nm_componentize_js.js`).

```javascript
chrome.runtime.sendNativeMessage(
  "nm_componentize_js", 
  { command: "deno eval 'Deno.stdout.write(new TextEncoder().encode(JSON.stringify(Deno.version)))'" }, 
  (message) => {
  if (chrome.runtime.lastError) {
    console.error(chrome.runtime.lastError);
  }
  console.log(message);
});
```

For differences between OS and browser implementations see [Chrome incompatibilities](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities#native_messaging).



