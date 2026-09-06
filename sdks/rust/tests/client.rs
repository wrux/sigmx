//! The embedded client and its helpers.

use std::fs;

#[test]
fn write_esm_unpacks_a_loadable_tree() {
    let dir = tempfile::tempdir().unwrap();
    let files = sigmx::client::write_esm(dir.path()).unwrap();
    assert_eq!(files.len(), sigmx::client::FILES.len());
    let kernel = fs::read_to_string(dir.path().join("kernel/index.js")).unwrap();
    assert!(kernel.contains("createSigmx"));
    let plugins = fs::read_to_string(dir.path().join("plugins/index.js")).unwrap();
    assert!(plugins.contains("./directives/"));
    // Idempotent: a second write leaves unchanged files alone.
    let before = fs::metadata(dir.path().join("kernel/index.js"))
        .unwrap()
        .modified()
        .unwrap();
    sigmx::client::write_esm(dir.path()).unwrap();
    assert_eq!(
        fs::metadata(dir.path().join("kernel/index.js"))
            .unwrap()
            .modified()
            .unwrap(),
        before
    );
}

#[test]
fn write_standalone_creates_directories() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("public/js/sigmx.js");
    sigmx::client::write_standalone(&path).unwrap();
    assert_eq!(fs::read_to_string(path).unwrap(), sigmx::client::STANDALONE);
    assert!(sigmx::client::STANDALONE.contains("sigmx"));
    assert_eq!(
        sigmx::client::VERSION,
        env!("CARGO_PKG_VERSION"),
        "the crate and the client it embeds move together"
    );
}

#[test]
fn etag_matching() {
    let tag = sigmx::client::ETAG;
    assert!(tag.starts_with('"') && tag.ends_with('"'));
    assert!(sigmx::client::matches_etag(Some(tag)));
    assert!(sigmx::client::matches_etag(Some(&format!("W/{tag}"))));
    assert!(sigmx::client::matches_etag(Some(&format!(
        "\"other\", {tag}"
    ))));
    assert!(!sigmx::client::matches_etag(Some("\"other\"")));
    assert!(!sigmx::client::matches_etag(None));
}
