//! Standalone Slack Web API helpers.
//!
//! These functions work with raw tokens and don't require a Channel adapter.
//! Used by both the SlackChannel adapter and the SlackSync module.

use anyhow::Context;

use super::types::{
    ConversationsCreateResponse, ConversationsListResponse, PostMessageResponse,
};
use crate::types::SendResult;

const BASE: &str = "https://slack.com/api";

/// Post a message (optionally threaded) and return the message's `ts`.
pub async fn post_message(
    bot_token: &str,
    channel: &str,
    text: &str,
    thread_ts: Option<&str>,
) -> anyhow::Result<SendResult> {
    let client = reqwest::Client::new();
    let mut body = serde_json::json!({
        "channel": channel,
        "text": text,
    });
    if let Some(ts) = thread_ts {
        body["thread_ts"] = serde_json::Value::String(ts.to_string());
    }

    let resp = client
        .post(format!("{BASE}/chat.postMessage"))
        .bearer_auth(bot_token)
        .json(&body)
        .send()
        .await
        .context("chat.postMessage request failed")?;

    let result: PostMessageResponse = resp
        .json()
        .await
        .context("failed to parse chat.postMessage response")?;

    if !result.ok {
        anyhow::bail!("chat.postMessage: {}", result.error.unwrap_or_default());
    }

    Ok(SendResult {
        message_ts: result.ts,
    })
}

/// Create a public Slack channel. Returns the channel ID.
/// If the channel name is already taken, finds and joins the existing one.
pub async fn create_channel(bot_token: &str, name: &str) -> anyhow::Result<String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{BASE}/conversations.create"))
        .bearer_auth(bot_token)
        .json(&serde_json::json!({ "name": name }))
        .send()
        .await
        .context("conversations.create request failed")?;

    let result: ConversationsCreateResponse = resp
        .json()
        .await
        .context("failed to parse conversations.create response")?;

    if !result.ok {
        let err = result.error.unwrap_or_default();
        if err == "name_taken" {
            return find_and_join_channel(bot_token, name).await;
        }
        anyhow::bail!("conversations.create: {err}");
    }

    result
        .channel
        .map(|c| c.id)
        .ok_or_else(|| anyhow::anyhow!("no channel in create response"))
}

/// Find a channel by name and join it. Returns the channel ID.
async fn find_and_join_channel(bot_token: &str, name: &str) -> anyhow::Result<String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{BASE}/conversations.list"))
        .bearer_auth(bot_token)
        .query(&[("types", "public_channel"), ("limit", "200")])
        .send()
        .await
        .context("conversations.list request failed")?;

    let result: ConversationsListResponse = resp
        .json()
        .await
        .context("failed to parse conversations.list response")?;

    if !result.ok {
        anyhow::bail!("conversations.list: {}", result.error.unwrap_or_default());
    }

    let channel = result
        .channels
        .unwrap_or_default()
        .into_iter()
        .find(|c| c.name == name)
        .ok_or_else(|| anyhow::anyhow!("channel '{name}' not found"))?;

    // Join the channel (no-op if already joined)
    let _ = client
        .post(format!("{BASE}/conversations.join"))
        .bearer_auth(bot_token)
        .json(&serde_json::json!({ "channel": channel.id }))
        .send()
        .await;

    Ok(channel.id)
}
