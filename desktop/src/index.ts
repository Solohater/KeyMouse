import os from 'node:os';
import qrcode from 'qrcode-terminal';
import { createInputBackend } from './platform';
import { PairingManager } from './pairing/PairingManager';
import { PocketServer } from './server/PocketServer';
import { DiscoveryService } from './discovery/DiscoveryService';
import { AdbManager } from './adb/AdbManager';
import { KIMO_VERSION } from './version';
import { removeState, writeState } from './state';

interface NetworkEndpoint {
  name: string;
  address: string;
  type: 'bt_pan' | 'hotspot' | 'pc_hotspot' | 'tether' | 'wifi' | 'lan' | 'other';
  label: string;
}

function getNetworkEndpoints(): NetworkEndpoint[] {
  const interfaces = os.networkInterfaces();
  const endpoints: NetworkEndpoint[] = [];

  const ignoredInterface = /^(lo|docker|veth|virbr|br-|tun|tap|wg|proton)/i;

  for (const name of Object.keys(interfaces)) {
    if (ignoredInterface.test(name)) continue;
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254.')) {
        let type: NetworkEndpoint['type'] = 'lan';
        let label = 'Local Network';

        if (iface.address.startsWith('192.168.44.') || name.startsWith('bnep') || name.startsWith('pan') || name.startsWith('bt')) {
          type = 'bt_pan';
          label = 'Bluetooth Network (PAN / Tethering)';
        } else if (iface.address.startsWith('192.168.43.')) {
          type = 'hotspot';
          label = 'Mobile Hotspot';
        } else if (iface.address.startsWith('10.42.0.') || iface.address.startsWith('192.168.137.')) {
          type = 'pc_hotspot';
          label = 'PC Hotspot';
        } else if (iface.address.startsWith('192.168.42.') || name.startsWith('usb') || name.startsWith('rndis')) {
          type = 'tether';
          label = 'USB Tethering';
        } else if (name.startsWith('wl') || name.startsWith('wifi')) {
          type = 'wifi';
          label = 'Wi-Fi Network';
        }

        endpoints.push({ name, address: iface.address, type, label });
      }
    }
  }

  const priority = { bt_pan: 0, hotspot: 1, pc_hotspot: 2, tether: 3, wifi: 4, lan: 5, other: 6 };
  endpoints.sort((a, b) => priority[a.type] - priority[b.type]);
  return endpoints;
}

async function main() {
  const port = parseInt(process.env.PORT || '4242', 10);
  const discoveryPort = parseInt(process.env.DISCOVERY_PORT || '4243', 10);
  let endpoints = getNetworkEndpoints();
  let primaryIp = endpoints[0]?.address || '127.0.0.1';
  const startedAt = Date.now();

  console.log('\n======================================================');
  console.log(`            📱 kiMo PC Companion v${KIMO_VERSION} ⌨ 🖱`);
  console.log('======================================================\n');
  console.log(`OS: ${os.type()} ${os.release()} (${os.arch()})`);
  console.log(`Display Session: ${process.env.XDG_SESSION_TYPE || 'Standard'}`);

  const backend = createInputBackend();
  const pairingManager = new PairingManager();
  const adbManager = new AdbManager(port);
  let stateWriteWarned = false;

  const persistState = () => {
    try {
      writeState({
        version: KIMO_VERSION,
        pid: process.pid,
        port,
        discoveryPort,
        pin: pairingManager.getPin(),
        pinIssuedAt: pairingManager.getPinIssuedAt(),
        startedAt,
        primaryIp,
        endpoints
      });
    } catch (err: any) {
      if (!stateWriteWarned) {
        stateWriteWarned = true;
        console.warn(`⚠️ Could not write state file: ${err?.message || err}`);
        console.warn('   `kimo status` may not work, but the server is running.');
      }
    }
  };

  const refreshEndpoints = (): void => {
    const next = getNetworkEndpoints();
    const nextPrimary = next[0]?.address || '127.0.0.1';
    const changed =
      nextPrimary !== primaryIp ||
      JSON.stringify(next.map((e) => `${e.name}:${e.address}`)) !==
        JSON.stringify(endpoints.map((e) => `${e.name}:${e.address}`));
    endpoints = next;
    primaryIp = nextPrimary;
    if (changed) {
      persistState();
      console.log(`📡 Network changed — advertising ${primaryIp}:${port}`);
    }
  };

  const server = new PocketServer(backend, pairingManager, {
    port,
    getHostIp: () => primaryIp,
    version: KIMO_VERSION,
    getAdbStatus: () => adbManager.getStatus(),
    onPairingChanged: persistState
  });

  try {
    await server.start(port);
  } catch (err: any) {
    if (err?.code === 'EADDRINUSE') {
      console.error(`❌ Port ${port} is already in use. Is another kiMo companion running?`);
      console.error('   Run `kimo status` or stop the other instance, then try again.');
    } else {
      console.error('❌ Failed to start the kiMo server:', err?.message || err);
    }
    process.exit(1);
  }

  adbManager.start();

  const discovery = new DiscoveryService({
    port: discoveryPort,
    serverPort: port,
    getIps: () => endpoints.map((e) => e.address),
    getPrimaryIp: () => primaryIp
  });
  discovery.start();

  persistState();
  const endpointTimer = setInterval(refreshEndpoints, 10000);
  endpointTimer.unref?.();

  const pairUrl = `http://${primaryIp}:${port}/`;
  const showSecrets = process.env.KIMO_QUIET !== '1' && process.env.KIMO_SHOW_PIN !== '0';

  console.log(`\n🚀 Server listening on port ${port} (all network interfaces)`);
  console.log(`⚡ Auto-Discovery (UDP beacon) active on port ${discoveryPort}\n`);

  if (showSecrets) {
    console.log(`🔑 Current Pairing PIN: \x1b[1m\x1b[32m${pairingManager.getPin()}\x1b[0m`);
    console.log('   (The PIN rotates after each successful pairing.)\n');
  } else {
    console.log('🔑 Run `kimo status` on the PC to see the current pairing PIN.\n');
  }

  console.log('📡 Detected Network Interfaces:');
  if (endpoints.length === 0) {
    console.log('  ⚠️ No active IPv4 network interface found (localhost only)');
  } else {
    for (const ep of endpoints) {
      const isPrimary = ep.address === primaryIp ? ' \x1b[33m(Primary)\x1b[0m' : '';
      console.log(`  • \x1b[36m${ep.address}\x1b[0m on ${ep.name} — ${ep.label}${isPrimary}`);
    }
  }

  console.log(`\n🔗 Web Controller:\n   \x1b[4m${pairUrl}\x1b[0m`);
  console.log('   Open it on the PC and enter the pairing PIN.\n');

  console.log('--- Scan this QR code with your phone to open the controller ---');
  qrcode.generate(pairUrl, { small: true });

  console.log('\n💡 Connection Modes:');
  console.log('  1. 🔌 USB (ADB) — recommended for lowest latency:');
  console.log('     • Connect the phone with a data-capable USB cable.');
  console.log('     • Enable Developer Options → USB debugging and authorize the PC.');
  console.log('     • The companion auto-creates the adb reverse tunnel; open kiMo → Connect USB.\n');
  console.log('  2. 📶 SAME WI-FI / PHONE HOTSPOT:');
  console.log('     • Connect phone and PC to the same network (or the phone hotspot).');
  console.log('     • In kiMo, use Auto-Detect or enter the PC IP manually.\n');
  console.log('  3. 🔵 BLUETOOTH HID (no companion required):');
  console.log('     • In kiMo → Bluetooth, make the phone discoverable and pair it from the PC.\n');
  console.log('Press Ctrl+C to stop.\n');

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\nShutting down kiMo companion...');
    clearInterval(endpointTimer);
    adbManager.stop();
    discovery.stop();
    await server.stop().catch(() => {});
    removeState();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal server error:', err);
  process.exit(1);
});
