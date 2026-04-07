//! Slack OAuth flow for desktop apps using a local HTTP server.
//!
//! Flow: open browser → user approves → callback to localhost → exchange code → tokens.

use anyhow::Context;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

use super::types::OAuthAccessResponse;

const DEFAULT_PORT: u16 = 28957;
const REDIRECT_PATH: &str = "/slack/callback";

/// Configuration for the Slack OAuth flow.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SlackOAuthConfig {
    pub client_id: String,
    pub client_secret: String,
}

/// Tokens received from a successful OAuth flow.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SlackOAuthTokens {
    pub bot_token: String,
    pub team_id: String,
    pub team_name: String,
}

/// Build the Slack OAuth authorization URL.
pub fn authorization_url(config: &SlackOAuthConfig) -> String {
    let scopes = [
        "channels:history",
        "channels:manage",
        "channels:read",
        "channels:join",
        "chat:write",
        "groups:history",
        "groups:read",
        "im:history",
        "im:read",
        "reactions:read",
        "users:read",
    ]
    .join(",");

    let redirect = format!("https://localhost:{DEFAULT_PORT}{REDIRECT_PATH}");
    format!(
        "https://slack.com/oauth/v2/authorize?client_id={}&scope={scopes}&redirect_uri={redirect}",
        config.client_id
    )
}

/// Start a local HTTP server, wait for the OAuth callback, exchange for tokens.
pub async fn run_oauth_flow(config: &SlackOAuthConfig) -> anyhow::Result<SlackOAuthTokens> {
    let listener = TcpListener::bind(format!("127.0.0.1:{DEFAULT_PORT}"))
        .await
        .context("failed to bind OAuth callback server")?;

    tracing::info!(port = DEFAULT_PORT, "OAuth callback server listening");

    let (mut stream, _) = listener.accept().await.context("accept failed")?;
    let mut buf = vec![0u8; 4096];
    let n = stream.read(&mut buf).await.context("read failed")?;
    let request = String::from_utf8_lossy(&buf[..n]);

    let code = parse_code(&request)
        .ok_or_else(|| anyhow::anyhow!("no code in OAuth callback"))?;

    let html = "<html><body style=\"font-family:system-ui;text-align:center;padding:80px\">\
                <h1>Connected to Slack!</h1><p>You can close this window.</p></body></html>";
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\n\r\n{html}",
        html.len()
    );
    stream.write_all(response.as_bytes()).await.ok();

    exchange_code(config, &code).await
}

fn parse_code(request: &str) -> Option<String> {
    let first_line = request.lines().next()?;
    let path = first_line.split_whitespace().nth(1)?;
    let query = path.split('?').nth(1)?;
    for param in query.split('&') {
        let mut kv = param.splitn(2, '=');
        if kv.next() == Some("code") {
            return kv.next().map(String::from);
        }
    }
    None
}

async fn exchange_code(
    config: &SlackOAuthConfig,
    code: &str,
) -> anyhow::Result<SlackOAuthTokens> {
    let redirect = format!("https://localhost:{DEFAULT_PORT}{REDIRECT_PATH}");
    let client = reqwest::Client::new();
    let resp = client
        .post("https://slack.com/api/oauth.v2.access")
        .form(&[
            ("client_id", config.client_id.as_str()),
            ("client_secret", config.client_secret.as_str()),
            ("code", code),
            ("redirect_uri", redirect.as_str()),
        ])
        .send()
        .await
        .context("oauth.v2.access request failed")?;

    let result: OAuthAccessResponse = resp
        .json()
        .await
        .context("failed to parse oauth.v2.access response")?;

    if !result.ok {
        anyhow::bail!("OAuth failed: {}", result.error.unwrap_or_default());
    }

    let team = result.team.ok_or_else(|| anyhow::anyhow!("no team in response"))?;
    Ok(SlackOAuthTokens {
        bot_token: result
            .access_token
            .ok_or_else(|| anyhow::anyhow!("no access_token"))?,
        team_id: team.id,
        team_name: team.name,
    })
}
