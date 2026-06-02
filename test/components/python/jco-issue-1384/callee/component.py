from __future__ import annotations

import sys

from wit_world import exports
import wit_world.exports.fs_provider as fs_provider

sys.modules.setdefault("fs_provider", fs_provider)


class File(fs_provider.File):
    def __init__(self, path: str) -> None:
        self._path = path
        self._id = int(path.rsplit("-", 1)[1])

    def id(self) -> int:
        return self._id


class Group(fs_provider.Group):
    def __init__(self, a: File, b: File) -> None:
        self._a = a
        self._b = b

    def take_a(self) -> File:
        out = self._a
        self._a = None
        return out


class FsProvider(exports.FsProvider):
    def make_file(self, id: int) -> File:
        return File(f"mem://id-{id}")

    def make_group(self, a: File, b: File) -> Group:
        return Group(a, b)


class Run(exports.Run):
    def run(self) -> None:
        return None
