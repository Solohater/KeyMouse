import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import {
  ArrowLeft,
  Bluetooth,
  CheckCircle2,
  Copy,
  Download,
  Laptop,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Usb,
  Wifi
} from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { triggerHaptic } from '../utils/haptics';
import { InstallerInfo, InstallerService } from '../services/InstallerService';
import { MobileDiscoveryService, DiscoveredServer } from '../services/DiscoveryService';
import { OnboardingState, StorageService } from '../services/StorageService';

interface InstallerScreenProps {
  onBack: () => void;
  onOpenConnection: () => void;
  hapticEnabled: boolean;
}

export const InstallerScreen: React.FC<InstallerScreenProps> = ({
  onBack,
  onOpenConnection,
  hapticEnabled
}) => {
  const { colors } = useTheme();
  const [info, setInfo] = useState<InstallerInfo | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState('');
  const [probeIp, setProbeIp] = useState('');
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<DiscoveredServer | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([InstallerService.getInfo(), StorageService.getOnboarding()]).then(([nextInfo, state]) => {
      if (!active) return;
      setInfo(nextInfo);
      setOnboarding(state);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const markStep = async (step: string, done = true) => {
    const next = await StorageService.setOnboardingStep(step, done);
    setOnboarding(next);
  };

  const handleSave = async () => {
    triggerHaptic(hapticEnabled, 'medium');
    setSaving(true);
    setMessage('');
    try {
      const result = await InstallerService.saveToDownloads();
      if (result.cancelled) {
        setMessage('Save cancelled.');
      } else {
        await markStep('transferred');
        setMessage(`Saved ${result.fileName || 'installer'} to Downloads. Connect USB and choose File Transfer to copy it.`);
      }
    } catch (error: any) {
      Alert.alert('Could not save installer', error?.message || 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    triggerHaptic(hapticEnabled, 'medium');
    setSharing(true);
    setMessage('');
    try {
      await InstallerService.shareInstaller();
      await markStep('transferred');
      setMessage('Choose Bluetooth in the share sheet, then accept the file on Ubuntu.');
    } catch (error: any) {
      Alert.alert('Could not share installer', error?.message || 'Unknown error');
    } finally {
      setSharing(false);
    }
  };

  const handleProbe = async () => {
    triggerHaptic(hapticEnabled, 'light');
    setProbing(true);
    setProbeResult(null);
    try {
      const target = probeIp.trim() || '127.0.0.1';
      const found = await MobileDiscoveryService.probeServer(target, 4242, 1500);
      setProbeResult(found);
      if (found) {
        await markStep('verified');
      }
    } finally {
      setProbing(false);
    }
  };

  const stepDone = (step: string) => Boolean(onboarding?.steps?.[step]);

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Reading the bundled installer...
        </Text>
      </View>
    );
  }

  const fileName = info?.file || 'kimo_amd64.deb';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={onBack}
          style={[styles.backButton, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}
          activeOpacity={0.8}
        >
          <ArrowLeft size={18} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Ubuntu companion</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Move, install, and verify in three steps
          </Text>
        </View>
      </View>

      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.infoTop}>
          <View style={[styles.infoIcon, { backgroundColor: colors.accentSubtle }]}>
            <Laptop size={22} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>
              {info ? `kiMo ${info.version} · ${info.architecture}` : 'Installer unavailable'}
            </Text>
            <Text style={[styles.infoSub, { color: colors.textSecondary }]}>
              {info ? `${InstallerService.formatSize(info.size)} · Ubuntu 22.04+` : 'Rebuild the APK with npm run package:ubuntu'}
            </Text>
          </View>
          {stepDone('transferred') && <CheckCircle2 size={20} color={colors.success} />}
        </View>
        {info?.sha256 ? (
          <>
            <Text style={[styles.shaLabel, { color: colors.textMuted }]}>SHA-256</Text>
            <Text selectable style={[styles.sha, { color: colors.textSecondary }]}>
              {info.sha256}
            </Text>
          </>
        ) : null}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardTitleRow}>
          <Usb size={18} color={colors.accent} />
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>1. Move it to the PC</Text>
        </View>

        <Text style={[styles.body, { color: colors.textSecondary }]}>
          USB file transfer is the most reliable method. The file is saved to your phone's Downloads
          folder, where you can copy it over MTP.
        </Text>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.accent }]}
          activeOpacity={0.8}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#041014" /> : <Download size={17} color="#041014" />}
          <Text style={styles.primaryButtonText}>Save installer to Downloads</Text>
        </TouchableOpacity>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <View style={styles.cardTitleRow}>
          <Bluetooth size={18} color={colors.accent} />
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Or send over Bluetooth</Text>
        </View>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Share the installer to your paired Ubuntu computer. Accept the incoming file on the PC,
          then install it from Downloads.
        </Text>
        <TouchableOpacity
          style={[styles.secondaryButton, { borderColor: colors.border, backgroundColor: colors.surfaceSubtle }]}
          activeOpacity={0.8}
          onPress={handleShare}
          disabled={sharing}
        >
          {sharing ? <ActivityIndicator color={colors.accent} /> : <Bluetooth size={17} color={colors.accent} />}
          <Text style={[styles.secondaryButtonText, { color: colors.textPrimary }]}>Share installer</Text>
        </TouchableOpacity>

        <View style={[styles.noteRow, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
          <Wifi size={15} color={colors.textMuted} />
          <Text style={[styles.noteText, { color: colors.textMuted }]}>
            Wi-Fi transfer is not included in this build. Use USB file transfer or Bluetooth.
          </Text>
        </View>

        {message ? (
          <Text style={[styles.message, { color: colors.success }]}>{message}</Text>
        ) : null}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardTitleRow}>
          <Terminal size={18} color={colors.accent} />
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>2. Install on Ubuntu</Text>
        </View>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Open the file in Files and choose Install, or run this in a terminal:
        </Text>
        <View style={[styles.codeBlock, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
          <Text selectable style={[styles.code, { color: colors.textPrimary }]}>
            sudo apt install ./{fileName}
          </Text>
        </View>
        <View style={styles.bulletRow}>
          <ShieldCheck size={15} color={colors.success} />
          <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
            Then log out and back in once, so the input permission rule applies.
          </Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardTitleRow}>
          <RefreshCw size={18} color={colors.accent} />
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>3. Start and verify</Text>
        </View>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          On the PC, run <Text style={{ fontWeight: '700' }}>kimo status</Text> to see the pairing PIN.
          The companion also starts automatically at login.
        </Text>
        <Text style={[styles.smallLabel, { color: colors.textMuted }]}>PC IP (optional)</Text>
        <TextInput
          value={probeIp}
          onChangeText={setProbeIp}
          placeholder="192.168.1.20 or 127.0.0.1"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border, color: colors.textPrimary }]}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[styles.secondaryButton, { borderColor: colors.border, backgroundColor: colors.surfaceSubtle }]}
          activeOpacity={0.8}
          onPress={handleProbe}
          disabled={probing}
        >
          {probing ? <ActivityIndicator color={colors.accent} /> : <RefreshCw size={17} color={colors.accent} />}
          <Text style={[styles.secondaryButtonText, { color: colors.textPrimary }]}>Check companion</Text>
        </TouchableOpacity>

        {probeResult ? (
          <View style={[styles.resultRow, { backgroundColor: colors.accentSubtle }]}>
            <CheckCircle2 size={16} color={colors.success} />
            <Text style={[styles.resultText, { color: colors.textPrimary }]}>
              Found {probeResult.serverName} at {probeResult.host}:{probeResult.port}
            </Text>
          </View>
        ) : probeIp || probing ? null : (
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Tip: use 127.0.0.1 for USB, or the PC's Wi-Fi IP for a network connection.
          </Text>
        )}
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, { backgroundColor: colors.accent, marginTop: 4 }]}
        activeOpacity={0.8}
        onPress={() => {
          triggerHaptic(hapticEnabled, 'medium');
          onOpenConnection();
        }}
      >
        <Text style={styles.primaryButtonText}>Open connection options</Text>
      </TouchableOpacity>

      <View style={styles.footerRow}>
        <Copy size={12} color={colors.textMuted} />
        <Text style={[styles.footerText, { color: colors.textMuted }]}>
          The installer stays inside the app and is shared only when you tap a button.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 36 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 13 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { fontSize: 12, marginTop: 2 },
  infoCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 14 },
  infoTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  infoTitle: { fontSize: 15, fontWeight: '700' },
  infoSub: { fontSize: 12, marginTop: 2 },
  shaLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, marginTop: 12, marginBottom: 3 },
  sha: { fontSize: 10, fontFamily: 'monospace', lineHeight: 14 },
  card: { borderWidth: 1, borderRadius: 16, padding: 15, marginBottom: 14 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  body: { fontSize: 13, lineHeight: 19, marginBottom: 10 },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12
  },
  primaryButtonText: { fontSize: 14, fontWeight: '800', color: '#041014' },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    marginTop: 4
  },
  secondaryButtonText: { fontSize: 13, fontWeight: '700' },
  divider: { height: 1, marginVertical: 14 },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 9,
    marginTop: 10
  },
  noteText: { fontSize: 11, flex: 1, lineHeight: 15 },
  message: { fontSize: 12, lineHeight: 17, marginTop: 10 },
  codeBlock: { borderWidth: 1, borderRadius: 10, padding: 11, marginBottom: 10 },
  code: { fontSize: 12, fontFamily: 'monospace' },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bulletText: { fontSize: 12, flex: 1, lineHeight: 17 },
  smallLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 8 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 10, marginTop: 10 },
  resultText: { fontSize: 12, flex: 1, fontWeight: '600' },
  hint: { fontSize: 11, lineHeight: 16, marginTop: 8 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingHorizontal: 4 },
  footerText: { fontSize: 10, flex: 1, lineHeight: 14 }
});
