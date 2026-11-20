import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Keyboard,
  KeyboardEvent,
  ScrollView
} from 'react-native';
import { socketService, ConnectionState } from '../services/PocketSocket';
import { inputDispatcher } from '../services/InputDispatcher';
import { triggerHaptic } from '../utils/haptics';
import { KeyModifier } from '../../../shared/src/protocol';
import { LINUX_EVDEV_KEYS } from '../../../shared/src/keys';
import { useTheme } from '../theme/ThemeContext';
import { ClipboardCopy, Keyboard as KeyboardIcon, ChevronDown, X, ArrowLeft, ArrowRight, ArrowUp, ArrowDown } from 'lucide-react-native';

interface SystemKeyboardProps {
  hapticEnabled: boolean;
  onSwitchToMouse?: () => void;
  onSwitchToClassic?: () => void;
}

const MOD_STICKY_KEYS: Record<string, KeyModifier> = {
  Ctrl: 'Ctrl',
  Alt: 'Alt',
  Win: 'Meta'
};

function mapSingleCharToKey(ch: string): { key: string; addShift: boolean } | null {
  if (ch >= 'a' && ch <= 'z') return { key: ch, addShift: false };
  if (ch >= 'A' && ch <= 'Z') return { key: ch.toLowerCase(), addShift: true };
  if (LINUX_EVDEV_KEYS[ch] !== undefined) return { key: ch, addShift: false };
  return null;
}

export const SystemKeyboard: React.FC<SystemKeyboardProps> = ({
  hapticEnabled,
  onSwitchToMouse,
  onSwitchToClassic
}) => {
  const { colors, isDark } = useTheme();
  const [mirror, setMirror] = useState('');
  const [connState, setConnState] = useState<ConnectionState>(socketService.getState());
  const [activeModifiers, setActiveModifiers] = useState<Set<KeyModifier>>(new Set());
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const mirrorRef = useRef('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const unsub = socketService.onStatusChange((state) => setConnState(state));
    const showSub = Keyboard.addListener('keyboardDidShow', (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates?.height || 0);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      unsub();
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const isBluetooth = inputDispatcher.isBluetoothMode();
  const isSocketReady = connState === 'connected' && !isBluetooth;

  const sendSpecialKey = (key: string) => {
    const mods = Array.from(activeModifiers);
    socketService.send({
      type: 'key_press',
      payload: {
        key,
        modifiers: mods.length > 0 ? mods : undefined
      }
    });
    if (mods.length > 0) setActiveModifiers(new Set());
  };

  const sendTextChunk = (text: string) => {
    const mods = Array.from(activeModifiers);
    if (mods.length === 0) {
      socketService.send({ type: 'type_text', payload: { text } });
      return;
    }
    // A sticky modifier can only ride on a real keycode, not on arbitrary text
    if (text.length === 1) {
      const mapped = mapSingleCharToKey(text);
      if (mapped) {
        const allMods: KeyModifier[] = mapped.addShift && !mods.includes('Shift') ? [...mods, 'Shift'] : mods;
        socketService.send({
          type: 'key_press',
          payload: { key: mapped.key, modifiers: allMods }
        });
        setActiveModifiers(new Set());
        return;
      }
    }
    // Multi-char or unmapped char: modifiers cannot apply — send text plainly
    socketService.send({ type: 'type_text', payload: { text } });
    setActiveModifiers(new Set());
  };

  // Live diff: convert mirror-field changes into Backspace presses + text for
  // the PC. Handles normal typing, held backspace, swipe, and autocorrect
  // rewrites (which replace earlier words).
  const applyDiff = (next: string) => {
    const prev = mirrorRef.current;
    mirrorRef.current = next;
    setMirror(next);
    if (!isSocketReady || next === prev) return;

    let prefix = 0;
    const minLen = Math.min(prev.length, next.length);
    while (prefix < minLen && prev[prefix] === next[prefix]) prefix++;
    let suffix = 0;
    while (
      suffix < minLen - prefix &&
      prev[prev.length - 1 - suffix] === next[next.length - 1 - suffix]
    ) suffix++;

    const deletions = prev.length - prefix - suffix;
    const inserted = next.slice(prefix, next.length - suffix);

    if (deletions > 0) {
      for (let i = 0; i < deletions; i++) sendSpecialKey('Backspace');
    }
    if (inserted) sendTextChunk(inserted);
  };

  const handleSubmit = () => {
    triggerHaptic(hapticEnabled, 'light');
    if (isSocketReady) sendSpecialKey('Enter');
  };

  const toggleSticky = (label: string) => {
    triggerHaptic(hapticEnabled, 'medium');
    const mod = MOD_STICKY_KEYS[label];
    const next = new Set(activeModifiers);
    if (next.has(mod)) next.delete(mod);
    else next.add(mod);
    setActiveModifiers(next);
    inputRef.current?.focus();
  };

  const toolbarKey = (label: string, key?: string) => (
    <TouchableOpacity
      key={label}
      style={[styles.toolKey, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => {
        triggerHaptic(hapticEnabled, 'light');
        if (isSocketReady) sendSpecialKey(key || label);
        inputRef.current?.focus();
      }}
      activeOpacity={0.7}
    >
      <Text style={[styles.toolKeyText, { color: colors.textPrimary }]}>{label}</Text>
    </TouchableOpacity>
  );

  const arrowKey = (label: string, ArrowIcon: React.ComponentType<any>) => (
    <TouchableOpacity
      key={label}
      style={[styles.toolKey, styles.arrowKey, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => {
        triggerHaptic(hapticEnabled, 'light');
        if (isSocketReady) sendSpecialKey(label);
        inputRef.current?.focus();
      }}
      activeOpacity={0.7}
    >
      <ArrowIcon size={15} color={colors.textPrimary} />
    </TouchableOpacity>
  );

  const clearMirror = () => {
    triggerHaptic(hapticEnabled, 'medium');
    mirrorRef.current = '';
    setMirror('');
    inputRef.current?.focus();
  };

  const hideKeyboard = () => {
    triggerHaptic(hapticEnabled, 'medium');
    inputRef.current?.blur();
    Keyboard.dismiss();
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header card */}
      <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.headerTitleRow}>
          <KeyboardIcon size={16} color={colors.accent} />
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Samsung Keyboard — Live</Text>
          {mirror.length > 0 && (
            <TouchableOpacity onPress={clearMirror} style={styles.clearBtn} activeOpacity={0.7}>
              <X size={12} color={colors.textSecondary} />
              <Text style={[styles.clearBtnText, { color: colors.textSecondary }]}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={[styles.headerHint, { color: colors.textSecondary }]}>
          Type below — text appears instantly in the focused window on your PC. Predictions, autocorrect & swipe work.
        </Text>
      </View>

      {!isSocketReady && (
        <View style={[styles.warnBanner, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : 'rgba(245, 158, 11, 0.08)', borderColor: '#f59e0b' }]}>
          <Text style={styles.warnText}>
            {isBluetooth
              ? 'Bluetooth HID mode: live typing needs USB/Wi-Fi. Tap ⌨ Classic for the built-in keys, or connect via USB.'
              : 'Not connected to PC — open the Connect tab first.'}
          </Text>
        </View>
      )}

      {/* Live mirror field (summons the system Samsung keyboard) */}
      <View style={[styles.fieldCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TextInput
          ref={inputRef}
          style={[styles.field, { color: colors.textPrimary }]}
          value={mirror}
          onChangeText={applyDiff}
          onSubmitEditing={handleSubmit}
          autoFocus
          autoCorrect
          autoCapitalize="sentences"
          spellCheck
          multiline={false}
          blurOnSubmit={false}
          returnKeyType="go"
          placeholder="Start typing on your Samsung keyboard…"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      <View style={{ flex: 1 }} />

      {/* Floating toolbar strip — sits just above the system keyboard */}
      <View style={[styles.toolbarWrap, { bottom: keyboardHeight }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.toolbarContent}
          keyboardShouldPersistTaps="handled"
        >
          {toolbarKey('Esc', 'Escape')}
          {toolbarKey('Tab')}
          {arrowKey('ArrowLeft', ArrowLeft)}
          {arrowKey('ArrowUp', ArrowUp)}
          {arrowKey('ArrowDown', ArrowDown)}
          {arrowKey('ArrowRight', ArrowRight)}
          {['Ctrl', 'Alt', 'Win'].map((label) => {
            const mod = MOD_STICKY_KEYS[label];
            const active = activeModifiers.has(mod);
            return (
              <TouchableOpacity
                key={label}
                style={[
                  styles.toolKey,
                  active && { backgroundColor: colors.accent, borderColor: colors.accent }
                ]}
                onPress={() => toggleSticky(label)}
                activeOpacity={0.7}
              >
                <Text style={[styles.toolKeyText, { color: active ? (isDark ? '#000000' : '#ffffff') : colors.textPrimary }]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={[styles.toolKey, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {
              triggerHaptic(hapticEnabled, 'light');
              if (isSocketReady) inputDispatcher.sendShortcut(['Control', 'v'], 'paste');
              inputRef.current?.focus();
            }}
            activeOpacity={0.7}
          >
            <ClipboardCopy size={12} color={colors.textPrimary} />
            <Text style={[styles.toolKeyText, { color: colors.textPrimary, marginLeft: 3 }]}>Paste</Text>
          </TouchableOpacity>
          {onSwitchToMouse && (
            <TouchableOpacity
              style={[styles.toolKey, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => {
                triggerHaptic(hapticEnabled, 'light');
                onSwitchToMouse();
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.toolKeyText, { color: colors.textPrimary }]}>Mouse</Text>
            </TouchableOpacity>
          )}
          {onSwitchToClassic && (
            <TouchableOpacity
              style={[styles.toolKey, styles.toolKeyWide, { backgroundColor: colors.accent }]}
              onPress={() => {
                triggerHaptic(hapticEnabled, 'light');
                onSwitchToClassic();
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.toolKeyText, { color: isDark ? '#000000' : '#ffffff' }]}>⌨ Classic</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.toolKey, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={hideKeyboard}
            activeOpacity={0.7}
          >
            <ChevronDown size={14} color={colors.textPrimary} />
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: 12,
    paddingHorizontal: 12
  },
  headerCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 6,
    flex: 1
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8
  },
  clearBtnText: {
    fontSize: 11,
    marginLeft: 2
  },
  headerHint: {
    fontSize: 11,
    lineHeight: 15
  },
  warnBanner: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10
  },
  warnText: {
    color: '#f59e0b',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600'
  },
  fieldCard: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4
  },
  field: {
    fontSize: 16,
    paddingVertical: 12,
    minHeight: 48
  },
  toolbarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.25)',
    paddingVertical: 6
  },
  toolbarContent: {
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 6
  },
  toolKey: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 9,
    borderWidth: 1
  },
  toolKeyWide: {
    paddingHorizontal: 12
  },
  arrowKey: {
    width: 36,
    paddingHorizontal: 0
  },
  toolKeyText: {
    fontSize: 12,
    fontWeight: '700'
  }
});

export default SystemKeyboard;
