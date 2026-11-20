import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  TextInput,
  Platform
} from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { socketService } from '../services/PocketSocket';
import { inputDispatcher } from '../services/InputDispatcher';
import { triggerHaptic } from '../utils/haptics';
import { KeyModifier, ShortcutType } from '../../../shared/src/protocol';
import { useTheme } from '../theme/ThemeContext';
import { Sun, Moon, RotateCcw, Smartphone, Laptop, ClipboardCopy, Keyboard as KeyboardIcon } from 'lucide-react-native';

export type KeyboardOrientation = 'portrait' | 'landscape';
type SamsungKeyPage = 'letters' | 'symbols1' | 'symbols2';

interface SamsungKeyboardProps {
  hapticEnabled: boolean;
  orientation?: KeyboardOrientation;
  onToggleOrientation?: (newOrientation: KeyboardOrientation) => void;
  onSwitchToMouse?: () => void;
  onSwitchToSystem?: () => void;
}

export const SamsungKeyboard: React.FC<SamsungKeyboardProps> = ({
  hapticEnabled,
  orientation = 'portrait',
  onToggleOrientation,
  onSwitchToMouse,
  onSwitchToSystem
}) => {
  const { colors, isDark, toggleTheme } = useTheme();
  const [page, setPage] = useState<SamsungKeyPage>('letters');
  const [shiftActive, setShiftActive] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [showPcBar, setShowPcBar] = useState(false);
  const [showFnBar, setShowFnBar] = useState(false);
  const [activeModifiers, setActiveModifiers] = useState<Set<KeyModifier>>(new Set());
  const [textInputBuffer, setTextInputBuffer] = useState('');
  const [currentOrientation, setCurrentOrientation] = useState<KeyboardOrientation>(orientation);

  useEffect(() => {
    setCurrentOrientation(orientation);
  }, [orientation]);

  const isLandscape = currentOrientation === 'landscape';

  const toggleOrientationMode = async () => {
    triggerHaptic(hapticEnabled, 'medium');
    const next = isLandscape ? 'portrait' : 'landscape';
    setCurrentOrientation(next);
    onToggleOrientation?.(next);

    try {
      if (next === 'landscape') {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      }
    } catch (e) {
      console.warn('Orientation lock error:', e);
    }
  };

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
    // Clear sticky modifiers once consumed
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

  const handleSendBufferedText = () => {
    if (!textInputBuffer) return;
    triggerHaptic(hapticEnabled, 'medium');
    socketService.send({
      type: 'type_text',
      payload: { text: textInputBuffer }
    });
    setTextInputBuffer('');
  };

  const isShifted = shiftActive || capsLock;

  // Number Row (Present on all Samsung Keyboard pages)
  const numberRow = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  // QWERTY Rows (photo 3)
  const lettersRow1 = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
  const lettersRow2 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'];
  const lettersRow3 = ['z', 'x', 'c', 'v', 'b', 'n', 'm'];

  // Symbols Page 1/2 (photo 4)
  const sym1Row1 = ['+', '×', '÷', '=', '/', '_', '<', '>', '[', ']'];
  const sym1Row2 = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')'];
  const sym1Row3 = ['-', "'", '"', ':', ';', ',', '?'];

  // Symbols Page 2/2 (photo 5)
  const sym2Row1 = ['`', '~', '\\', '|', '{', '}', '€', '£', '¥', '₩'];
  const sym2Row2 = ['°', '•', '○', '●', '□', '■', '♤', '♡', '◇', '♧'];
  const sym2Row3 = ['☆', '▪', '¤', '《', '》', '¡', '¿'];

  return (
    <View
      style={[
        styles.rootContainer,
        { backgroundColor: colors.background },
        isLandscape && styles.rootContainerLandscape
      ]}
    >
      {/* Upper Area in Portrait: Quick Input & Preview */}
      {!isLandscape && (
        <View style={styles.portraitTopArea}>
          <View
            style={[
              styles.inputPreviewCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border
              }
            ]}
          >
            <TextInput
              style={[styles.inputPreviewField, { color: colors.textPrimary }]}
              placeholder="Type whole sentence or paste here to send..."
              placeholderTextColor={colors.textMuted}
              value={textInputBuffer}
              onChangeText={setTextInputBuffer}
              onSubmitEditing={handleSendBufferedText}
              returnKeyType="send"
            />
            {textInputBuffer.length > 0 && (
              <TouchableOpacity
                style={[styles.sendPreviewBtn, { backgroundColor: colors.accent }]}
                onPress={handleSendBufferedText}
              >
                <Text style={[styles.sendPreviewBtnText, { color: isDark ? '#000000' : '#ffffff' }]}>
                  Send ➔
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Samsung Toolbar */}
      <View
        style={[
          styles.samsungToolbar,
          {
            backgroundColor: colors.keyboardToolbar,
            borderBottomColor: colors.keyboardToolbarBorder
          }
        ]}
      >
        <View style={styles.toolbarLeft}>
          {/* Theme Quick Toggle (Dark / Light Mode) */}
          <TouchableOpacity
            style={[
              styles.toolbarActionBtn,
              {
                backgroundColor: colors.surfaceSubtle,
                borderColor: colors.border
              }
            ]}
            onPress={() => {
              triggerHaptic(hapticEnabled, 'medium');
              toggleTheme();
            }}
            activeOpacity={0.7}
          >
            {isDark ? (
              <Sun size={14} color={colors.accent} />
            ) : (
              <Moon size={14} color={colors.textPrimary} />
            )}
            <Text style={[styles.toolbarActionIcon, { color: colors.textPrimary, marginLeft: 4 }]}>
              {isDark ? 'Light' : 'Dark'}
            </Text>
          </TouchableOpacity>

          {/* Orientation Toggle Button (Normal vs Landscape) */}
          <TouchableOpacity
            style={[styles.toolbarActionBtn, styles.orientationPill, { backgroundColor: colors.accent }]}
            onPress={toggleOrientationMode}
            activeOpacity={0.7}
          >
            {isLandscape ? (
              <Smartphone size={14} color={isDark ? '#000000' : '#ffffff'} />
            ) : (
              <RotateCcw size={14} color={isDark ? '#000000' : '#ffffff'} />
            )}
            <Text style={[styles.toolbarActionIcon, { color: isDark ? '#000000' : '#ffffff', marginLeft: 4 }]}>
              {isLandscape ? 'Normal' : 'Landscape'}
            </Text>
          </TouchableOpacity>

          {/* PC Keys Bar Toggle */}
          <TouchableOpacity
            style={[
              styles.toolbarActionBtn,
              {
                backgroundColor: showPcBar ? colors.accent : colors.surfaceSubtle,
                borderColor: colors.border
              }
            ]}
            onPress={() => {
              triggerHaptic(hapticEnabled, 'light');
              setShowPcBar(!showPcBar);
            }}
          >
            <Laptop size={14} color={showPcBar ? (isDark ? '#000000' : '#ffffff') : colors.textPrimary} />
            <Text
              style={[
                styles.toolbarActionIcon,
                { color: showPcBar ? (isDark ? '#000000' : '#ffffff') : colors.textPrimary, marginLeft: 4 }
              ]}
            >
              PC
            </Text>
          </TouchableOpacity>

          {/* F-Keys Bar Toggle */}
          <TouchableOpacity
            style={[
              styles.toolbarActionBtn,
              {
                backgroundColor: showFnBar ? colors.accent : colors.surfaceSubtle,
                borderColor: colors.border
              }
            ]}
            onPress={() => {
              triggerHaptic(hapticEnabled, 'light');
              setShowFnBar(!showFnBar);
            }}
          >
            <Text
              style={[
                styles.toolbarActionIcon,
                { color: showFnBar ? (isDark ? '#000000' : '#ffffff') : colors.textPrimary }
              ]}
            >
              F1–F12
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.toolbarRight}>
          {/* Quick Paste from PC / clipboard */}
          <TouchableOpacity
            style={styles.toolbarIconBtn}
            onPress={() => handleShortcut('paste')}
          >
            <ClipboardCopy size={13} color={colors.textSecondary} />
            <Text style={[styles.toolbarTextBtn, { color: colors.textSecondary, marginLeft: 4 }]}>Paste</Text>
          </TouchableOpacity>

          {/* Switch to the system Samsung keyboard (live typing) */}
          {onSwitchToSystem && (
            <TouchableOpacity
              style={styles.toolbarIconBtn}
              onPress={() => {
                triggerHaptic(hapticEnabled, 'light');
                onSwitchToSystem();
              }}
            >
              <KeyboardIcon size={13} color={colors.accent} />
              <Text style={[styles.toolbarTextBtn, { color: colors.accent, marginLeft: 4 }]}>Samsung</Text>
            </TouchableOpacity>
          )}

          {onSwitchToMouse && (
            <TouchableOpacity
              style={styles.toolbarIconBtn}
              onPress={onSwitchToMouse}
            >
              <Text style={[styles.toolbarTextBtn, { color: colors.textSecondary }]}>Mouse</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Optional PC Navigation Bar (Esc, Tab, Ctrl, Alt, Win, Del, Arrows) */}
      {showPcBar && (
        <View style={[styles.pcKeysBar, { backgroundColor: colors.surfaceSubtle, borderBottomColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pcKeysScroll}>
            <PcBarBtn label="Esc" onPress={() => handleKeyPress('Escape')} />
            <PcBarBtn label="Tab" onPress={() => handleKeyPress('Tab')} />
            <PcBarBtn
              label="Ctrl"
              active={activeModifiers.has('Ctrl')}
              onPress={() => toggleModifier('Ctrl')}
            />
            <PcBarBtn
              label="Alt"
              active={activeModifiers.has('Alt')}
              onPress={() => toggleModifier('Alt')}
            />
            <PcBarBtn
              label="Win"
              active={activeModifiers.has('Meta')}
              onPress={() => toggleModifier('Meta')}
            />
            <PcBarBtn label="Del" onPress={() => handleKeyPress('Delete')} />
            <PcBarBtn label="Copy" onPress={() => handleShortcut('copy')} />
            <PcBarBtn label="Select All" onPress={() => handleShortcut('select_all')} />
            <PcBarBtn label="Undo" onPress={() => handleShortcut('undo')} />
            <PcBarBtn label="Alt+Tab" onPress={() => handleShortcut('alt_tab')} />
            <PcBarBtn label="◀" onPress={() => handleKeyPress('ArrowLeft')} />
            <PcBarBtn label="▲" onPress={() => handleKeyPress('ArrowUp')} />
            <PcBarBtn label="▼" onPress={() => handleKeyPress('ArrowDown')} />
            <PcBarBtn label="▶" onPress={() => handleKeyPress('ArrowRight')} />
          </ScrollView>
        </View>
      )}

      {/* Optional Function Keys Bar (F1-F12) */}
      {showFnBar && (
        <View style={[styles.pcKeysBar, { backgroundColor: colors.surfaceSubtle, borderBottomColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pcKeysScroll}>
            {['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'].map(f => (
              <PcBarBtn key={f} label={f} onPress={() => handleKeyPress(f)} />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Main Samsung Keyboard Chassis */}
      <View
        style={[
          styles.keyboardChassis,
          { backgroundColor: colors.keyboardChassis },
          isLandscape && styles.keyboardChassisLandscape
        ]}
      >
        {/* Row 1: Numbers (1 2 3 4 5 6 7 8 9 0) */}
        <View style={styles.row}>
          {numberRow.map((n) => (
            <KeyButton
              key={n}
              label={n}
              onPress={() => handleKeyPress(n)}
              isLandscape={isLandscape}
            />
          ))}
        </View>

        {/* --- PAGE: LETTERS (photo_3) --- */}
        {page === 'letters' && (
          <>
            {/* Row 2: Q W E R T Y U I O P */}
            <View style={styles.row}>
              {lettersRow1.map((k) => (
                <KeyButton
                  key={k}
                  label={isShifted ? k.toUpperCase() : k}
                  onPress={() => handleKeyPress(isShifted ? k.toUpperCase() : k)}
                  isLandscape={isLandscape}
                />
              ))}
            </View>

            {/* Row 3: A S D F G H J K L */}
            <View style={[styles.row, styles.indentedRow]}>
              {lettersRow2.map((k) => (
                <KeyButton
                  key={k}
                  label={isShifted ? k.toUpperCase() : k}
                  onPress={() => handleKeyPress(isShifted ? k.toUpperCase() : k)}
                  isLandscape={isLandscape}
                />
              ))}
            </View>

            {/* Row 4: Shift | Z X C V B N M | Backspace */}
            <View style={styles.row}>
              <KeyButton
                label={capsLock ? '⇪' : '⇧'}
                special
                active={shiftActive || capsLock}
                flex={1.3}
                onPress={handleShift}
                isLandscape={isLandscape}
              />
              {lettersRow3.map((k) => (
                <KeyButton
                  key={k}
                  label={isShifted ? k.toUpperCase() : k}
                  onPress={() => handleKeyPress(isShifted ? k.toUpperCase() : k)}
                  isLandscape={isLandscape}
                />
              ))}
              <KeyButton
                label="⌫"
                special
                flex={1.3}
                onPress={() => handleKeyPress('Backspace')}
                isLandscape={isLandscape}
              />
            </View>

            {/* Row 5: !#1 | ? | Space ("English (US)") | . | Enter */}
            <View style={styles.row}>
              <KeyButton
                label="!#1"
                special
                flex={1.3}
                onPress={() => setPage('symbols1')}
                isLandscape={isLandscape}
              />
              <KeyButton
                label="?"
                special
                flex={1}
                onPress={() => handleKeyPress('?')}
                isLandscape={isLandscape}
              />
              <KeyButton
                label="English (US)"
                isSpace
                flex={4.2}
                onPress={() => handleKeyPress('Space')}
                isLandscape={isLandscape}
              />
              <KeyButton
                label="."
                special
                flex={1}
                onPress={() => handleKeyPress('.')}
                isLandscape={isLandscape}
              />
              <KeyButton
                label="↵"
                special
                flex={1.3}
                onPress={() => handleKeyPress('Enter')}
                isLandscape={isLandscape}
              />
            </View>
          </>
        )}

        {/* --- PAGE: SYMBOLS 1/2 (photo_4) --- */}
        {page === 'symbols1' && (
          <>
            {/* Row 2: + × ÷ = / _ < > [ ] */}
            <View style={styles.row}>
              {sym1Row1.map((k) => (
                <KeyButton
                  key={k}
                  label={k}
                  onPress={() => handleKeyPress(k)}
                  isLandscape={isLandscape}
                />
              ))}
            </View>

            {/* Row 3: ! @ # $ % ^ & * ( ) */}
            <View style={styles.row}>
              {sym1Row2.map((k) => (
                <KeyButton
                  key={k}
                  label={k}
                  onPress={() => handleKeyPress(k)}
                  isLandscape={isLandscape}
                />
              ))}
            </View>

            {/* Row 4: 1/2 | - ' " : ; , ? | Backspace */}
            <View style={styles.row}>
              <KeyButton
                label="1/2"
                special
                flex={1.3}
                onPress={() => setPage('symbols2')}
                isLandscape={isLandscape}
              />
              {sym1Row3.map((k) => (
                <KeyButton
                  key={k}
                  label={k}
                  onPress={() => handleKeyPress(k)}
                  isLandscape={isLandscape}
                />
              ))}
              <KeyButton
                label="⌫"
                special
                flex={1.3}
                onPress={() => handleKeyPress('Backspace')}
                isLandscape={isLandscape}
              />
            </View>

            {/* Row 5: ABC | ? | Space | . | Enter */}
            <View style={styles.row}>
              <KeyButton
                label="ABC"
                special
                flex={1.3}
                onPress={() => setPage('letters')}
                isLandscape={isLandscape}
              />
              <KeyButton
                label="?"
                special
                flex={1}
                onPress={() => handleKeyPress('?')}
                isLandscape={isLandscape}
              />
              <KeyButton
                label="English (US)"
                isSpace
                flex={4.2}
                onPress={() => handleKeyPress('Space')}
                isLandscape={isLandscape}
              />
              <KeyButton
                label="."
                special
                flex={1}
                onPress={() => handleKeyPress('.')}
                isLandscape={isLandscape}
              />
              <KeyButton
                label="↵"
                special
                flex={1.3}
                onPress={() => handleKeyPress('Enter')}
                isLandscape={isLandscape}
              />
            </View>
          </>
        )}

        {/* --- PAGE: SYMBOLS 2/2 (photo_5) --- */}
        {page === 'symbols2' && (
          <>
            {/* Row 2: ` ~ \ | { } € £ ¥ ₩ */}
            <View style={styles.row}>
              {sym2Row1.map((k) => (
                <KeyButton
                  key={k}
                  label={k}
                  onPress={() => handleKeyPress(k)}
                  isLandscape={isLandscape}
                />
              ))}
            </View>

            {/* Row 3: ° • ○ ● □ ■ ♤ ♡ ◇ ♧ */}
            <View style={styles.row}>
              {sym2Row2.map((k) => (
                <KeyButton
                  key={k}
                  label={k}
                  onPress={() => handleKeyPress(k)}
                  isLandscape={isLandscape}
                />
              ))}
            </View>

            {/* Row 4: 2/2 | ☆ ▪ ¤ 《 》 ¡ ¿ | Backspace */}
            <View style={styles.row}>
              <KeyButton
                label="2/2"
                special
                flex={1.3}
                onPress={() => setPage('symbols1')}
                isLandscape={isLandscape}
              />
              {sym2Row3.map((k) => (
                <KeyButton
                  key={k}
                  label={k}
                  onPress={() => handleKeyPress(k)}
                  isLandscape={isLandscape}
                />
              ))}
              <KeyButton
                label="⌫"
                special
                flex={1.3}
                onPress={() => handleKeyPress('Backspace')}
                isLandscape={isLandscape}
              />
            </View>

            {/* Row 5: ABC | ? | Space | . | Enter */}
            <View style={styles.row}>
              <KeyButton
                label="ABC"
                special
                flex={1.3}
                onPress={() => setPage('letters')}
                isLandscape={isLandscape}
              />
              <KeyButton
                label="?"
                special
                flex={1}
                onPress={() => handleKeyPress('?')}
                isLandscape={isLandscape}
              />
              <KeyButton
                label="English (US)"
                isSpace
                flex={4.2}
                onPress={() => handleKeyPress('Space')}
                isLandscape={isLandscape}
              />
              <KeyButton
                label="."
                special
                flex={1}
                onPress={() => handleKeyPress('.')}
                isLandscape={isLandscape}
              />
              <KeyButton
                label="↵"
                special
                flex={1.3}
                onPress={() => handleKeyPress('Enter')}
                isLandscape={isLandscape}
              />
            </View>
          </>
        )}
      </View>
    </View>
  );
};

const KeyButton: React.FC<{
  label: string;
  special?: boolean;
  active?: boolean;
  isSpace?: boolean;
  flex?: number;
  isLandscape?: boolean;
  onPress: () => void;
}> = ({ label, special, active, isSpace, flex = 1, isLandscape, onPress }) => {
  const { colors, isDark } = useTheme();

  const keyBg = active
    ? colors.modifierActiveBg
    : special
    ? colors.keySpecial
    : colors.keyBackground;

  const textColor = active
    ? colors.modifierActiveText
    : special
    ? colors.keyTextSpecial
    : colors.keyText;

  const borderColor = active
    ? colors.accent
    : colors.keyBorder;

  return (
    <TouchableOpacity
      style={[
        styles.key,
        {
          flex,
          backgroundColor: keyBg,
          borderColor: borderColor
        },
        isLandscape && styles.keyLandscape
      ]}
      activeOpacity={0.65}
      onPress={onPress}
    >
      <Text
        style={[
          styles.keyText,
          { color: textColor },
          (special || active) && { fontWeight: '700' },
          isSpace && { color: colors.textMuted, fontSize: 12 },
          isLandscape && styles.keyTextLandscape
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const PcBarBtn: React.FC<{
  label: string;
  active?: boolean;
  onPress: () => void;
}> = ({ label, active, onPress }) => {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.pcBtn,
        {
          backgroundColor: active ? colors.accent : colors.card,
          borderColor: active ? colors.accent : colors.border
        }
      ]}
      activeOpacity={0.65}
      onPress={onPress}
    >
      <Text
        style={[
          styles.pcBtnText,
          { color: active ? colors.modifierActiveText : colors.textPrimary }
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'flex-end'
  },
  rootContainerLandscape: {
    backgroundColor: '#0f172a',
    justifyContent: 'flex-end'
  },
  portraitTopArea: {
    flex: 1,
    padding: 12,
    justifyContent: 'center'
  },
  inputPreviewCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4
  },
  inputPreviewField: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 14,
    minHeight: 40
  },
  sendPreviewBtn: {
    backgroundColor: '#38bdf8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8
  },
  sendPreviewBtnText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 13
  },
  // Samsung Toolbar
  samsungToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#d8dce4',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#cbcfd7'
  },
  toolbarLeft: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center'
  },
  toolbarRight: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center'
  },
  toolbarActionBtn: {
    backgroundColor: '#e7eaef',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbcfd7'
  },
  orientationPill: {
    backgroundColor: '#38bdf8',
    borderColor: '#0ea5e9'
  },
  toolbarActionBtnActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0369a1'
  },
  toolbarActionIcon: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1b1d20'
  },
  toolbarActionIconActive: {
    color: '#ffffff'
  },
  toolbarIconBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  toolbarTextBtn: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155'
  },
  // PC Keys Drawer
  pcKeysBar: {
    backgroundColor: '#1e293b',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#334155'
  },
  pcKeysScroll: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center'
  },
  pcBtn: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155'
  },
  pcBtnActive: {
    backgroundColor: '#38bdf8',
    borderColor: '#0284c7'
  },
  pcBtnText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '600'
  },
  pcBtnTextActive: {
    color: '#0f172a',
    fontWeight: '700'
  },
  // Samsung Keyboard Chassis (matching photos 3, 4, 5)
  keyboardChassis: {
    backgroundColor: '#eceef2',
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    gap: 5
  },
  keyboardChassisLandscape: {
    paddingBottom: 6,
    gap: 4
  },
  row: {
    flexDirection: 'row',
    gap: 4
  },
  indentedRow: {
    paddingHorizontal: 12
  },
  // Individual Key Styling
  key: {
    backgroundColor: '#ffffff',
    borderRadius: 7,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 1.2,
    elevation: 2,
    borderWidth: 0.5,
    borderColor: 'rgba(0, 0, 0, 0.06)'
  },
  keyLandscape: {
    height: 38
  },
  keySpecial: {
    backgroundColor: '#cfd4dc'
  },
  keyActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#2563eb'
  },
  keySpace: {
    backgroundColor: '#ffffff'
  },
  keyText: {
    color: '#1b1d20',
    fontSize: 17,
    fontWeight: '400'
  },
  keyTextLandscape: {
    fontSize: 15
  },
  keyTextSpecial: {
    color: '#1b1d20',
    fontWeight: '500',
    fontSize: 14
  },
  keyTextActive: {
    color: '#ffffff',
    fontWeight: '700'
  },
  keyTextSpace: {
    color: '#71757e',
    fontSize: 12,
    fontWeight: '400'
  }
});
