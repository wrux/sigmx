//! `sigmx`: the client and the scanner from the command line, for builds without Node.
//!
//!   sigmx client standalone <out.js>        write the script-tag build (every plugin)
//!   sigmx client unpack <dir>               write the ES module tree (kernel/, plugins/, presets/)
//!   sigmx scan [paths…] [options]           print or write the plugins module auto mode selects
//!   sigmx entry [paths…] --out <file>       write a complete entry module (scan + createSigmx)
//!   sigmx version

use sigmx::scan::{self, CustomPlugin, Entry, Kind, Options, Source};
use std::path::PathBuf;
use std::process::exit;

const USAGE: &str = "usage:
  sigmx client standalone <out.js>
  sigmx client unpack <dir>
  sigmx scan [paths...] [--root DIR] [--out FILE] [--from ./vendor/sigmx | sigmx]
             [--always a,b] [--custom name=path[:kind:name],...] [--prefix data-,hx-] [--ext .rs,.html]
  sigmx entry [paths...] --out FILE [--from ./vendor/sigmx] [--preset all|essentials|minimal]
             [--always a,b] [--custom name=path[:kind:name],...] [--plugin name=specifier,...]
             [--prefix data-,hx-] [--event-prefix sigmx-,datastar-] [--expose NAME|none] [--ext .rs,.html]
  sigmx version

  --custom  a plugin of yours, scanned for like the built-ins; its definition is read from the
            file, or declared as name=path:attribute|action|handler:<directive-name>
  --plugin  a plugin registered regardless of the scan (entry only); the specifier is relative to
            the output file, e.g. shout=./js/shout.js, or a package";

fn main() {
    let mut args: Vec<String> = std::env::args().skip(1).collect();
    let Some(cmd) = args.first().cloned() else {
        println!("{USAGE}");
        return;
    };
    args.remove(0);
    let result = match cmd.as_str() {
        "client" => client(args),
        "scan" => scan_cmd(args, false),
        "entry" => scan_cmd(args, true),
        "version" | "--version" | "-V" => {
            println!(
                "sigmx {} (client {})",
                env!("CARGO_PKG_VERSION"),
                sigmx::client::VERSION
            );
            Ok(())
        }
        "help" | "--help" | "-h" => {
            println!("{USAGE}");
            Ok(())
        }
        other => Err(format!("unknown command '{other}'\n{USAGE}")),
    };
    if let Err(e) = result {
        eprintln!("sigmx: {e}");
        exit(1);
    }
}

fn client(args: Vec<String>) -> Result<(), String> {
    match (args.first().map(String::as_str), args.get(1)) {
        (Some("standalone"), Some(out)) => {
            sigmx::client::write_standalone(out).map_err(|e| format!("{out}: {e}"))?;
            eprintln!(
                "sigmx: wrote {out} ({} bytes, sigmx {})",
                sigmx::client::STANDALONE.len(),
                sigmx::client::VERSION
            );
            Ok(())
        }
        (Some("unpack"), Some(dir)) => {
            let files = sigmx::client::write_esm(dir).map_err(|e| format!("{dir}: {e}"))?;
            eprintln!(
                "sigmx: wrote {} modules under {dir} (sigmx {})",
                files.len(),
                sigmx::client::VERSION
            );
            Ok(())
        }
        _ => Err(format!(
            "client needs 'standalone <out.js>' or 'unpack <dir>'\n{USAGE}"
        )),
    }
}

/// Removes `--name value` from `args`, returning the value.
fn opt(args: &mut Vec<String>, name: &str) -> Result<Option<String>, String> {
    let flag = format!("--{name}");
    let Some(i) = args.iter().position(|a| *a == flag) else {
        return Ok(None);
    };
    if i + 1 >= args.len() {
        return Err(format!("{flag} needs a value"));
    }
    args.remove(i);
    Ok(Some(args.remove(i)))
}

fn list(v: Option<String>) -> Vec<String> {
    v.map(|s| {
        s.split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
            .collect()
    })
    .unwrap_or_default()
}

fn scan_cmd(mut args: Vec<String>, entry: bool) -> Result<(), String> {
    let mut o = Options::default();
    if let Some(root) = opt(&mut args, "root")? {
        o.root = PathBuf::from(root);
    }
    let out = opt(&mut args, "out")?;
    if let Some(from) = opt(&mut args, "from")? {
        o.from = if from.starts_with('.') || from.starts_with('/') {
            Source::Dir(from)
        } else {
            Source::Package(from)
        };
    }
    let always = list(opt(&mut args, "always")?);
    let prefixes = list(opt(&mut args, "prefix")?);
    let event_prefix = list(opt(&mut args, "event-prefix")?);
    let ext = list(opt(&mut args, "ext")?);
    let preset = opt(&mut args, "preset")?;
    let expose = opt(&mut args, "expose")?;
    let custom = list(opt(&mut args, "custom")?);
    let plugins = list(opt(&mut args, "plugin")?);
    if let Some(bad) = args.iter().find(|a| a.starts_with("--")) {
        return Err(format!("unknown option {bad}\n{USAGE}"));
    }
    if !args.is_empty() {
        o.include = args.iter().map(PathBuf::from).collect();
    }
    if !prefixes.is_empty() {
        o.prefixes = prefixes.clone();
    }
    if !ext.is_empty() {
        o.extensions = ext;
    }
    o.always = always;
    o.out = out.as_ref().map(PathBuf::from);
    for pair in custom {
        let (name, rest) = pair
            .split_once('=')
            .ok_or_else(|| format!("--custom entries are name=path[:kind:name], got '{pair}'"))?;
        let mut parts = rest.splitn(3, ':');
        let path = parts.next().unwrap_or_default();
        let mut c = CustomPlugin::new(name, path);
        if let (Some(kind), Some(plugin_name)) = (parts.next(), parts.next()) {
            let kind = match kind {
                "attribute" => Kind::Attribute,
                "action" => Kind::Action,
                "handler" => Kind::Handler,
                other => return Err(format!("unknown plugin kind '{other}' in --custom {pair}")),
            };
            c = c.named(plugin_name, kind);
        }
        o.custom.push(c);
    }
    let mut extra = Vec::new();
    for pair in plugins {
        let (name, from) = pair
            .split_once('=')
            .ok_or_else(|| format!("--plugin entries are name=specifier, got '{pair}'"))?;
        extra.push((name.to_owned(), from.to_owned()));
    }

    let code = if entry {
        let mut e = match preset {
            Some(p) => Entry::preset(&p, o.from.clone()),
            None => Entry::selection(scan::scan(&o).map_err(|e| e.to_string())?, o.from.clone()),
        };
        e.prefix = prefixes;
        e.event_prefix = event_prefix;
        e.extra = extra;
        e.expose = match expose.as_deref() {
            Some("none") | Some("false") => None,
            Some(n) => Some(n.to_owned()),
            None => Some("sigmx".into()),
        };
        report(&e.plugins);
        e.module()
    } else {
        let sel = scan::scan(&o).map_err(|e| e.to_string())?;
        report(&scan::EntryPlugins::Selection(sel.clone()));
        scan::plugins_module(&sel)
    };
    match out {
        Some(path) => {
            let p = o.root.join(&path);
            if let Some(parent) = p.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("{}: {e}", parent.display()))?;
            }
            std::fs::write(&p, code).map_err(|e| format!("{}: {e}", p.display()))?;
            eprintln!("sigmx: wrote {}", p.display());
        }
        None => print!("{code}"),
    }
    Ok(())
}

fn report(plugins: &scan::EntryPlugins) {
    match plugins {
        scan::EntryPlugins::Preset(p) => eprintln!("sigmx: preset {p}"),
        scan::EntryPlugins::Selection(sel) => {
            let names: Vec<&str> = sel.plugins.iter().map(|p| p.export.as_str()).collect();
            eprintln!(
                "sigmx: {} plugins ({}); {} unused; {} files scanned",
                names.len(),
                names.join(", "),
                sel.unused.len(),
                sel.files.len()
            );
        }
    }
}
