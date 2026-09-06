//! Auto mode without Node: scan source files for the directives and functions they use, pick the
//! plugins, and generate the module that registers them. The same rules as `sigmx/scan` in the
//! JavaScript package, so a project can move between the two.
//!
//! ```no_run
//! use sigmx::scan::{Entry, Options, Source};
//!
//! let mut o = Options::default();
//! o.include = vec!["src".into(), "assets/js".into()];
//! o.from = Source::Dir("./vendor/sigmx".into());
//! let selection = sigmx::scan::scan(&o).unwrap();
//! std::fs::write("assets/js/sigmx-entry.js", Entry::selection(selection, o.from).module()).unwrap();
//! ```

use std::collections::BTreeMap;
use std::io;
use std::path::{Component, Path, PathBuf};

/// What kind of plugin an export is.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    /// A directive: `data-<name>`.
    Attribute,
    /// A function: `@name(...)`.
    Action,
    /// A server-event handler: `sigmx-<name>`.
    Handler,
}

impl Kind {
    /// The name the JavaScript package uses.
    pub const fn as_str(self) -> &'static str {
        match self {
            Kind::Attribute => "attribute",
            Kind::Action => "action",
            Kind::Handler => "handler",
        }
    }
}

/// A built-in plugin, as generated from the JavaScript build.
#[derive(Debug, Clone, Copy)]
pub struct BuiltinMeta {
    /// Export name in `sigmx/plugins`.
    pub export: &'static str,
    /// Directive, function or event name.
    pub name: &'static str,
    /// Kind.
    pub kind: Kind,
    /// The value is a literal rather than an expression.
    pub literal: bool,
    /// Extra expression parameters.
    pub args: &'static [&'static str],
}

include!("../client/plugins.rs");

/// A plugin the scanner knows about.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PluginMeta {
    /// Export name.
    pub export: String,
    /// Directive, function or event name.
    pub name: String,
    /// Kind.
    pub kind: Kind,
    /// Module specifier to import it from.
    pub from: String,
    /// The value is a literal rather than an expression.
    pub literal: bool,
    /// Extra expression parameters.
    pub args: Vec<String>,
}

/// Where the client modules are imported from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Source {
    /// An npm package, normally `sigmx`: imports become `sigmx`, `sigmx/plugins`, `sigmx/presets/all`.
    Package(String),
    /// A directory holding the ES tree written by [`crate::client::write_esm`], relative to the
    /// generated module, e.g. `./vendor/sigmx`: imports become `./vendor/sigmx/kernel/index.js`.
    Dir(String),
}

impl Source {
    /// Specifier of the kernel (`createSigmx`).
    pub fn kernel(&self) -> String {
        match self {
            Source::Package(p) => p.clone(),
            Source::Dir(d) => format!("{}/kernel/index.js", d.trim_end_matches('/')),
        }
    }
    /// Specifier of the plugin index.
    pub fn plugins(&self) -> String {
        match self {
            Source::Package(p) => format!("{p}/plugins"),
            Source::Dir(d) => format!("{}/plugins/index.js", d.trim_end_matches('/')),
        }
    }
    /// Specifier of a preset (`all`, `essentials`, `minimal`).
    pub fn preset(&self, name: &str) -> String {
        match self {
            Source::Package(p) => format!("{p}/presets/{name}"),
            Source::Dir(d) => format!("{}/presets/{name}.js", d.trim_end_matches('/')),
        }
    }
}

impl Default for Source {
    fn default() -> Self {
        Source::Package("sigmx".into())
    }
}

/// File extensions scanned by default: templates of every stripe, plus `.rs` for maud, askama
/// and friends.
pub const DEFAULT_EXTENSIONS: &[&str] = &[
    ".rs", ".html", ".htm", ".astro", ".mdx", ".md", ".ts", ".tsx", ".js", ".jsx", ".svelte",
    ".vue", ".php", ".erb", ".twig", ".hbs", ".tera", ".jinja", ".jinja2", ".j2", ".liquid",
];

/// Directories scanned by default, relative to the root.
pub const DEFAULT_INCLUDE: &[&str] = &["src", "templates", "index.html"];

/// A plugin of your own: a module exporting an `attribute({ … })`, `action({ … })` or
/// `handler({ … })` definition. Its name and kind are read from the source, or declared with
/// [`CustomPlugin::named`] when the definition is not in that shape.
///
/// ```
/// use sigmx::scan::{CustomPlugin, Kind};
///
/// let parsed = CustomPlugin::new("shout", "assets/js/shout.js");
/// let declared = CustomPlugin::new("toast", "assets/js/toast.js").named("toast", Kind::Handler).always();
/// ```
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CustomPlugin {
    /// Export name in the module.
    pub export: String,
    /// The module, relative to the root.
    pub path: PathBuf,
    /// Directive, function or event name; read from the source when `None`.
    pub name: Option<String>,
    /// Kind; read from the source when `None`.
    pub kind: Option<Kind>,
    /// The value is a literal rather than an expression (directives only).
    pub literal: bool,
    /// Extra expression parameters (directives only).
    pub args: Vec<String>,
    /// Ship it whether or not the scan finds a use.
    pub always: bool,
}

impl CustomPlugin {
    /// A plugin exported as `export` from the module at `path`; its definition is read from the
    /// source.
    pub fn new(export: impl Into<String>, path: impl Into<PathBuf>) -> Self {
        CustomPlugin {
            export: export.into(),
            path: path.into(),
            name: None,
            kind: None,
            literal: false,
            args: Vec::new(),
            always: false,
        }
    }
    /// Declare the name and kind instead of reading them from the source.
    pub fn named(mut self, name: impl Into<String>, kind: Kind) -> Self {
        self.name = Some(name.into());
        self.kind = Some(kind);
        self
    }
    /// The directive's value is a literal (`__dynamic` makes it an expression).
    pub fn literal(mut self, literal: bool) -> Self {
        self.literal = literal;
        self
    }
    /// Extra parameter names the directive's expression can reference.
    pub fn args<I, S>(mut self, args: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.args = args.into_iter().map(Into::into).collect();
        self
    }
    /// Ship it whether or not the scan finds a use.
    pub fn always(mut self) -> Self {
        self.always = true;
        self
    }
}

impl<S: Into<String>, P: Into<PathBuf>> From<(S, P)> for CustomPlugin {
    fn from((export, path): (S, P)) -> Self {
        CustomPlugin::new(export, path)
    }
}

/// What to scan and how to import what is found.
#[derive(Debug, Clone)]
pub struct Options {
    /// Project root; defaults to the current directory.
    pub root: PathBuf,
    /// Files or directories to scan, relative to the root. Default [`DEFAULT_INCLUDE`].
    pub include: Vec<PathBuf>,
    /// Extensions to read. Default [`DEFAULT_EXTENSIONS`].
    pub extensions: Vec<String>,
    /// Attribute prefixes in use. Default `data-`.
    pub prefixes: Vec<String>,
    /// Export names that ship no matter what.
    pub always: Vec<String>,
    /// Your own plugins; see [`CustomPlugin`].
    pub custom: Vec<CustomPlugin>,
    /// Where the client modules come from.
    pub from: Source,
    /// The file the module will be written to, so custom plugins get relative imports. Without
    /// it they are root-absolute (`/src/plugins/upper.ts`), which suits Vite.
    pub out: Option<PathBuf>,
}

impl Default for Options {
    fn default() -> Self {
        Options {
            root: std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
            include: DEFAULT_INCLUDE.iter().map(PathBuf::from).collect(),
            extensions: DEFAULT_EXTENSIONS.iter().map(|s| (*s).to_owned()).collect(),
            prefixes: vec!["data-".into()],
            always: Vec::new(),
            custom: Vec::new(),
            from: Source::default(),
            out: None,
        }
    }
}

/// The built-in plugins, importable from `from`.
pub fn builtin_plugins(from: &Source) -> Vec<PluginMeta> {
    let specifier = from.plugins();
    BUILTIN
        .iter()
        .map(|b| PluginMeta {
            export: b.export.into(),
            name: b.name.into(),
            kind: b.kind,
            from: specifier.clone(),
            literal: b.literal,
            args: b.args.iter().map(|a| (*a).to_owned()).collect(),
        })
        .collect()
}

/// Plugins a network function implies: the handlers that apply what comes back.
pub fn implied(export: &str) -> &'static [&'static str] {
    match export {
        "boost" => &["httpGet", "httpPost", "applyElements", "applyState"],
        "httpGet" | "httpPost" | "httpPut" | "httpPatch" | "httpDelete" | "websocket" => {
            &["applyElements", "applyState"]
        }
        _ => &[],
    }
}

fn is_ident(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'$'
}

fn skip_ws(s: &[u8], mut i: usize) -> usize {
    while i < s.len() && s[i].is_ascii_whitespace() {
        i += 1;
    }
    i
}

fn quoted(s: &str) -> Option<&str> {
    let s = s.trim();
    let b = s.as_bytes();
    if b.len() >= 2 && matches!(b[0], b'\'' | b'"' | b'`') && b[b.len() - 1] == b[0] {
        Some(&s[1..s.len() - 1])
    } else {
        None
    }
}

/// `key: 'value'` inside a plugin definition body.
fn quoted_field<'a>(body: &'a str, key: &str) -> Option<&'a str> {
    let b = body.as_bytes();
    let mut start = 0;
    while let Some(i) = body[start..].find(key).map(|i| i + start) {
        start = i + key.len();
        if i > 0 && is_ident(b[i - 1]) {
            continue;
        }
        let mut j = skip_ws(b, i + key.len());
        if j >= b.len() || b[j] != b':' {
            continue;
        }
        j = skip_ws(b, j + 1);
        if j >= b.len() || !matches!(b[j], b'\'' | b'"' | b'`') {
            continue;
        }
        let q = b[j];
        let end = body[j + 1..].find(q as char)? + j + 1;
        return Some(&body[j + 1..end]);
    }
    None
}

fn flag_field(body: &str, key: &str, value: &str) -> bool {
    let b = body.as_bytes();
    let mut start = 0;
    while let Some(i) = body[start..].find(key).map(|i| i + start) {
        start = i + key.len();
        if i > 0 && is_ident(b[i - 1]) {
            continue;
        }
        let mut j = skip_ws(b, i + key.len());
        if j >= b.len() || b[j] != b':' {
            continue;
        }
        j = skip_ws(b, j + 1);
        if body[j..].starts_with(value) {
            return true;
        }
    }
    false
}

/// Read a custom plugin's metadata from its source without running it: finds
/// `export const <export> = attribute({ name: 'x', … })` (or `action` / `handler`).
pub fn custom_plugin_meta(export: &str, source: &str, from: &str) -> Option<PluginMeta> {
    let b = source.as_bytes();
    let mut start = 0;
    while let Some(i) = source[start..].find("export").map(|i| i + start) {
        start = i + 6;
        if i > 0 && is_ident(b[i - 1]) {
            continue;
        }
        let mut j = i + 6;
        if j >= b.len() || !b[j].is_ascii_whitespace() {
            continue;
        }
        j = skip_ws(b, j);
        if !source[j..].starts_with("const") {
            continue;
        }
        j = skip_ws(b, j + 5);
        if !source[j..].starts_with(export) {
            continue;
        }
        j += export.len();
        if j < b.len() && is_ident(b[j]) {
            continue;
        }
        j = skip_ws(b, j);
        if j < b.len() && b[j] == b':' {
            j = source[j..].find('=').map(|e| e + j)?;
        }
        if j >= b.len() || b[j] != b'=' {
            continue;
        }
        j = skip_ws(b, j + 1);
        let kind = if source[j..].starts_with("attribute") {
            (Kind::Attribute, 9)
        } else if source[j..].starts_with("action") {
            (Kind::Action, 6)
        } else if source[j..].starts_with("handler") {
            (Kind::Handler, 7)
        } else {
            continue;
        };
        j = skip_ws(b, j + kind.1);
        if j >= b.len() || b[j] != b'(' {
            continue;
        }
        j = skip_ws(b, j + 1);
        if j >= b.len() || b[j] != b'{' {
            continue;
        }
        let body_start = j + 1;
        let mut depth = 1usize;
        let mut k = body_start;
        while k < b.len() && depth > 0 {
            match b[k] {
                b'{' => depth += 1,
                b'}' => depth -= 1,
                _ => {}
            }
            k += 1;
        }
        let body = &source[body_start..k.saturating_sub(1).max(body_start)];
        let name = quoted_field(body, "name")?;
        let args = body
            .find("args")
            .filter(|&a| a == 0 || !is_ident(b[body_start + a - 1]))
            .and_then(|a| {
                let rest = &body[a + 4..];
                let open = rest.find('[')?;
                if rest[..open].trim() != ":" {
                    return None;
                }
                let close = rest[open..].find(']')? + open;
                Some(
                    rest[open + 1..close]
                        .split(',')
                        .filter_map(|s| quoted(s).map(str::to_owned))
                        .collect::<Vec<_>>(),
                )
            })
            .unwrap_or_default();
        return Some(PluginMeta {
            export: export.to_owned(),
            name: name.to_owned(),
            kind: kind.0,
            from: from.to_owned(),
            literal: flag_field(body, "literal", "true"),
            args,
        });
    }
    None
}

/// True if `source` refers to the plugin: `data-<name>` for directives (any listed prefix),
/// `@name(` for functions, the name as a quoted string for handlers.
pub fn mentions(source: &str, p: &PluginMeta, prefixes: &[String]) -> bool {
    match p.kind {
        Kind::Attribute => prefixes
            .iter()
            .any(|pre| mentions_attr(source, &format!("{pre}{}", p.name))),
        Kind::Action => mentions_action(source, &p.name),
        Kind::Handler => mentions_handler(source, &p.name),
    }
}

fn mentions_attr(src: &str, needle: &str) -> bool {
    let b = src.as_bytes();
    let mut start = 0;
    while let Some(i) = src[start..].find(needle).map(|i| i + start) {
        let end = i + needle.len();
        let before = i == 0
            || matches!(b[i - 1], b'"' | b'\'' | b'`' | b'<')
            || b[i - 1].is_ascii_whitespace();
        let after = end == b.len()
            || matches!(
                b[end],
                b'=' | b':' | b'_' | b'>' | b'"' | b'\'' | b'`' | b'/'
            )
            || b[end].is_ascii_whitespace();
        if before && after {
            return true;
        }
        start = end;
    }
    false
}

fn mentions_action(src: &str, name: &str) -> bool {
    let needle = format!("@{name}");
    let b = src.as_bytes();
    let mut start = 0;
    while let Some(i) = src[start..].find(&needle).map(|i| i + start) {
        let j = skip_ws(b, i + needle.len());
        if j < b.len() && b[j] == b'(' {
            return true;
        }
        start = i + needle.len();
    }
    false
}

fn mentions_handler(src: &str, name: &str) -> bool {
    let b = src.as_bytes();
    let is_quote = |c: u8| matches!(c, b'\'' | b'"' | b'`');
    let mut start = 0;
    while let Some(i) = src[start..].find(name).map(|i| i + start) {
        let end = i + name.len();
        start = end;
        if end >= b.len() || !is_quote(b[end]) || i == 0 {
            continue;
        }
        if is_quote(b[i - 1]) {
            return true;
        }
        if b[i - 1] == b'-' {
            let mut j = i - 1;
            while j > 0
                && (b[j - 1].is_ascii_alphanumeric() || b[j - 1] == b'_' || b[j - 1] == b'-')
            {
                j -= 1;
            }
            if j > 0 && is_quote(b[j - 1]) {
                return true;
            }
        }
    }
    false
}

/// The outcome of a scan.
#[derive(Debug, Clone, Default)]
pub struct Selection {
    /// The plugins to ship, in the order they were considered.
    pub plugins: Vec<PluginMeta>,
    /// Export name to why it ships: `used`, `always`, or the export that implied it.
    pub reasons: BTreeMap<String, String>,
    /// Known plugins that were left out.
    pub unused: Vec<String>,
    /// The files that were read.
    pub files: Vec<PathBuf>,
}

/// Decide which of `known` plugins to ship given the sources. `always` ships regardless; custom
/// handlers count when their name appears quoted, built-in handlers only through implication.
pub fn select_plugins(
    sources: &[String],
    known: Vec<PluginMeta>,
    prefixes: &[String],
    always: &[String],
    custom: &[String],
) -> Selection {
    let mut reasons: BTreeMap<String, String> = BTreeMap::new();
    fn add(known: &[PluginMeta], reasons: &mut BTreeMap<String, String>, export: &str, why: &str) {
        if !known.iter().any(|p| p.export == export) || reasons.contains_key(export) {
            return;
        }
        reasons.insert(export.to_owned(), why.to_owned());
        for dep in implied(export) {
            add(known, reasons, dep, export);
        }
    }
    for exp in always {
        add(&known, &mut reasons, exp, "always");
    }
    let text = sources.join("\n");
    for p in &known {
        if reasons.contains_key(&p.export) {
            continue;
        }
        if p.kind == Kind::Handler && !custom.contains(&p.export) {
            continue;
        }
        if mentions(&text, p, prefixes) {
            add(&known, &mut reasons, &p.export, "used");
        }
    }
    let plugins: Vec<PluginMeta> = known
        .iter()
        .filter(|p| reasons.contains_key(&p.export))
        .cloned()
        .collect();
    let unused = known
        .iter()
        .filter(|p| !reasons.contains_key(&p.export))
        .map(|p| p.export.clone())
        .collect();
    Selection {
        plugins,
        reasons,
        unused,
        files: Vec::new(),
    }
}

/// Files under `path` (or `path` itself) with one of the extensions; `node_modules`, `target` and
/// dot-directories are skipped.
pub fn walk(path: &Path, extensions: &[String], out: &mut Vec<PathBuf>) {
    let has_ext = |p: &Path| {
        p.to_str()
            .is_some_and(|s| extensions.iter().any(|e| s.ends_with(e.as_str())))
    };
    let Ok(meta) = std::fs::metadata(path) else {
        return;
    };
    if meta.is_file() {
        if has_ext(path) {
            out.push(path.to_path_buf());
        }
        return;
    }
    let Ok(entries) = std::fs::read_dir(path) else {
        return;
    };
    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for e in entries {
        let name = e.file_name();
        let name = name.to_string_lossy();
        if name == "node_modules" || name == "target" || name.starts_with('.') {
            continue;
        }
        let p = e.path();
        if p.is_dir() {
            walk(&p, extensions, out);
        } else if has_ext(&p) {
            out.push(p);
        }
    }
}

/// A relative module specifier from `from_dir` to `to` (`./x.js`, `../lib/x.js`).
pub fn relative_specifier(from_dir: &Path, to: &Path) -> String {
    let norm = |p: &Path| -> Vec<String> {
        let mut parts: Vec<String> = Vec::new();
        for c in p.components() {
            match c {
                Component::Normal(s) => parts.push(s.to_string_lossy().into_owned()),
                Component::ParentDir => {
                    parts.pop();
                }
                _ => {}
            }
        }
        parts
    };
    let (a, b) = (norm(from_dir), norm(to));
    let common = a.iter().zip(b.iter()).take_while(|(x, y)| x == y).count();
    let mut out: Vec<String> = std::iter::repeat("..".to_owned())
        .take(a.len() - common)
        .collect();
    out.extend(b[common..].iter().cloned());
    let s = out.join("/");
    if s.starts_with("..") {
        s
    } else {
        format!("./{s}")
    }
}

/// Scan the project described by `o` and pick the plugins.
pub fn scan(o: &Options) -> io::Result<Selection> {
    let root = std::path::absolute(&o.root)?;
    let mut files = Vec::new();
    for inc in &o.include {
        walk(&root.join(inc), &o.extensions, &mut files);
    }
    let mut sources = Vec::with_capacity(files.len());
    for f in &files {
        sources.push(std::fs::read_to_string(f)?);
    }
    let out_dir = o
        .out
        .as_ref()
        .map(|p| root.join(p))
        .and_then(|p| p.parent().map(Path::to_path_buf));
    let mut known = builtin_plugins(&o.from);
    let mut custom_names = Vec::new();
    let mut always = o.always.clone();
    for c in &o.custom {
        let abs = root.join(&c.path);
        let from = match &out_dir {
            Some(dir) => relative_specifier(dir, &abs),
            None => format!(
                "/{}",
                abs.strip_prefix(&root)
                    .unwrap_or(&abs)
                    .to_string_lossy()
                    .replace('\\', "/")
            ),
        };
        let meta = match (&c.name, c.kind) {
            (Some(name), Some(kind)) => PluginMeta {
                export: c.export.clone(),
                name: name.clone(),
                kind,
                from,
                literal: c.literal,
                args: c.args.clone(),
            },
            _ => {
                let src = std::fs::read_to_string(&abs)?;
                custom_plugin_meta(&c.export, &src, &from).ok_or_else(|| {
                    io::Error::new(
                        io::ErrorKind::InvalidData,
                        format!(
                            "could not read plugin metadata for \"{}\" in {}; declare it with \
                             CustomPlugin::named",
                            c.export,
                            c.path.display()
                        ),
                    )
                })?
            }
        };
        if c.always {
            always.push(c.export.clone());
        }
        custom_names.push(c.export.clone());
        known.push(meta);
    }
    let mut sel = select_plugins(&sources, known, &o.prefixes, &always, &custom_names);
    sel.files = files;
    Ok(sel)
}

fn js_string(s: &str) -> String {
    crate::jsonfmt::json_str(s)
}

/// The module `sigmx scan` writes: imports for every selected plugin, `export const plugins`, and
/// `export const report` with the reasons.
pub fn plugins_module(sel: &Selection) -> String {
    let mut groups: Vec<(String, Vec<String>)> = Vec::new();
    for p in &sel.plugins {
        match groups.iter_mut().find(|(from, _)| *from == p.from) {
            Some((_, names)) => names.push(p.export.clone()),
            None => groups.push((p.from.clone(), vec![p.export.clone()])),
        }
    }
    let mut out = String::new();
    for (from, names) in &groups {
        out.push_str(&format!(
            "import {{ {} }} from {}\n",
            names.join(", "),
            js_string(from)
        ));
    }
    let list: Vec<&str> = sel.plugins.iter().map(|p| p.export.as_str()).collect();
    out.push_str(&format!("export const plugins = [{}]\n", list.join(", ")));
    out.push_str("export const report = {\n  \"reasons\": {\n");
    let reasons: Vec<String> = sel
        .reasons
        .iter()
        .map(|(k, v)| format!("    {}: {}", js_string(k), js_string(v)))
        .collect();
    out.push_str(&reasons.join(",\n"));
    out.push_str("\n  },\n  \"unused\": [\n");
    let unused: Vec<String> = sel
        .unused
        .iter()
        .map(|u| format!("    {}", js_string(u)))
        .collect();
    out.push_str(&unused.join(",\n"));
    out.push_str("\n  ]\n}\n");
    out
}

/// Which plugins an [`Entry`] registers.
#[derive(Debug, Clone)]
pub enum EntryPlugins {
    /// A preset: `all`, `essentials` or `minimal`.
    Preset(String),
    /// The result of a scan.
    Selection(Selection),
}

/// A complete client entry module: imports, plugins, `createSigmx(...)`. Bundle it with your own
/// tools, or serve it as-is next to an unpacked ES tree and let the browser load the modules.
#[derive(Debug, Clone)]
pub struct Entry {
    /// Where the client modules come from.
    pub from: Source,
    /// Which plugins to register.
    pub plugins: EntryPlugins,
    /// Attribute prefixes; only written when not the default `data-`.
    pub prefix: Vec<String>,
    /// Server event-name prefixes; only written when not the default `sigmx-`.
    pub event_prefix: Vec<String>,
    /// Global the instance is exposed as (default `sigmx`); `None` for no global.
    pub expose: Option<String>,
    /// Plugins added on top of the preset or selection: export name and module specifier
    /// (relative to the generated file, or a package). See [`Entry::plugin`].
    pub extra: Vec<(String, String)>,
    /// Statements appended after the instance is created. See [`Entry::append`].
    pub code: Vec<String>,
}

impl Entry {
    /// An entry registering a preset.
    pub fn preset(name: &str, from: Source) -> Self {
        Entry {
            from,
            plugins: EntryPlugins::Preset(name.to_owned()),
            prefix: Vec::new(),
            event_prefix: Vec::new(),
            expose: Some("sigmx".into()),
            extra: Vec::new(),
            code: Vec::new(),
        }
    }

    /// An entry registering what a scan selected.
    pub fn selection(sel: Selection, from: Source) -> Self {
        Entry {
            from,
            plugins: EntryPlugins::Selection(sel),
            prefix: Vec::new(),
            event_prefix: Vec::new(),
            expose: Some("sigmx".into()),
            extra: Vec::new(),
            code: Vec::new(),
        }
    }

    /// Register a plugin of your own regardless of the scan: `export` is imported from `from`
    /// (a specifier relative to the generated file, such as `./js/shout.js`, or a package) and
    /// added to the plugin list. Works with presets too.
    pub fn plugin(mut self, export: impl Into<String>, from: impl Into<String>) -> Self {
        self.extra.push((export.into(), from.into()));
        self
    }

    /// Append JavaScript after the instance is created, for anything the plugin list cannot
    /// express: `sigmx.use(...)` with a plugin object built inline, event listeners, and so on.
    /// The instance is in scope as `sigmx`.
    pub fn append(mut self, code: impl Into<String>) -> Self {
        self.code.push(code.into());
        self
    }

    /// The module source.
    pub fn module(&self) -> String {
        let mut out = format!(
            "import {{ createSigmx }} from {};\n",
            js_string(&self.from.kernel())
        );
        let mut groups: Vec<(String, Vec<String>)> = Vec::new();
        let mut add = |from: &str, export: &str| match groups.iter_mut().find(|(f, _)| f == from) {
            Some((_, names)) => {
                if !names.iter().any(|n| n == export) {
                    names.push(export.to_owned());
                }
            }
            None => groups.push((from.to_owned(), vec![export.to_owned()])),
        };
        let mut list: Vec<String> = Vec::new();
        match &self.plugins {
            EntryPlugins::Preset(name) => {
                add(&self.from.preset(name), name);
                list.push(format!("...{name}"));
            }
            EntryPlugins::Selection(sel) => {
                for p in &sel.plugins {
                    add(&p.from, &p.export);
                    list.push(p.export.clone());
                }
            }
        }
        for (export, from) in &self.extra {
            add(from, export);
            if !list.iter().any(|l| l == export) {
                list.push(export.clone());
            }
        }
        for (from, names) in &groups {
            out.push_str(&format!(
                "import {{ {} }} from {};\n",
                names.join(", "),
                js_string(from)
            ));
        }
        out.push_str(&format!("const plugins = [{}];\n", list.join(", ")));
        let mut opts = vec!["plugins".to_owned()];
        let list = |v: &[String]| {
            format!(
                "[{}]",
                v.iter()
                    .map(|s| js_string(s))
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        };
        if !self.prefix.is_empty() && self.prefix != ["data-"] {
            opts.push(format!("prefix: {}", list(&self.prefix)));
        }
        if !self.event_prefix.is_empty() && self.event_prefix != ["sigmx-"] {
            opts.push(format!("eventPrefix: {}", list(&self.event_prefix)));
        }
        out.push_str(&format!(
            "export const sigmx = createSigmx({{ {} }});\n",
            opts.join(", ")
        ));
        if let Some(name) = &self.expose {
            out.push_str(&format!("globalThis[{}] = sigmx;\n", js_string(name)));
        }
        for code in &self.code {
            out.push_str(code.trim_end());
            out.push('\n');
        }
        out
    }
}
