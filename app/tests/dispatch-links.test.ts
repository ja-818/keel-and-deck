import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  decodeCreateAgentIntents,
  decodeSaveAgentIntents,
  buildAdjustDispatchActionId,
  buildSaveDispatchActionId,
  extractDispatchLinks,
  parseAdjustAgentsFromHref,
  parseCreateAgentsFromHref,
  parseSaveAgentsFromHref,
} from "../src/lib/dispatch-links.ts";

function legacyRolePrompt(name: string): string {
  return `You are a reusable specialized agent named ${name}. Understand the user's mission, ask one targeted question if essential context is missing, and deliver complete work in plain language.`;
}

describe("dispatch links", () => {
  it("reads encoded intents from the assistant link hash", () => {
    const encoded = encodeURIComponent(
      JSON.stringify([{ name: "Research", prompt: "Find trends" }]),
    );

    strictEqual(
      parseCreateAgentsFromHref(`https://houston.ai/_/create-agents#intents=${encoded}`),
      '[{"name":"Research","prompt":"Find trends"}]',
    );
  });

  it("ignores malformed links", () => {
    strictEqual(parseCreateAgentsFromHref("not-a-url"), null);
    strictEqual(parseCreateAgentsFromHref("https://houston.invalid/"), null);
    strictEqual(parseCreateAgentsFromHref("https://houston.ai/_/other#intents=[]"), null);
    strictEqual(parseAdjustAgentsFromHref("not-a-url"), null);
    strictEqual(parseAdjustAgentsFromHref("https://houston.ai/_/other#adjustment=x"), null);
    strictEqual(parseSaveAgentsFromHref("not-a-url"), null);
    strictEqual(parseSaveAgentsFromHref("https://houston.invalid/_/other"), null);
  });

  it("decodes only valid specialized-agent payloads", () => {
    const encoded = encodeURIComponent(
      JSON.stringify([
        { name: "Research", rolePrompt: "Reusable researcher", taskPrompt: "Find trends" },
        { name: "Writer", rolePrompt: "Reusable writer", taskPrompt: "Draft captions" },
      ]),
    );

    deepStrictEqual(decodeCreateAgentIntents(encoded), [
      { name: "Research", rolePrompt: "Reusable researcher", taskPrompt: "Find trends" },
      { name: "Writer", rolePrompt: "Reusable writer", taskPrompt: "Draft captions" },
    ]);
    const dag = encodeURIComponent(
      JSON.stringify([
        {
          id: "research",
          name: "Research",
          rolePrompt: "Reusable researcher",
          taskPrompt: "Find trends",
          dependsOn: [],
        },
        {
          id: "writer",
          name: "Writer",
          rolePrompt: "Reusable writer",
          taskPrompt: "Use trends",
          dependsOn: ["research"],
        },
      ]),
    );
    deepStrictEqual(decodeCreateAgentIntents(dag), [
      {
        id: "research",
        name: "Research",
        rolePrompt: "Reusable researcher",
        taskPrompt: "Find trends",
        dependsOn: [],
      },
      {
        id: "writer",
        name: "Writer",
        rolePrompt: "Reusable writer",
        taskPrompt: "Use trends",
        dependsOn: ["research"],
      },
    ]);
    deepStrictEqual(decodeCreateAgentIntents("%7Bbad-json"), []);
    deepStrictEqual(
      decodeCreateAgentIntents(
        encodeURIComponent(JSON.stringify([{ name: "Broken", prompt: 42 }])),
      ),
      [],
    );
  });

  it("keeps legacy create-agent prompt links usable", () => {
    const encoded = encodeURIComponent(
      JSON.stringify([{ name: "Research", prompt: "Find trends" }]),
    );

    deepStrictEqual(decodeCreateAgentIntents(encoded), [
      {
        name: "Research",
        rolePrompt: legacyRolePrompt("Research"),
        taskPrompt: "Find trends",
        prompt: "Find trends",
      },
    ]);
  });

  it("reads and decodes save-agent payloads", () => {
    const encoded = encodeURIComponent(
      JSON.stringify([{ name: "Writer", agentPath: "/tmp/workspaces/main/Writer" }]),
    );

    strictEqual(
      parseSaveAgentsFromHref(`https://houston.ai/_/save-agents#agents=${encoded}`),
      '[{"name":"Writer","agentPath":"/tmp/workspaces/main/Writer"}]',
    );
    deepStrictEqual(decodeSaveAgentIntents(encoded), [
      { name: "Writer", agentPath: "/tmp/workspaces/main/Writer" },
    ]);
    deepStrictEqual(decodeSaveAgentIntents("%7Bbad-json"), []);
    deepStrictEqual(
      decodeSaveAgentIntents(
        encodeURIComponent(JSON.stringify([{ name: "Broken", agentPath: 42 }])),
      ),
      [],
    );
  });

  it("extracts dispatch cards before markdown sanitization", () => {
    const encoded = encodeURIComponent(
      JSON.stringify([{ name: "Research", prompt: "Find trends" }]),
    );
    const extracted = extractDispatchLinks(
      `Antes\n\n[suggest_agents](https://houston.ai/_/create-agents#intents=${encoded})\n\nDespues`,
    );

    strictEqual(extracted.content, "Antes\n\nDespues");
    deepStrictEqual(decodeCreateAgentIntents(extracted.createAgentIntents[0]!), [
      {
        name: "Research",
        rolePrompt: legacyRolePrompt("Research"),
        taskPrompt: "Find trends",
        prompt: "Find trends",
      },
    ]);
  });

  it("extracts private adjustment links", () => {
    const intent = encodeURIComponent(
      JSON.stringify({
        adjustment: "hazlo mas directo",
        targetNodeIds: ["posts"],
      }),
    );
    const extracted = extractDispatchLinks(
      `Voy a ajustarlo.\n\n[adjust_agents](https://houston.ai/_/adjust-agents#intent=${intent})`,
    );

    strictEqual(extracted.content, "Voy a ajustarlo.");
    deepStrictEqual(extracted.adjustAgentIntents, [
      { adjustment: "hazlo mas directo", targetNodeIds: ["posts"] },
    ]);
  });

  it("builds stable adjustment action ids per assistant message", () => {
    const left = buildAdjustDispatchActionId(
      "/workspace/Parent",
      "chat-1",
      { adjustment: "  hazlo   mas directo ", targetNodeIds: ["posts", "frases"] },
      "assistant-a",
    );
    const right = buildAdjustDispatchActionId(
      "/workspace/Parent",
      "chat-1",
      { adjustment: "hazlo mas directo", targetNodeIds: ["frases", "posts"] },
      "assistant-a",
    );
    const nextMessage = buildAdjustDispatchActionId(
      "/workspace/Parent",
      "chat-1",
      { adjustment: "hazlo mas directo", targetNodeIds: ["frases", "posts"] },
      "assistant-b",
    );

    strictEqual(left, right);
    strictEqual(left === nextMessage, false);
  });

  it("builds stable save action ids per assistant message", () => {
    const left = buildSaveDispatchActionId(
      "/workspace/Parent",
      "chat-1",
      [
        { name: "  Writer ", agentPath: "/workspace/Writer" },
        { name: "Research", agentPath: "/workspace/Research" },
      ],
      "assistant-a",
    );
    const right = buildSaveDispatchActionId(
      "/workspace/Parent",
      "chat-1",
      [
        { name: "Research", agentPath: "/workspace/Research" },
        { name: "Writer", agentPath: "/workspace/Writer" },
      ],
      "assistant-a",
    );
    const nextMessage = buildSaveDispatchActionId(
      "/workspace/Parent",
      "chat-1",
      [
        { name: "Research", agentPath: "/workspace/Research" },
        { name: "Writer", agentPath: "/workspace/Writer" },
      ],
      "assistant-b",
    );

    strictEqual(left, right);
    strictEqual(left === nextMessage, false);
  });

  it("extracts dispatch cards when the encoded JSON contains markdown parens", () => {
    const prompt =
      "Crea posts con hashtags (ej: #Peluquería #HumorCapilar). Haz que cada post sea único.";
    const encoded = encodeURIComponent(JSON.stringify([{ name: "Writer", prompt }]));
    const extracted = extractDispatchLinks(
      `Antes\n\n[suggest_agents](https://houston.ai/_/create-agents#intents=${encoded})\n\nDespues`,
    );

    strictEqual(extracted.content, "Antes\n\nDespues");
    strictEqual(extracted.content.includes("%20Haz%20"), false);
    deepStrictEqual(decodeCreateAgentIntents(extracted.createAgentIntents[0]!), [
      { name: "Writer", rolePrompt: legacyRolePrompt("Writer"), taskPrompt: prompt, prompt },
    ]);
  });

  it("hides incomplete private dispatch markers while assistant text streams", () => {
    const extracted = extractDispatchLinks(
      "Antes\n\n[suggest_agents](https://houston.ai/_/create-agents#intents=%5B%7B",
    );

    strictEqual(extracted.content, "Antes");
    deepStrictEqual(extracted.createAgentIntents, []);
    strictEqual(extracted.pendingAction, "create");
  });

  it("strips malformed completed private links without showing pending state", () => {
    const extracted = extractDispatchLinks(
      "Antes\n\n[adjust_agents](https://houston.ai/_/adjust-agents#adjustment=viejo) %20resto%20filtrado\n\nDespues",
    );

    strictEqual(extracted.content, "Antes\n\nDespues");
    deepStrictEqual(extracted.adjustAgentIntents, []);
    strictEqual(extracted.pendingAction, null);
  });
});
