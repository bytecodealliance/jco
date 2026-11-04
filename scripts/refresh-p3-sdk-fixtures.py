#!/usr/bin/env python3
"""Rebuild pinned Wasmtime P3 fixtures with the SDK cancellation-order fix.

Requires Python 3.12+, the pinned Rust toolchain with wasm32-wasip1 installed,
and the pinned wasm-tools CLI. Source archives, dependency versions, historical
source overrides, and output mappings are recorded next to this script.
"""
import argparse
import fcntl
import fnmatch
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import urllib.request

REPOSITORY = Path(__file__).resolve().parents[1]
SUPPORT = Path(__file__).resolve().parent / 'fixtures/p3_sdk'
sys.path.insert(0, str(SUPPORT))
from wit_surface import normalize_wit


def run(*command, **kwargs):
    return subprocess.run(command, check=True, **kwargs)


def checksum(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def download(url, expected, destination, offline):
    if destination.is_file():
        if checksum(destination) != expected:
            raise RuntimeError(f'cached input checksum mismatch: {destination}')
        return destination
    if offline:
        raise RuntimeError(f'missing cached input for offline rebuild: {destination}')
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_suffix(destination.suffix + '.part')
    with urllib.request.urlopen(url) as response, partial.open('wb') as output:
        shutil.copyfileobj(response, output)
    if checksum(partial) != expected:
        partial.unlink()
        raise RuntimeError(f'download checksum mismatch: {url}')
    partial.replace(destination)
    return destination


def unpack(archive, destination):
    # Cached archives are reusable; extracted build inputs are recreated so
    # local edits cannot silently alter the pinned guest programs or adapters.
    if destination.is_symlink():
        destination.unlink()
    elif destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)
    with tarfile.open(archive) as source:
        for member in source.getmembers():
            member.name = '/'.join(member.name.split('/')[1:])
            if member.name:
                source.extract(member, destination, filter='data')


def prepare(work, config, offline):
    cache = work / 'downloads'
    archives = {}
    for key in ('wasmtime', 'sdk', 'adapter40'):
        item = config[key]
        archives[key] = download(item['url'], item['sha256'], cache / f'{key}.tar.gz', offline)
    source = work / 'wasmtime'
    unpack(archives['wasmtime'], source)
    sdk = source / 'wit-bindgen-patched'
    unpack(archives['sdk'], sdk)

    # This is the upstream SDK 0.63 ordering fix backported to the original SDK.
    # Guest program logic, WIT signatures, and the SDK's remaining code are intact.
    patch = sdk / 'src/rt/async_support/inter_task_wakeup.rs'
    before = '''        unsafe {
            UnitStreamOps.cancel_read(handle);
        }
        self.remove_waitable(handle);'''
    after = '''        self.remove_waitable(handle);
        unsafe {
            UnitStreamOps.cancel_read(handle);
        }'''
    text = patch.read_text()
    if text.count(before) == 1:
        patch.write_text(text.replace(before, after))
    elif text.count(after) != 1:
        raise RuntimeError('SDK source no longer matches the exact cancellation-order patch')

    # Keep historical source files where the vendored fixture predates additions
    # to an upstream test's public interface. Each override is independently pinned.
    for override in config['sourceOverrides']:
        url = f"https://raw.githubusercontent.com/bytecodealliance/wasmtime/{override['revision']}/{override['path']}"
        cached = download(url, override['sha256'], cache / override['sha256'], offline)
        shutil.copyfile(cached, source / override['path'])

    with tarfile.open(archives['wasmtime']) as archive:
        member = next(item for item in archive.getmembers() if item.name.count('/') == 1 and item.name.endswith('/Cargo.toml'))
        original = archive.extractfile(member).read().decode()
    workspace = original[original.index('[workspace]\n'):original.index('[features]\n')]
    workspace = re.sub(r'(?ms)^members = \[.*?^\]', 'members = ["crates/test-programs"]', workspace, count=1)
    workspace += '\n[patch.crates-io]\nwit-bindgen = { path = "wit-bindgen-patched" }\n'
    workspace += '\n[profile.release]\nopt-level = "s"\ndebug = 1\n'
    (source / 'Cargo.toml').write_text(workspace)
    shutil.copyfile(SUPPORT / 'Cargo.lock', source / 'Cargo.lock')
    old_adapters = work / 'adapter40'
    unpack(archives['adapter40'], old_adapters)
    return source, old_adapters / 'artefacts'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work-dir', type=Path, default=REPOSITORY / 'target/p3-sdk-fixtures')
    parser.add_argument('--target-dir', type=Path, default=REPOSITORY / 'target')
    parser.add_argument('--lock-file', type=Path)
    parser.add_argument('--output-dir', type=Path, default=REPOSITORY / 'packages/jco-transpile/test/fixtures/components/p3')
    parser.add_argument('--only', action='append', help='Select fixture paths by glob; repeat to select several groups')
    parser.add_argument('--offline', action='store_true')
    args = parser.parse_args()
    config = json.loads((SUPPORT / 'manifest.json').read_text())
    for program, version in [('rustc', config['rustc']), ('wasm-tools', config['wasmTools'])]:
        actual = subprocess.check_output([program, '--version'], text=True)
        if not actual.startswith(f'{program} {version} '):
            raise RuntimeError(f'rebuild requires {program} {version}; found {actual.strip()}')
    fixtures = [item for item in config['fixtures'] if not args.only or any(fnmatch.fnmatchcase(item['path'], pattern) for pattern in args.only)]
    if not fixtures:
        parser.error('no fixtures match --only')
    args.work_dir = args.work_dir.resolve()
    args.target_dir = args.target_dir.resolve()
    args.work_dir.mkdir(parents=True, exist_ok=True)
    lock_path = args.lock_file or args.target_dir / '.p3-sdk-fixtures.lock'
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        source, old_adapters = prepare(args.work_dir, config, args.offline)
        # Extracted archive timestamps can precede another cached build. Force
        # Cargo to inspect this exact source tree when sharing a target cache.
        for rust_source in source.rglob('*.rs'):
            rust_source.touch()
        env = os.environ.copy()
        env['CARGO_TARGET_DIR'] = str(args.target_dir)
        command = ['cargo', 'build', '--locked', '--release', '--target', 'wasm32-wasip1', '-p', 'test-programs']
        if args.offline:
            command.append('--offline')
        for item in fixtures:
            command.extend(['--bin', item['bin']])
        run(*command, cwd=source, env=env)
        pending = []
        for item in fixtures:
            kind = 'reactor' if item['bin'].startswith('p3_') else 'command'
            adapter_directory = old_adapters if item['wasi'] == '0.2.6' else REPOSITORY / 'packages/jco/lib'
            adapter = adapter_directory / f'wasi_snapshot_preview1.{kind}.wasm'
            if item['wasi'] == '0.2.12' and checksum(adapter) != config['repositoryAdapters'][kind]:
                raise RuntimeError(f'repository adapter changed: {adapter}')
            output = args.work_dir / 'components' / item['path']
            output.parent.mkdir(parents=True, exist_ok=True)
            core = args.target_dir / 'wasm32-wasip1/release' / (item['bin'] + '.wasm')
            run('wasm-tools', 'component', 'new', str(core), '--adapt', f'wasi_snapshot_preview1={adapter}', '-o', str(output))
            run('wasm-tools', 'strip', str(output), '-o', str(output))
            run('wasm-tools', 'validate', '--features', 'all', str(output))
            previous = args.output_dir / item['path']
            expected = subprocess.check_output(['wasm-tools', 'component', 'wit', str(previous)], text=True)
            actual = subprocess.check_output(['wasm-tools', 'component', 'wit', str(output)], text=True)
            if normalize_wit(expected) != normalize_wit(actual):
                raise RuntimeError(f'public WIT interface changed: {item["path"]}')
            pending.append((output, previous))
        # No checked-in fixture changes until every rebuilt interface is verified.
        for output, destination in pending:
            shutil.copyfile(output, destination)
            print(f'refreshed {destination.relative_to(args.output_dir)}')


if __name__ == '__main__':
    main()
