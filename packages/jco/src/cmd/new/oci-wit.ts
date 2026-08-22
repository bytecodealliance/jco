import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const MANIFEST_TYPES = [
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

interface OciReference {
    registry: string;
    repository: string;
    reference: string;
}

interface Descriptor {
    digest: string;
    mediaType: string;
    size?: number;
}

interface ImageManifest {
    schemaVersion: number;
    layers: Descriptor[];
}

/** Return whether an argument denotes an OCI registry artifact. */
export function isOciWit(input: string): boolean {
    return input.startsWith("oci://") || /^wasi:[a-z][a-z0-9-]*@\d+\.\d+\.\d+(?:[-+].+)?$/.test(input);
}

/** Pull an encoded WIT package from OCI and expand it into a WIT directory. */
export async function pullOciWit(input: string, destination: string): Promise<void> {
    const { ref, packageSpec } = resolveReference(input);
    const base = `https://${ref.registry}/v2/${ref.repository}`;
    const manifestResponse = await registryFetch(`${base}/manifests/${encodeURIComponent(ref.reference)}`, {
        headers: { accept: MANIFEST_TYPES },
        repository: ref.repository,
    });
    const manifest = (await manifestResponse.json()) as ImageManifest;
    if (manifest.schemaVersion !== 2 || !Array.isArray(manifest.layers)) {
        throw new Error(`Invalid OCI manifest returned for ${input}`);
    }
    const layer = manifest.layers.find(({ mediaType }) => mediaType === "application/wasm") ?? manifest.layers[0];
    if (!layer) {
        throw new Error(`OCI artifact ${input} has no layers`);
    }

    const blobResponse = await registryFetch(`${base}/blobs/${layer.digest}`, { repository: ref.repository });
    const bytes = new Uint8Array(await blobResponse.arrayBuffer());
    verifyDescriptor(input, layer, bytes);
    // Use a dynamic import so Jco can build against the latest published compatible
    // jco-transpile while this new API is released alongside it.
    const { unpackWit } = (await import("@bytecodealliance/jco-transpile")) as unknown as {
        unpackWit(expected: string | undefined, binary: Uint8Array): Promise<Map<string, string>>;
    };
    const files = await unpackWit(packageSpec, bytes);
    for (const [path, contents] of files) {
        const output = join(destination, path);
        await mkdir(dirname(output), { recursive: true });
        await writeFile(output, contents);
    }
}

function resolveReference(input: string): { ref: OciReference; packageSpec?: string } {
    if (!input.startsWith("oci://")) {
        const [name, reference] = input.split("@", 2);
        const [namespace, packageName] = name.split(":", 2);
        return {
            ref: {
                registry: "ghcr.io",
                repository: `webassembly/${namespace}/${packageName}`,
                reference,
            },
            packageSpec: input,
        };
    }

    const value = input.slice("oci://".length);
    const slash = value.indexOf("/");
    const path = value.slice(slash + 1);
    const digestSeparator = path.lastIndexOf("@");
    const tagSeparator = path.lastIndexOf(":");
    const separator = digestSeparator >= 0 ? digestSeparator : tagSeparator;
    if (slash <= 0 || separator <= path.lastIndexOf("/")) {
        throw new Error(`Invalid OCI reference ${JSON.stringify(input)}; expected oci://registry/repository:tag`);
    }
    return {
        ref: {
            registry: value.slice(0, slash),
            repository: path.slice(0, separator),
            reference: path.slice(separator + 1),
        },
    };
}

async function registryFetch(
    url: string,
    options: { headers?: Record<string, string>; repository: string },
): Promise<Response> {
    let response = await fetch(url, { headers: options.headers });
    if (response.status === 401) {
        const challenge = response.headers.get("www-authenticate");
        if (!challenge) {
            throw new Error(`OCI registry denied access to ${url}`);
        }
        const auth = parseBearerChallenge(challenge);
        const tokenUrl = new URL(auth.realm);
        tokenUrl.searchParams.set("service", auth.service);
        tokenUrl.searchParams.set("scope", auth.scope ?? `repository:${options.repository}:pull`);
        const tokenResponse = await fetch(tokenUrl);
        if (!tokenResponse.ok) {
            throw new Error(`OCI registry authentication failed: ${tokenResponse.statusText}`);
        }
        const tokenBody = (await tokenResponse.json()) as { token?: string; access_token?: string };
        const token = tokenBody.token ?? tokenBody.access_token;
        if (!token) {
            throw new Error("OCI registry authentication response did not include a token");
        }
        response = await fetch(url, { headers: { ...options.headers, authorization: `Bearer ${token}` } });
    }
    if (!response.ok) {
        throw new Error(`Failed to pull OCI artifact: ${response.status} ${response.statusText}`);
    }
    return response;
}

function parseBearerChallenge(challenge: string): Record<string, string> & { realm: string; service: string } {
    if (!challenge.startsWith("Bearer ")) {
        throw new Error(`Unsupported OCI authentication challenge: ${challenge}`);
    }
    const values: Record<string, string> = {};
    for (const match of challenge.slice(7).matchAll(/([a-zA-Z]+)="([^"]*)"/g)) {
        values[match[1]] = match[2];
    }
    if (!values.realm || !values.service) {
        throw new Error(`Invalid OCI authentication challenge: ${challenge}`);
    }
    return values as Record<string, string> & { realm: string; service: string };
}

function verifyDescriptor(input: string, descriptor: Descriptor, bytes: Uint8Array): void {
    if (descriptor.size !== undefined && descriptor.size !== bytes.byteLength) {
        throw new Error(`OCI layer for ${input} has an invalid size`);
    }
    const [algorithm, expected] = descriptor.digest.split(":", 2);
    if (algorithm !== "sha256" || !expected) {
        throw new Error(`Unsupported OCI digest ${descriptor.digest}`);
    }
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== expected) {
        throw new Error(`OCI layer for ${input} failed digest verification`);
    }
}
