# @houston-ai/connections

External service connections management. Display connected services, manage OAuth tokens, handle connection status.

## Install

```bash
pnpm add @houston-ai/connections
```

## Usage

```tsx
import { ConnectionsView } from "@houston-ai/connections"

<ConnectionsView
  connections={connections}
  onConnect={(id) => startOAuth(id)}
  onDisconnect={(id) => revokeConnection(id)}
/>
```

## Exports

- `ConnectionsView` -- full connections list with status indicators
- `ConnectionRow` -- single connection with connect/disconnect actions
- Types: `Connection`, `ConnectionsResult`

## Peer Dependencies

- React 19+
- @houston-ai/core

---

Part of [Houston](../../README.md).
