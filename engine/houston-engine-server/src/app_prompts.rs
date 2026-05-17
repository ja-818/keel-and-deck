use houston_engine_core::{preferences, EngineState};
use houston_terminal_manager::NativeDelegationPolicy;

pub async fn selected_app_system_prompt(engine: &EngineState) -> String {
    let level = preferences::experience_level(&engine.db).await;
    if level == "beginner" && !engine.app_beginner_system_prompt.is_empty() {
        engine.app_beginner_system_prompt.clone()
    } else {
        engine.app_system_prompt.clone()
    }
}

pub async fn selected_native_delegation_policy(engine: &EngineState) -> NativeDelegationPolicy {
    match preferences::experience_level(&engine.db).await.as_str() {
        "beginner" => NativeDelegationPolicy::Block,
        _ => NativeDelegationPolicy::Allow,
    }
}

#[cfg(test)]
mod tests {
    use super::{selected_app_system_prompt, selected_native_delegation_policy};
    use crate::{ServerConfig, ServerState};
    use houston_terminal_manager::NativeDelegationPolicy;

    #[tokio::test]
    async fn uses_beginner_prompt_when_preference_requests_it() {
        let home = tempfile::tempdir().unwrap();
        let docs = tempfile::tempdir().unwrap();
        let state = ServerState::new_in_memory(ServerConfig {
            bind: "127.0.0.1:0".parse().unwrap(),
            token: "prompt-test".into(),
            home_dir: home.path().to_path_buf(),
            docs_dir: docs.path().to_path_buf(),
            app_system_prompt: "professional".into(),
            app_beginner_system_prompt: "beginner".into(),
            app_onboarding_prompt: String::new(),
            tunnel_url: "http://test.invalid".into(),
        })
        .await
        .unwrap();

        houston_engine_core::preferences::set(&state.engine.db, "experience_level", "beginner")
            .await
            .unwrap();

        let prompt = selected_app_system_prompt(&state.engine).await;
        assert_eq!(prompt, "beginner");
    }

    #[tokio::test]
    async fn falls_back_to_professional_prompt_when_beginner_prompt_missing() {
        let home = tempfile::tempdir().unwrap();
        let docs = tempfile::tempdir().unwrap();
        let state = ServerState::new_in_memory(ServerConfig {
            bind: "127.0.0.1:0".parse().unwrap(),
            token: "prompt-test".into(),
            home_dir: home.path().to_path_buf(),
            docs_dir: docs.path().to_path_buf(),
            app_system_prompt: "professional".into(),
            app_beginner_system_prompt: String::new(),
            app_onboarding_prompt: String::new(),
            tunnel_url: "http://test.invalid".into(),
        })
        .await
        .unwrap();

        houston_engine_core::preferences::set(&state.engine.db, "experience_level", "beginner")
            .await
            .unwrap();

        let prompt = selected_app_system_prompt(&state.engine).await;
        assert_eq!(prompt, "professional");
    }

    #[tokio::test]
    async fn beginner_blocks_native_delegation() {
        let home = tempfile::tempdir().unwrap();
        let docs = tempfile::tempdir().unwrap();
        let state = ServerState::new_in_memory(ServerConfig {
            bind: "127.0.0.1:0".parse().unwrap(),
            token: "policy-test".into(),
            home_dir: home.path().to_path_buf(),
            docs_dir: docs.path().to_path_buf(),
            app_system_prompt: "professional".into(),
            app_beginner_system_prompt: "beginner".into(),
            app_onboarding_prompt: String::new(),
            tunnel_url: "http://test.invalid".into(),
        })
        .await
        .unwrap();

        houston_engine_core::preferences::set(&state.engine.db, "experience_level", "beginner")
            .await
            .unwrap();

        let policy = selected_native_delegation_policy(&state.engine).await;
        assert_eq!(policy, NativeDelegationPolicy::Block);
    }

    #[tokio::test]
    async fn professional_allows_native_delegation() {
        let home = tempfile::tempdir().unwrap();
        let docs = tempfile::tempdir().unwrap();
        let state = ServerState::new_in_memory(ServerConfig {
            bind: "127.0.0.1:0".parse().unwrap(),
            token: "policy-test".into(),
            home_dir: home.path().to_path_buf(),
            docs_dir: docs.path().to_path_buf(),
            app_system_prompt: "professional".into(),
            app_beginner_system_prompt: "beginner".into(),
            app_onboarding_prompt: String::new(),
            tunnel_url: "http://test.invalid".into(),
        })
        .await
        .unwrap();

        houston_engine_core::preferences::set(&state.engine.db, "experience_level", "professional")
            .await
            .unwrap();

        let policy = selected_native_delegation_policy(&state.engine).await;
        assert_eq!(policy, NativeDelegationPolicy::Allow);
    }
}
