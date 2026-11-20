import { ClientMessage, ServerMessage } from '../../../shared/src/protocol';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

const AUTH_TIMEOUT_MS = 8000;
const PONG_TIMEOUT_MS = 15000;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

export interface ServerInfo {
  serverName: string;
  os: string;
  displayServer: string;
}

export type StatusListener = (state: ConnectionState, info?: ServerInfo, errorMsg?: string) => void;
export type LatencyListener = (latencyMs: number) => void;

export interface ConnectOptions {
  /** Maximum connect attempts including the first one (default: unlimited). */
  maxAttempts?: number;
}

export class PocketSocket {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private statusListeners: Set<StatusListener> = new Set();
  private latencyListeners: Set<LatencyListener> = new Set();
  private reconnectTimer: any = null;
  private pingInterval: any = null;
  private pongTimer: any = null;
  private authTimer: any = null;
  private host = '';
  private port = 4242;
  private pin = '';
  private token = '';
  private autoReconnect = true;
  private autoReconnectPref = true;
  private generation = 0;
  private attemptCount = 0;
  private maxAttempts = Infinity;
  private authenticated = false;
  private lastPongAt = 0;
  private lastError = '';
  private serverInfo: ServerInfo | undefined;

  constructor() {}

  getState(): ConnectionState {
    return this.state;
  }

  /** Sync with the user's Auto-Reconnect preference (Settings). */
  setAutoReconnectPref(enabled: boolean): void {
    this.autoReconnectPref = enabled;
    this.autoReconnect = enabled;
  }

  getHost(): string {
    return this.host;
  }

  getPort(): number {
    return this.port;
  }

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.state, this.serverInfo);
    return () => this.statusListeners.delete(listener);
  }

  onLatencyChange(listener: LatencyListener): () => void {
    this.latencyListeners.add(listener);
    return () => this.latencyListeners.delete(listener);
  }

  private notify(state: ConnectionState, info?: ServerInfo, errorMsg?: string) {
    this.state = state;
    if (info) this.serverInfo = info;
    for (const listener of this.statusListeners) {
      listener(state, info ?? this.serverInfo, errorMsg);
    }
  }

  connect(host: string, port = 4242, pin = '', token = '', options: ConnectOptions = {}): void {
    this.host = host.trim();
    this.port = port;
    this.pin = pin.trim();
    this.token = token.trim();
    this.autoReconnect = this.autoReconnectPref;
    this.maxAttempts = options.maxAttempts ?? Infinity;
    this.attemptCount = 0;
    this.authenticated = false;
    this.lastError = '';
    this.serverInfo = undefined;

    this.disconnect(false);
    this.notify('connecting');
    this.openSocket();
  }

  private describeFailure(): string {
    if (this.host === '127.0.0.1' || this.host === 'localhost') {
      return 'USB tunnel not detected. Enable USB debugging, authorize this PC, and run the kiMo companion.';
    }
    return `Unable to reach the kiMo companion at ${this.host}:${this.port}`;
  }

  private openSocket(): void {
    // Generation guards against stale handlers: each new socket (or disconnect)
    // invalidates callbacks belonging to previous sockets, so a rapid
    // reconnect/target-switch can no longer be hijacked by an old onclose.
    const generation = ++this.generation;
    this.attemptCount++;

    try {
      const ws = new WebSocket(`ws://${this.host}:${this.port}`);
      this.ws = ws;

      ws.onopen = () => {
        if (generation !== this.generation) return;
        this.authenticated = false;
        this.clearAuthTimer();
        this.authTimer = setTimeout(() => {
          if (generation !== this.generation || this.authenticated) return;
          this.lastError = 'The PC did not accept the connection. Check the companion and pairing PIN.';
          ws.close();
        }, AUTH_TIMEOUT_MS);

        // Authenticate immediately upon connection. Do not mark the socket
        // connected until the server confirms authentication.
        this.send({
          type: 'auth',
          payload: {
            pin: this.pin,
            token: this.token,
            deviceName: 'Android Smartphone',
            platform: 'Android'
          }
        });
      };

      ws.onmessage = (event) => {
        if (generation !== this.generation) return;
        try {
          const msg: ServerMessage = JSON.parse(event.data.toString());
          this.handleServerMessage(msg);
        } catch (e) {
          console.warn('Failed to parse server message', e);
        }
      };

      ws.onclose = () => {
        if (generation !== this.generation) return;
        this.authenticated = false;
        this.clearAuthTimer();
        this.cleanupHeartbeat();

        const isUsb = this.host === '127.0.0.1' || this.host === 'localhost';
        // For USB / localhost connections, maintain continuous background retry
        // so that reconnecting the USB cable or starting ADB reverse recovers automatically.
        if (this.autoReconnect && (isUsb || this.attemptCount < this.maxAttempts)) {
          const delay = isUsb
            ? Math.min(1500 + Math.min(this.attemptCount, 5) * 500, 5000)
            : Math.min(
                RECONNECT_BASE_MS * Math.pow(2, Math.max(0, this.attemptCount - 1)),
                RECONNECT_MAX_MS
              );
          this.notify('connecting');
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (generation !== this.generation) return;
            if (this.autoReconnect && this.state !== 'connected') {
              this.openSocket();
            }
          }, delay);
        } else {
          this.notify('error', undefined, this.lastError || this.describeFailure());
        }
      };

      ws.onerror = () => {
        // onclose owns retry/error reporting so we do not flash an error
        // banner between every reconnect attempt.
      };
    } catch (err: any) {
      this.notify('error', undefined, err?.message || this.describeFailure());
    }
  }

  private handleServerMessage(msg: ServerMessage) {
    if (msg.type === 'auth_response') {
      this.clearAuthTimer();
      if (msg.payload.success) {
        if (msg.payload.token) {
          this.token = msg.payload.token;
        }
        this.authenticated = true;
        this.attemptCount = 0;
        this.lastError = '';
        this.notify('connected', this.serverInfo);
        this.startHeartbeat();
      } else {
        this.autoReconnect = false;
        this.lastError = msg.payload.error || 'Pairing authentication failed';
        this.notify('error', undefined, this.lastError);
        this.ws?.close();
      }
    } else if (msg.type === 'status') {
      this.serverInfo = {
        serverName: msg.payload.serverName,
        os: msg.payload.os,
        displayServer: msg.payload.displayServer
      };
      // Status is metadata only. It must never promote an unauthenticated
      // socket to "connected".
      if (this.authenticated) {
        this.notify('connected', this.serverInfo);
      }
    } else if (msg.type === 'error') {
      this.lastError = msg.payload.message || 'The companion rejected the request.';
      if (msg.payload.code === 'UNAUTHORIZED') {
        this.autoReconnect = false;
      }
      this.notify('error', undefined, this.lastError);
      if (msg.payload.code === 'UNAUTHORIZED') {
        this.ws?.close();
      }
    } else if (msg.type === 'pong') {
      this.lastPongAt = Date.now();
      const latency = Date.now() - msg.payload.timestamp;
      for (const listener of this.latencyListeners) {
        listener(latency);
      }
    }
  }

  private startHeartbeat() {
    this.cleanupHeartbeat();
    this.lastPongAt = Date.now();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({
          type: 'ping',
          payload: { timestamp: Date.now() }
        });
      }
    }, 3000);

    // If the tunnel disappears without a TCP close (common with adb reverse),
    // close the socket so the reconnect loop can repair it.
    this.pongTimer = setInterval(() => {
      if (Date.now() - this.lastPongAt > PONG_TIMEOUT_MS) {
        this.lastError = 'The PC stopped responding. Reconnecting...';
        this.ws?.close();
      }
    }, 2000);
  }

  private cleanupHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.pongTimer) {
      clearInterval(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private clearAuthTimer() {
    if (this.authTimer) {
      clearTimeout(this.authTimer);
      this.authTimer = null;
    }
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect(manual = true): void {
    if (manual) {
      this.autoReconnect = false;
      this.lastError = '';
    }
    // Invalidate handlers of any socket still in flight.
    this.generation++;
    this.authenticated = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearAuthTimer();
    this.cleanupHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.notify('disconnected');
  }

  getToken(): string {
    return this.token;
  }
}

export const socketService = new PocketSocket();
