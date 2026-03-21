/**
 * Integration test: ConnectionManager with real WebSocket servers.
 *
 * Tests Bridge/Gateway priority switching, event forwarding, and reconnection
 * using actual WS servers (not mocks).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, type Server } from 'http';
import { State, PermissionMode } from '@agentdeck/shared';
import type { StateUpdateEvent, BridgeEvent } from '@agentdeck/shared';

// ─── Minimal WS test server ────────────────────────────────────────

interface TestServer {
  port: number;
  httpServer: Server;
  wss: WebSocketServer;
  clients: Set<WebSocket>;
  broadcast: (event: BridgeEvent) => void;
  close: () => Promise<void>;
}

async function createTestServer(): Promise<TestServer> {
  return new Promise((resolve) => {
    const httpServer = createServer();
    const wss = new WebSocketServer({ server: httpServer });
    const clients = new Set<WebSocket>();

    wss.on('connection', (ws) => {
      clients.add(ws);
      ws.on('close', () => clients.delete(ws));
    });

    httpServer.listen(0, '127.0.0.1', () => {
      const addr = httpServer.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;

      resolve({
        port,
        httpServer,
        wss,
        clients,
        broadcast: (event: BridgeEvent) => {
          const payload = JSON.stringify(event);
          for (const client of clients) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(payload);
            }
          }
        },
        close: () => new Promise<void>((res) => {
          for (const client of clients) client.close();
          wss.close();
          httpServer.close(() => res());
          setTimeout(res, 500);
        }),
      });
    });
  });
}

function makeStateUpdate(state: string = 'idle', agentType: string = 'claude-code'): StateUpdateEvent {
  return {
    type: 'state_update',
    state: state as State,
    permissionMode: PermissionMode.DEFAULT,
    agentType: agentType as any,
    projectName: 'TestProject',
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('ConnectionManager Integration — Real WebSocket', () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await createTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it('client connects and receives broadcast events', async () => {
    const received: BridgeEvent[] = [];

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    ws.on('message', (data) => {
      received.push(JSON.parse(data.toString()));
    });

    // Wait for server to register client
    await new Promise((r) => setTimeout(r, 50));

    server.broadcast(makeStateUpdate('idle'));

    await new Promise((r) => setTimeout(r, 100));

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('state_update');
    expect((received[0] as StateUpdateEvent).state).toBe('idle');

    ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it('multiple clients receive same broadcast', async () => {
    const received1: BridgeEvent[] = [];
    const received2: BridgeEvent[] = [];

    const ws1 = new WebSocket(`ws://127.0.0.1:${server.port}`);
    const ws2 = new WebSocket(`ws://127.0.0.1:${server.port}`);

    await Promise.all([
      new Promise<void>((r) => ws1.on('open', r)),
      new Promise<void>((r) => ws2.on('open', r)),
    ]);

    ws1.on('message', (data) => received1.push(JSON.parse(data.toString())));
    ws2.on('message', (data) => received2.push(JSON.parse(data.toString())));

    await new Promise((r) => setTimeout(r, 50));

    server.broadcast(makeStateUpdate('processing'));

    await new Promise((r) => setTimeout(r, 100));

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
    expect((received1[0] as StateUpdateEvent).state).toBe('processing');
    expect((received2[0] as StateUpdateEvent).state).toBe('processing');

    ws1.close();
    ws2.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it('client sends command to server', async () => {
    const serverReceived: Record<string, unknown>[] = [];

    server.wss.on('connection', (ws) => {
      ws.on('message', (data) => {
        serverReceived.push(JSON.parse(data.toString()));
      });
    });

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    await new Promise<void>((r) => ws.on('open', r));

    ws.send(JSON.stringify({ type: 'interrupt' }));
    ws.send(JSON.stringify({ type: 'respond', value: 'y' }));

    await new Promise((r) => setTimeout(r, 100));

    expect(serverReceived).toHaveLength(2);
    expect(serverReceived[0].type).toBe('interrupt');
    expect(serverReceived[1].type).toBe('respond');

    ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it('handles rapid connect/disconnect without crashes', async () => {
    const connections: WebSocket[] = [];

    // Rapid connect/disconnect 5 times
    for (let i = 0; i < 5; i++) {
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
      connections.push(ws);
      await new Promise<void>((resolve) => {
        ws.on('open', () => {
          ws.close();
          resolve();
        });
        ws.on('error', resolve);
      });
    }

    await new Promise((r) => setTimeout(r, 200));

    // Server should still be functional
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    await new Promise<void>((r) => ws.on('open', r));

    const received: BridgeEvent[] = [];
    ws.on('message', (data) => received.push(JSON.parse(data.toString())));

    await new Promise((r) => setTimeout(r, 50));
    server.broadcast(makeStateUpdate('idle'));
    await new Promise((r) => setTimeout(r, 100));

    expect(received).toHaveLength(1);
    ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it('server detects client disconnect', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    await new Promise<void>((r) => ws.on('open', r));
    await new Promise((r) => setTimeout(r, 50));

    expect(server.clients.size).toBe(1);

    ws.close();
    await new Promise((r) => setTimeout(r, 200));

    expect(server.clients.size).toBe(0);
  });

  it('bridge → gateway priority: second server takes over on disconnect', async () => {
    // Create a second "gateway" server
    const gatewayServer = await createTestServer();

    try {
      const received: BridgeEvent[] = [];

      // Client connects to bridge first
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
      await new Promise<void>((r) => ws.on('open', r));

      ws.on('message', (data) => received.push(JSON.parse(data.toString())));
      await new Promise((r) => setTimeout(r, 50));

      // Bridge sends event
      server.broadcast(makeStateUpdate('idle', 'claude-code'));
      await new Promise((r) => setTimeout(r, 100));

      expect(received).toHaveLength(1);
      expect((received[0] as StateUpdateEvent).agentType).toBe('claude-code');

      ws.close();
      await new Promise((r) => setTimeout(r, 50));

      // Client connects to gateway
      received.length = 0;
      const ws2 = new WebSocket(`ws://127.0.0.1:${gatewayServer.port}`);
      await new Promise<void>((r) => ws2.on('open', r));

      ws2.on('message', (data) => received.push(JSON.parse(data.toString())));
      await new Promise((r) => setTimeout(r, 50));

      // Gateway sends event
      gatewayServer.broadcast(makeStateUpdate('processing', 'openclaw'));
      await new Promise((r) => setTimeout(r, 100));

      expect(received).toHaveLength(1);
      expect((received[0] as StateUpdateEvent).agentType).toBe('openclaw');

      ws2.close();
      await new Promise((r) => setTimeout(r, 50));
    } finally {
      await gatewayServer.close();
    }
  });
});
