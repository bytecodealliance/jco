from __future__ import annotations

import sys

from wit_world import exports
import wit_world.exports.fs_provider_borrow as fs_provider_borrow

sys.modules.setdefault("fs_provider_borrow", fs_provider_borrow)


class File(fs_provider_borrow.File):
    _seq: int = 0
    _sizes: dict[str, int] = {}

    def __init__(self, path: str) -> None:
        self._path = path

    def size(self) -> int:
        return File._sizes[self._path]


class FsProviderBorrow(exports.FsProviderBorrow):
    def open_temp(self) -> File:
        File._seq += 1
        path = f"mem://f-{File._seq}"
        File._sizes[path] = File._seq
        return File(path)

    def borrow_one(self, a: File) -> int:
        out = a.size()
        return out


class Run(exports.Run):
    def run(self) -> None:
        return None
