import http from 'node:http';
import os from 'node:os';
import { WebSocketServer, WebSocket } from 'ws';
import {
  ClientMessage,
  ServerMessage,
  isValidClientMessage
} from '@pocketinput/shared';
import { InputBackend } from '../platform/InputBackend';
import { MouseCoalescer } from '../input/MouseCoalescer';
import { PairingManager } from '../pairing/PairingManager';
import { getWebClientHtml } from './webClient';
import { KIMO_VERSION } from '../version';

export interface AdbStatus {
  available: boolean;
  path: string;
  devices: Array<{ serial: string; state: string }>;
}

export interface PocketServerOptions {
  port?: number;
  hostIp?: string;
  getHostIp?: () => string;
  version?: string;
  getAdbStatus?: () => AdbStatus;
  onPairingChanged?: () => void;
}

interface ClientState {
  authenticated: boolean;
  deviceName?: string;
  pendingText: string;
  textTimer: NodeJS.Timeout | null;
  inputChain: Promise<void>;
  authTimer: NodeJS.Timeout | null;
}

export class PocketServer {
  private static readonly TYPE_COALESCE_MS = 40;

  private server: http.Server;
  private wss: WebSocketServer;
  private coalescer: MouseCoalescer;
  private activeClients = new Map<WebSocket, ClientState>();

  constructor(
    private backend: InputBackend,
    private pairingManager: PairingManager,
    private options: PocketServerOptions = {}
  ) {
    this.coalescer = new MouseCoalescer(this.backend);

    this.server = http.createServer((req, res) => {
      this.handleHttpRequest(req, res);
    });

    this.wss = new WebSocketServer({ server: this.server });
    this.setupWebSocket();
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const hostIp = this.options.getHostIp?.() || this.options.hostIp || '127.0.0.1';
    const port = this.options.port || 4242;

    if (url.pathname === '/') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer'
      });
      res.end(getWebClientHtml(hostIp, port));
      return;
    }

    if (url.pathname === '/status' || url.pathname === '/api/discover') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Accept, Content-Type'
      });
      const adb = this.options.getAdbStatus?.() || { available: false, path: '', devices: [] };
      res.end(JSON.stringify({
        server: 'PocketInput',
        serverName: os.hostname(),
        platform: os.platform(),
        backend: this.backend.platformName,
        port,
        version: this.options.version || KIMO_VERSION,
        pairedDevices: this.pairingManager.getPairedDevices().length,
        usb: adb
      }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientIp = req.socket.remoteAddress || '';
      const isLocal = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';
      console.log(`\n📱 New client connected from ${clientIp} (local USB: ${isLocal})`);

      // Do not advertise a connected/authenticated status before the client
      // authenticates. The phone must only leave its Connect screen after an
      // explicit auth_response success.
      const authTimer = setTimeout(() => {
        if (!this.activeClients.get(ws)?.authenticated) {
          this.sendMessage(ws, {
            type: 'auth_response',
            payload: { success: false, error: 'Authentication timed out.' }
          });
          ws.close();
        }
      }, 15000);

      this.activeClients.set(ws, {
        authenticated: false,
        pendingText: '',
        textTimer: null,
        inputChain: Promise.resolve(),
        authTimer
      });

      ws.on('message', async (data) => {
        try {
          const raw = data.toString();
          const message = JSON.parse(raw);
          if (!isValidClientMessage(message)) {
            this.sendMessage(ws, {
              type: 'error',
              payload: { code: 'INVALID_PROTOCOL', message: 'Unknown or invalid message format' }
            });
            return;
          }

          await this.handleClientMessage(ws, message, isLocal, clientIp);
        } catch (err: any) {
          console.error('Error handling message:', err.message);
        }
      });

      ws.on('close', async () => {
        const state = this.activeClients.get(ws);
        if (state?.textTimer) clearTimeout(state.textTimer);
        if (state?.authTimer) clearTimeout(state.authTimer);
        console.log(`🔌 Client disconnected from ${clientIp}`);
        this.activeClients.delete(ws);
        this.coalescer.reset();
        await this.backend.releaseAll();
      });

      ws.on('error', async (err) => {
        console.error('WebSocket client error:', err.message);
        const state = this.activeClients.get(ws);
        if (state?.textTimer) clearTimeout(state.textTimer);
        if (state?.authTimer) clearTimeout(state.authTimer);
        this.activeClients.delete(ws);
        this.coalescer.reset();
        await this.backend.releaseAll();
      });
    });
  }

  private async handleClientMessage(
    ws: WebSocket,
    msg: ClientMessage,
    isLocal = false,
    clientIp = 'unknown'
  ): Promise<void> {
    const clientState = this.activeClients.get(ws);
    if (!clientState) return;

    if (msg.type === 'auth') {
      const { pin, token, deviceName, platform } = msg.payload;
      const result = this.pairingManager.authenticate(pin, token, deviceName, platform, clientIp);

      if (isLocal || result.success) {
        clientState.authenticated = true;
        clientState.deviceName = deviceName;
        if (clientState.authTimer) {
          clearTimeout(clientState.authTimer);
          clientState.authTimer = null;
        }
        if (result.success) this.options.onPairingChanged?.();
        console.log(`✅ Client authenticated: "${deviceName}" (${platform}, local=${isLocal})`);
        this.sendMessage(ws, {
          type: 'auth_response',
          payload: { success: true, token: result.token || 'local_usb_token', deviceName }
        });
        // Send connection metadata only after authentication. The client uses
        // this for display, never as proof of a valid pairing.
        this.sendMessage(ws, {
          type: 'status',
          payload: {
            connected: true,
            serverName: os.hostname(),
            os: os.type(),
            displayServer: process.env.XDG_SESSION_TYPE || 'unknown',
            paired: true
          }
        });
      } else {
        if (clientState.authTimer) {
          clearTimeout(clientState.authTimer);
          clientState.authTimer = null;
        }
        const base = result.error || 'Authentication failed';
        const error = result.retryAfterMs
          ? `${base.replace(/\.$/, '')} Try again in ${Math.ceil(result.retryAfterMs / 1000)}s.`
          : base;
        console.warn(`❌ Client auth failed from ${clientIp}: ${result.error}`);
        this.sendMessage(ws, {
          type: 'auth_response',
          payload: { success: false, error }
        });
      }
      return;
    }

    if (msg.type === 'ping') {
      this.sendMessage(ws, {
        type: 'pong',
        payload: { timestamp: msg.payload.timestamp, serverTime: Date.now() }
      });
      return;
    }

    if (!clientState.authenticated) {
      this.sendMessage(ws, {
        type: 'error',
        payload: { code: 'UNAUTHORIZED', message: 'Device not authenticated. Please pair first.' }
      });
      return;
    }

    if (msg.type === 'type_text') {
      clientState.pendingText += msg.payload.text;
      if (!clientState.textTimer) {
        clientState.textTimer = setTimeout(() => {
          clientState.textTimer = null;
          this.enqueueInput(clientState, () => this.flushPendingText(clientState));
        }, PocketServer.TYPE_COALESCE_MS);
      }
      return;
    }

    this.enqueueInput(clientState, async () => {
      await this.flushPendingText(clientState);
      switch (msg.type) {
        case 'mouse_move':
          this.coalescer.addDelta(msg.payload.dx, msg.payload.dy);
          break;

        case 'mouse_click':
          await this.backend.mouseClick(msg.payload.button, msg.payload.double);
          break;

        case 'mouse_button':
          await this.backend.mouseButton(msg.payload.button, msg.payload.action);
          break;

        case 'mouse_scroll':
          await this.backend.scroll(msg.payload.dx || 0, msg.payload.dy);
          break;

        case 'key_down':
          await this.backend.keyDown(msg.payload.key, msg.payload.code, msg.payload.modifiers);
          break;

        case 'key_up':
          await this.backend.keyUp(msg.payload.key, msg.payload.code);
          break;

        case 'key_press':
          await this.backend.keyPress(msg.payload.key, msg.payload.code, msg.payload.modifiers);
          break;

        case 'shortcut':
          await this.backend.shortcut(msg.payload.shortcut);
          break;
      }
    });
  }

  private enqueueInput(state: ClientState, work: () => Promise<void>): void {
    state.inputChain = state.inputChain.then(work).catch((err: any) => {
      console.error('Error handling input message:', err?.message || err);
    });
  }

  private async flushPendingText(state: ClientState): Promise<void> {
    if (state.textTimer) {
      clearTimeout(state.textTimer);
      state.textTimer = null;
    }
    const text = state.pendingText;
    state.pendingText = '';
    if (text) await this.backend.typeText(text);
  }

  private sendMessage(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  async start(port = 4242): Promise<void> {
    await this.backend.init();
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, '0.0.0.0', () => {
        this.server.off('error', reject);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    await this.backend.releaseAll();
    return new Promise((resolve, reject) => {
      this.wss.close(() => {
        this.server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }
}
