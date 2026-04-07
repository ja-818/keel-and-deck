---
name: AI-native workspace reactivity paradigm
description: Core philosophy — users and LLMs are equal participants; all mutations from either must be immediately visible to both. File watcher + query invalidation is the mechanism.
type: project
---

Houston builds AI-native workspaces. Core principle: **users and LLMs have identical capabilities in changing workspace data, and all changes from either must be immediately visible to both.**

**Why:** This is the product's foundational paradigm. Houston isn't a tool where the AI is a second-class citizen writing to files the UI polls occasionally. Both human and agent are first-class participants. The workspace is shared, live, and reactive.

**How to apply:**
- Every data surface in the app must react to file changes, regardless of who made them (user via UI, agent via file write, external edit)
- The file watcher on `.houston/` is not an optimization — it's architecturally required
- When building new features that read `.houston/` data, they MUST use the query invalidation pattern (TanStack Query + file watcher events), never manual load-on-mount-only
- Never build a feature where "the agent can do X but the UI won't show it until refresh"
