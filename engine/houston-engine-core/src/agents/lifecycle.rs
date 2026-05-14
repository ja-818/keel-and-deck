//! Lease-aware activity lifecycle transitions.
//!
//! Pulled out of `activity.rs` so that file stays a CRUD-only surface
//! (per CLAUDE.md file-size rule) and so the lease invariants live next
//! to each other. Every function here:
//!
//! 1. Looks up the activity by `session_key` (with the `activity-{id}`
//!    legacy fallback that mission-board rows older than the
//!    `session_key` field rely on).
//! 2. Mutates `status` and/or `lease` atomically.
//! 3. Bumps `updated_at` so the file watcher emits an event.
//!
//! Callers:
//! - [`attach_lease`] — `sessions::start`, on CLI spawn.
//! - [`extend_lease`] — the heartbeat task that runs while a session is
//!   alive. Returns `false` if the stored lease_id no longer matches
//!   (something else took ownership) so the caller can stop pumping.
//! - [`clear_lease_and_set_status`] — `sessions::start`'s end-of-flow
//!   when the CLI exits cleanly.
//! - [`sweep_stale`] — the engine's reaper task. Returns the list of
//!   activities it transitioned so the caller can fan out events.

use super::lease::Lease;
use super::status::ActivityStatus;
use super::store::{read_json, write_json};
use super::types::Activity;
use crate::error::CoreResult;
use chrono::Utc;
use std::path::Path;

const FILE: &str = "activity";

/// Find the activity matching `session_key`, then run `mutate` on it
/// and persist. Returns the post-mutation row, or `None` if no activity
/// matches (legitimate for ad-hoc sessions that have no board row).
///
/// Matching: exact `session_key` field, or the `activity-{id}` legacy
/// convention. Backfills the `session_key` field on the row when matched
/// via the legacy path so future lookups hit the fast path.
fn mutate_by_session_key<F: FnOnce(&mut Activity)>(
    root: &Path,
    session_key: &str,
    mutate: F,
) -> CoreResult<Option<Activity>> {
    let mut items: Vec<Activity> = read_json(root, FILE)?;
    let implied_id = session_key.strip_prefix("activity-");
    let Some(item) = items.iter_mut().find(|t| {
        t.session_key.as_deref() == Some(session_key)
            || implied_id.is_some_and(|id| t.id == id)
    }) else {
        return Ok(None);
    };
    if item.session_key.as_deref() != Some(session_key) {
        item.session_key = Some(session_key.to_string());
    }
    mutate(item);
    item.updated_at = Some(Utc::now().to_rfc3339());
    let result = item.clone();
    write_json(root, FILE, &items)?;
    Ok(Some(result))
}

/// Promote the activity bound to `session_key` to `Running` with a
/// fresh lease owned by the current process. Returns the new row.
///
/// Called by `sessions::start` immediately before the CLI subprocess
/// spawns. If the row already had a lease (from a prior interrupted
/// run), it's replaced — the new session owns this activity now.
pub fn attach_lease(
    root: &Path,
    session_key: &str,
) -> CoreResult<Option<(Activity, Lease)>> {
    let new_lease = Lease::fresh();
    let stored_lease = new_lease.clone();
    let updated = mutate_by_session_key(root, session_key, |item| {
        item.status = ActivityStatus::Running;
        item.lease = Some(stored_lease);
    })?;
    Ok(updated.map(|a| (a, new_lease)))
}

/// Push the lease's `expires_at` forward by another TTL. The caller
/// supplies the `lease_id` it expects to own; if the stored lease no
/// longer matches (e.g. the reaper transitioned the row, or another
/// process took over) this returns `Ok(false)` and the caller should
/// stop pumping. `Ok(true)` means heartbeat applied.
pub fn extend_lease(root: &Path, session_key: &str, lease_id: &str) -> CoreResult<bool> {
    let mut extended = false;
    mutate_by_session_key(root, session_key, |item| {
        if let Some(ref existing) = item.lease {
            if existing.lease_id == lease_id {
                item.lease = Some(existing.extended());
                extended = true;
            }
        }
    })?;
    Ok(extended)
}

/// Clear the lease and set the activity to a (typically terminal)
/// status. Used at end-of-session: status flips to `NeedsYou` /
/// `Error` / `Done` and the lease is released.
pub fn clear_lease_and_set_status(
    root: &Path,
    session_key: &str,
    status: ActivityStatus,
) -> CoreResult<Option<Activity>> {
    let updated = mutate_by_session_key(root, session_key, |item| {
        item.status = status;
        item.lease = None;
    })?;
    Ok(updated)
}

/// Sweep the agent's activity file for in-flight rows whose lease is
/// expired (or missing entirely, which is the case for any row that
/// was already in `Running` when the engine restarted before leases
/// existed). Each such row gets `status = Interrupted` and `lease =
/// None`, the row's `updated_at` bumped, and is returned so the caller
/// can emit `ActivityChanged` for the agent.
pub fn sweep_stale(root: &Path) -> CoreResult<Vec<Activity>> {
    let mut items: Vec<Activity> = read_json(root, FILE)?;
    let mut transitioned = Vec::new();
    for item in items.iter_mut() {
        if !item.status.is_in_flight() {
            continue;
        }
        let stale = match &item.lease {
            None => true,
            Some(l) => l.is_expired(),
        };
        if !stale {
            continue;
        }
        item.status = ActivityStatus::Interrupted;
        item.lease = None;
        item.updated_at = Some(Utc::now().to_rfc3339());
        transitioned.push(item.clone());
    }
    if !transitioned.is_empty() {
        write_json(root, FILE, &items)?;
    }
    Ok(transitioned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agents::activity;
    use crate::agents::types::NewActivity;
    use tempfile::TempDir;

    fn make_root() -> (TempDir, std::path::PathBuf) {
        let dir = TempDir::new().unwrap();
        let root = dir.path().to_path_buf();
        crate::agents::store::ensure_houston_dir(&root).unwrap();
        (dir, root)
    }

    fn make_activity(root: &Path, title: &str) -> Activity {
        activity::create(
            root,
            NewActivity {
                title: title.into(),
                description: String::new(),
                agent: None,
                worktree_path: None,
            },
        )
        .unwrap()
    }

    #[test]
    fn attach_lease_flips_to_running_and_writes_lease() {
        let (_d, root) = make_root();
        let a = make_activity(&root, "x");
        let sk = a.session_key.clone().unwrap();
        let (after, lease) = attach_lease(&root, &sk).unwrap().unwrap();
        assert_eq!(after.status, ActivityStatus::Running);
        assert_eq!(after.lease.as_ref().unwrap().lease_id, lease.lease_id);
        assert_eq!(lease.owner_pid, std::process::id());
    }

    #[test]
    fn attach_lease_no_match_returns_none() {
        let (_d, root) = make_root();
        make_activity(&root, "x");
        assert!(attach_lease(&root, "activity-not-real")
            .unwrap()
            .is_none());
    }

    #[test]
    fn extend_lease_pushes_expiry_when_id_matches() {
        let (_d, root) = make_root();
        let a = make_activity(&root, "x");
        let sk = a.session_key.clone().unwrap();
        let (_a2, l) = attach_lease(&root, &sk).unwrap().unwrap();
        let before = l.expires_at;
        std::thread::sleep(std::time::Duration::from_millis(5));
        assert!(extend_lease(&root, &sk, &l.lease_id).unwrap());
        let listed: Vec<Activity> = read_json(&root, FILE).unwrap();
        assert!(listed[0].lease.as_ref().unwrap().expires_at > before);
    }

    #[test]
    fn extend_lease_returns_false_on_id_mismatch() {
        let (_d, root) = make_root();
        let a = make_activity(&root, "x");
        let sk = a.session_key.clone().unwrap();
        attach_lease(&root, &sk).unwrap().unwrap();
        assert!(!extend_lease(&root, &sk, "not-the-real-id").unwrap());
    }

    #[test]
    fn clear_lease_and_set_status_releases_ownership() {
        let (_d, root) = make_root();
        let a = make_activity(&root, "x");
        let sk = a.session_key.clone().unwrap();
        attach_lease(&root, &sk).unwrap();
        let after = clear_lease_and_set_status(&root, &sk, ActivityStatus::NeedsYou)
            .unwrap()
            .unwrap();
        assert_eq!(after.status, ActivityStatus::NeedsYou);
        assert!(after.lease.is_none());
    }

    #[test]
    fn sweep_stale_transitions_expired_running_to_interrupted() {
        let (_d, root) = make_root();
        let a = make_activity(&root, "x");
        let sk = a.session_key.clone().unwrap();
        let (_, _) = attach_lease(&root, &sk).unwrap().unwrap();
        // Forcibly expire the lease by rewriting the file with a past expiry.
        let mut items: Vec<Activity> = read_json(&root, FILE).unwrap();
        items[0].lease.as_mut().unwrap().expires_at =
            Utc::now() - chrono::Duration::seconds(1);
        write_json(&root, FILE, &items).unwrap();

        let transitioned = sweep_stale(&root).unwrap();
        assert_eq!(transitioned.len(), 1);
        assert_eq!(transitioned[0].status, ActivityStatus::Interrupted);
        assert!(transitioned[0].lease.is_none());
    }

    #[test]
    fn sweep_stale_transitions_running_row_with_no_lease() {
        // Legacy data path: a row pre-leases that's stuck on Running.
        let (_d, root) = make_root();
        let a = make_activity(&root, "x");
        // Promote manually without minting a lease — simulates legacy data.
        let mut items: Vec<Activity> = read_json(&root, FILE).unwrap();
        items[0].status = ActivityStatus::Running;
        items[0].lease = None;
        write_json(&root, FILE, &items).unwrap();
        let _ = a;
        let transitioned = sweep_stale(&root).unwrap();
        assert_eq!(transitioned.len(), 1);
        assert_eq!(transitioned[0].status, ActivityStatus::Interrupted);
    }

    #[test]
    fn sweep_stale_ignores_terminal_and_queued_rows() {
        let (_d, root) = make_root();
        let a = make_activity(&root, "x");
        // Activity defaults to Queued — sweep must not touch it.
        let _ = a;
        let transitioned = sweep_stale(&root).unwrap();
        assert!(transitioned.is_empty(), "Queued is not in-flight");
    }
}
