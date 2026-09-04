import { fromDirectSettings, toDirectSettings } from "../../settings.js";
import type {
  DirectHttp2Host,
  Http2ClientOptions,
  Http2ClientSessionImplementation,
} from "../../types.js";
import { tlsBytes, unwrap } from "./shared.js";

export function createDirectHttp2Client(
  host: DirectHttp2Host,
  authority: string,
  options: Http2ClientOptions,
): Http2ClientSessionImplementation {
  const session = new host.ClientSession(authority, {
    settings: toDirectSettings(options.settings),
    rejectUnauthorized: options.rejectUnauthorized,
    serverName: options.servername,
    ca: tlsBytes(options.ca),
  });
  return {
    ready() {
      const info = unwrap(session.ready());
      return {
        ...info,
        localSettings: fromDirectSettings(info.localSettings),
        remoteSettings: fromDirectSettings(info.remoteSettings),
      };
    },
    request(headers, requestOptions) {
      const stream = unwrap(session.request(headers, requestOptions));
      return {
        write: (chunk) => unwrap(stream.write(chunk)),
        finish: () => unwrap(stream.finish()),
        close: (code) => unwrap(stream.close(code)),
        id: () => stream.id(),
        state: () => stream.state(),
      };
    },
    close: () => unwrap(session.close()),
    destroy: (code) => unwrap(session.destroy(code)),
    settings(value) {
      return fromDirectSettings(unwrap(session.settings(toDirectSettings(value))));
    },
    ping: (payload) => unwrap(session.ping(payload)),
    goaway: (code, lastStreamId, opaqueData) =>
      unwrap(session.goaway(code, lastStreamId, opaqueData)),
    ref: () => session.ref(),
    unref: () => session.unref(),
  };
}
