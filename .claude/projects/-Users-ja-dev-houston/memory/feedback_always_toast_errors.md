---
name: Always toast errors
description: Never suppress error toasts — user prefers seeing every error over silent failures
type: feedback
---

Every Tauri invoke error must show a toast to the user. No silent mode, no suppression.

**Why:** User explicitly prefers error toast spam over the possibility of a broken button/action going unnoticed. Silent failures are worse than noisy ones.

**How to apply:** Never add silent/quiet options to the invoke wrapper. If a command can fail in expected ways (like reading optional files), fix the Rust command to not error — don't suppress the toast on the JS side.
