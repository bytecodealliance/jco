import {
  _setEnv,
  _setTerminalStdin,
  _setTerminalStdout,
  _setTerminalStderr,
} from "@bytecodealliance/preview2-shim/cli";
import './base.mjs';

_setTerminalStderr();
_setTerminalStdin();
_setTerminalStdout();
