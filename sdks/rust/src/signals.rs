//! The request side: the signals a sigmx request carries, and the headers it sets.

use serde::de::DeserializeOwned;
use serde_json::{Map, Value};
use std::borrow::Cow;
use std::fmt;

/// The query parameter GET and DELETE requests carry their signals in.
pub const SIGNALS_KEY: &str = "sigmx";
/// The header the client sets on every request it makes (`true`).
pub const REQUEST_HEADER: &str = "sigmx-request";
/// Response header naming the target of a plain HTML response.
pub const SELECTOR_HEADER: &str = "sigmx-selector";
/// Response header with the patch mode of a plain HTML response.
pub const MODE_HEADER: &str = "sigmx-mode";
/// Response header making a plain JSON response keep existing signals.
pub const ONLY_IF_MISSING_HEADER: &str = "sigmx-only-if-missing";

/// True when the `sigmx-request` header value says the sigmx client made the request.
pub fn is_sigmx_request(header: Option<&str>) -> bool {
    header.map(str::trim) == Some("true")
}

/// The signals could not be read: `status` is 400 when the payload could not be parsed and 422
/// when it parsed but did not match the expected type.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SignalsError {
    /// What went wrong.
    pub message: String,
    /// 400 or 422.
    pub status: u16,
}

impl SignalsError {
    /// A parse failure (400).
    pub fn bad_request(message: impl Into<String>) -> Self {
        SignalsError {
            message: message.into(),
            status: 400,
        }
    }
    /// A validation failure (422).
    pub fn invalid(message: impl Into<String>) -> Self {
        SignalsError {
            message: message.into(),
            status: 422,
        }
    }
    /// `{"error": message}`, the body the JavaScript SDK sends for the same failure.
    pub fn json_body(&self) -> String {
        format!("{{\"error\":{}}}", crate::jsonfmt::json_str(&self.message))
    }
}

impl fmt::Display for SignalsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}
impl std::error::Error for SignalsError {}

/// The parts of a request that decide where its signals are.
#[derive(Debug, Clone, Copy)]
pub struct RawRequest<'a> {
    /// HTTP method, any case.
    pub method: &'a str,
    /// The `content-type` header.
    pub content_type: Option<&'a str>,
    /// The query string, without the `?`.
    pub query: Option<&'a str>,
    /// The body. Ignored for GET and DELETE.
    pub body: &'a [u8],
}

/// Read the signals as a JSON object.
///
/// GET and DELETE requests carry them in the `sigmx` query parameter, or as plain query
/// parameters for a `contentType: 'form'` GET (repeated names become arrays); other methods carry
/// a JSON body, or form fields for `contentType: 'form'`.
pub fn parse_signals(req: &RawRequest<'_>) -> Result<Map<String, Value>, SignalsError> {
    let method = req.method.to_ascii_uppercase();
    let content_type = req.content_type.unwrap_or("");
    let raw = if method == "GET" || method == "DELETE" {
        from_query(req.query.unwrap_or(""))?
    } else if content_type.contains("application/json") {
        if req.body.is_empty() {
            Value::Object(Map::new())
        } else {
            serde_json::from_slice(req.body)
                .map_err(|e| SignalsError::bad_request(format!("could not parse signals: {e}")))?
        }
    } else if content_type.contains("multipart/form-data") {
        return Err(SignalsError::bad_request(
            "multipart form bodies are not read as signals; parse the form with your framework",
        ));
    } else if content_type.contains("form") {
        fields_to_object(form_urlencoded::parse(req.body))
    } else {
        Value::Object(Map::new())
    };
    match raw {
        Value::Object(m) => Ok(m),
        _ => Err(SignalsError::bad_request("signals must be an object")),
    }
}

/// Read the signals into a type, typically a `#[derive(Deserialize)]` struct. Parse failures are
/// 400s, type mismatches 422s.
pub fn read_signals<T: DeserializeOwned>(req: &RawRequest<'_>) -> Result<T, SignalsError> {
    let object = parse_signals(req)?;
    serde_json::from_value(Value::Object(object))
        .map_err(|e| SignalsError::invalid(format!("invalid signals: {e}")))
}

fn from_query(query: &str) -> Result<Value, SignalsError> {
    let pairs: Vec<(Cow<'_, str>, Cow<'_, str>)> =
        form_urlencoded::parse(query.as_bytes()).collect();
    if let Some((_, json)) = pairs.iter().find(|(k, _)| k == SIGNALS_KEY) {
        return serde_json::from_str(json)
            .map_err(|e| SignalsError::bad_request(format!("could not parse signals: {e}")));
    }
    Ok(fields_to_object(pairs))
}

/// Form fields as an object; a repeated name becomes an array.
fn fields_to_object<'a, I>(pairs: I) -> Value
where
    I: IntoIterator<Item = (Cow<'a, str>, Cow<'a, str>)>,
{
    let mut out = Map::new();
    for (k, v) in pairs {
        let v = Value::String(v.into_owned());
        match out.get_mut(k.as_ref()) {
            None => {
                out.insert(k.into_owned(), v);
            }
            Some(Value::Array(a)) => a.push(v),
            Some(existing) => {
                let first = std::mem::take(existing);
                *existing = Value::Array(vec![first, v]);
            }
        }
    }
    Value::Object(out)
}
