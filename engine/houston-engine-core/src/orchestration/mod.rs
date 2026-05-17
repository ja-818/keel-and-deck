//! Engine-owned DAG orchestration for temporary specialized agents.

mod activity_projection;
mod adjust;
mod context;
mod create;
mod graph;
mod parent_summary;
mod prompts;
mod role_profile;
mod save;
mod scheduler;
mod store;
mod types;

pub use adjust::adjust_and_run;
pub use create::create_and_run;
pub use save::save_agents;
pub use types::{AgentIntent, CreateAndRunResult, CreatedAgent, OrchestrationManifest};

pub fn status(
    parent_agent_path: &str,
    parent_session_key: &str,
) -> crate::CoreResult<Option<OrchestrationManifest>> {
    store::read_optional(parent_agent_path, parent_session_key)
}
