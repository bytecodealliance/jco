// Regression test for a bug where `WASIImportObject`, `VersionedWASIImportObject`,
// `WASIShimConfig`, `SandboxConfig`, and `GetImportObjectArgs` were declared without
// `export`, and `getImportObject`'s version type parameter wasn't inferred from
// `asVersion`, so callers had to pass it twice with nothing checking they agreed.
import { WASIShim } from "../../../../src/common/instantiation.js";
import type {
    VersionedWASIImportObject,
    WASIImportObject,
} from "../../../../src/common/instantiation.js";

const shim = new WASIShim();

const unversioned: WASIImportObject = shim.getImportObject();
unversioned satisfies WASIImportObject;
unversioned satisfies VersionedWASIImportObject<"">;

const versioned: VersionedWASIImportObject<"0.2.3"> = shim.getImportObject({
    asVersion: "0.2.3",
});
versioned satisfies VersionedWASIImportObject<"0.2.3">;
