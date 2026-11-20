import dgram from 'node:dgram';
import os from 'node:os';

export interface DiscoveryOptions {
  port: number;
  serverPort: number;
  getIps: () => string[];
  getPrimaryIp: () => string;
}

export class DiscoveryService {
  private socket: dgram.Socket | null = null;
  private beaconTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(private options: DiscoveryOptions) {}

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.socket.on('error', (err) => {
        // UDP discovery failure shouldn't crash the main server
        console.warn('Discovery UDP socket warning:', err.message);
      });

      this.socket.on('message', (msg, rinfo) => {
        try {
          const text = msg.toString();
          const parsed = JSON.parse(text);

          if (parsed && (parsed.type === 'DISCOVER_POCKETINPUT' || parsed.type === 'POCKET_DISCOVER')) {
            // Respond directly to the sender
            const response = JSON.stringify({
              type: 'POCKETINPUT_OFFER',
              serverName: os.hostname(),
              port: this.options.serverPort,
              ips: this.options.getIps(),
              primaryIp: this.options.getPrimaryIp(),
              os: os.type()
            });

            this.socket?.send(response, rinfo.port, rinfo.address, (err) => {
              if (err) console.warn('Failed to send discovery response:', err.message);
            });
          }
        } catch {
          // Ignore non-JSON broadcast noise
        }
      });

      this.socket.bind(this.options.port, '0.0.0.0', () => {
        try {
          this.socket?.setBroadcast(true);
        } catch {
          // Broadcast permission may vary by OS
        }
      });

      // Periodically broadcast discovery beacon
      this.beaconTimer = setInterval(() => {
        this.broadcastBeacon();
      }, 3000);
    } catch (err: any) {
      console.warn('Could not initialize UDP discovery:', err.message);
    }
  }

  private broadcastBeacon(): void {
    if (!this.socket || !this.isRunning) return;

    try {
      const beaconMsg = JSON.stringify({
        type: 'POCKETINPUT_BEACON',
        serverName: os.hostname(),
        port: this.options.serverPort,
        ips: this.options.getIps(),
        primaryIp: this.options.getPrimaryIp(),
        timestamp: Date.now()
      });

      // Broadcast to standard broadcast address
      this.socket.send(beaconMsg, this.options.port, '255.255.255.255', () => {});
    } catch {
      // Ignore broadcast errors
    }
  }

  stop(): void {
    this.isRunning = false;
    if (this.beaconTimer) {
      clearInterval(this.beaconTimer);
      this.beaconTimer = null;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch {}
      this.socket = null;
    }
  }
}
