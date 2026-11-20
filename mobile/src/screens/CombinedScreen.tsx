import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { Touchpad } from '../components/Touchpad';
import { inputDispatcher } from '../services/InputDispatcher';
import { triggerHaptic } from '../utils/haptics';
import { UserPreferences } from '../services/StorageService';
import { useTheme } from '../theme/ThemeContext';

interface CombinedScreenProps {
  preferences: UserPreferences;
  onExpandKeyboard: () => void;
}

export const CombinedScreen: React.FC<CombinedScreenProps> = ({
  preferences,
  onExpandKeyboard
}) => {
  const { colors, isDark } = useTheme();

  const sendKey = (key: string) => {
    triggerHaptic(preferences.hapticEnabled, 'light');
    inputDispatcher.sendKeyPress(key);
  };

  const sendShortcut = (shortcut: 'copy' | 'paste' | 'undo' | 'select_all' | 'alt_tab') => {
    triggerHaptic(preferences.hapticEnabled, 'medium');
    if (shortcut === 'copy') inputDispatcher.sendShortcut(['Control', 'c']);
    else if (shortcut === 'paste') inputDispatcher.sendShortcut(['Control', 'v']);
    else if (shortcut === 'undo') inputDispatcher.sendShortcut(['Control', 'z']);
    else if (shortcut === 'alt_tab') inputDispatcher.sendShortcut(['Alt', 'Tab']);
    else inputDispatcher.sendShortcut(['Control', 'a']);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Upper Touchpad Area */}
      <View style={styles.touchpadWrapper}>
        <Touchpad
          sensitivity={preferences.sensitivity}
          scrollSpeed={preferences.scrollSpeed}
          hapticEnabled={preferences.hapticEnabled}
          tapToClick={preferences.tapToClick}
          acceleration={preferences.acceleration ?? true}
        />
      </View>

      {/* Lower Compact Keyboard Section */}
      <View
        style={[
          styles.keyboardSection,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border
          }
        ]}
      >
        <View style={styles.sectionHeader}>
          <Text style={[styles.headerTitle, { color: colors.textSecondary }]}>Quick Actions & Keys</Text>
          <TouchableOpacity
            style={[styles.expandBtn, { backgroundColor: colors.accent }]}
            onPress={onExpandKeyboard}
          >
            <Text style={[styles.expandBtnText, { color: isDark ? '#000000' : '#ffffff' }]}>
              ⛶ Full Landscape
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.keyRow}>
          <QuickBtn label="Esc" special onPress={() => sendKey('Escape')} />
          <QuickBtn label="Ctrl+C" special onPress={() => sendShortcut('copy')} />
          <QuickBtn label="Ctrl+V" special onPress={() => sendShortcut('paste')} />
          <QuickBtn label="Ctrl+Z" special onPress={() => sendShortcut('undo')} />
          <QuickBtn label="Alt+Tab" special onPress={() => sendShortcut('alt_tab')} />
          <QuickBtn label="⌫" special onPress={() => sendKey('Backspace')} />
        </View>

        <View style={styles.keyRow}>
          <QuickBtn label="Tab" special onPress={() => sendKey('Tab')} />
          <QuickBtn label="Space" flex={3} onPress={() => sendKey('Space')} />
          <QuickBtn label="Enter ↵" special flex={1.5} onPress={() => sendKey('Enter')} />
          <QuickBtn label="▲" special onPress={() => sendKey('ArrowUp')} />
        </View>

        <View style={styles.keyRow}>
          <QuickBtn label="Win" special onPress={() => sendKey('Meta')} />
          <QuickBtn label="Ctrl" special onPress={() => sendKey('Control')} />
          <QuickBtn label="Alt" special onPress={() => sendKey('Alt')} />
          <QuickBtn label="◀" special onPress={() => sendKey('ArrowLeft')} />
          <QuickBtn label="▼" special onPress={() => sendKey('ArrowDown')} />
          <QuickBtn label="▶" special onPress={() => sendKey('ArrowRight')} />
        </View>
      </View>
    </View>
  );
};

const QuickBtn: React.FC<{
  label: string;
  special?: boolean;
  flex?: number;
  onPress: () => void;
}> = ({ label, special, flex = 1, onPress }) => {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.btn,
        {
          flex,
          backgroundColor: special ? colors.keySpecial : colors.keyBackground,
          borderColor: colors.keyBorder
        }
      ]}
      activeOpacity={0.6}
      onPress={onPress}
    >
      <Text
        style={[
          styles.btnText,
          {
            color: special
              ? colors.keyTextSpecial
              : colors.keyText,
            fontWeight: special ? '700' : '600'
          }
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  touchpadWrapper: {
    flex: 1.2
  },
  keyboardSection: {
    flex: 1,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 12,
    gap: 8,
    borderTopWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '700'
  },
  expandBtn: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8
  },
  expandBtnText: {
    fontSize: 11,
    fontWeight: '700'
  },
  keyRow: {
    flexDirection: 'row',
    gap: 6,
    height: 44
  },
  btn: {
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1
  },
  btnText: {
    fontSize: 12
  }
});
