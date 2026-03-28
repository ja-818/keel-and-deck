# Claude Session Protocol

### MANDATORY STOPPING RULES
Whenever this protocol tells you to "wait for approval", "wait for user feedback", or "ask the user", you MUST IMMEDIATELY STOP GENERATING YOUR RESPONSE.
- End your text output right there.
- Do NOT output the next phase.
- Do NOT anticipate the user's answer.
- You must physically stop your turn and return control to the user.

Follow these phases IN ORDER for every interaction. Do not skip phases.

**IMPORTANT: Always print the phase name exactly (e.g., "PHASE 1: Load Context") so the user knows we're following the protocol.**

---

## PHASE 1: Load Context (Session Start Only)

**On the FIRST message of a new session:**

1. Print "PHASE 1: Load Context"
2. Read ALL knowledge base files:
   - `/knowledge-base/architecture.md` — monorepo structure, package details, component APIs
   - `/knowledge-base/frameworks.md` — React, Tailwind 4, shadcn/ui, Framer Motion patterns
   - `/knowledge-base/design.md` — color tokens, animations, layout rules
3. Briefly acknowledge what you loaded
4. Then proceed to Phase 2

---

## PHASE 2: Understand the Request

1. Print "PHASE 2: Understand the Request"
2. Read any files the user references
3. Ask clarifying questions if ANYTHING is unclear
4. **STOP AND WAIT:** If you asked clarifying questions, end your turn immediately. Do NOT proceed to Phase 3 until the user answers.

---

## PHASE 3: Challenge

1. Print "PHASE 3: Challenge"
2. Before planning any implementation, critically evaluate the request:
   - **Does this belong in the library?** Not every component should be here — only things multiple apps would reuse.
   - **Which package does this belong in?** core, chat, board, or layout? Or does it need a new package?
   - **Is the API right?** Components must be props-driven, no store dependencies, no app-specific logic.
3. If you see a better approach: Say so clearly.
4. If the approach is sound: Say "Approach looks sound".
5. **STOP AND WAIT:** Do NOT proceed until the user agrees.

---

## PHASE 4: Plan

1. Print "PHASE 4: Plan"
2. Use the knowledge base context loaded in Phase 1
3. Create a numbered plan with specific steps
4. Group steps into "testable chunks"
5. Present the plan to the user
6. **STOP AND WAIT:** Wait for approval.

---

## PHASE 5: Execute (By Testable Chunk)

1. Print "PHASE 5: Execute — [chunk description]"
2. Do ALL steps in the current testable chunk
3. Report what you did (brief summary)
4. Proceed directly to Phase 6

---

## PHASE 6: Test

1. Print "PHASE 6: Test"
2. Run `npx tsc --noEmit -p packages/<package>/tsconfig.json` for every package you touched
3. Fix any failures before proceeding
4. Proceed to Phase 7

---

## PHASE 7: Verify

1. Print "PHASE 7: Verify"
2. Run full workspace check: `pnpm typecheck` (or individual package checks)
3. For UI changes: verify visual fidelity matches Houston's design
4. Say "Ready for testing — please verify"
5. **STOP AND WAIT:** Do NOT continue until the user confirms.

---

## PHASE 8: Refactor

1. Print "PHASE 8: Refactor"
2. Reflect:
   - Is the component API clean? Props-driven, no store leaks?
   - Is it in the right package?
   - Does any file exceed 200 lines? If so, extract.
   - Are types generic enough? No Houston-specific types leaking in.
3. If refactor needed: propose and do after approval
4. If not: Say "No refactor needed"

---

## PHASE 9: Cleanup

1. Print "PHASE 9: Cleanup"
2. Check for: unused imports, leftover Houston references, debug code
3. Verify: no `@/` path aliases (use relative imports)
4. Verify: no Zustand store imports
5. Verify: no Tauri-specific imports
6. Clean up or say "No cleanup needed"

---

## PHASE 10: Complete

1. Print "PHASE 10: Complete"
2. Summarize what was accomplished
3. Evaluate if knowledge base needs updating
4. If YES: Propose specific changes
5. If NO: Say "No knowledge base update needed"

---

## PHASE 11: Commit

1. Print "PHASE 11: Commit"
2. Ask user: "Ready to commit? (yes/no/skip)"
3. **STOP AND WAIT.**

---

# Code Quality Rules (Always Apply)

## Library-Specific Rules

### Props over stores — ALWAYS
Components must NEVER import from Zustand, Redux, or any state management library. All data comes via props. All actions are callbacks.

### No app-specific imports
Never import Houston types (Issue, Skill, Routine, etc.). Never import Tauri APIs. Never import app-specific stores or hooks.

### Generic types only
Use `BoardItem`, `FeedItem`, `ChatMessage`, etc. If a Houston type needs to work with a Deck component, Houston maps it at the app level.

### No `@/` path aliases
Use relative imports within a package. Use package imports (`@deck-ui/core`) between packages. Path aliases break in published libraries.

## General Rules

### File Size Limits
- **200 lines max** per file (excluding tests). CSS: 500 lines.
- Extract into separate modules — don't compress code.

### No Silent Failures
- Errors surface to the consumer. No swallowed errors.

### No Hover-Only Affordances
- All interactive elements must be visible without hovering.

### Search Before Building
- Check shadcn/ui registry, Houston's existing components, npm — before building from scratch.

### Visual Fidelity
- All components must look identical to their Houston originals.
- Same CSS classes, same animations, same spacing.
- If in doubt, read the Houston source and match it exactly.
