from __future__ import annotations

from wit_world import exports
from wit_world.imports.resources import NamedResource, roundtrip_owned


class Run(exports.Run):
    def run(self) -> None:
        direct = NamedResource("direct")
        assert direct.get_name() == "direct"

        returned = roundtrip_owned(NamedResource("roundtrip"))
        assert returned.get_name() == "roundtrip"
