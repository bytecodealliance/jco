import type { TlsHost } from "../../../tls/host-types.js";
import deniedTls from "../../../tls/node-host.js";
import { encode } from "../../../tls/wire.js";
import { hostCall } from "../../../tls/errors.js";
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
  tls: TlsHost = deniedTls,
): Http2ClientSessionImplementation {
  const tlsContext =
    new URL(authority).protocol === "https:"
      ? hostCall(() =>
          tls.createContext(
            encode({
              ca: tlsBytes(options.ca),
              servername: options.servername,
              rejectUnauthorized: options.rejectUnauthorized,
            }),
          ),
        )
      : undefined;
  let session: InstanceType<typeof host.ClientSession>;
  try {
    session = new host.ClientSession(authority, {
      settings: toDirectSettings(options.settings),
      tlsContext,
    });
  } finally {
    if (tlsContext !== undefined) {
      tls.releaseContext(tlsContext);
    }
  }
  return {
    ready() {
      const info = unwrap(() => session.ready());
      return {
        ...info,
        localSettings: fromDirectSettings(info.localSettings),
        remoteSettings: fromDirectSettings(info.remoteSettings),
      };
    },
    request(headers, requestOptions) {
      const stream = unwrap(() => session.request(headers, requestOptions));
      return {
        write: (chunk) => unwrap(() => stream.write(chunk)),
        finish: () => unwrap(() => stream.finish()),
        close: (code) => unwrap(() => stream.close(code)),
        id: () => stream.id(),
        state: () => stream.state(),
      };
    },
    close: () => unwrap(() => session.close()),
    destroy: (code) => unwrap(() => session.destroy(code)),
    settings(value) {
      return fromDirectSettings(unwrap(() => session.settings(toDirectSettings(value))));
    },
    ping: (payload) => unwrap(() => session.ping(payload)),
    goaway: (code, lastStreamId, opaqueData) =>
      unwrap(() => session.goaway(code, lastStreamId, opaqueData)),
    ref: () => session.ref(),
    unref: () => session.unref(),
  };
}
