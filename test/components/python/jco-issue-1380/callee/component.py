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

    def append(self, data: str) -> None:
        Handle._storage[self._path] = Handle._storage.get(self._path, "") + data


class Iface(exports.Iface):
    def open_temp(self) -> Handle:
        Handle._seq += 1
        h = Handle(f"mem://h-{Handle._seq}")
        return h


class Run(exports.Run):
    def run(self) -> None:
        api = Handle()
        h = api.open_temp()
        h.append("|py-run|")
        return None
