import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  TouchableOpacity
} from 'react-native';
import { UserPreferences, AppThemeMode } from '../services/StorageService';
import { triggerHaptic } from '../utils/haptics';
import { useTheme } from '../theme/ThemeContext';
import { Palette, Mouse, Vibrate, Info, Sun, Moon, Sparkles } from 'lucide-react-native';

interface SettingsScreenProps {
  preferences: UserPreferences;
  onUpdatePreferences: (updated: Partial<UserPreferences>) => void;
  onOpenSetup?: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  preferences,
  onUpdatePreferences,
  onOpenSetup
}) => {
  const { mode, setMode, colors } = useTheme();

  const handleSelectTheme = (newMode: AppThemeMode) => {
    triggerHaptic(preferences.hapticEnabled, 'medium');
    setMode(newMode);
    onUpdatePreferences({ themeMode: newMode });
  };

  const adjustSensitivity = (delta: number) => {
    triggerHaptic(preferences.hapticEnabled, 'light');
    const next = Math.max(0.5, Math.min(5.0, Math.round((preferences.sensitivity + delta) * 10) / 10));
    onUpdatePreferences({ sensitivity: next });
  };

  const adjustScrollSpeed = (delta: number) => {
    triggerHaptic(preferences.hapticEnabled, 'light');
    const next = Math.max(0.5, Math.min(4.0, Math.round((preferences.scrollSpeed + delta) * 10) / 10));
    onUpdatePreferences({ scrollSpeed: next });
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: colors.textPrimary }]}>Preferences & System</Text>

      {/* Theme Selection Card */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <Palette size={18} color={colors.accent} />
          <Text style={[styles.cardTitle, { color: colors.accent, marginLeft: 8, marginBottom: 0 }]}>
            Appearance & Theme
          </Text>
        </View>
        <Text style={[styles.cardSubText, { color: colors.textSecondary }]}>
          Choose your interface theme. OLED Black maximizes battery life on Samsung AMOLED displays.
        </Text>

        <View style={styles.themeRow}>
          <TouchableOpacity
            style={[
              styles.themeOption,
              { backgroundColor: '#000000', borderColor: mode === 'oled' ? colors.accent : '#222222' },
              mode === 'oled' && styles.themeOptionActive
            ]}
            onPress={() => handleSelectTheme('oled')}
          >
            <View style={styles.themeCircle}>
              <Moon size={16} color={mode === 'oled' ? colors.accent : '#94a3b8'} />
            </View>
            <Text style={[styles.themeLabel, { color: mode === 'oled' ? colors.accent : '#ffffff' }]}>
              OLED Black
            </Text>
            <Text style={styles.themeSubLabel}>Pure AMOLED</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.themeOption,
              { backgroundColor: '#0b0f19', borderColor: mode === 'dark' ? colors.accent : '#1f2937' },
              mode === 'dark' && styles.themeOptionActive
            ]}
            onPress={() => handleSelectTheme('dark')}
          >
            <View style={styles.themeCircle}>
              <Moon size={16} color={mode === 'dark' ? colors.accent : '#94a3b8'} />
            </View>
            <Text style={[styles.themeLabel, { color: mode === 'dark' ? colors.accent : '#f8fafc' }]}>
              Midnight
            </Text>
            <Text style={styles.themeSubLabel}>Slate Dark</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.themeOption,
              { backgroundColor: '#f8fafc', borderColor: mode === 'light' ? colors.accent : '#cbd5e1' },
              mode === 'light' && styles.themeOptionActive
            ]}
            onPress={() => handleSelectTheme('light')}
          >
            <View style={styles.themeCircle}>
              <Sun size={16} color={mode === 'light' ? colors.accent : '#64748b'} />
            </View>
            <Text style={[styles.themeLabel, { color: mode === 'light' ? colors.accent : '#0f172a' }]}>
              Light
            </Text>
            <Text style={[styles.themeSubLabel, { color: '#64748b' }]}>Clean Crisp</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Mouse Physics & Touchpad Settings */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Mouse size={18} color={colors.accent} />
          <Text style={[styles.cardTitle, { color: colors.accent, marginLeft: 8, marginBottom: 0 }]}>
            Mouse Physics Engine
          </Text>
        </View>

        {/* Dynamic Acceleration Switch */}
        <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>Dynamic Acceleration Curve</Text>
            <Text style={[styles.settingSub, { color: colors.textSecondary }]}>
              Provides pinpoint precision when moving slowly and accelerates across wide displays when flicking fast.
            </Text>
          </View>
          <Switch
            value={preferences.acceleration ?? true}
            onValueChange={(val) => {
              triggerHaptic(preferences.hapticEnabled, 'light');
              onUpdatePreferences({ acceleration: val });
            }}
            thumbColor={colors.accent}
            trackColor={{ false: colors.border, true: colors.accentGlow }}
          />
        </View>

        {/* Sensitivity Stepper */}
        <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>Base Sensitivity</Text>
            <Text style={[styles.settingSub, { color: colors.textSecondary }]}>Overall cursor speed multiplier</Text>
          </View>
          <View style={[styles.stepper, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.stepBtn, { backgroundColor: colors.surface }]}
              onPress={() => adjustSensitivity(-0.2)}
            >
              <Text style={[styles.stepBtnText, { color: colors.textPrimary }]}>-</Text>
            </TouchableOpacity>
            <Text style={[styles.stepValue, { color: colors.accent }]}>{preferences.sensitivity.toFixed(1)}x</Text>
            <TouchableOpacity
              style={[styles.stepBtn, { backgroundColor: colors.surface }]}
              onPress={() => adjustSensitivity(0.2)}
            >
              <Text style={[styles.stepBtnText, { color: colors.textPrimary }]}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Scroll Speed Stepper */}
        <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>Scroll Speed</Text>
            <Text style={[styles.settingSub, { color: colors.textSecondary }]}>Two-finger scroll momentum</Text>
          </View>
          <View style={[styles.stepper, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.stepBtn, { backgroundColor: colors.surface }]}
              onPress={() => adjustScrollSpeed(-0.2)}
            >
              <Text style={[styles.stepBtnText, { color: colors.textPrimary }]}>-</Text>
            </TouchableOpacity>
            <Text style={[styles.stepValue, { color: colors.accent }]}>{preferences.scrollSpeed.toFixed(1)}x</Text>
            <TouchableOpacity
              style={[styles.stepBtn, { backgroundColor: colors.surface }]}
              onPress={() => adjustScrollSpeed(0.2)}
            >
              <Text style={[styles.stepBtnText, { color: colors.textPrimary }]}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tap to Click Toggle */}
        <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>Tap to Click</Text>
            <Text style={[styles.settingSub, { color: colors.textSecondary }]}>
              Single finger tap = Left Click &bull; 2-finger = Right Click
            </Text>
          </View>
          <Switch
            value={preferences.tapToClick}
            onValueChange={(val) => {
              triggerHaptic(preferences.hapticEnabled, 'light');
              onUpdatePreferences({ tapToClick: val });
            }}
            thumbColor={colors.accent}
            trackColor={{ false: colors.border, true: colors.accentGlow }}
          />
        </View>
      </View>

      {/* Device Feedback */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Vibrate size={18} color={colors.accent} />
          <Text style={[styles.cardTitle, { color: colors.accent, marginLeft: 8, marginBottom: 0 }]}>
            Haptics & Feedback
          </Text>
        </View>

        <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>Tactile Haptic Feedback</Text>
            <Text style={[styles.settingSub, { color: colors.textSecondary }]}>
              Gentle vibration pulses on key taps and button clicks
            </Text>
          </View>
          <Switch
            value={preferences.hapticEnabled}
            onValueChange={(val) => {
              triggerHaptic(val, 'medium');
              onUpdatePreferences({ hapticEnabled: val });
            }}
            thumbColor={colors.accent}
            trackColor={{ false: colors.border, true: colors.accentGlow }}
          />
        </View>

        <View style={styles.settingRowLast}>
          <View>
            <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>Auto-Reconnect</Text>
            <Text style={[styles.settingSub, { color: colors.textSecondary }]}>
              Automatically reconnect to bonded PC when available
            </Text>
          </View>
          <Switch
            value={preferences.autoReconnect}
            onValueChange={(val) => onUpdatePreferences({ autoReconnect: val })}
            thumbColor={colors.accent}
            trackColor={{ false: colors.border, true: colors.accentGlow }}
          />
        </View>
      </View>

      {/* Help & User Guide */}
      {onOpenSetup && (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Sparkles size={18} color={colors.accent} />
            <Text style={[styles.cardTitle, { color: colors.accent, marginLeft: 8, marginBottom: 0 }]}>
              User Guide &amp; Walkthrough
            </Text>
          </View>
          <Text style={[styles.cardSubText, { color: colors.textSecondary, marginBottom: 12 }]}>
            Review the 5 interactive cards anytime to learn gestures, connection methods, and tips.
          </Text>
          <TouchableOpacity
            style={[styles.guideBtn, { backgroundColor: colors.accentSubtle, borderColor: colors.accent }]}
            activeOpacity={0.8}
            onPress={() => {
              triggerHaptic(preferences.hapticEnabled, 'light');
              onOpenSetup();
            }}
          >
            <Text style={[styles.guideBtnText, { color: colors.accent }]}>Open Setup &amp; Gesture Guide</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* System info */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Info size={18} color={colors.accent} />
          <Text style={[styles.cardTitle, { color: colors.accent, marginLeft: 8, marginBottom: 0 }]}>
            Connection &amp; Protocol
          </Text>
        </View>
        <Text style={[styles.aboutText, { color: colors.textSecondary }]}>Mode: Standalone Bluetooth HID Device</Text>
        <Text style={[styles.aboutText, { color: colors.textSecondary }]}>Subsystem: Direct Linux Kernel Input (/dev/input)</Text>
        <Text style={[styles.aboutText, { color: colors.textSecondary }]}>PC Server: Not needed (Zero-Server HID Hardware Mode)</Text>
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
    paddingBottom: 40
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 16
  },
  card: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 6,
    letterSpacing: 0.3
  },
  cardSubText: {
    fontSize: 12,
    marginBottom: 14,
    lineHeight: 18
  },
  themeRow: {
    flexDirection: 'row',
    gap: 10
  },
  themeOption: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2
  },
  themeOptionActive: {
    transform: [{ scale: 1.02 }]
  },
  themeCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6
  },
  themeLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2
  },
  themeSubLabel: {
    fontSize: 10,
    color: '#94a3b8'
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1
  },
  settingRowLast: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600'
  },
  settingSub: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    padding: 4,
    borderWidth: 1
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center'
  },
  stepBtnText: {
    fontSize: 16,
    fontWeight: '800'
  },
  stepValue: {
    fontSize: 13,
    fontWeight: '800',
    minWidth: 40,
    textAlign: 'center'
  },
  aboutText: {
    fontSize: 13,
    marginBottom: 4,
    lineHeight: 20
  },
  guideBtn: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  guideBtnText: {
    fontSize: 14,
    fontWeight: '700'
  }
});
