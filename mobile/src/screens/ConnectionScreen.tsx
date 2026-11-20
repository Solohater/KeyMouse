import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator
} from 'react-native';
import { socketService, ConnectionState, ServerInfo } from '../services/PocketSocket';
import { StorageService, SavedPC } from '../services/StorageService';
import { MobileDiscoveryService, DiscoveredServer } from '../services/DiscoveryService';
import { bluetoothHidService, BondedBluetoothDevice } from '../services/BluetoothHidService';
import { inputDispatcher } from '../services/InputDispatcher';
import { triggerHaptic } from '../utils/haptics';
import { useTheme } from '../theme/ThemeContext';
import {
  Usb,
  RadioTower,
  Wifi,
  Bluetooth,
  Zap,
  Laptop,
  ChevronRight,
  CheckCircle2,
  RefreshCw,
  Radio,
  Sliders,
  X
} from 'lucide-react-native';

export type ConnectionTab = 'usb' | 'hotspot' | 'wifi' | 'bluetooth';

const isLocalHost = (h: string) => h === '127.0.0.1' || h === 'localhost';

interface ConnectionScreenProps {
  onConnected: () => void;
  hapticEnabled: boolean;
  initialTab?: ConnectionTab;
  onOpenSetup?: () => void;
}

export const ConnectionScreen: React.FC<ConnectionScreenProps> = ({
  onConnected,
  hapticEnabled,
  initialTab = 'usb',
  onOpenSetup
}) => {
  const { colors, isDark } = useTheme();

  // Tab State: Default is 'usb' for ultra-low latency & zero data requirement
  const [activeTab, setActiveTab] = useState<ConnectionTab>(initialTab);

  // Network / Socket Connection states
  const [host, setHost] = useState('');
  const [port, setPort] = useState('4242');
  const [pin, setPin] = useState('');
  const [connState, setConnState] = useState<ConnectionState>('disconnected');
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedPCs, setSavedPCs] = useState<SavedPC[]>([]);
  const [latency, setLatency] = useState<number | null>(null);

  // Auto Discovery & Hotspot states
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredServers, setDiscoveredServers] = useState<DiscoveredServer[]>([]);
  const [scanStatus, setScanStatus] = useState<string>('');

  // Bluetooth HID state
  const [btSupported, setBtSupported] = useState(false);
  const [btRegistered, setBtRegistered] = useState(false);
  const [btConnected, setBtConnected] = useState(false);
  const [btConnectedDevice, setBtConnectedDevice] = useState<string>('');
  const [btBondedDevices, setBtBondedDevices] = useState<BondedBluetoothDevice[]>([]);
  const [btLoading, setBtLoading] = useState(false);
  const [btStatusMsg, setBtStatusMsg] = useState<string>('');

  const autoConnectAttempted = useRef(false);
  const connStateRef = useRef<ConnectionState>('disconnected');
  const isConnectingUserInitiated = useRef(false);
  const btInitAttempted = useRef(false);

  useEffect(() => {
    // 1. Initialize Bluetooth HID (permissions are requested when the tab opens)
    bluetoothHidService.isSupported().then(setBtSupported);

    const unsubBt = bluetoothHidService.onStateChange((event) => {
      if (event.state === 'connected') {
        setBtConnected(true);
        setBtConnectedDevice(event.deviceName || 'PC');
        inputDispatcher.setMode('bluetooth_hid');
        setBtStatusMsg(`Connected directly to ${event.deviceName || 'PC'} via Bluetooth!`);
        if (isConnectingUserInitiated.current) {
          isConnectingUserInitiated.current = false;
          onConnected();
        }
      } else if (event.state === 'disconnected') {
        setBtConnected(false);
        setBtConnectedDevice('');
        setBtStatusMsg('Bluetooth disconnected.');
      } else if (event.event === 'appStatusChanged') {
        setBtRegistered(!!event.registered);
        if (event.registered) {
          setBtStatusMsg('✓ Bluetooth HID Profile registered and active!');
          bluetoothHidService.getBondedDevices().then(setBtBondedDevices);
        } else {
          setBtStatusMsg('Bluetooth HID profile unregistered.');
        }
      } else if (event.event === 'error') {
        setBtStatusMsg(`Bluetooth error: ${event.message}`);
      }
    });

    // 2. Initialize WebSocket Status & Latency Listeners
    // Sync the Auto-Reconnect preference and purge legacy USB (127.0.0.1)
    // entries from Saved PCs — they only work while the USB tunnel is up.
    StorageService.getPreferences().then((prefs) => {
      socketService.setAutoReconnectPref(prefs.autoReconnect);
    });
    StorageService.removeLocalPCs().then(() => loadSaved());

    const unsubStatus = socketService.onStatusChange((state, info, err) => {
      const prev = connStateRef.current;
      connStateRef.current = state;
      setConnState(state);
      if (info) setServerInfo(info);
      if (err) setErrorMsg(err);
      if (state === 'connected') {
        setErrorMsg(null);
        inputDispatcher.setMode('socket');
        // Persist connected PC (use the socket's actual target — this listener
        // must not capture host/port from the render it was created in)
        const targetHost = socketService.getHost();
        const targetPort = socketService.getPort();
        // USB/localhost connections are session-only; keep them out of Saved PCs
        if (!isLocalHost(targetHost)) {
          StorageService.savePC({
            id: `${targetHost}:${targetPort}`,
            name: info?.serverName || `PC (${targetHost})`,
            host: targetHost,
            port: targetPort,
            token: socketService.getToken(),
            lastConnected: Date.now()
          });
        }
        loadSaved();
        if (isConnectingUserInitiated.current) {
          isConnectingUserInitiated.current = false;
          onConnected();
        }
      }
    });

    const unsubLatency = socketService.onLatencyChange((ms) => {
      setLatency(ms);
    });

    // 3. Proactive USB auto-connect if disconnected (bounded: a few attempts so
    // a missing tunnel surfaces an error instead of spinning forever)
    const timer = setTimeout(() => {
      if (initialTab === 'usb' && !autoConnectAttempted.current && socketService.getState() === 'disconnected') {
        autoConnectAttempted.current = true;
        // Probe the ADB tunnel. Keep retrying so a cable replug or an adb
        // restart recovers without restarting the app.
        socketService.connect('127.0.0.1', 4242, '', '');
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      unsubBt();
      unsubStatus();
      unsubLatency();
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'bluetooth' || !btSupported || btInitAttempted.current) return;
    btInitAttempted.current = true;
    setBtLoading(true);
    bluetoothHidService
      .requestPermissions()
      .then(async (granted) => {
        if (!granted) {
          setBtStatusMsg('Bluetooth permission denied. Tap "Start Bluetooth HID" to try again.');
          return;
        }
        const started = await bluetoothHidService.startHidService();
        if (!started) {
          setBtStatusMsg('Could not start the Bluetooth HID profile on this device.');
        }
        const devices = await bluetoothHidService.getBondedDevices();
        setBtBondedDevices(devices);
      })
      .catch((e) => setBtStatusMsg(`Bluetooth error: ${e?.message || 'unknown'}`))
      .finally(() => setBtLoading(false));
  }, [activeTab, btSupported]);

  const loadSaved = async () => {
    const pcs = await StorageService.getSavedPCs();
    setSavedPCs(pcs);
  };

  // Connect via USB (127.0.0.1:4242 reversed port)
  const handleConnectUsb = () => {
    triggerHaptic(hapticEnabled, 'medium');
    setErrorMsg(null);
    setHost('127.0.0.1');
    setPort('4242');
    inputDispatcher.setMode('socket');
    if (socketService.getState() === 'connected' && isLocalHost(socketService.getHost())) {
      onConnected();
      return;
    }
    isConnectingUserInitiated.current = true;
    setConnState('connecting');
    connStateRef.current = 'connecting';
    // Retry until the user disconnects or the tunnel appears. The socket
    // handles backoff, auth timeout, and pong-based dead-tunnel detection.
    socketService.connect('127.0.0.1', 4242, '', '');
  };

  // Connect via generic host/port/pin
  const handleConnect = (targetHost?: string, targetPort?: number, targetPin?: string) => {
    triggerHaptic(hapticEnabled, 'medium');
    inputDispatcher.setMode('socket');
    const connectHost = targetHost || host;
    const connectPort = targetPort || parseInt(port, 10) || 4242;
    const connectPin = targetPin !== undefined ? targetPin : pin;

    if (!connectHost.trim()) {
      Alert.alert('Required', 'Please enter your PC IP address');
      return;
    }

    setErrorMsg(null);
    isConnectingUserInitiated.current = true;
    socketService.connect(connectHost, connectPort, connectPin);
  };

  const handleDisconnect = () => {
    triggerHaptic(hapticEnabled, 'medium');
    socketService.disconnect(true);
  };

  const discoverOnCurrentNetwork = async (label: string, emptyMessage: string) => {
    triggerHaptic(hapticEnabled, 'medium');
    setIsScanning(true);
    setScanStatus(`Looking for the ${label} companion...`);
    setDiscoveredServers([]);

    try {
      const results = await MobileDiscoveryService.scanLocalNetworks((scanned, total) => {
        setScanStatus(`Probing ${label} (${scanned}/${total})...`);
      });

      if (results.length > 0) {
        setDiscoveredServers(results);
        setHost(results[0].host);
        setPort(results[0].port.toString());
        setScanStatus(`Found ${results.length} PC on ${label}. Tap it to connect.`);
      } else {
        setScanStatus(emptyMessage);
      }
    } catch {
      setScanStatus('Scan timed out. You can still enter the PC IP below.');
    } finally {
      setIsScanning(false);
    }
  };

  // Hotspot / AP scan
  const handleScanHotspot = () =>
    discoverOnCurrentNetwork(
      'the hotspot',
      'No PC found. Make sure the PC is connected to this phone\'s hotspot and the companion is running.'
    );

  // Wi-Fi scan
  const handleScanWifi = () =>
    discoverOnCurrentNetwork(
      'Wi-Fi',
      'No PC found automatically. Enter the PC IP below, and make sure both devices are on the same network.'
    );

  // USB tethering scan: no Developer Options and no ADB tunnel required.
  const handleScanTethering = () =>
    discoverOnCurrentNetwork(
      'USB tethering',
      'No PC found. Enable USB tethering on this phone, connect the cable, and make sure the companion is running.'
    );

  // Bluetooth Actions
  const handleStartBtService = async () => {
    triggerHaptic(hapticEnabled, 'medium');
    setBtLoading(true);
    setBtStatusMsg('Registering Bluetooth HID profile...');
    try {
      await bluetoothHidService.startHidService();
      const devs = await bluetoothHidService.getBondedDevices();
      setBtBondedDevices(devs);
    } catch (e: any) {
      setBtStatusMsg(`Bluetooth error: ${e.message}`);
    } finally {
      setBtLoading(false);
    }
  };

  const handleMakeDiscoverable = async () => {
    triggerHaptic(hapticEnabled, 'medium');
    setBtStatusMsg('Phone discoverable for 120s! Select it in PC Bluetooth settings.');
    await bluetoothHidService.makeDiscoverable(120);
  };

  const handleConnectBtDevice = async (address: string) => {
    triggerHaptic(hapticEnabled, 'medium');
    isConnectingUserInitiated.current = true;
    setBtLoading(true);
    setBtStatusMsg('Connecting to Bluetooth PC...');
    try {
      await bluetoothHidService.connectToDevice(address);
      inputDispatcher.setMode('bluetooth_hid');
    } catch (e: any) {
      setBtStatusMsg(`Connection failed: ${e.message}`);
    } finally {
      setBtLoading(false);
    }
  };

  const handleDisconnectBt = async () => {
    triggerHaptic(hapticEnabled, 'medium');
    await bluetoothHidService.disconnectDevice();
    setBtConnected(false);
    setBtConnectedDevice('');
  };

  const connectToSaved = (pc: SavedPC) => {
    setHost(pc.host);
    setPort(pc.port.toString());
    triggerHaptic(hapticEnabled, 'light');
    socketService.connect(pc.host, pc.port, '', pc.token);
  };

  const removeSaved = async (id: string) => {
    triggerHaptic(hapticEnabled, 'light');
    await StorageService.removePC(id);
    loadSaved();
  };

  const isSocketConnected = connState === 'connected';
  const isAnyConnected = isSocketConnected || btConnected;
  const activeHost = socketService.getHost();
  const isUsbActive = isSocketConnected && isLocalHost(activeHost);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* 1. Header: Brand & Live Status Pill */}
      <View style={styles.hubHeaderRow}>
        <View>
          <Text style={[styles.hubBrandTitle, { color: colors.textPrimary }]}>kiMo</Text>
          <Text style={[styles.hubBrandSub, { color: colors.textSecondary }]}>Ultra-fast PC Control</Text>
        </View>

        <View
          style={[
            styles.hubStatusPill,
            isAnyConnected ? styles.hubStatusPillConnected : styles.hubStatusPillDisconnected
          ]}
        >
          {isUsbActive ? (
            <Usb size={13} color="#10b981" />
          ) : isSocketConnected ? (
            <Wifi size={13} color="#10b981" />
          ) : btConnected ? (
            <Bluetooth size={13} color="#10b981" />
          ) : (
            <Zap size={13} color={colors.accent} />
          )}
          <Text
            style={[
              styles.hubStatusPillText,
              { color: isAnyConnected ? '#10b981' : colors.accent }
            ]}
          >
            {isUsbActive
              ? `USB Active (${latency !== null ? `${latency}ms` : '<1ms'})`
              : isSocketConnected
              ? `Wi-Fi (${serverInfo?.serverName || 'PC'})`
              : btConnected
              ? `BT (${btConnectedDevice || 'PC'})`
              : 'Ready to Connect'}
          </Text>
        </View>
      </View>

      {onOpenSetup && (
        <TouchableOpacity
          style={[styles.setupLink, { borderColor: colors.border, backgroundColor: colors.surfaceSubtle }]}
          activeOpacity={0.8}
          onPress={() => {
            triggerHaptic(hapticEnabled, 'light');
            onOpenSetup();
          }}
        >
          <Laptop size={14} color={colors.accent} />
          <Text style={[styles.setupLinkText, { color: colors.textSecondary }]}>
            New to kiMo? Open the setup guide
          </Text>
          <ChevronRight size={15} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      {/* 2. TAB SELECTOR BAR (4 TABS) */}
      <View style={[styles.tabSelectorBar, { backgroundColor: isDark ? '#0e1526' : '#e2e8f0' }]}>
        <TouchableOpacity
          style={[
            styles.tabSelectorItem,
            activeTab === 'usb' && [styles.tabSelectorItemActive, { backgroundColor: colors.accent }]
          ]}
          onPress={() => {
            triggerHaptic(hapticEnabled, 'light');
            setActiveTab('usb');
          }}
          activeOpacity={0.8}
        >
          <Usb size={13} color={activeTab === 'usb' ? (isDark ? '#000000' : '#ffffff') : colors.textSecondary} />
          <Text
            style={[
              styles.tabSelectorText,
              activeTab === 'usb' && styles.tabSelectorTextActive,
              { color: activeTab === 'usb' ? (isDark ? '#000000' : '#ffffff') : colors.textSecondary }
            ]}
          >
            USB Cable
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabSelectorItem,
            activeTab === 'hotspot' && [styles.tabSelectorItemActive, { backgroundColor: colors.accent }]
          ]}
          onPress={() => {
            triggerHaptic(hapticEnabled, 'light');
            setActiveTab('hotspot');
          }}
          activeOpacity={0.8}
        >
          <RadioTower size={13} color={activeTab === 'hotspot' ? (isDark ? '#000000' : '#ffffff') : colors.textSecondary} />
          <Text
            style={[
              styles.tabSelectorText,
              activeTab === 'hotspot' && styles.tabSelectorTextActive,
              { color: activeTab === 'hotspot' ? (isDark ? '#000000' : '#ffffff') : colors.textSecondary }
            ]}
          >
            Hotspot
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabSelectorItem,
            activeTab === 'wifi' && [styles.tabSelectorItemActive, { backgroundColor: colors.accent }]
          ]}
          onPress={() => {
            triggerHaptic(hapticEnabled, 'light');
            setActiveTab('wifi');
          }}
          activeOpacity={0.8}
        >
          <Wifi size={13} color={activeTab === 'wifi' ? (isDark ? '#000000' : '#ffffff') : colors.textSecondary} />
          <Text
            style={[
              styles.tabSelectorText,
              activeTab === 'wifi' && styles.tabSelectorTextActive,
              { color: activeTab === 'wifi' ? (isDark ? '#000000' : '#ffffff') : colors.textSecondary }
            ]}
          >
            Wi-Fi
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabSelectorItem,
            activeTab === 'bluetooth' && [styles.tabSelectorItemActive, { backgroundColor: colors.accent }]
          ]}
          onPress={() => {
            triggerHaptic(hapticEnabled, 'light');
            setActiveTab('bluetooth');
          }}
          activeOpacity={0.8}
        >
          <Bluetooth size={13} color={activeTab === 'bluetooth' ? (isDark ? '#000000' : '#ffffff') : colors.textSecondary} />
          <Text
            style={[
              styles.tabSelectorText,
              activeTab === 'bluetooth' && styles.tabSelectorTextActive,
              { color: activeTab === 'bluetooth' ? (isDark ? '#000000' : '#ffffff') : colors.textSecondary }
            ]}
          >
            Bluetooth
          </Text>
        </TouchableOpacity>
      </View>

      {/* ===================================================================== */}
      {/* TAB 1: USB CABLE (PRIMARY & RECOMMENDED)                               */}
      {/* ===================================================================== */}
      {activeTab === 'usb' && (
        <View style={[styles.heroGlassCard, { backgroundColor: isDark ? '#0b0f1a' : '#ffffff', borderColor: colors.accent }]}>
          <View style={[styles.heroBadge, { backgroundColor: 'rgba(6, 182, 212, 0.15)', borderColor: colors.accent }]}>
            <Zap size={11} color={colors.accent} />
            <Text style={[styles.heroBadgeText, { color: colors.accent }]}>RECOMMENDED • ZERO-LATENCY</Text>
          </View>

          <Text style={[styles.heroCardTitle, { color: colors.textPrimary }]}>
            {isUsbActive ? 'USB Cable Active' : 'USB Cable Connection'}
          </Text>
          <Text style={[styles.heroCardSubtitle, { color: colors.textSecondary }]}>
            Ultra-low latency (&lt;0.5ms) • Zero Wi-Fi or mobile data needed
          </Text>

          {/* Central Glowing Circular Button */}
          <TouchableOpacity
            style={[
              styles.heroCircleGlowOuter,
              isUsbActive && { borderColor: '#10b981', shadowColor: '#10b981' },
              connState === 'connecting' && { borderColor: '#facc15' }
            ]}
            activeOpacity={0.85}
            onPress={isUsbActive ? onConnected : handleConnectUsb}
            disabled={connState === 'connecting'}
          >
            <View
              style={[
                styles.heroCircleGlowInner,
                isUsbActive && { backgroundColor: 'rgba(16, 185, 129, 0.15)' }
              ]}
            >
              {connState === 'connecting' ? (
                <ActivityIndicator color={colors.accent} size="large" />
              ) : (
                <>
                  <Usb size={32} color={isUsbActive ? '#10b981' : colors.accent} />
                  <Text style={[styles.heroCircleTitle, isUsbActive && { color: '#10b981' }]}>
                    {isUsbActive ? 'OPEN MOUSE' : 'CONNECT USB'}
                  </Text>
                  <Text style={styles.heroCircleSub}>
                    {isUsbActive
                      ? `Lat: ${latency !== null ? `${latency}ms` : '<1ms'} • Ready`
                      : 'Tap to connect'}
                  </Text>
                </>
              )}
            </View>
          </TouchableOpacity>

          {isUsbActive ? (
            <View style={styles.activeActionsRow}>
              <TouchableOpacity
                style={[styles.primaryActionPill, { backgroundColor: '#10b981' }]}
                onPress={onConnected}
              >
                <Text style={styles.primaryActionPillText}>Use Touchpad & Keyboard ›</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.disconnectPillBtn, { borderColor: '#ef4444' }]}
                onPress={handleDisconnect}
              >
                <Text style={[styles.disconnectPillBtnText, { color: '#ef4444' }]}>Disconnect</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.instructionsBox}>
              <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
                NO DEVELOPER OPTIONS? USE USB TETHERING
              </Text>
              <View style={styles.instRow}>
                <View style={[styles.instNum, { backgroundColor: colors.accent }]}>
                  <Text style={styles.instNumText}>1</Text>
                </View>
                <Text style={[styles.instText, { color: colors.textSecondary }]}>
                  Connect phone to the PC with a data-capable USB cable.
                </Text>
              </View>
              <View style={styles.instRow}>
                <View style={[styles.instNum, { backgroundColor: colors.accent }]}>
                  <Text style={styles.instNumText}>2</Text>
                </View>
                <Text style={[styles.instText, { color: colors.textSecondary }]}>
                  Enable <Text style={{ fontWeight: '700', color: colors.textPrimary }}>USB tethering</Text> in Android
                  Settings, then tap the detect button below.
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.primaryActionPill, { backgroundColor: '#f59e0b', marginTop: 12 }]}
                onPress={handleScanTethering}
                disabled={isScanning}
              >
                {isScanning ? (
                  <ActivityIndicator color="#000000" size="small" />
                ) : (
                  <Text style={[styles.primaryActionPillText, { color: '#000000' }]}>
                    Auto-Detect USB Tethering
                  </Text>
                )}
              </TouchableOpacity>

              <Text style={[styles.instText, { color: colors.textSecondary, marginTop: 12 }]}>
                ADB mode (advanced): enable Developer Options → USB debugging, authorize this PC,
                then tap <Text style={{ color: colors.accent, fontWeight: '700' }}>CONNECT USB</Text> above.
              </Text>
            </View>
          )}

          {scanStatus ? (
            <Text style={[styles.scanStatusLabel, { color: colors.textSecondary }]}>{scanStatus}</Text>
          ) : null}

          {discoveredServers.length > 0 && (
            <View style={{ width: '100%', marginTop: 12 }}>
              <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>DISCOVERED PC</Text>
              {discoveredServers.map((srv, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.discoveredCard, { backgroundColor: isDark ? '#131b2e' : '#f1f5f9' }]}
                  onPress={() => handleConnect(srv.host, srv.port)}
                >
                  <Laptop size={20} color={colors.accent} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.discoveredName, { color: colors.textPrimary }]}>{srv.serverName}</Text>
                    <Text style={[styles.discoveredHost, { color: colors.textSecondary }]}>{srv.host}:{srv.port}</Text>
                  </View>
                  <Text style={[styles.connectTag, { color: colors.accent }]}>Connect ›</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {!isUsbActive && connState === 'error' && errorMsg && (
            <View
              style={[
                styles.errorBanner,
                { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.07)', borderColor: '#ef4444' }
              ]}
            >
              <Text style={styles.errorBannerTitle}>{errorMsg}</Text>
              <Text style={[styles.errorBannerHint, { color: colors.textSecondary }]}>
                For ADB mode, check the cable, allow USB debugging, and run the companion on the PC. For normal phones,
                use USB tethering above. The PC must run Ubuntu/Debian x86_64.
              </Text>
              <TouchableOpacity
                style={[styles.disconnectPillBtn, { borderColor: colors.accent, marginTop: 10 }]}
                onPress={handleConnectUsb}
              >
                <Text style={[styles.disconnectPillBtnText, { color: colors.accent }]}>Retry ADB tunnel</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: PHONE HOTSPOT (DIRECT WIRELESS)                                */}
      {/* ===================================================================== */}
      {activeTab === 'hotspot' && (
        <View style={[styles.heroGlassCard, { backgroundColor: isDark ? '#0b0f1a' : '#ffffff', borderColor: '#f59e0b' }]}>
          <View style={[styles.heroBadge, { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: '#f59e0b' }]}>
            <RadioTower size={11} color="#f59e0b" />
            <Text style={[styles.heroBadgeText, { color: "#f59e0b" }]}>DIRECT WIRELESS • NO ROUTER</Text>
          </View>

          <Text style={[styles.heroCardTitle, { color: colors.textPrimary }]}>Phone Hotspot Mode</Text>
          <Text style={[styles.heroCardSubtitle, { color: colors.textSecondary }]}>
            Connect PC directly to phone's Wi-Fi hotspot (mobile data can stay OFF)
          </Text>

          <View style={styles.instructionsBox}>
            <View style={styles.instRow}>
              <View style={[styles.instNum, { backgroundColor: '#f59e0b' }]}>
                <Text style={styles.instNumText}>1</Text>
              </View>
              <Text style={[styles.instText, { color: colors.textSecondary }]}>
                Turn on <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Personal Hotspot</Text> on this phone.
              </Text>
            </View>
            <View style={styles.instRow}>
              <View style={[styles.instNum, { backgroundColor: '#f59e0b' }]}>
                <Text style={styles.instNumText}>2</Text>
              </View>
              <Text style={[styles.instText, { color: colors.textSecondary }]}>
                Connect your Laptop to this phone's Wi-Fi network.
              </Text>
            </View>
            <View style={styles.instRow}>
              <View style={[styles.instNum, { backgroundColor: '#f59e0b' }]}>
                <Text style={styles.instNumText}>3</Text>
              </View>
              <Text style={[styles.instText, { color: colors.textSecondary }]}>
                Tap <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Auto-Detect Laptop</Text> below.
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryActionPill, { backgroundColor: '#f59e0b', marginTop: 14 }]}
            onPress={handleScanHotspot}
            disabled={isScanning}
          >
            {isScanning ? (
              <ActivityIndicator color="#000000" size="small" />
            ) : (
              <Text style={[styles.primaryActionPillText, { color: '#000000' }]}>
                🔍 Auto-Detect Laptop on Hotspot
              </Text>
            )}
          </TouchableOpacity>

          {scanStatus ? (
            <Text style={[styles.scanStatusLabel, { color: colors.textSecondary }]}>{scanStatus}</Text>
          ) : null}

          {discoveredServers.length > 0 && (
            <View style={{ width: '100%', marginTop: 12 }}>
              <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>DISCOVERED LAPTOPS</Text>
              {discoveredServers.map((srv, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.discoveredCard, { backgroundColor: isDark ? '#131b2e' : '#f1f5f9' }]}
                  onPress={() => handleConnect(srv.host, srv.port)}
                >
                  <Laptop size={20} color="#f59e0b" />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.discoveredName, { color: colors.textPrimary }]}>{srv.serverName}</Text>
                    <Text style={[styles.discoveredHost, { color: colors.textSecondary }]}>{srv.host}:{srv.port}</Text>
                  </View>
                  <Text style={[styles.connectTag, { color: '#f59e0b' }]}>Connect ›</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: WI-FI NETWORK (SHARED ROUTER)                                  */}
      {/* ===================================================================== */}
      {activeTab === 'wifi' && (
        <View style={[styles.heroGlassCard, { backgroundColor: isDark ? '#0b0f1a' : '#ffffff', borderColor: colors.accent }]}>
          <View style={[styles.heroBadge, { backgroundColor: 'rgba(6, 182, 212, 0.15)', borderColor: colors.accent }]}>
            <Wifi size={11} color={colors.accent} />
            <Text style={[styles.heroBadgeText, { color: colors.accent }]}>LOCAL WI-FI NETWORK</Text>
          </View>

          <Text style={[styles.heroCardTitle, { color: colors.textPrimary }]}>Local Wi-Fi Network</Text>
          <Text style={[styles.heroCardSubtitle, { color: colors.textSecondary }]}>
            Connect both Phone & Laptop to the same Wi-Fi router
          </Text>

          <TouchableOpacity
            style={[styles.primaryActionPill, { backgroundColor: colors.accent, marginBottom: 14 }]}
            onPress={handleScanWifi}
            disabled={isScanning}
          >
            {isScanning ? (
              <ActivityIndicator color={isDark ? '#000000' : '#ffffff'} size="small" />
            ) : (
              <Text style={[styles.primaryActionPillText, { color: isDark ? '#000000' : '#ffffff' }]}>
                ⚡ Quick Share / Scan Wi-Fi
              </Text>
            )}
          </TouchableOpacity>

          {scanStatus ? (
            <Text style={[styles.scanStatusLabel, { color: colors.textSecondary }]}>{scanStatus}</Text>
          ) : null}

          {/* Manual IP / Port Input */}
          <View style={styles.manualForm}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Laptop IP Address</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: isDark ? '#141c2c' : '#f1f5f9', color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="e.g. 192.168.1.180"
              placeholderTextColor={colors.textSecondary}
              value={host}
              onChangeText={setHost}
              autoCapitalize="none"
              keyboardType="numeric"
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Port</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: isDark ? '#141c2c' : '#f1f5f9', color: colors.textPrimary, borderColor: colors.border }]}
                  placeholder="4242"
                  placeholderTextColor={colors.textSecondary}
                  value={port}
                  onChangeText={setPort}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>PIN (Optional)</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: isDark ? '#141c2c' : '#f1f5f9', color: colors.textPrimary, borderColor: colors.border }]}
                  placeholder="e.g. 186034"
                  placeholderTextColor={colors.textSecondary}
                  value={pin}
                  onChangeText={setPin}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.connectManualBtn, { backgroundColor: colors.accent }]}
              onPress={() => handleConnect()}
              disabled={connState === 'connecting'}
            >
              {connState === 'connecting' ? (
                <ActivityIndicator color={isDark ? '#000000' : '#ffffff'} size="small" />
              ) : (
                <Text style={[styles.connectManualBtnText, { color: isDark ? '#000000' : '#ffffff' }]}>
                  Connect via Wi-Fi IP
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: BLUETOOTH (DIRECT HID FALLBACK)                                */}
      {/* ===================================================================== */}
      {activeTab === 'bluetooth' && (
        <View style={[styles.heroGlassCard, { backgroundColor: isDark ? '#0b0f1a' : '#ffffff', borderColor: '#3b82f6' }]}>
          <View style={[styles.heroBadge, { backgroundColor: 'rgba(59, 130, 246, 0.15)', borderColor: '#3b82f6' }]}>
            <Bluetooth size={11} color="#3b82f6" />
            <Text style={[styles.heroBadgeText, { color: "#3b82f6" }]}>DIRECT BLUETOOTH HID PROFILE</Text>
          </View>

          <Text style={[styles.heroCardTitle, { color: colors.textPrimary }]}>Bluetooth Mouse & Keyboard</Text>
          <Text style={[styles.heroCardSubtitle, { color: colors.textSecondary }]}>
            Emulates a native physical Bluetooth mouse & keyboard directly to the OS
          </Text>

          {/* Central Circular Button for BT */}
          <TouchableOpacity
            style={[
              styles.heroCircleGlowOuter,
              btConnected && { borderColor: '#10b981', shadowColor: '#10b981' }
            ]}
            activeOpacity={0.8}
            onPress={btConnected ? onConnected : !btRegistered ? handleStartBtService : onConnected}
            disabled={btLoading}
          >
            <View style={[styles.heroCircleGlowInner, btConnected && { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              {btLoading ? (
                <ActivityIndicator color="#3b82f6" size="large" />
              ) : (
                <>
                  <Bluetooth size={32} color={btConnected ? '#10b981' : '#3b82f6'} />
                  <Text style={[styles.heroCircleTitle, { color: btConnected ? '#10b981' : '#3b82f6' }]}>
                    {btConnected ? 'OPEN MOUSE' : btRegistered ? 'BT READY' : 'ACTIVATE BT'}
                  </Text>
                  <Text style={styles.heroCircleSub}>
                    {btConnected ? btConnectedDevice || 'Connected' : btRegistered ? 'Pairing mode' : 'Tap to start'}
                  </Text>
                </>
              )}
            </View>
          </TouchableOpacity>

          {btConnected && (
            <TouchableOpacity
              style={[styles.disconnectPillBtn, { borderColor: '#ef4444', marginBottom: 12 }]}
              onPress={handleDisconnectBt}
            >
              <Text style={[styles.disconnectPillBtnText, { color: '#ef4444' }]}>Disconnect Bluetooth</Text>
            </TouchableOpacity>
          )}

          {btStatusMsg ? (
            <Text style={[styles.scanStatusLabel, { color: colors.accent, marginBottom: 10 }]}>{btStatusMsg}</Text>
          ) : null}

          {/* Action Row: Make Discoverable */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: 8 }}>
            <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>PAIRED COMPUTERS</Text>
            <TouchableOpacity
              style={[styles.smallPillBtn, { borderColor: '#3b82f6' }]}
              onPress={handleMakeDiscoverable}
            >
              <Radio size={12} color="#3b82f6" />
              <Text style={[styles.smallPillBtnText, { color: '#3b82f6' }]}>Make Discoverable</Text>
            </TouchableOpacity>
          </View>

          {btBondedDevices.length > 0 ? (
            btBondedDevices.map((dev, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.deviceRowItem, { borderBottomColor: colors.border }]}
                onPress={() => handleConnectBtDevice(dev.address)}
                disabled={btLoading}
              >
                <Laptop size={20} color="#3b82f6" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.deviceRowName, { color: colors.textPrimary }]}>{dev.name}</Text>
                  <Text style={[styles.deviceRowStatus, { color: colors.accent }]}>
                    {btConnected && btConnectedDevice === dev.name ? 'Connected' : 'Paired • Tap to connect'}
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.noDeviceBox}>
              <Text style={[styles.deviceRowStatus, { color: colors.textSecondary }]}>
                No paired PCs found. Tap "Make Discoverable" above, then select your phone in PC Bluetooth settings.
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ===================================================================== */}
      {/* SAVED COMPUTERS SECTION (ALWAYS AVAILABLE AT BOTTOM)                  */}
      {/* ===================================================================== */}
      <View style={{ width: '100%', marginTop: 22 }}>
        <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>SAVED COMPUTERS</Text>

        {savedPCs.length === 0 ? (
          <View style={[styles.emptySavedBox, { borderColor: colors.border }]}>
            <Laptop size={20} color={colors.textSecondary} />
            <Text style={[styles.emptySavedText, { color: colors.textSecondary }]}>
              Connected computers will be saved here for 1-tap reconnect.
            </Text>
          </View>
        ) : (
          savedPCs.map((pc) => (
            <TouchableOpacity
              key={pc.id}
              style={[
                styles.savedDeviceCard,
                { backgroundColor: isDark ? '#111827' : '#ffffff', borderColor: colors.border }
              ]}
              onPress={() => connectToSaved(pc)}
            >
              <Laptop size={20} color={colors.accent} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.deviceRowName, { color: colors.textPrimary }]}>{pc.name}</Text>
                <Text style={[styles.deviceRowSub, { color: colors.textSecondary }]}>
                  {pc.host}:{pc.port}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => removeSaved(pc.id)}
                style={{ padding: 6, marginRight: 6 }}
              >
                <X size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              <Text style={[styles.deviceRowBadge, { color: colors.accent }]}>Connect ›</Text>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  content: {
    padding: 16,
    paddingBottom: 48
  },
  hubHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 12
  },
  hubBrandTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3
  },
  hubBrandSub: {
    fontSize: 11,
    marginTop: 1,
    fontWeight: '500'
  },
  hubStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 6
  },
  hubStatusPillConnected: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10b981'
  },
  hubStatusPillDisconnected: {
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderColor: '#06b6d4'
  },
  hubStatusPillText: {
    fontSize: 12,
    fontWeight: '700'
  },
  tabSelectorBar: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16
  },
  tabSelectorItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    gap: 5
  },
  tabSelectorItemActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  tabSelectorText: {
    fontSize: 11,
    fontWeight: '600'
  },
  tabSelectorTextActive: {
    fontWeight: '800'
  },
  setupLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 12
  },
  setupLinkText: { flex: 1, fontSize: 12, fontWeight: '600' },
  heroGlassCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 18,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
    marginBottom: 10
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
    marginBottom: 8
  },
  heroBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  heroCardTitle: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 0.2
  },
  heroCardSubtitle: {
    fontSize: 12,
    marginTop: 3,
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 16
  },
  heroCircleGlowOuter: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: '#06b6d4',
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 16,
    elevation: 8,
    marginBottom: 16,
    backgroundColor: 'rgba(6, 182, 212, 0.05)'
  },
  heroCircleGlowInner: {
    width: 124,
    height: 124,
    borderRadius: 62,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.12)'
  },
  heroCircleTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#06b6d4',
    letterSpacing: 0.8,
    marginTop: 6
  },
  heroCircleSub: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2
  },
  activeActionsRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginTop: 6
  },
  primaryActionPill: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  primaryActionPillText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff'
  },
  disconnectPillBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  disconnectPillBtnText: {
    fontSize: 11,
    fontWeight: '700'
  },
  instructionsBox: {
    width: '100%',
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    gap: 8,
    marginTop: 4
  },
  errorBanner: {
    width: '100%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12
  },
  errorBannerTitle: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4
  },
  errorBannerHint: {
    fontSize: 12,
    lineHeight: 17
  },
  instRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  instNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center'
  },
  instNumText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#000000'
  },
  instText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 16
  },
  scanStatusLabel: {
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '600'
  },
  discoveredCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginTop: 8
  },
  discoveredName: {
    fontSize: 13,
    fontWeight: '700'
  },
  discoveredHost: {
    fontSize: 11,
    marginTop: 1
  },
  connectTag: {
    fontSize: 12,
    fontWeight: '700'
  },
  manualForm: {
    width: '100%',
    marginTop: 6
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4
  },
  textInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13
  },
  connectManualBtn: {
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 14
  },
  connectManualBtnText: {
    fontSize: 13,
    fontWeight: '700'
  },
  smallPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1
  },
  smallPillBtnText: {
    fontSize: 10,
    fontWeight: '700'
  },
  deviceRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 12,
    borderBottomWidth: 1
  },
  deviceRowName: {
    fontSize: 13,
    fontWeight: '700'
  },
  deviceRowStatus: {
    fontSize: 11,
    marginTop: 2
  },
  noDeviceBox: {
    width: '100%',
    paddingVertical: 10
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 8
  },
  emptySavedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 14,
    gap: 10
  },
  emptySavedText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 16
  },
  savedDeviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8
  },
  deviceRowSub: {
    fontSize: 11,
    marginTop: 2
  },
  deviceRowBadge: {
    fontSize: 12,
    fontWeight: '700'
  }
});
