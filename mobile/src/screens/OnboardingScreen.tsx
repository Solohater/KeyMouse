import React, { useRef, useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import {
  ArrowRight,
  Bluetooth,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Laptop,
  Lock,
  Mouse,
  MousePointer,
  RadioTower,
  Share2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Usb,
  Wifi,
  Zap
} from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { triggerHaptic } from '../utils/haptics';
import { ConnectionTab } from './ConnectionScreen';
import { StorageService } from '../services/StorageService';
import { InstallerService, InstallerInfo } from '../services/InstallerService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TOTAL_PAGES = 5;

interface OnboardingScreenProps {
  onOpenInstaller?: () => void;
  onOpenAdvanced: (tab?: ConnectionTab) => void;
  hapticEnabled: boolean;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
  onOpenInstaller,
  onOpenAdvanced,
  hapticEnabled
}) => {
  const { colors, isDark } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [currentPage, setCurrentPage] = useState(0);

  // Companion file actions
  const [installerInfo, setInstallerInfo] = useState<InstallerInfo | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [transferMsg, setTransferMsg] = useState<string | null>(null);
  const [showTerminalSnippet, setShowTerminalSnippet] = useState(false);

  useEffect(() => {
    InstallerService.getInfo().then(setInstallerInfo).catch(() => {});
  }, []);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const page = Math.round(offsetX / SCREEN_WIDTH);
    if (page !== currentPage && page >= 0 && page < TOTAL_PAGES) {
      setCurrentPage(page);
    }
  };

  const goToPage = (pageIndex: number) => {
    triggerHaptic(hapticEnabled, 'light');
    const target = Math.max(0, Math.min(TOTAL_PAGES - 1, pageIndex));
    setCurrentPage(target);
    scrollRef.current?.scrollTo({ x: target * SCREEN_WIDTH, animated: true });
  };

  const handleNext = () => {
    if (currentPage < TOTAL_PAGES - 1) {
      goToPage(currentPage + 1);
    } else {
      finishOnboarding('usb');
    }
  };

  const handleBack = () => {
    if (currentPage > 0) {
      goToPage(currentPage - 1);
    }
  };

  const finishOnboarding = (tab: ConnectionTab = 'usb') => {
    triggerHaptic(hapticEnabled, 'medium');
    StorageService.completeOnboarding().catch(() => {});
    onOpenAdvanced(tab);
  };

  const handleSaveToDownloads = async () => {
    triggerHaptic(hapticEnabled, 'medium');
    setIsSaving(true);
    setTransferMsg(null);
    try {
      const res = await InstallerService.saveToDownloads();
      if (res.cancelled) {
        setTransferMsg('Cancelled save.');
      } else {
        setTransferMsg(`✓ Saved ${res.fileName || 'installer'} to Downloads folder! You can copy it to your PC over USB.`);
      }
    } catch (e: any) {
      Alert.alert('Save to Downloads', e?.message || 'Could not save installer.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleShareBluetooth = async () => {
    triggerHaptic(hapticEnabled, 'medium');
    setIsSharing(true);
    setTransferMsg(null);
    try {
      await InstallerService.shareInstaller();
      setTransferMsg('✓ Sharing started! Choose Bluetooth, then accept the file on your PC.');
    } catch (e: any) {
      Alert.alert('Share Companion', e?.message || 'Could not share file.');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 1. TOP HEADER BAR */}
      <View style={styles.topHeader}>
        <View style={styles.brandRow}>
          <View style={[styles.brandLogo, { backgroundColor: colors.accentSubtle }]}>
            <Text style={[styles.brandLogoText, { color: colors.accent }]}>ki</Text>
          </View>
          <View>
            <Text style={[styles.brandTitle, { color: colors.textPrimary }]}>kiMo</Text>
            <Text style={[styles.brandSubtitle, { color: colors.textSecondary }]}>
              User Guide & Quick Setup
            </Text>
          </View>
        </View>

        <View style={styles.topRightControls}>
          <View style={[styles.stepPill, { backgroundColor: colors.surfaceSubtle }]}>
            <Text style={[styles.stepPillText, { color: colors.accent }]}>
              {currentPage + 1} of {TOTAL_PAGES}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.skipBtn}
            activeOpacity={0.7}
            onPress={() => finishOnboarding('usb')}
          >
            <Text style={[styles.skipBtnText, { color: colors.textMuted }]}>Skip</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. HORIZONTAL SLIDING CAROUSEL */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={styles.carousel}
      >
        {/* =================================================================== */}
        {/* CARD 1: WELCOME & OVERVIEW                                          */}
        {/* =================================================================== */}
        <View style={[styles.slideContainer, { width: SCREEN_WIDTH }]}>
          <ScrollView
            style={styles.cardScroll}
            contentContainerStyle={styles.cardContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.cardTag, { backgroundColor: 'rgba(6, 182, 212, 0.12)' }]}>
                <Sparkles size={13} color={colors.accent} />
                <Text style={[styles.cardTagText, { color: colors.accent }]}>WELCOME TO KIMO</Text>
              </View>

              <Text style={[styles.heroHeading, { color: colors.textPrimary }]}>
                Your Phone is Now Your Computer Mouse & Keyboard
              </Text>
              <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
                No bulky mouse to carry around. Control your laptop or desktop with zero lag, anywhere you go.
              </Text>

              {/* Feature Highlights */}
              <View style={styles.featuresList}>
                <View style={[styles.featureItem, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
                  <View style={[styles.featureIconBubble, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                    <Zap size={18} color="#10b981" />
                  </View>
                  <View style={styles.featureItemTextCol}>
                    <Text style={[styles.featureTitle, { color: colors.textPrimary }]}>Lightning Fast (&lt;1ms)</Text>
                    <Text style={[styles.featureDesc, { color: colors.textSecondary }]}>
                      Buttery-smooth cursor movement that responds instantly just like a physical mouse.
                    </Text>
                  </View>
                </View>

                <View style={[styles.featureItem, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
                  <View style={[styles.featureIconBubble, { backgroundColor: 'rgba(6, 182, 212, 0.15)' }]}>
                    <Mouse size={18} color={colors.accent} />
                  </View>
                  <View style={styles.featureItemTextCol}>
                    <Text style={[styles.featureTitle, { color: colors.textPrimary }]}>Intuitive Multi-Touch</Text>
                    <Text style={[styles.featureDesc, { color: colors.textSecondary }]}>
                      Smooth 1-finger navigation, tap-to-click, and effortless 2-finger web scrolling.
                    </Text>
                  </View>
                </View>

                <View style={[styles.featureItem, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
                  <View style={[styles.featureIconBubble, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                    <ShieldCheck size={18} color="#f59e0b" />
                  </View>
                  <View style={styles.featureItemTextCol}>
                    <Text style={[styles.featureTitle, { color: colors.textPrimary }]}>100% Private &amp; Offline</Text>
                    <Text style={[styles.featureDesc, { color: colors.textSecondary }]}>
                      No internet, accounts, or cloud required. Works directly between phone and PC.
                    </Text>
                  </View>
                </View>
              </View>

              <View style={[styles.swipePromptBox, { backgroundColor: colors.surfaceSubtle }]}>
                <Text style={[styles.swipePromptText, { color: colors.textSecondary }]}>
                  👉 Swipe left or tap <Text style={{ color: colors.accent, fontWeight: '700' }}>Next</Text> to see how to connect
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>

        {/* =================================================================== */}
        {/* CARD 2: 3 SIMPLE WAYS TO CONNECT                                    */}
        {/* =================================================================== */}
        <View style={[styles.slideContainer, { width: SCREEN_WIDTH }]}>
          <ScrollView
            style={styles.cardScroll}
            contentContainerStyle={styles.cardContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.cardTag, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <Usb size={13} color="#10b981" />
                <Text style={[styles.cardTagText, { color: '#10b981' }]}>STEP 1 · CHOOSE HOW TO CONNECT</Text>
              </View>

              <Text style={[styles.heroHeading, { color: colors.textPrimary }]}>
                Connect Wirelessly or with a Cable
              </Text>
              <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
                kiMo gives you three super-easy ways to connect. Pick whichever is most convenient:
              </Text>

              {/* 3 Methods */}
              <View style={styles.methodsCol}>
                {/* Method 1: USB */}
                <View style={[styles.methodCard, { backgroundColor: colors.surfaceSubtle, borderColor: colors.accent }]}>
                  <View style={styles.methodHeader}>
                    <View style={[styles.methodBadge, { backgroundColor: colors.accent }]}>
                      <Usb size={16} color={isDark ? '#000000' : '#ffffff'} />
                      <Text style={[styles.methodBadgeText, { color: isDark ? '#000000' : '#ffffff' }]}>
                        USB Cable · RECOMMENDED
                      </Text>
                    </View>
                    <Text style={[styles.latencyPill, { color: '#10b981' }]}>&lt;0.5ms Lag</Text>
                  </View>
                  <Text style={[styles.methodTitle, { color: colors.textPrimary }]}>
                    Plug &amp; Play (Zero Config)
                  </Text>
                  <Text style={[styles.methodDesc, { color: colors.textSecondary }]}>
                    Just plug your phone into your PC with your regular charger cable. No Wi-Fi or data needed.
                  </Text>
                </View>

                {/* Method 2: Wi-Fi */}
                <View style={[styles.methodCard, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
                  <View style={styles.methodHeader}>
                    <View style={[styles.methodBadge, { backgroundColor: 'rgba(6, 182, 212, 0.15)' }]}>
                      <Wifi size={16} color={colors.accent} />
                      <Text style={[styles.methodBadgeText, { color: colors.accent }]}>Wi-Fi Network</Text>
                    </View>
                  </View>
                  <Text style={[styles.methodTitle, { color: colors.textPrimary }]}>
                    Convenient Wireless
                  </Text>
                  <Text style={[styles.methodDesc, { color: colors.textSecondary }]}>
                    Connect phone and laptop to the same Wi-Fi. kiMo finds your computer automatically in 1 tap.
                  </Text>
                </View>

                {/* Method 3: Hotspot */}
                <View style={[styles.methodCard, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
                  <View style={styles.methodHeader}>
                    <View style={[styles.methodBadge, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                      <RadioTower size={16} color="#f59e0b" />
                      <Text style={[styles.methodBadgeText, { color: '#f59e0b' }]}>Phone Hotspot</Text>
                    </View>
                  </View>
                  <Text style={[styles.methodTitle, { color: colors.textPrimary }]}>
                    Works Anywhere Without a Router
                  </Text>
                  <Text style={[styles.methodDesc, { color: colors.textSecondary }]}>
                    On a train or plane? Turn on your phone's hotspot, connect your PC, and control it wire-free!
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>

        {/* =================================================================== */}
        {/* CARD 3: HOW TO USE THE TRACKPAD (GESTURES)                          */}
        {/* =================================================================== */}
        <View style={[styles.slideContainer, { width: SCREEN_WIDTH }]}>
          <ScrollView
            style={styles.cardScroll}
            contentContainerStyle={styles.cardContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.cardTag, { backgroundColor: 'rgba(6, 182, 212, 0.15)' }]}>
                <MousePointer size={13} color={colors.accent} />
                <Text style={[styles.cardTagText, { color: colors.accent }]}>STEP 2 · HOW TO USE</Text>
              </View>

              <Text style={[styles.heroHeading, { color: colors.textPrimary }]}>
                Simple &amp; Intuitive Gestures
              </Text>
              <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
                The entire screen becomes your trackpad. Use the same gestures you already know:
              </Text>

              {/* Gestures Grid */}
              <View style={styles.gesturesList}>
                <View style={[styles.gestureRow, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
                  <View style={[styles.gestureIconBox, { backgroundColor: colors.accentSubtle }]}>
                    <Text style={styles.gestureEmoji}>👆</Text>
                  </View>
                  <View style={styles.gestureTextCol}>
                    <Text style={[styles.gestureName, { color: colors.textPrimary }]}>1-Finger Slide</Text>
                    <Text style={[styles.gestureAction, { color: colors.textSecondary }]}>
                      Steer the mouse cursor smoothly across the screen.
                    </Text>
                  </View>
                </View>

                <View style={[styles.gestureRow, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
                  <View style={[styles.gestureIconBox, { backgroundColor: colors.accentSubtle }]}>
                    <Text style={styles.gestureEmoji}>👆</Text>
                  </View>
                  <View style={styles.gestureTextCol}>
                    <Text style={[styles.gestureName, { color: colors.textPrimary }]}>1-Finger Tap</Text>
                    <Text style={[styles.gestureAction, { color: colors.textSecondary }]}>
                      Standard Left Click to open files, links, and apps.
                    </Text>
                  </View>
                </View>

                <View style={[styles.gestureRow, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
                  <View style={[styles.gestureIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                    <Text style={styles.gestureEmoji}>✌️</Text>
                  </View>
                  <View style={styles.gestureTextCol}>
                    <Text style={[styles.gestureName, { color: colors.textPrimary }]}>2-Finger Slide</Text>
                    <Text style={[styles.gestureAction, { color: colors.textSecondary }]}>
                      Scroll up and down through websites and long documents.
                    </Text>
                  </View>
                </View>

                <View style={[styles.gestureRow, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
                  <View style={[styles.gestureIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                    <Text style={styles.gestureEmoji}>✌️</Text>
                  </View>
                  <View style={styles.gestureTextCol}>
                    <Text style={[styles.gestureName, { color: colors.textPrimary }]}>2-Finger Tap or 'Right' Button</Text>
                    <Text style={[styles.gestureAction, { color: colors.textSecondary }]}>
                      Right Click to open context menus and options.
                    </Text>
                  </View>
                </View>

                <View style={[styles.gestureRow, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
                  <View style={[styles.gestureIconBox, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                    <Lock size={18} color="#f59e0b" />
                  </View>
                  <View style={styles.gestureTextCol}>
                    <Text style={[styles.gestureName, { color: colors.textPrimary }]}>Drag Button</Text>
                    <Text style={[styles.gestureAction, { color: colors.textSecondary }]}>
                      Locks click down so you can easily move windows or highlight text.
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>

        {/* =================================================================== */}
        {/* CARD 4: 1-MINUTE COMPUTER SETUP                                     */}
        {/* =================================================================== */}
        <View style={[styles.slideContainer, { width: SCREEN_WIDTH }]}>
          <ScrollView
            style={styles.cardScroll}
            contentContainerStyle={styles.cardContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.cardTag, { backgroundColor: 'rgba(6, 182, 212, 0.15)' }]}>
                <Laptop size={13} color={colors.accent} />
                <Text style={[styles.cardTagText, { color: colors.accent }]}>STEP 3 · COMPUTER HELPER</Text>
              </View>

              <Text style={[styles.heroHeading, { color: colors.textPrimary }]}>
                1-Minute Computer Setup
              </Text>
              <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
                Your computer just needs the lightweight kiMo companion running so it can receive your touches.
              </Text>

              {/* Friendly explanation card */}
              <View style={[styles.helperBox, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
                <View style={styles.helperHeader}>
                  <CheckCircle2 size={18} color="#10b981" />
                  <Text style={[styles.helperTitle, { color: colors.textPrimary }]}>
                    No Complex Setup Needed
                  </Text>
                </View>
                <Text style={[styles.helperDesc, { color: colors.textSecondary }]}>
                  If you connect with a USB cable, simply tap <Text style={{ color: colors.accent, fontWeight: '700' }}>CONNECT USB</Text> on the next screen and you're good to go!
                </Text>

                <View style={styles.divider} />

                <Text style={[styles.companionSubheading, { color: colors.textPrimary }]}>
                  Need the companion app for your computer?
                </Text>
                <Text style={[styles.helperDesc, { color: colors.textSecondary }]}>
                  The Ubuntu companion ({installerInfo ? InstallerService.formatSize(installerInfo.size) : 'bundled'}) is stored right inside this phone app:
                </Text>

                {/* Transfer Action Buttons */}
                <View style={styles.transferButtonsRow}>
                  <TouchableOpacity
                    style={[styles.actionBtnOutline, { borderColor: colors.accent }]}
                    activeOpacity={0.8}
                    onPress={handleSaveToDownloads}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <>
                        <Download size={15} color={colors.accent} />
                        <Text style={[styles.actionBtnOutlineText, { color: colors.accent }]}>
                          Save to Downloads
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtnOutline, { borderColor: colors.accent }]}
                    activeOpacity={0.8}
                    onPress={handleShareBluetooth}
                    disabled={isSharing}
                  >
                    {isSharing ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <>
                        <Share2 size={15} color={colors.accent} />
                        <Text style={[styles.actionBtnOutlineText, { color: colors.accent }]}>
                          Share via Bluetooth
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {transferMsg && (
                  <View style={[styles.msgBadge, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                    <Text style={[styles.msgBadgeText, { color: '#10b981' }]}>{transferMsg}</Text>
                  </View>
                )}

                {/* Collapsible Technical / Terminal Info */}
                <TouchableOpacity
                  style={styles.techToggleRow}
                  activeOpacity={0.7}
                  onPress={() => setShowTerminalSnippet(!showTerminalSnippet)}
                >
                  <Terminal size={14} color={colors.textMuted} />
                  <Text style={[styles.techToggleText, { color: colors.textMuted }]}>
                    {showTerminalSnippet ? 'Hide terminal details' : 'Show terminal install command (for Linux users)'}
                  </Text>
                  <ChevronRight
                    size={14}
                    color={colors.textMuted}
                    style={{ transform: [{ rotate: showTerminalSnippet ? '90deg' : '0deg' }] }}
                  />
                </TouchableOpacity>

                {showTerminalSnippet && (
                  <View style={[styles.codeBox, { backgroundColor: isDark ? '#020617' : '#0f172a' }]}>
                    <Text style={styles.codeText}>sudo apt install ./kimo_1.1.0_amd64.deb</Text>
                    <Text style={styles.codeSubText}>Then log out &amp; in once so input permissions apply.</Text>
                  </View>
                )}
              </View>
            </View>
          </ScrollView>
        </View>

        {/* =================================================================== */}
        {/* CARD 5: READY TO GO!                                                */}
        {/* =================================================================== */}
        <View style={[styles.slideContainer, { width: SCREEN_WIDTH }]}>
          <ScrollView
            style={styles.cardScroll}
            contentContainerStyle={styles.cardContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.cardTag, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <CheckCircle2 size={13} color="#10b981" />
                <Text style={[styles.cardTagText, { color: '#10b981' }]}>ALL SET · YOU'RE READY</Text>
              </View>

              <Text style={[styles.heroHeading, { color: colors.textPrimary }]}>
                Ready to Take Control!
              </Text>
              <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
                Everything is set up. Choose how you would like to connect right now:
              </Text>

              {/* Ready Action Buttons */}
              <View style={styles.finalActionsCol}>
                <TouchableOpacity
                  style={[styles.bigPrimaryBtn, { backgroundColor: colors.accent }]}
                  activeOpacity={0.85}
                  onPress={() => finishOnboarding('usb')}
                >
                  <Usb size={20} color={isDark ? '#000000' : '#ffffff'} />
                  <View style={styles.bigBtnTextCol}>
                    <Text style={[styles.bigBtnTitle, { color: isDark ? '#000000' : '#ffffff' }]}>
                      Connect with USB Cable
                    </Text>
                    <Text style={[styles.bigBtnSub, { color: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.85)' }]}>
                      Fastest &bull; 0.5ms speed &bull; No Wi-Fi needed
                    </Text>
                  </View>
                  <ArrowRight size={18} color={isDark ? '#000000' : '#ffffff'} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.bigSecondaryBtn, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}
                  activeOpacity={0.85}
                  onPress={() => finishOnboarding('wifi')}
                >
                  <Wifi size={20} color={colors.accent} />
                  <View style={styles.bigBtnTextCol}>
                    <Text style={[styles.bigBtnTitle, { color: colors.textPrimary }]}>
                      Connect Wirelessly (Wi-Fi)
                    </Text>
                    <Text style={[styles.bigBtnSub, { color: colors.textSecondary }]}>
                      Automatic scan on your local network
                    </Text>
                  </View>
                  <ArrowRight size={18} color={colors.textSecondary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.bigSecondaryBtn, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}
                  activeOpacity={0.85}
                  onPress={() => finishOnboarding('hotspot')}
                >
                  <RadioTower size={20} color="#f59e0b" />
                  <View style={styles.bigBtnTextCol}>
                    <Text style={[styles.bigBtnTitle, { color: colors.textPrimary }]}>
                      Use Phone Hotspot
                    </Text>
                    <Text style={[styles.bigBtnSub, { color: colors.textSecondary }]}>
                      Direct connection anywhere you go
                    </Text>
                  </View>
                  <ArrowRight size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={[styles.footerNoteBox, { backgroundColor: colors.surfaceSubtle }]}>
                <Text style={[styles.footerNoteText, { color: colors.textMuted }]}>
                  💡 You can revisit this guide or adjust sensitivity at any time in <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Settings</Text>.
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </ScrollView>

      {/* 3. MODERN BOTTOM CONTROL & PAGINATION BAR */}
      <View style={[styles.bottomControlBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        {/* Back Button */}
        <TouchableOpacity
          style={[styles.navStepBtn, currentPage === 0 && { opacity: 0.3 }]}
          disabled={currentPage === 0}
          activeOpacity={0.7}
          onPress={handleBack}
        >
          <ChevronLeft size={20} color={colors.textSecondary} />
          <Text style={[styles.navStepBtnText, { color: colors.textSecondary }]}>Back</Text>
        </TouchableOpacity>

        {/* Centered Pagination Dot Indicators */}
        <View style={styles.paginationDotsContainer}>
          {Array.from({ length: TOTAL_PAGES }).map((_, index) => {
            const isActive = index === currentPage;
            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.dot,
                  isActive
                    ? [styles.dotActive, { backgroundColor: colors.accent }]
                    : [styles.dotInactive, { backgroundColor: colors.border }]
                ]}
                activeOpacity={0.8}
                onPress={() => goToPage(index)}
              />
            );
          })}
        </View>

        {/* Next / Finish Button */}
        <TouchableOpacity
          style={[styles.primaryActionBtn, { backgroundColor: colors.accent }]}
          activeOpacity={0.85}
          onPress={handleNext}
        >
          <Text style={[styles.primaryActionBtnText, { color: isDark ? '#000000' : '#ffffff' }]}>
            {currentPage === TOTAL_PAGES - 1 ? 'Get Started' : 'Next'}
          </Text>
          <ChevronRight size={17} color={isDark ? '#000000' : '#ffffff'} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 8
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  brandLogo: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  brandLogoText: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.5
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3
  },
  brandSubtitle: {
    fontSize: 11,
    fontWeight: '500'
  },
  topRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  stepPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10
  },
  stepPillText: {
    fontSize: 11,
    fontWeight: '700'
  },
  skipBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  skipBtnText: {
    fontSize: 13,
    fontWeight: '600'
  },
  carousel: {
    flex: 1
  },
  slideContainer: {
    flex: 1,
    paddingHorizontal: 16
  },
  cardScroll: {
    flex: 1
  },
  cardContent: {
    paddingVertical: 8,
    paddingBottom: 20
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  },
  cardTag: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 12
  },
  cardTagText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8
  },
  heroHeading: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 28,
    marginBottom: 8
  },
  heroSub: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18
  },
  featuresList: {
    gap: 10,
    marginBottom: 16
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12
  },
  featureIconBubble: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  featureItemTextCol: {
    flex: 1
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2
  },
  featureDesc: {
    fontSize: 12,
    lineHeight: 16
  },
  swipePromptBox: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4
  },
  swipePromptText: {
    fontSize: 12,
    fontWeight: '500'
  },
  methodsCol: {
    gap: 10
  },
  methodCard: {
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14
  },
  methodHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  methodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8
  },
  methodBadgeText: {
    fontSize: 11,
    fontWeight: '700'
  },
  latencyPill: {
    fontSize: 11,
    fontWeight: '800'
  },
  methodTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3
  },
  methodDesc: {
    fontSize: 12,
    lineHeight: 17
  },
  gesturesList: {
    gap: 9
  },
  gestureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12
  },
  gestureIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  gestureEmoji: {
    fontSize: 18
  },
  gestureTextCol: {
    flex: 1
  },
  gestureName: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2
  },
  gestureAction: {
    fontSize: 12,
    lineHeight: 16
  },
  helperBox: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16
  },
  helperHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6
  },
  helperTitle: {
    fontSize: 15,
    fontWeight: '700'
  },
  helperDesc: {
    fontSize: 12,
    lineHeight: 17
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(150, 150, 150, 0.15)',
    marginVertical: 12
  },
  companionSubheading: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4
  },
  transferButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    marginBottom: 6
  },
  actionBtnOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8
  },
  actionBtnOutlineText: {
    fontSize: 12,
    fontWeight: '700'
  },
  msgBadge: {
    padding: 8,
    borderRadius: 10,
    marginTop: 8
  },
  msgBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center'
  },
  techToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 4
  },
  techToggleText: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1
  },
  codeBox: {
    borderRadius: 10,
    padding: 12,
    marginTop: 8
  },
  codeText: {
    color: '#38bdf8',
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '700'
  },
  codeSubText: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 4
  },
  finalActionsCol: {
    gap: 10,
    marginBottom: 16
  },
  bigPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    shadowColor: '#06b6d4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3
  },
  bigSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12
  },
  bigBtnTextCol: {
    flex: 1
  },
  bigBtnTitle: {
    fontSize: 15,
    fontWeight: '800'
  },
  bigBtnSub: {
    fontSize: 11,
    marginTop: 2
  },
  footerNoteBox: {
    padding: 12,
    borderRadius: 12
  },
  footerNoteText: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center'
  },
  bottomControlBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1
  },
  navStepBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10
  },
  navStepBtnText: {
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 4
  },
  paginationDotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  dot: {
    height: 8,
    borderRadius: 4
  },
  dotActive: {
    width: 22
  },
  dotInactive: {
    width: 8
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    gap: 4
  },
  primaryActionBtnText: {
    fontSize: 13,
    fontWeight: '800'
  }
});
