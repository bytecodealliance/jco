from __future__ import annotations

import sys

from wit_world import exports
import wit_world.exports.fs_provider as fs_provider

sys.modules.setdefault("fs_provider", fs_provider)

class File(fs_provider.File):
    _sizes: dict[str, int] = {}

    def __init__(self, path: str) -> None:
        self._path = path
        File._sizes.setdefault(self._path, 0)

    def size(self) -> int:
        out = File._sizes.get(self._path, 0)
        return out


class Group(fs_provider.Group):
    def __init__(self, a: File, b: File) -> None:
        self._a = a
        self._b = b

    def sizes(self) -> tuple[int, int]:
        sa = self._a.size()
        sb = self._b.size()
        return (sa, sb)


class FsProvider(exports.FsProvider):
    _seq: int = 0

    def open_temp(self) -> File:
        FsProvider._seq += 1
        path = f"mem://f-{FsProvider._seq}"
        File._sizes[path] = FsProvider._seq
        return File(path)

    def make_group(self, a: File, b: File) -> Group:
        return Group(a, b)


class Run(exports.Run):
    def run(self) -> None:
        return None
