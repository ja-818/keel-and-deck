use reqwest::StatusCode;
use serde_json::Value;

#[tauri::command(rename_all = "snake_case")]
pub async fn report_bug(payload: Value) -> Result<(), String> {
    let webhook_url = bug_webhook_url().ok_or_else(|| {
        "Bug reporting not configured (missing SLACK_BUG_WEBHOOK_URL at build time)".to_string()
    })?;

    send_bug_report_to(&webhook_url, &payload).await
}

async fn send_bug_report_to(webhook_url: &str, payload: &Value) -> Result<(), String> {
    let response = reqwest::Client::new()
        .post(webhook_url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Slack webhook request failed: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        let body = response
            .text()
            .await
            .unwrap_or_else(|e| format!("could not read Slack response body: {e}"));
        let message = slack_error_message(status, &body);
        tracing::warn!(%message, "bug report webhook rejected payload");
        return Err(message);
    }

    Ok(())
}

fn bug_webhook_url() -> Option<String> {
    configured_webhook_url(
        std::env::var("SLACK_BUG_WEBHOOK_URL").ok(),
        option_env!("SLACK_BUG_WEBHOOK_URL"),
    )
}

fn configured_webhook_url(
    runtime: Option<String>,
    compiled: Option<&'static str>,
) -> Option<String> {
    runtime
        .as_deref()
        .map(str::trim)
        .filter(|url| !url.is_empty())
        .map(str::to_string)
        .or_else(|| {
            compiled
                .map(str::trim)
                .filter(|url| !url.is_empty())
                .map(str::to_string)
        })
}

fn slack_error_message(status: StatusCode, body: &str) -> String {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return format!("Slack webhook failed: {status}");
    }
    let detail = if trimmed.len() > 160 {
        format!("{}...", trimmed.chars().take(160).collect::<String>())
    } else {
        trimmed.to_string()
    };
    format!("Slack webhook failed: {status} {detail}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    #[test]
    fn configured_webhook_prefers_runtime_value() {
        let url = configured_webhook_url(
            Some(" https://hooks.slack.test/runtime ".to_string()),
            Some("https://hooks.slack.test/compiled"),
        );
        assert_eq!(url.as_deref(), Some("https://hooks.slack.test/runtime"));
    }

    #[test]
    fn configured_webhook_uses_compiled_fallback() {
        let url = configured_webhook_url(Some(" ".to_string()), Some(" compiled "));
        assert_eq!(url.as_deref(), Some("compiled"));
    }

    #[test]
    fn slack_error_message_keeps_status_and_body() {
        let message = slack_error_message(StatusCode::BAD_REQUEST, "invalid_payload");
        assert_eq!(
            message,
            "Slack webhook failed: 400 Bad Request invalid_payload"
        );
    }

    #[tokio::test]
    async fn send_bug_report_posts_payload_to_webhook() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test webhook");
        let addr = listener.local_addr().expect("read listener address");

        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept request");
            let mut request = Vec::new();
            let mut buffer = [0; 1024];
            loop {
                let read = stream.read(&mut buffer).expect("read request");
                if read == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..read]);
                if let Some(header_end) = find_header_end(&request) {
                    let headers = String::from_utf8_lossy(&request[..header_end]);
                    let content_length = headers
                        .lines()
                        .find_map(|line| {
                            let (name, value) = line.split_once(':')?;
                            name.eq_ignore_ascii_case("content-length")
                                .then(|| value.trim())
                        })
                        .and_then(|value| value.parse::<usize>().ok())
                        .unwrap_or(0);
                    if request.len() >= header_end + 4 + content_length {
                        break;
                    }
                }
            }
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok")
                .expect("write response");
            String::from_utf8(request).expect("request is utf8")
        });

        let payload = serde_json::json!({
            "attachments": [{ "title": "Bug Report from Houston" }]
        });
        send_bug_report_to(&format!("http://{addr}/slack"), &payload)
            .await
            .expect("send bug report");

        let request = server.join().expect("join webhook server");
        assert!(request.starts_with("POST /slack HTTP/1.1"));
        assert!(request.contains("application/json"));
        assert!(request.contains("\"Bug Report from Houston\""));
    }

    fn find_header_end(request: &[u8]) -> Option<usize> {
        request.windows(4).position(|window| window == b"\r\n\r\n")
    }
}
