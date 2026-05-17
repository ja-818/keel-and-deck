use super::prompts;
use super::scheduler::SchedulerContext;
use super::types::OrchestrationManifest;
use crate::sessions::{self, StartParams};
use std::path::PathBuf;

pub async fn spawn(ctx: &SchedulerContext, manifest: &OrchestrationManifest) -> Result<(), String> {
    sessions::start(
        &ctx.sessions,
        ctx.events.clone(),
        ctx.db.clone(),
        &ctx.app_system_prompt,
        StartParams {
            agent_dir: PathBuf::from(&manifest.parent_agent_path),
            working_dir: PathBuf::from(&manifest.parent_agent_path),
            session_key: manifest.parent_session_key.clone(),
            prompt: prompts::parent_summary_prompt(manifest),
            visible_user_message: false,
            system_prompt: None,
            source: Some("orchestration-summary".into()),
            provider: ctx.provider,
            model: ctx.model.clone(),
            native_delegation_policy: houston_terminal_manager::NativeDelegationPolicy::Block,
            effort: None,
        },
    )
    .await
    .map(|_| ())
    .map_err(|err| err.to_string())
}
