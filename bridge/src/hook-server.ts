import express from 'express';
import { createServer, type Server } from 'http';
import { EventEmitter } from 'events';
import { debug } from './logger.js';

export class HookServer extends EventEmitter {
  private app: express.Application;
  private server: Server;
  private diagHandler: ((tail?: number) => unknown) | null = null;

  constructor() {
    super();
    this.app = express();
    this.app.use(express.json());
    this.setupRoutes();
    this.server = createServer(this.app);
  }

  /** Register a callback that provides diagnostic dump data */
  onDiag(handler: (tail?: number) => unknown): void {
    this.diagHandler = handler;
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (_req, res) => {
      debug('Hook', 'GET /health');
      res.json({ status: 'ok', uptime: process.uptime() });
    });

    // Diagnostic endpoint
    this.app.get('/diag', (req, res) => {
      debug('Hook', 'GET /diag');
      if (!this.diagHandler) {
        res.status(503).json({ error: 'Diagnostic system not initialized' });
        return;
      }
      const tail = req.query.tail ? parseInt(req.query.tail as string, 10) : undefined;
      try {
        const dump = this.diagHandler(tail);
        res.json(dump);
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });

    // Hook endpoint - receives JSON POST from Claude Code hooks
    // The hook script pipes stdin JSON to curl POST body
    this.app.post('/hooks/:eventName', (req, res) => {
      const eventName = req.params.eventName;
      const data = req.body || {};

      debug('Hook', `POST /hooks/${eventName} (${JSON.stringify(data).slice(0, 120)})`);

      this.emit('hook', { event: eventName, data });

      // Respond quickly so the hook doesn't block Claude
      res.json({ received: true });
    });

    // Catch-all for unknown routes
    this.app.use((req, res) => {
      debug('Hook', `404: ${req.method} ${req.url}`);
      res.status(404).json({ error: 'Not found' });
    });
  }

  async listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use. Is another bridge instance running?`));
        } else {
          reject(err);
        }
      });

      this.server.listen(port, '127.0.0.1', () => {
        debug('Hook', `listening on 127.0.0.1:${port}`);
        resolve();
      });
    });
  }

  getServer(): Server {
    return this.server;
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      debug('Hook', 'closing server');
      this.server.close(() => {
        resolve();
      });
    });
  }
}
