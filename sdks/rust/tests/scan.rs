//! The scanner: detection rules, custom plugins, generated modules.

use sigmx::scan::{
    self, custom_plugin_meta, mentions, plugins_module, Entry, Kind, Options, PluginMeta, Source,
};
use std::fs;

fn meta(name: &str, kind: Kind) -> PluginMeta {
    PluginMeta {
        export: name.into(),
        name: name.into(),
        kind,
        from: "sigmx/plugins".into(),
        literal: false,
        args: vec![],
    }
}
fn prefixes() -> Vec<String> {
    vec!["data-".into()]
}

#[test]
fn directive_detection_respects_boundaries() {
    let on = meta("on", Kind::Attribute);
    assert!(mentions(r#"<b data-on:click="x">"#, &on, &prefixes()));
    assert!(mentions("<b data-on__once=\"x\">", &on, &prefixes()));
    assert!(mentions("data-on", &on, &prefixes()));
    assert!(!mentions(r#"<b data-on-intersect="x">"#, &on, &prefixes()));
    assert!(!mentions("xdata-on=", &on, &prefixes()));
    assert!(mentions("<b hx-on=\"x\">", &on, &["hx-".to_owned()]));
    // Rust source: maud attribute names.
    assert!(mentions(
        "input data-bind:q data-on:input=\"$searching = true\";",
        &meta("bind", Kind::Attribute),
        &prefixes()
    ));
}

#[test]
fn function_and_handler_detection() {
    let get = meta("get", Kind::Action);
    assert!(mentions("@get('/x')", &get, &prefixes()));
    assert!(mentions("@get ('/x')", &get, &prefixes()));
    assert!(!mentions("@getx('/x')", &get, &prefixes()));
    assert!(!mentions("user@get.com", &get, &prefixes()));
    let toast = meta("toast", Kind::Handler);
    assert!(mentions("Event::custom(\"toast\")", &toast, &prefixes()));
    assert!(mentions("'sigmx-toast'", &toast, &prefixes()));
    assert!(mentions("\"my-app-toast\"", &toast, &prefixes()));
    assert!(!mentions("toast", &toast, &prefixes()));
    assert!(!mentions("'toaster'", &toast, &prefixes()));
}

#[test]
fn custom_plugin_metadata_is_read_from_source() {
    let src = r#"
import { attribute } from 'sigmx';
export const upper = attribute({
  name: 'upper',
  value: 'required',
  mount({ el, evaluate, effect }) { effect(() => { el.textContent = String(evaluate()).toUpperCase(); }); },
});
export const mask2: AttributePlugin = attribute({ name: 'mask2', literal: true, args: ['a', "b"], mount() {} })
export const shout = action({ name: 'shout', call() {} });
export const toast = handler({ name: 'toast', handle() {} });
"#;
    let m = custom_plugin_meta("upper", src, "./plugins.js").unwrap();
    assert_eq!(
        (m.name.as_str(), m.kind, m.literal, m.from.as_str()),
        ("upper", Kind::Attribute, false, "./plugins.js")
    );
    let m = custom_plugin_meta("mask2", src, "x").unwrap();
    assert_eq!(
        (m.name.as_str(), m.literal, m.args.clone()),
        ("mask2", true, vec!["a".to_owned(), "b".to_owned()])
    );
    assert_eq!(
        custom_plugin_meta("shout", src, "x").unwrap().kind,
        Kind::Action
    );
    assert_eq!(
        custom_plugin_meta("toast", src, "x").unwrap().kind,
        Kind::Handler
    );
    assert!(custom_plugin_meta("missing", src, "x").is_none());
}

#[test]
fn selection_follows_implied_dependencies_and_always() {
    let known = scan::builtin_plugins(&Source::default());
    let sel = scan::select_plugins(
        &["<button data-on:click=\"@get('/x')\">".to_owned()],
        known.clone(),
        &prefixes(),
        &[],
        &[],
    );
    let names: Vec<&str> = sel.plugins.iter().map(|p| p.export.as_str()).collect();
    assert_eq!(names, vec!["applyElements", "applyState", "httpGet", "on"]);
    assert_eq!(sel.reasons["applyElements"], "httpGet");
    assert_eq!(sel.reasons["on"], "used");
    assert!(sel.unused.contains(&"bind".to_owned()));
    let sel = scan::select_plugins(
        &[String::new()],
        known,
        &prefixes(),
        &["signals".to_owned()],
        &[],
    );
    assert_eq!(sel.reasons["signals"], "always");
    assert_eq!(sel.plugins.len(), 1);
}

#[test]
fn scans_a_project_and_generates_modules() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    fs::create_dir_all(root.join("src/views")).unwrap();
    fs::create_dir_all(root.join("assets/js")).unwrap();
    fs::create_dir_all(root.join("target")).unwrap();
    fs::write(
        root.join("src/views/page.rs"),
        "html! { input data-bind:q; b data-shout=\"$q\" {} }",
    )
    .unwrap();
    fs::write(
        root.join("src/notes.txt"),
        "data-text ignored: not a scanned extension",
    )
    .unwrap();
    fs::write(root.join("target/junk.rs"), "data-text").unwrap();
    fs::write(
        root.join("assets/js/shout.js"),
        "export const shout = attribute({ name: 'shout', mount() {} });",
    )
    .unwrap();

    let mut o = Options {
        root: root.to_path_buf(),
        ..Options::default()
    };
    o.include = vec!["src".into()];
    o.from = Source::Dir("./vendor/sigmx".into());
    o.out = Some("public/sigmx.js".into());
    o.custom = vec![("shout".into(), "assets/js/shout.js".into())];
    let sel = scan::scan(&o).unwrap();
    let names: Vec<&str> = sel.plugins.iter().map(|p| p.export.as_str()).collect();
    assert_eq!(names, vec!["bind", "shout"]);
    assert_eq!(sel.files.len(), 1);

    let module = plugins_module(&sel);
    assert!(module.starts_with("import { bind } from \"./vendor/sigmx/plugins/index.js\"\nimport { shout } from \"../assets/js/shout.js\"\nexport const plugins = [bind, shout]\n"));
    assert!(module.contains("\"shout\": \"used\""));

    let entry = Entry::selection(sel, o.from.clone()).module();
    assert!(entry.starts_with("import { createSigmx } from \"./vendor/sigmx/kernel/index.js\";\n"));
    assert!(entry.contains("const plugins = [bind, shout];\nexport const sigmx = createSigmx({ plugins });\nglobalThis[\"sigmx\"] = sigmx;\n"));

    let mut e = Entry::preset("essentials", Source::Package("sigmx".into()));
    e.prefix = vec!["data-".into(), "datastar-".into()];
    e.event_prefix = vec!["sigmx-".into(), "datastar-".into()];
    e.expose = None;
    assert_eq!(
        e.module(),
        "import { createSigmx } from \"sigmx\";\nimport { essentials as plugins } from \"sigmx/presets/essentials\";\nexport const sigmx = createSigmx({ plugins, prefix: [\"data-\", \"datastar-\"], eventPrefix: [\"sigmx-\", \"datastar-\"] });\n"
    );
}

#[test]
fn relative_specifiers() {
    use std::path::Path;
    assert_eq!(
        scan::relative_specifier(Path::new("/p/public"), Path::new("/p/public/js/x.js")),
        "./js/x.js"
    );
    assert_eq!(
        scan::relative_specifier(Path::new("/p/public"), Path::new("/p/assets/x.js")),
        "../assets/x.js"
    );
    assert_eq!(
        scan::relative_specifier(Path::new("/p"), Path::new("/p/x.js")),
        "./x.js"
    );
}

#[test]
fn the_builtin_table_matches_the_client() {
    let all = scan::builtin_plugins(&Source::default());
    assert!(all.len() >= 50, "{} plugins", all.len());
    let get = all.iter().find(|p| p.export == "httpGet").unwrap();
    assert_eq!((get.name.as_str(), get.kind), ("get", Kind::Action));
    let mask = all.iter().find(|p| p.export == "mask").unwrap();
    assert!(mask.literal);
    let apply = all.iter().find(|p| p.export == "applyElements").unwrap();
    assert_eq!(
        (apply.name.as_str(), apply.kind),
        ("patch-elements", Kind::Handler)
    );
    // Every module a preset imports is in the embedded tree.
    for name in ["all", "essentials", "minimal"] {
        assert!(sigmx::client::file(&format!("presets/{name}.js")).is_some());
    }
}
