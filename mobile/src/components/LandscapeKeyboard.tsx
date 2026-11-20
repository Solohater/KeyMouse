import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { socketService } from '../services/PocketSocket';
import { inputDispatcher } from '../services/InputDispatcher';
import { triggerHaptic } from '../utils/haptics';
import { KeyModifier, ShortcutType } from '../../../shared/src/protocol';

interface LandscapeKeyboardProps {
  hapticEnabled: boolean;
  onSwitchToMouse: () => void;
}

type KeyboardPage = 'letters' | 'fn' | 'shortcuts';

export const LandscapeKeyboard: React.FC<LandscapeKeyboardProps> = ({
  hapticEnabled,
  onSwitchToMouse
}) => {
  const [page, setPage] = useState<KeyboardPage>('letters');
  const [shiftActive, setShiftActive] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [activeModifiers, setActiveModifiers] = useState<Set<KeyModifier>>(new Set());

  const handleKeyPress = (key: string) => {
    triggerHaptic(hapticEnabled, 'light');

    const mods: KeyModifier[] = Array.from(activeModifiers);
    if ((shiftActive || capsLock) && !mods.includes('Shift')) {
      mods.push('Shift');
    }

    if (inputDispatcher.isBluetoothMode()) {
      inputDispatcher.sendKeyPress(key);
    } else {
      socketService.send({
        type: 'key_press',
        payload: {
          key,
          modifiers: mods.length > 0 ? mods : undefined
        }
      });
    }

    // Reset non-caps Shift after single use
    if (shiftActive && !capsLock) {
      setShiftActive(false);
    }
    // Clear sticky modifiers once consumed unless held
    if (activeModifiers.size > 0) {
      setActiveModifiers(new Set());
    }
  };

  const toggleModifier = (mod: KeyModifier) => {
    triggerHaptic(hapticEnabled, 'medium');
    const next = new Set(activeModifiers);
    if (next.has(mod)) {
      next.delete(mod);
      inputDispatcher.sendKeyUp(mod);
    } else {
      next.add(mod);
      inputDispatcher.sendKeyDown(mod);
    }
    setActiveModifiers(next);
  };

  const handleShift = () => {
    triggerHaptic(hapticEnabled, 'medium');
    if (!shiftActive && !capsLock) {
      setShiftActive(true);
    } else if (shiftActive && !capsLock) {
      setCapsLock(true);
      setShiftActive(false);
    } else {
      setCapsLock(false);
      setShiftActive(false);
    }
  };

  const handleShortcut = (shortcut: ShortcutType) => {
    triggerHaptic(hapticEnabled, 'medium');
    if (shortcut === 'copy') inputDispatcher.sendShortcut(['Control', 'c'], 'copy');
    else if (shortcut === 'paste') inputDispatcher.sendShortcut(['Control', 'v'], 'paste');
    else if (shortcut === 'undo') inputDispatcher.sendShortcut(['Control', 'z'], 'undo');
    else if (shortcut === 'select_all') inputDispatcher.sendShortcut(['Control', 'a'], 'select_all');
    else if (shortcut === 'alt_tab') inputDispatcher.sendShortcut(['Alt', 'Tab'], 'alt_tab');
    else {
      inputDispatcher.sendShortcut([], shortcut);
    }
  };

  const isShifted = shiftActive || capsLock;

  return (
    <View style={styles.container}>
      {/* Top Header / Mode Bar */}
      <View style={styles.headerBar}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={[styles.modeTab, page === 'letters' && styles.modeTabActive]}
            onPress={() => setPage('letters')}
          >
            <Text style={[styles.modeTabText, page === 'letters' && styles.modeTabTextActive]}>ABC / 123</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeTab, page === 'fn' && styles.modeTabActive]}
            onPress={() => setPage('fn')}
          >
            <Text style={[styles.modeTabText, page === 'fn' && styles.modeTabTextActive]}>F1–F12</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeTab, page === 'shortcuts' && styles.modeTabActive]}
            onPress={() => setPage('shortcuts')}
          >
            <Text style={[styles.modeTabText, page === 'shortcuts' && styles.modeTabTextActive]}>Shortcuts</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.mouseSwitchBtn} onPress={onSwitchToMouse}>
          <Text style={styles.mouseSwitchText}>🖱 Mouse Mode</Text>
        </TouchableOpacity>
      </View>

      {/* Main Keyboard Area */}
      {page === 'letters' && (
        <View style={styles.keysContainer}>
          {/* Numbers Row */}
          <View style={styles.row}>
            <KeyBtn label="Esc" special flex={1.1} onPress={() => handleKeyPress('Escape')} />
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='].map((k) => (
              <KeyBtn key={k} label={k} onPress={() => handleKeyPress(k)} />
            ))}
            <KeyBtn label="⌫" special flex={1.3} onPress={() => handleKeyPress('Backspace')} />
          </View>

          {/* Row 1 (QWERTY) */}
          <View style={styles.row}>
            <KeyBtn label="Tab" special flex={1.3} onPress={() => handleKeyPress('Tab')} />
            {['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']'].map((k) => (
              <KeyBtn
                key={k}
                label={isShifted ? k.toUpperCase() : k}
                onPress={() => handleKeyPress(isShifted ? k.toUpperCase() : k)}
              />
            ))}
            <KeyBtn label="Del" special flex={1.1} onPress={() => handleKeyPress('Delete')} />
          </View>

          {/* Row 2 (ASDF) */}
          <View style={styles.row}>
            <KeyBtn
              label={capsLock ? 'CAPS 🔒' : shiftActive ? 'Shift ⇧' : 'Shift'}
              special
              active={shiftActive || capsLock}
              flex={1.4}
              onPress={handleShift}
            />
            {['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', '\''].map((k) => (
              <KeyBtn
                key={k}
                label={isShifted ? k.toUpperCase() : k}
                onPress={() => handleKeyPress(isShifted ? k.toUpperCase() : k)}
              />
            ))}
            <KeyBtn label="Enter ↵" special flex={1.7} onPress={() => handleKeyPress('Enter')} />
          </View>

          {/* Row 3 (ZXCV + Arrows) */}
          <View style={styles.row}>
            <KeyBtn
              label="Ctrl"
              special
              active={activeModifiers.has('Ctrl')}
              flex={1.1}
              onPress={() => toggleModifier('Ctrl')}
            />
            <KeyBtn
              label="Win"
              special
              active={activeModifiers.has('Meta')}
              flex={1}
              onPress={() => toggleModifier('Meta')}
            />
            <KeyBtn
              label="Alt"
              special
              active={activeModifiers.has('Alt')}
              flex={1}
              onPress={() => toggleModifier('Alt')}
            />
            {['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.'].map((k) => (
              <KeyBtn
                key={k}
                label={isShifted ? k.toUpperCase() : k}
                onPress={() => handleKeyPress(isShifted ? k.toUpperCase() : k)}
              />
            ))}
            <KeyBtn label="▲" special flex={1.1} onPress={() => handleKeyPress('ArrowUp')} />
          </View>

          {/* Row 4 (Space & Nav) */}
          <View style={styles.row}>
            <KeyBtn label="/" special flex={1} onPress={() => handleKeyPress('/')} />
            <KeyBtn label="Space" flex={6} onPress={() => handleKeyPress('Space')} />
            <KeyBtn label="◀" special flex={1} onPress={() => handleKeyPress('ArrowLeft')} />
            <KeyBtn label="▼" special flex={1} onPress={() => handleKeyPress('ArrowDown')} />
            <KeyBtn label="▶" special flex={1} onPress={() => handleKeyPress('ArrowRight')} />
          </View>
        </View>
      )}

      {/* Function Keys Page */}
      {page === 'fn' && (
        <View style={styles.keysContainer}>
          <View style={styles.row}>
            {['F1', 'F2', 'F3', 'F4', 'F5', 'F6'].map((f) => (
              <KeyBtn key={f} label={f} special onPress={() => handleKeyPress(f)} />
            ))}
          </View>
          <View style={styles.row}>
            {['F7', 'F8', 'F9', 'F10', 'F11', 'F12'].map((f) => (
              <KeyBtn key={f} label={f} special onPress={() => handleKeyPress(f)} />
            ))}
          </View>
          <View style={styles.row}>
            <KeyBtn label="PrintScreen" special flex={2} onPress={() => handleKeyPress('PrintScreen')} />
            <KeyBtn label="Insert" special flex={1.5} onPress={() => handleKeyPress('Insert')} />
            <KeyBtn label="Home" special flex={1.5} onPress={() => handleKeyPress('Home')} />
            <KeyBtn label="End" special flex={1.5} onPress={() => handleKeyPress('End')} />
            <KeyBtn label="Page Up" special flex={2} onPress={() => handleKeyPress('PageUp')} />
            <KeyBtn label="Page Down" special flex={2} onPress={() => handleKeyPress('PageDown')} />
          </View>
        </View>
      )}

      {/* Shortcuts Page */}
      {page === 'shortcuts' && (
        <View style={styles.keysContainer}>
          <View style={styles.row}>
            <KeyBtn label="Copy (Ctrl+C)" special flex={1} onPress={() => handleShortcut('copy')} />
            <KeyBtn label="Paste (Ctrl+V)" special flex={1} onPress={() => handleShortcut('paste')} />
            <KeyBtn label="Cut (Ctrl+X)" special flex={1} onPress={() => handleShortcut('cut')} />
          </View>
          <View style={styles.row}>
            <KeyBtn label="Undo (Ctrl+Z)" special flex={1} onPress={() => handleShortcut('undo')} />
            <KeyBtn label="Redo (Ctrl+Y)" special flex={1} onPress={() => handleShortcut('redo')} />
            <KeyBtn label="Select All (Ctrl+A)" special flex={1} onPress={() => handleShortcut('select_all')} />
          </View>
          <View style={styles.row}>
            <KeyBtn label="Save (Ctrl+S)" special flex={1} onPress={() => handleShortcut('save')} />
            <KeyBtn label="Find (Ctrl+F)" special flex={1} onPress={() => handleShortcut('find')} />
            <KeyBtn label="Switch Window (Alt+Tab)" special flex={1.5} onPress={() => handleShortcut('alt_tab')} />
          </View>
        </View>
      )}
    </View>
  );
};

const KeyBtn: React.FC<{
  label: string;
  special?: boolean;
  active?: boolean;
  flex?: number;
  onPress: () => void;
}> = ({ label, special, active, flex = 1, onPress }) => {
  return (
    <TouchableOpacity
      style={[
        styles.key,
        special && styles.keySpecial,
        active && styles.keyActive,
        { flex }
      ]}
      activeOpacity={0.6}
      onPress={onPress}
    >
      <Text style={[styles.keyText, active && styles.keyTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 6
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 4
  },
  headerLeft: {
    flexDirection: 'row',
    gap: 6
  },
  modeTab: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1e293b'
  },
  modeTabActive: {
    backgroundColor: '#38bdf8'
  },
  modeTabText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600'
  },
  modeTabTextActive: {
    color: '#0f172a',
    fontWeight: '700'
  },
  mouseSwitchBtn: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#334155'
  },
  mouseSwitchText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '600'
  },
  keysContainer: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 4
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: 4
  },
  key: {
    backgroundColor: '#1e293b',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center'
  },
  keySpecial: {
    backgroundColor: '#334155'
  },
  keyActive: {
    backgroundColor: '#38bdf8',
    borderColor: '#0284c7'
  },
  keyText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '500'
  },
  keyTextActive: {
    color: '#0f172a',
    fontWeight: '700'
  }
});
