import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar
} from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { ConnectionScreen, ConnectionTab } from './src/screens/ConnectionScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { InstallerScreen } from './src/screens/InstallerScreen';
import { Touchpad } from './src/components/Touchpad';
import { SamsungKeyboard, KeyboardOrientation } from './src/components/SamsungKeyboard';
import { SystemKeyboard } from './src/components/SystemKeyboard';
import { CombinedScreen } from './src/screens/CombinedScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { StorageService, UserPreferences, defaultPreferences } from './src/services/StorageService';
import { socketService, ConnectionState } from './src/services/PocketSocket';
import { bluetoothHidService } from './src/services/BluetoothHidService';
import { inputDispatcher } from './src/services/InputDispatcher';
import { triggerHaptic } from './src/utils/haptics';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import {
  Link2,
  Mouse,
  Keyboard,
  Smartphone,
  Settings as SettingsIcon,
  Minimize2
} from 'lucide-react-native';

type ScreenMode = 'onboarding' | 'installer' | 'connect' | 'touchpad' | 'keyboard' | 'combined' | 'settings';

function MainApp() {
  const { colors, isDark, mode } = useTheme();
  const [currentMode, setCurrentMode] = useState<ScreenMode>('onboarding');
  const [connectionTab, setConnectionTab] = useState<ConnectionTab>('usb');
  const [connState, setConnState] = useState<ConnectionState>('disconnected');
  const [btConnected, setBtConnected] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [keyboardOrientation, setKeyboardOrientation] = useState<KeyboardOrientation>('portrait');
  const [useSystemKeyboard, setUseSystemKeyboard] = useState(true);
  const [isImmersiveFullScreen, setIsImmersiveFullScreen] = useState(false);

  const toggleImmersiveFullScreen = () => {
    triggerHaptic(preferences.hapticEnabled, 'medium');
    setIsImmersiveFullScreen((prev) => !prev);
  };

  useEffect(() => {
    StorageService.getOnboarding().then((onboarding) => {
      if (onboarding.completed) setCurrentMode('connect');
    });

    // Load persisted preferences
    StorageService.getPreferences().then((prefs) => {
      setPreferences(prefs);
      socketService.setAutoReconnectPref(prefs.autoReconnect);
    });

    let previousSocketState = socketService.getState();
    const unsubSocket = socketService.onStatusChange((state) => {
      previousSocketState = state;
      setConnState(state);
    });

    // Subscribe to Bluetooth HID state
    const unsubBt = bluetoothHidService.onStateChange((event) => {
      if (event.state === 'connected') {
        setBtConnected(true);
        inputDispatcher.setMode('bluetooth_hid');
      } else if (event.state === 'disconnected') {
        setBtConnected(false);
      }
    });

    return () => {
      unsubSocket();
      unsubBt();
    };
  }, []);

  const switchMode = async (newMode: ScreenMode, targetOrientation: KeyboardOrientation = 'portrait') => {
    triggerHaptic(preferences.hapticEnabled, 'light');
    setCurrentMode(newMode);

    try {
      if (newMode === 'keyboard') {
        setKeyboardOrientation(targetOrientation);
        if (targetOrientation === 'landscape') {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        } else {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        }
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      }
    } catch (e) {
      console.warn('Orientation lock failed', e);
    }
  };

  const handleToggleKeyboardOrientation = async (newOrientation: KeyboardOrientation) => {
    setKeyboardOrientation(newOrientation);
  };

  const handleConnected = () => {
    StorageService.completeOnboarding().catch(() => {});
    switchMode('touchpad');
  };

  const openAdvanced = (tab: ConnectionTab = 'usb') => {
    setConnectionTab(tab);
    StorageService.completeOnboarding().catch(() => {});
    switchMode('connect');
  };

  const handleUpdatePreferences = async (updated: Partial<UserPreferences>) => {
    const saved = await StorageService.savePreferences(updated);
    setPreferences(saved);
    if (updated.autoReconnect !== undefined) {
      socketService.setAutoReconnectPref(saved.autoReconnect);
    }
  };

  const isConnected = connState === 'connected' || btConnected;
  const isLandscapeKeyboard = currentMode === 'keyboard' && keyboardOrientation === 'landscape';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />

      {/* Main Content Area */}
      <View style={styles.content}>
        {currentMode === 'onboarding' && (
          <OnboardingScreen
            hapticEnabled={preferences.hapticEnabled}
            onOpenInstaller={() => switchMode('installer')}
            onOpenAdvanced={openAdvanced}
          />
        )}

        {currentMode === 'installer' && (
          <InstallerScreen
            hapticEnabled={preferences.hapticEnabled}
            onBack={() => switchMode('onboarding')}
            onOpenConnection={() => openAdvanced('usb')}
          />
        )}

        {currentMode === 'connect' && (
          <ConnectionScreen
            hapticEnabled={preferences.hapticEnabled}
            initialTab={connectionTab}
            onConnected={handleConnected}
            onOpenSetup={() => switchMode('onboarding')}
          />
        )}

        {currentMode === 'touchpad' && (
          <Touchpad
            sensitivity={preferences.sensitivity}
            scrollSpeed={preferences.scrollSpeed}
            hapticEnabled={preferences.hapticEnabled}
            tapToClick={preferences.tapToClick}
            acceleration={preferences.acceleration ?? true}
            isImmersive={isImmersiveFullScreen}
            onToggleImmersive={toggleImmersiveFullScreen}
          />
        )}

        {currentMode === 'keyboard' &&
          (useSystemKeyboard ? (
            <SystemKeyboard
              hapticEnabled={preferences.hapticEnabled}
              onSwitchToMouse={() => switchMode('touchpad')}
              onSwitchToClassic={() => setUseSystemKeyboard(false)}
            />
          ) : (
            <SamsungKeyboard
              hapticEnabled={preferences.hapticEnabled}
              orientation={keyboardOrientation}
              onToggleOrientation={handleToggleKeyboardOrientation}
              onSwitchToMouse={() => switchMode('touchpad')}
              onSwitchToSystem={() => setUseSystemKeyboard(true)}
            />
          ))}

        {currentMode === 'combined' && (
          <CombinedScreen
            preferences={preferences}
            onExpandKeyboard={() => switchMode('keyboard', 'landscape')}
          />
        )}

        {currentMode === 'settings' && (
          <SettingsScreen
            preferences={preferences}
            onUpdatePreferences={handleUpdatePreferences}
            onOpenSetup={() => switchMode('onboarding')}
          />
        )}
      </View>

      {/* Modern Bottom Navigation Bar (Hidden in Fullscreen Immersive Mode) */}
      {!isLandscapeKeyboard && !isImmersiveFullScreen && currentMode !== 'onboarding' && currentMode !== 'installer' && (
        <View
          style={[
            styles.bottomNav,
            {
              backgroundColor: colors.bottomNavBg,
              borderTopColor: colors.bottomNavBorder
            }
          ]}
        >
          <NavTab
            title="Connect"
            renderIcon={(color) => <Link2 size={22} color={color} />}
            active={currentMode === 'connect'}
            onPress={() => switchMode('connect')}
          />
          <NavTab
            title="Mouse"
            renderIcon={(color) => <Mouse size={22} color={color} />}
            active={currentMode === 'touchpad'}
            onPress={() => switchMode('touchpad')}
          />
          <NavTab
            title="Keyboard"
            renderIcon={(color) => <Keyboard size={22} color={color} />}
            active={currentMode === 'keyboard'}
            onPress={() => switchMode('keyboard', 'portrait')}
          />
          <NavTab
            title="Combined"
            renderIcon={(color) => <Smartphone size={22} color={color} />}
            active={currentMode === 'combined'}
            onPress={() => switchMode('combined')}
          />
          <NavTab
            title="Settings"
            renderIcon={(color) => <SettingsIcon size={22} color={color} />}
            active={currentMode === 'settings'}
            onPress={() => switchMode('settings')}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const NavTab: React.FC<{
  title: string;
  renderIcon: (color: string) => React.ReactNode;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}> = ({ title, renderIcon, active, disabled, onPress }) => {
  const { colors } = useTheme();
  const iconColor = active ? colors.accent : colors.textMuted;
  return (
    <TouchableOpacity
      style={[
        styles.navBtn,
        active && { backgroundColor: colors.accentSubtle },
        disabled && styles.navBtnDisabled
      ]}
      disabled={disabled}
      activeOpacity={0.7}
      onPress={onPress}
    >
      <View style={{ marginBottom: 4 }}>
        {renderIcon(iconColor)}
      </View>
      <Text
        style={[
          styles.navTitle,
          { color: active ? colors.accent : colors.textMuted },
          disabled && { color: colors.border }
        ]}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <MainApp />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  content: {
    flex: 1
  },
  bottomNav: {
    flexDirection: 'row',
    height: 64,
    borderTopWidth: 1,
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 8
  },
  navBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12
  },
  navBtnDisabled: {
    opacity: 0.35
  },
  navIcon: {
    fontSize: 19,
    marginBottom: 2
  },
  navIconActive: {
    transform: [{ scale: 1.1 }]
  },
  navTitle: {
    fontSize: 11,
    fontWeight: '700'
  }
});
