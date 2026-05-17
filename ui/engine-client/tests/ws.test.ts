import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { EngineWebSocket, topics } from "../src/ws.ts";

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  closed = false;
  readyState = FakeWebSocket.OPEN;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.closed = true;
  }
}

describe("EngineWebSocket", () => {
  it("preserves handlers and subscriptions when the engine endpoint changes", () => {
    FakeWebSocket.instances = [];
    const first = { wsUrl: () => "ws://127.0.0.1:1001/v1/ws?token=a" };
    const second = { wsUrl: () => "ws://127.0.0.1:1002/v1/ws?token=b" };
    const ws = new EngineWebSocket(
      first as never,
      FakeWebSocket as unknown as typeof WebSocket,
    );
    const events: unknown[] = [];

    ws.onEvent((event) => events.push(event));
    ws.connect();
    const firstSocket = FakeWebSocket.instances[0];
    firstSocket.onopen?.();
    ws.subscribe([topics.firehose]);

    ws.replaceClient(second as never);
    const secondSocket = FakeWebSocket.instances[1];
    secondSocket.onopen?.();
    secondSocket.onmessage?.({
      data: JSON.stringify({
        kind: "event",
        payload: { type: "SessionStatus", data: { status: "completed" } },
      }),
    });

    strictEqual(firstSocket.closed, true);
    strictEqual(secondSocket.url, "ws://127.0.0.1:1002/v1/ws?token=b");
    const subFrame = JSON.parse(secondSocket.sent[0]);
    deepStrictEqual(subFrame.payload, { op: "sub", topics: ["*"] });
    deepStrictEqual(events, [
      { type: "SessionStatus", data: { status: "completed" } },
    ]);
  });
});
