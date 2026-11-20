import { NativeModules, Platform } from 'react-native';

/**
 * Auto-discovery service for finding the kiMo companion on a local network,
 * phone hotspot, or USB tethering link.
 */

export interface DiscoveredServer {
  host: string;
  port: number;
  serverName: string;
  version?: string;
  usb?: string;
  latencyMs: number;
}

interface NativeDiscoverResult {
  hosts?: string[];
  primaryIp?: string;
  port?: number;
  serverName?: string;
}

const NativeDiscovery =
  Platform.OS === 'android' ? NativeModules.NetworkDiscoveryModule : null;

const PRIVATE_PREFIXES = ['10.', '172.', '192.168.', '100.64.'];

function isPrivateIPv4(address: string): boolean {
  return PRIVATE_PREFIXES.some((prefix) => address.startsWith(prefix));
}

function subnetPrefix(address: string): string | null {
  const parts = address.trim().split('.');
  if (parts.length !== 4) return null;
  if (parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

export class MobileDiscoveryService {
  /**
   * Probes a specific IP and port to see if a kiMo companion is responding.
   */
  static async probeServer(host: string, port = 4242, timeoutMs = 900): Promise<DiscoveredServer | null> {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`http://${host}:${port}/status`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' }
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.server === 'PocketInput') {
          return {
            host,
            port,
            serverName: data.serverName || 'PC',
            version: data.version,
            usb: data.usb,
            latencyMs: Date.now() - start
          };
        }
      }
    } catch {
      // Offline or unreachable
    } finally {
      clearTimeout(timer);
    }
    return null;
  }

  /** Returns the phone's current non-loopback IPv4 addresses. */
  static async getLocalAddresses(): Promise<string[]> {
    if (!NativeDiscovery?.getLocalIpv4Addresses) return [];
    try {
      const addresses = await NativeDiscovery.getLocalIpv4Addresses();
      if (!Array.isArray(addresses)) return [];
      return addresses.filter((address: unknown): address is string =>
        typeof address === 'string' && address.includes('.') && !address.startsWith('127.')
      );
    } catch {
      return [];
    }
  }

  /**
   * Sends a UDP discovery request and returns the PC's advertised addresses.
   * The companion listens on 4243 and answers with POCKETINPUT_OFFER.
   */
  static async udpDiscover(
    timeoutMs = 2000
  ): Promise<{ hosts: string[]; port: number; serverName?: string }> {
    if (!NativeDiscovery?.discover) return { hosts: [], port: 4242 };
    try {
      const result: NativeDiscoverResult = await NativeDiscovery.discover(timeoutMs);
      const hosts = new Set<string>();
      for (const host of result?.hosts || []) {
        if (typeof host === 'string' && host.includes('.')) hosts.add(host);
      }
      if (result?.primaryIp) hosts.add(result.primaryIp);
      return {
        hosts: [...hosts].filter((host) => !host.startsWith('127.')),
        port: result?.port || 4242,
        serverName: result?.serverName
      };
    } catch {
      return { hosts: [], port: 4242 };
    }
  }

  private static async probeHosts(
    hosts: string[],
    port = 4242,
    timeoutMs = 900
  ): Promise<DiscoveredServer[]> {
    const unique = [...new Set(hosts)];
    if (unique.length === 0) return [];
    const results = await Promise.all(unique.map((host) => this.probeServer(host, port, timeoutMs)));
    return results.filter((server): server is DiscoveredServer => server !== null);
  }

  /**
   * Fast path: UDP broadcast plus HTTP verification of the advertised IPs.
   * This works on Wi-Fi, phone hotspot, and USB tethering without knowing
   * the PC's IP in advance.
   */
  static async discoverFast(): Promise<DiscoveredServer[]> {
    const udp = await this.udpDiscover(1800);
    if (udp.hosts.length > 0) {
      const found = await this.probeHosts(udp.hosts, udp.port, 1000);
      if (found.length > 0) return found;
    }
    return [];
  }

  /**
   * Scans the /24 of the phone's actual local address. This is the fallback
   * when UDP broadcast is blocked by the router or Android.
   */
  static async scanLocalNetworks(
    onProgress?: (scanned: number, total: number) => void
  ): Promise<DiscoveredServer[]> {
    const fast = await this.discoverFast();
    if (fast.length > 0) {
      onProgress?.(1, 1);
      return fast;
    }

    const localAddresses = await this.getLocalAddresses();
    const prefixes = new Set<string>();
    for (const address of localAddresses) {
      if (!isPrivateIPv4(address)) continue;
      const prefix = subnetPrefix(address);
      if (prefix) prefixes.add(prefix);
    }

    // Common Android USB tethering / hotspot gateways. Only add these when
    // the phone does not expose a usable address, or when the address matches.
    const fallbackPrefixes = ['192.168.42', '192.168.43', '192.168.44', '10.42.0', '192.168.137'];
    if (prefixes.size === 0) {
      for (const prefix of fallbackPrefixes) prefixes.add(prefix);
    }

    const found: DiscoveredServer[] = [];
    const prefixList = [...prefixes];
    for (const prefix of prefixList) {
      const result = await this.scanSubnet(`${prefix}.1`, onProgress, 320, 24);
      for (const server of result) {
        if (!found.some((item) => item.host === server.host)) found.push(server);
      }
      if (found.length > 0) break;
    }

    if (found.length === 0 && prefixes.size > 0) {
      // The PC may be on a neighboring subnet when the phone is on a wider
      // network (for example a /16 Wi-Fi deployment). Probe the gateways only.
      const gateways = ['192.168.42.1', '192.168.43.1', '192.168.44.1', '10.42.0.1', '192.168.137.1'];
      const gatewayResults = await this.probeHosts(gateways, 4242, 700);
      for (const server of gatewayResults) {
        if (!found.some((item) => item.host === server.host)) found.push(server);
      }
    }

    return found;
  }

  /**
   * Scans common hotspot subnets. Kept for compatibility with older screens.
   */
  static async scanHotspotSubnet(
    onProgress?: (scanned: number, total: number) => void
  ): Promise<DiscoveredServer[]> {
    return this.scanLocalNetworks(onProgress);
  }

  /**
   * Scans a custom subnet based on a known IP (e.g. 192.168.1.180 -> scan .1..254)
   */
  static async scanSubnet(
    baseIp: string,
    onProgress?: (scanned: number, total: number) => void,
    timeoutMs = 400,
    batchSize = 24
  ): Promise<DiscoveredServer[]> {
    const prefix = subnetPrefix(baseIp);
    if (!prefix) return [];

    const found: DiscoveredServer[] = [];

    // Probe the supplied address first; it is often the gateway or the PC.
    const primaryProbe = await this.probeServer(baseIp, 4242, Math.max(700, timeoutMs));
    if (primaryProbe) return [primaryProbe];

    const targets: string[] = [];
    for (let i = 1; i <= 254; i++) {
      const target = `${prefix}.${i}`;
      if (target !== baseIp) targets.push(target);
    }

    let completed = 1;
    const total = targets.length + 1;

    for (let i = 0; i < targets.length; i += batchSize) {
      const chunk = targets.slice(i, i + batchSize);
      const results = await Promise.all(
        chunk.map((ip) => this.probeServer(ip, 4242, timeoutMs))
      );

      for (const res of results) {
        if (res && !found.some((item) => item.host === res.host)) found.push(res);
      }

      completed += chunk.length;
      onProgress?.(Math.min(completed, total), total);

      if (found.length > 0) break;
    }

    return found;
  }
}
