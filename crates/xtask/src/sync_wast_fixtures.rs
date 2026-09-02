use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::LazyLock;

use anyhow::{Context as _, Result, bail, ensure};
use serde::Deserialize;

const MANIFEST_PATH: &str = "packages/jco-transpile/test/fixtures/wast/upstream-manifest.json";
const RAW_GITHUB_BASE: &str = "https://raw.githubusercontent.com";

static WORKSPACE_DIR: LazyLock<PathBuf> = LazyLock::new(|| {
    let xtask_manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    xtask_manifest_dir.join("../../")
});

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpstreamManifest {
    repository: String,
    source_directory: String,
    destination_directory: String,
    fixtures: Vec<Fixture>,
}

#[derive(Debug, Deserialize)]
struct Fixture {
    name: String,
    revision: String,
}

struct PendingUpdate {
    destination: PathBuf,
    contents: Vec<u8>,
}

#[derive(Debug)]
struct SyncReport {
    total: usize,
    updated: usize,
}

pub(crate) fn run(check: bool) -> Result<()> {
    let manifest = load_manifest(&WORKSPACE_DIR)?;
    let report = sync_with(&WORKSPACE_DIR, &manifest, check, download)?;

    if report.updated == 0 {
        println!(
            "All {} vendored WAST fixtures match their pinned upstream revisions.",
            report.total
        );
    } else {
        println!(
            "Updated {} of {} vendored WAST fixtures.",
            report.updated, report.total
        );
    }

    Ok(())
}

fn load_manifest(workspace_dir: &Path) -> Result<UpstreamManifest> {
    let path = workspace_dir.join(MANIFEST_PATH);
    let contents = fs::read_to_string(&path)
        .with_context(|| format!("failed to read WAST fixture manifest [{}]", path.display()))?;
    let manifest = serde_json::from_str(&contents)
        .with_context(|| format!("failed to parse WAST fixture manifest [{}]", path.display()))?;
    validate_manifest(&manifest)?;
    Ok(manifest)
}

fn validate_manifest(manifest: &UpstreamManifest) -> Result<()> {
    ensure!(
        manifest.repository.split('/').count() == 2,
        "upstream WAST repository must use owner/repository syntax"
    );
    validate_relative_path(&manifest.source_directory, "source directory")?;
    validate_relative_path(&manifest.destination_directory, "destination directory")?;

    let mut names = HashSet::new();
    for fixture in &manifest.fixtures {
        ensure!(
            fixture.name.ends_with(".wast"),
            "upstream fixture name must end with .wast: {}",
            fixture.name
        );
        validate_relative_path(&fixture.name, "fixture name")?;
        ensure!(
            fixture.revision.len() == 40
                && fixture
                    .revision
                    .bytes()
                    .all(|byte| byte.is_ascii_hexdigit()),
            "upstream fixture revision must be a full Git commit: {}",
            fixture.revision
        );
        ensure!(
            names.insert(&fixture.name),
            "duplicate upstream WAST fixture: {}",
            fixture.name
        );
    }

    Ok(())
}

fn validate_relative_path(path: &str, description: &str) -> Result<()> {
    ensure!(!path.is_empty(), "upstream WAST {description} is empty");
    ensure!(
        Path::new(path)
            .components()
            .all(|component| matches!(component, Component::Normal(_))),
        "upstream WAST {description} must be a normalized relative path: {path}"
    );
    Ok(())
}

fn sync_with<F>(
    workspace_dir: &Path,
    manifest: &UpstreamManifest,
    check: bool,
    mut fetch: F,
) -> Result<SyncReport>
where
    F: FnMut(&str) -> Result<Vec<u8>>,
{
    let mut pending = Vec::new();

    // Download everything before writing anything so a transient network failure
    // cannot leave the vendored fixture set partially updated.
    for fixture in &manifest.fixtures {
        let source = format!(
            "{RAW_GITHUB_BASE}/{}/{}/{}/{}",
            manifest.repository,
            fixture.revision,
            manifest.source_directory.trim_end_matches('/'),
            fixture.name
        );
        let contents = fetch(&source)
            .with_context(|| format!("failed to fetch upstream WAST fixture [{}]", fixture.name))?;
        let destination = workspace_dir
            .join(&manifest.destination_directory)
            .join(&fixture.name);

        let is_current = match fs::read(&destination) {
            Ok(existing) => existing == contents,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
            Err(error) => {
                return Err(error).with_context(|| {
                    format!(
                        "failed to read vendored WAST fixture [{}]",
                        destination.display()
                    )
                });
            }
        };

        if !is_current {
            pending.push(PendingUpdate {
                destination,
                contents,
            });
        }
    }

    if check && !pending.is_empty() {
        let changed = pending
            .iter()
            .map(|update| {
                format!(
                    "  {}",
                    update
                        .destination
                        .strip_prefix(workspace_dir)
                        .unwrap_or(&update.destination)
                        .display()
                )
            })
            .collect::<Vec<_>>()
            .join("\n");
        bail!(
            "{} vendored WAST fixture(s) differ from their pinned upstream revisions:\n{changed}\nRun `cargo xtask sync-wast-fixtures` to update them.",
            pending.len()
        );
    }

    let updated = pending.len();
    for update in pending {
        if let Some(parent) = update.destination.parent() {
            fs::create_dir_all(parent).with_context(|| {
                format!(
                    "failed to create WAST fixture directory [{}]",
                    parent.display()
                )
            })?;
        }
        fs::write(&update.destination, update.contents).with_context(|| {
            format!(
                "failed to write vendored WAST fixture [{}]",
                update.destination.display()
            )
        })?;
        println!("Updated {}", update.destination.display());
    }

    Ok(SyncReport {
        total: manifest.fixtures.len(),
        updated,
    })
}

fn download(url: &str) -> Result<Vec<u8>> {
    let output = Command::new("curl")
        .args([
            "--location",
            "--fail",
            "--silent",
            "--show-error",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            url,
        ])
        .output()
        .context("failed to execute curl; install curl to synchronize WAST fixtures")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        bail!("curl failed for {url}: {}", stderr.trim());
    }

    Ok(output.stdout)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    struct TestDir(PathBuf);

    impl TestDir {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "jco-sync-wast-fixtures-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).unwrap();
        }
    }

    fn test_manifest() -> UpstreamManifest {
        UpstreamManifest {
            repository: "WebAssembly/component-model".into(),
            source_directory: "test/async".into(),
            destination_directory: "fixtures".into(),
            fixtures: vec![Fixture {
                name: "example.wast".into(),
                revision: "0123456789abcdef0123456789abcdef01234567".into(),
            }],
        }
    }

    #[test]
    fn synchronization_is_a_noop_for_matching_fixture_bytes() {
        let temp = TestDir::new();
        let destination = temp.0.join("fixtures/example.wast");
        fs::create_dir_all(destination.parent().unwrap()).unwrap();
        fs::write(&destination, b"fixture bytes\n").unwrap();

        let report = sync_with(&temp.0, &test_manifest(), false, |_| {
            Ok(b"fixture bytes\n".to_vec())
        })
        .unwrap();

        assert_eq!(report.total, 1);
        assert_eq!(report.updated, 0);
        assert_eq!(fs::read(destination).unwrap(), b"fixture bytes\n");
    }

    #[test]
    fn check_reports_drift_without_overwriting_the_fixture() {
        let temp = TestDir::new();
        let destination = temp.0.join("fixtures/example.wast");
        fs::create_dir_all(destination.parent().unwrap()).unwrap();
        fs::write(&destination, b"local bytes\n").unwrap();

        let error = sync_with(&temp.0, &test_manifest(), true, |_| {
            Ok(b"upstream bytes\n".to_vec())
        })
        .unwrap_err();

        assert!(error.to_string().contains("example.wast"));
        assert_eq!(fs::read(destination).unwrap(), b"local bytes\n");
    }

    #[test]
    fn synchronization_updates_drifted_fixture_bytes() {
        let temp = TestDir::new();
        let destination = temp.0.join("fixtures/example.wast");
        fs::create_dir_all(destination.parent().unwrap()).unwrap();
        fs::write(&destination, b"local bytes\n").unwrap();

        let report = sync_with(&temp.0, &test_manifest(), false, |_| {
            Ok(b"upstream bytes\n".to_vec())
        })
        .unwrap();

        assert_eq!(report.updated, 1);
        assert_eq!(fs::read(destination).unwrap(), b"upstream bytes\n");
    }

    #[test]
    fn failed_download_does_not_partially_update_fixtures() {
        let temp = TestDir::new();
        let first = temp.0.join("fixtures/example.wast");
        fs::create_dir_all(first.parent().unwrap()).unwrap();
        fs::write(&first, b"local bytes\n").unwrap();

        let mut manifest = test_manifest();
        manifest.fixtures.push(Fixture {
            name: "unavailable.wast".into(),
            revision: "0123456789abcdef0123456789abcdef01234567".into(),
        });

        let error = sync_with(&temp.0, &manifest, false, |url| {
            if url.ends_with("unavailable.wast") {
                bail!("network unavailable");
            }
            Ok(b"upstream bytes\n".to_vec())
        })
        .unwrap_err();

        assert!(error.to_string().contains("unavailable.wast"));
        assert_eq!(fs::read(first).unwrap(), b"local bytes\n");
    }

    #[test]
    fn manifest_tracks_every_vendored_wast_fixture() {
        let manifest = load_manifest(&WORKSPACE_DIR).unwrap();
        let fixture_dir = WORKSPACE_DIR.join(&manifest.destination_directory);
        let vendored = fs::read_dir(fixture_dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().into_string().unwrap())
            .filter(|name| name.ends_with(".wast"))
            .collect::<BTreeSet<_>>();
        let tracked = manifest
            .fixtures
            .iter()
            .map(|fixture| fixture.name.clone())
            .collect::<BTreeSet<_>>();

        assert_eq!(tracked, vendored);
    }
}
