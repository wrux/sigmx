//! The client, embedded at build time from the same release: the script-tag build with every
//! plugin, and the ES module tree for projects that bundle their own selection (see
//! [`crate::scan`]). Both can be written to disk from a build step, or served from memory.

use std::io;
use std::path::{Path, PathBuf};

include!("../client/manifest.rs");

/// `cache-control` for a served client. The ETag handles revalidation.
pub const CACHE_CONTROL: &str = "public, max-age=3600";

/// True when an `If-None-Match` header already names the embedded build.
pub fn matches_etag(if_none_match: Option<&str>) -> bool {
    if_none_match.is_some_and(|v| {
        v.split(',')
            .any(|t| t.trim().trim_start_matches("W/") == ETAG)
    })
}

/// One module of the ES tree by its path (`kernel/index.js`, `plugins/index.js`, `presets/all.js`).
pub fn file(path: &str) -> Option<&'static str> {
    FILES.iter().find(|(p, _)| *p == path).map(|(_, s)| *s)
}

/// Write the script-tag build to `path`, creating parent directories.
pub fn write_standalone(path: impl AsRef<Path>) -> io::Result<()> {
    let path = path.as_ref();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, STANDALONE)
}

/// Write the ES module tree under `dir` (`dir/kernel/index.js`, `dir/plugins/index.js`, …).
/// Modules import each other relatively, so any bundler, or a browser, can load them from there.
/// Returns the files written.
pub fn write_esm(dir: impl AsRef<Path>) -> io::Result<Vec<PathBuf>> {
    let dir = dir.as_ref();
    let mut written = Vec::with_capacity(FILES.len());
    for (rel, source) in FILES {
        let path = dir.join(rel);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        // Only touch files whose content changed: watchers and cargo rebuilds key off mtimes.
        if std::fs::read(&path).ok().as_deref() != Some(source.as_bytes()) {
            std::fs::write(&path, source)?;
        }
        written.push(path);
    }
    Ok(written)
}
