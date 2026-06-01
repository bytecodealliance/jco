from __future__ import annotations

import sys

from bindings.wit_world import exports
import bindings.wit_world.exports.iface as iface

# componentize-py may resolve this module by top-level name.
sys.modules.setdefault("iface", iface)

class Handle(iface.Handle):
    _storage: dict[str, str] = {}
    _seq: int = 0

    def __init__(self, path: str) -> None:
        self._path = path
        Handle._storage.setdefault(self._path, "")
        print(f"[dbg] py: Handle.__init__ path={self._path}")

    def append(self, data: str) -> None:
        print(f"[dbg] py: Handle.append begin path={self._path} data={data}")
        Handle._storage[self._path] = Handle._storage.get(self._path, "") + data
        print(
            f"[dbg] py: Handle.append end path={self._path} size={len(Handle._storage[self._path])}"
        )


class Iface(exports.Iface):
    def open_temp(self) -> Handle:
        print("[dbg] py: open_temp begin")
        Handle._seq += 1
        h = Handle(f"mem://h-{Handle._seq}")
        print(f"[dbg] py: open_temp end path={h._path}")
        return h


class Run(exports.Run):
    def run(self) -> None:
        print("[dbg] py: run begin")
        api = Handle()
        print("[dbg] py: run open_temp")
        h = api.open_temp()
        print("[dbg] py: run append")
        h.append("|py-run|")
        print("[dbg] py: run end")
        return None
