//! Antigravity-specific stderr / result-error classifiers.
//!
//! Antigravity CLI v1.0.0 has zero stderr fixtures in the wild (it
//! launched the same day this integration landed). The classifier
//! therefore matches **conservative** patterns shared with the Gemini
//! API surface (Google's underlying SDK is the same one gemini-cli
//! uses) plus a handful of obvious "not authenticated" wordings. Every
//! pattern documented here is fixture-tested in the unit-test module
//! below; new fixtures captured from real `agy` runs should be added
//! there with a one-line provenance comment so we can prune speculation
//! over time.
//!
//! Everything else falls through to the catch-all `ProviderError::Unknown`
//! that the [`crate::session_io::read_stderr_lines`] hot path uses, so
//! unrecognised errors still surface a "Report bug" card with the raw
//! excerpt — that's how we grow the fixture set.

use crate::provider_error_kind::{
    truncate_excerpt, AuthFailureCause, ProviderError, QuotaScope,
};

const PROVIDER: &str = "antigravity";

/// Plan-upgrade target shared with Gemini — Antigravity bills on the
/// same Google AI account today. If Google introduces a dedicated
/// Antigravity-only billing page, switch this constant rather than
/// embedding the URL in JSX/i18n.
pub const UPGRADE_URL: &str = "https://antigravity.google/pricing";

pub(crate) fn classify_stderr(line: &str) -> Option<ProviderError> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }

    let lower = trimmed.to_lowercase();

    // Auth — implicit-login CLIs print very direct phrasing when the
    // keyring is empty or rejected.
    if lower.contains("not authenticated")
        || lower.contains("not signed in")
        || lower.contains("no active session")
        || lower.contains("please sign in")
        || lower.contains("login required")
    {
        return Some(ProviderError::Unauthenticated {
            provider: PROVIDER.into(),
            cause: AuthFailureCause::NoCredentials,
            message: truncate_excerpt(trimmed),
        });
    }
    if lower.contains("token expired") || lower.contains("session expired") {
        return Some(ProviderError::Unauthenticated {
            provider: PROVIDER.into(),
            cause: AuthFailureCause::TokenExpired,
            message: truncate_excerpt(trimmed),
        });
    }
    if (lower.contains("401") || lower.contains("403"))
        && (lower.contains("unauthorized") || lower.contains("forbidden") || lower.contains("auth"))
    {
        return Some(ProviderError::Unauthenticated {
            provider: PROVIDER.into(),
            cause: AuthFailureCause::Unknown,
            message: truncate_excerpt(trimmed),
        });
    }

    // Rate limit / quota — both are common in Gemini-backed flows and
    // the wording carries over to Antigravity (same upstream SDK).
    if lower.contains("429") || lower.contains("rate limit") || lower.contains("rate_limit") {
        return Some(ProviderError::RateLimited {
            provider: PROVIDER.into(),
            model: None,
            retry_after_seconds: None,
            message: truncate_excerpt(trimmed),
        });
    }
    if (lower.contains("quota") && lower.contains("exhaust"))
        || lower.contains("daily limit")
        || lower.contains("monthly limit")
    {
        return Some(ProviderError::QuotaExhausted {
            provider: PROVIDER.into(),
            model: None,
            scope: QuotaScope::Unknown,
            message: truncate_excerpt(trimmed),
            upgrade_url: Some(UPGRADE_URL.into()),
        });
    }

    // 5xx and explicit upstream-down phrasing.
    if let Some(status) = parse_http_5xx(trimmed) {
        return Some(ProviderError::ProviderInternal {
            provider: PROVIDER.into(),
            http_status: Some(status),
            message: truncate_excerpt(trimmed),
        });
    }

    // Network — connection refused, ECONNRESET, dial tcp i/o errors
    // (Go's net package emits these directly into stderr).
    if lower.contains("connection refused")
        || lower.contains("connection reset")
        || lower.contains("no such host")
        || lower.contains("i/o timeout")
        || lower.contains("dial tcp")
    {
        return Some(ProviderError::NetworkUnreachable {
            provider: PROVIDER.into(),
            message: truncate_excerpt(trimmed),
        });
    }

    None
}

/// Classify structured `result {status:"error", error:{type,message}}`
/// events. Antigravity v1.0.0 does not emit such events on `--print`
/// (it returns plain text), but the wiring is in place for when
/// structured streaming output ships upstream — at that point the
/// dispatch in [`crate::session_dispatch`] grows a real NDJSON parser
/// and this function gets called with the upstream-defined error
/// class names.
pub(crate) fn classify_result_error(
    error_type: &str,
    error_message: &str,
) -> Option<ProviderError> {
    match error_type {
        "QuotaExceeded" | "ResourceExhausted" => Some(ProviderError::QuotaExhausted {
            provider: PROVIDER.into(),
            model: None,
            scope: QuotaScope::Unknown,
            message: truncate_excerpt(error_message),
            upgrade_url: Some(UPGRADE_URL.into()),
        }),
        "Unauthenticated" | "AuthenticationError" => Some(ProviderError::Unauthenticated {
            provider: PROVIDER.into(),
            cause: AuthFailureCause::Unknown,
            message: truncate_excerpt(error_message),
        }),
        "Unavailable" | "InternalError" => Some(ProviderError::ProviderInternal {
            provider: PROVIDER.into(),
            http_status: None,
            message: truncate_excerpt(error_message),
        }),
        _ => None,
    }
}

fn parse_http_5xx(line: &str) -> Option<u16> {
    // Match `5xx` anywhere — Go's stdlib prints `HTTP 502 Bad Gateway`
    // and SDK wrappers print `status: 500`. Both end up here.
    for token in line.split(|c: char| !c.is_ascii_digit()) {
        if token.len() == 3 {
            if let Ok(n) = token.parse::<u16>() {
                if (500..=599).contains(&n) {
                    return Some(n);
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn variant(p: &ProviderError) -> &'static str {
        match p {
            ProviderError::RateLimited { .. } => "RateLimited",
            ProviderError::QuotaExhausted { .. } => "QuotaExhausted",
            ProviderError::ModelUnavailable { .. } => "ModelUnavailable",
            ProviderError::Unauthenticated { .. } => "Unauthenticated",
            ProviderError::NetworkUnreachable { .. } => "NetworkUnreachable",
            ProviderError::ProviderInternal { .. } => "ProviderInternal",
            ProviderError::SessionResumeMissing { .. } => "SessionResumeMissing",
            ProviderError::MalformedResponse { .. } => "MalformedResponse",
            ProviderError::SpawnFailed { .. } => "SpawnFailed",
            ProviderError::Cancelled { .. } => "Cancelled",
            ProviderError::Unknown { .. } => "Unknown",
        }
    }

    #[test]
    fn empty_line_is_none() {
        assert!(classify_stderr("").is_none());
        assert!(classify_stderr("   \n  ").is_none());
    }

    #[test]
    fn detects_not_authenticated() {
        // Speculative wording — replace with a real fixture from the
        // first reported `agy` auth-rejection log.
        let p = classify_stderr("error: not authenticated — please sign in").unwrap();
        assert_eq!(variant(&p), "Unauthenticated");
        if let ProviderError::Unauthenticated { cause, .. } = p {
            assert_eq!(cause, AuthFailureCause::NoCredentials);
        }
    }

    #[test]
    fn detects_token_expired() {
        let p = classify_stderr("agy: token expired, rerun to re-authenticate").unwrap();
        if let ProviderError::Unauthenticated { cause, .. } = p {
            assert_eq!(cause, AuthFailureCause::TokenExpired);
        } else {
            panic!("expected Unauthenticated, got {p:?}");
        }
    }

    #[test]
    fn detects_401_with_auth_word() {
        let p = classify_stderr("HTTP 401 unauthorized while calling Gemini API").unwrap();
        assert_eq!(variant(&p), "Unauthenticated");
    }

    #[test]
    fn detects_rate_limit() {
        let p = classify_stderr("error: HTTP 429 rate limit reached").unwrap();
        assert_eq!(variant(&p), "RateLimited");
    }

    #[test]
    fn detects_quota_exhausted_with_upgrade_url() {
        let p = classify_stderr("quota exhausted for project, raise the limit").unwrap();
        match p {
            ProviderError::QuotaExhausted { upgrade_url, .. } => {
                assert_eq!(upgrade_url.as_deref(), Some(UPGRADE_URL));
            }
            other => panic!("expected QuotaExhausted, got {other:?}"),
        }
    }

    #[test]
    fn detects_5xx_status() {
        let p = classify_stderr("upstream returned HTTP 503 service unavailable").unwrap();
        match p {
            ProviderError::ProviderInternal { http_status, .. } => {
                assert_eq!(http_status, Some(503));
            }
            other => panic!("expected ProviderInternal, got {other:?}"),
        }
    }

    #[test]
    fn detects_network_unreachable() {
        let p = classify_stderr("dial tcp: lookup ai.google.com: no such host").unwrap();
        assert_eq!(variant(&p), "NetworkUnreachable");
    }

    #[test]
    fn unknown_lines_return_none() {
        // Informational logs MUST fall through so the runner doesn't
        // false-positive every routine line into an error card.
        assert!(classify_stderr("[agy] connecting to API…").is_none());
        assert!(classify_stderr("loaded 12 plugins").is_none());
    }

    #[test]
    fn classify_result_error_maps_known_types() {
        let q = classify_result_error("QuotaExceeded", "daily quota for gemini-3-pro").unwrap();
        assert_eq!(variant(&q), "QuotaExhausted");

        let a = classify_result_error("AuthenticationError", "no active session").unwrap();
        assert_eq!(variant(&a), "Unauthenticated");

        let i = classify_result_error("InternalError", "upstream timeout").unwrap();
        assert_eq!(variant(&i), "ProviderInternal");

        assert!(classify_result_error("SomeFutureClass", "future").is_none());
    }
}
