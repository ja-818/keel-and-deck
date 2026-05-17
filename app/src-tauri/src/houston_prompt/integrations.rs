/// Composio CLI integration guidance, including rich connect-card links.
pub const COMPOSIO_GUIDANCE: &str = "\n\n---\n\n# Integrations - Composio CLI\n\n\
When a task needs a connected app or account, prefer Composio when a suitable tool exists. \
Search Composio before using another integration path. \
Quick reference:\n\
- `composio search \"<what you want to do>\"` - find the right tool\n\
- `composio execute <TOOL_SLUG> -d '{ ... }'` - run a tool\n\
- `composio execute <TOOL_SLUG> --get-schema` - see required params\n\n\
Search first, inspect the schema when needed, then execute only after the \
interaction procedure says the task is ready.\n\n\
## When the user is not signed into Composio at all\n\n\
If `composio search` / `composio execute` / `composio link` fails with an \
authentication / login / not-signed-in error (the user has no Composio \
session at all, not just a missing per-toolkit connection), DO NOT tell \
the user to open settings or visit a website. Instead, post a Composio \
sign-in card directly in chat by writing the markdown link exactly as: \
`[Sign in to Composio](https://composio.dev/#houston_composio_signin=1)`. \
The Houston chat renders this as a rich sign-in card with a one-click \
button. Then add ONE short line, e.g. \"I need you to sign into Composio \
first so I can use your apps.\" Do not ask them to manually confirm completion. \
Houston will prompt you to continue after sign-in completes, then retry the \
original command.\n\n\
## When an app is not connected\n\n\
If `composio execute` fails because no account is linked for that \
toolkit, DO NOT open the browser for the user and DO NOT tell them \
to go to the Integrations tab. Instead:\n\n\
1. Identify ALL missing toolkits at once. Run `composio search \"<what you need>\"` \
if needed, or determine which toolkits the task requires.\n\
2. For EVERY missing toolkit, run `composio link <toolkit> --no-wait` via \
Bash and collect all the JSON outputs.\n\
3. Present ALL connect cards in a single message. For each toolkit, extract \
the `redirect_url` from its JSON and format as a markdown link. \
**IMPORTANT**: append `#houston_toolkit=<toolkit>` to each URL so the \
Houston chat renders them as rich connect cards with live connection \
status. Example: if the JSON has `\"toolkit\": \"gmail\"` and \
`\"redirect_url\": \"https://connect.composio.dev/link/lk_abc\"`, \
output exactly: \
`[Connect Gmail](https://connect.composio.dev/link/lk_abc#houston_toolkit=gmail)`.\n\
4. Tell the user to approve the cards in the browser and return to Houston. \
Do not ask them to manually confirm completion. Houston watches the \
connections and will prompt you to continue when the required apps are ready. \
When that continuation prompt arrives, silently re-check connected apps and \
retry the original request.";
