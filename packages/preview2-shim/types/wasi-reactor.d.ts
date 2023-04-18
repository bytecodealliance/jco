import { WallClock as WallClockImports } from './imports/wall-clock';
import { Poll as PollImports } from './imports/poll';
import { MonotonicClock as MonotonicClockImports } from './imports/monotonic-clock';
import { Timezone as TimezoneImports } from './imports/timezone';
import { Streams as StreamsImports } from './imports/streams';
import { Filesystem as FilesystemImports } from './imports/filesystem';
import { Network as NetworkImports } from './imports/network';
import { InstanceNetwork as InstanceNetworkImports } from './imports/instance-network';
import { IpNameLookup as IpNameLookupImports } from './imports/ip-name-lookup';
import { Tcp as TcpImports } from './imports/tcp';
import { TcpCreateSocket as TcpCreateSocketImports } from './imports/tcp-create-socket';
import { Udp as UdpImports } from './imports/udp';
import { UdpCreateSocket as UdpCreateSocketImports } from './imports/udp-create-socket';
import { Random as RandomImports } from './imports/random';
import { Console as ConsoleImports } from './imports/console';
import { Types as TypesImports } from './imports/types';
import { DefaultOutgoingHttp as DefaultOutgoingHttpImports } from './imports/default-outgoing-HTTP';
import { Environment as EnvironmentImports } from './imports/environment';
import { Preopens as PreopensImports } from './imports/preopens';
import { Exit as ExitImports } from './imports/exit';
export interface ImportObject {
  'wall-clock': typeof WallClockImports,
  'poll': typeof PollImports,
  'monotonic-clock': typeof MonotonicClockImports,
  'timezone': typeof TimezoneImports,
  'streams': typeof StreamsImports,
  'filesystem': typeof FilesystemImports,
  'network': typeof NetworkImports,
  'instance-network': typeof InstanceNetworkImports,
  'ip-name-lookup': typeof IpNameLookupImports,
  'tcp': typeof TcpImports,
  'tcp-create-socket': typeof TcpCreateSocketImports,
  'udp': typeof UdpImports,
  'udp-create-socket': typeof UdpCreateSocketImports,
  'random': typeof RandomImports,
  'console': typeof ConsoleImports,
  'types': typeof TypesImports,
  'default-outgoing-HTTP': typeof DefaultOutgoingHttpImports,
  'environment': typeof EnvironmentImports,
  'preopens': typeof PreopensImports,
  'exit': typeof ExitImports,
}
export interface WasiReactor {
}

/**
* Instantiates this component with the provided imports and
* returns a map of all the exports of the component.
*
* This function is intended to be similar to the
* `WebAssembly.instantiate` function. The second `imports`
* argument is the "import object" for wasm, except here it
* uses component-model-layer types instead of core wasm
* integers/numbers/etc.
*
* The first argument to this function, `compileCore`, is
* used to compile core wasm modules within the component.
* Components are composed of core wasm modules and this callback
* will be invoked per core wasm module. The caller of this
* function is responsible for reading the core wasm module
* identified by `path` and returning its compiled
* WebAssembly.Module object. This would use `compileStreaming`
* on the web, for example.
*/
export function instantiate(
compileCore: (path: string, imports: Record<string, any>) => Promise<WebAssembly.Module>,
imports: ImportObject,
instantiateCore?: (module: WebAssembly.Module, imports: Record<string, any>) => Promise<WebAssembly.Instance>
): Promise<WasiReactor>;

