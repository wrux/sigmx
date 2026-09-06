//! Client assets for the Worker, built with cargo alone. Run from the example directory:
//!
//!     cargo run --manifest-path assetc/Cargo.toml
//!
//! It writes `public/`, which wrangler serves through the `[assets]` binding before the Worker runs:
//!
//! - `public/vendor/sigmx/**`: the sigmx ES modules embedded in the crate, unpacked once.
//! - `public/js/*.js`: the project's own modules (a custom directive here), copied over.
//! - `public/sigmx.js`: the generated entry. Auto mode scans `src/` (maud templates) and `assets/js`
//!   for the directives and functions in use and registers only those, plus the custom plugin.
//!
//! A project with a bundler (swc, esbuild, Vite) points it at the same entry to get one file.

use sigmx::scan::{self, CustomPlugin, Entry, Options, Source};
use std::fs;
use std::path::Path;

fn main() -> std::io::Result<()> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_path_buf();
    std::env::set_current_dir(&root)?;

    let modules = sigmx::client::write_esm("public/vendor/sigmx")?;
    eprintln!(
        "assetc: {} sigmx modules under public/vendor/sigmx (sigmx {})",
        modules.len(),
        sigmx::client::VERSION
    );

    fs::create_dir_all("public/js")?;
    for entry in fs::read_dir("assets/js")? {
        let entry = entry?;
        fs::copy(entry.path(), Path::new("public/js").join(entry.file_name()))?;
    }

    let mut o = Options::default();
    o.root = root;
    o.include = vec!["src".into(), "assets/js".into()];
    o.from = Source::Dir("./vendor/sigmx".into());
    o.out = Some("public/sigmx.js".into());
    o.custom = vec![CustomPlugin::new("shout", "public/js/shout.js")];
    let sel = scan::scan(&o)?;
    let names: Vec<&str> = sel.plugins.iter().map(|p| p.export.as_str()).collect();
    eprintln!(
        "assetc: {} plugins ({}); {} unused",
        names.len(),
        names.join(", "),
        sel.unused.len()
    );
    fs::write("public/sigmx.js", Entry::selection(sel, o.from).module())?;
    eprintln!("assetc: wrote public/sigmx.js");
    Ok(())
}
