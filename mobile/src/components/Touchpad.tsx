import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  TouchableOpacity,
  Animated,
  Dimensions
} from 'react-native';
import { Gyroscope } from 'expo-sensors';
import { inputDispatcher } from '../services/InputDispatcher';
import { triggerHaptic } from '../utils/haptics';
import { useTheme } from '../theme/ThemeContext';
import { StorageService } from '../services/StorageService';
import {
  Mouse,
  MousePointerClick,
  Lock,
  Unlock,
  Radio,
  Move,
  Compass,
  Layers,
  Sliders,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Minimize2
} from 'lucide-react-native';

export type MouseViewMode = 'split' | 'fullscreen_trackpad' | 'fullscreen_gyro';

interface TouchpadProps {
  sensitivity: number;
  scrollSpeed: number;
  hapticEnabled: boolean;
  tapToClick: boolean;
  acceleration?: boolean;
  initialMode?: MouseViewMode;
  isImmersive?: boolean;
  onToggleImmersive?: () => void;
}

export const Touchpad: React.FC<TouchpadProps> = ({
  sensitivity,
  scrollSpeed,
  hapticEnabled,
  tapToClick,
  acceleration = true,
  initialMode,
  isImmersive,
  onToggleImmersive
}) => {
  const { colors, isDark } = useTheme();

  // Active view layout mode
  const [viewMode, setViewMode] = useState<MouseViewMode>(initialMode || 'split');

  // Load saved view mode on mount if not provided as prop
  useEffect(() => {
    if (!initialMode) {
      StorageService.getPreferences().then(prefs => {
        if (prefs.mouseViewMode) {
          setViewMode(prefs.mouseViewMode);
        }
      });
    }
  }, [initialMode]);

  const changeViewMode = (mode: MouseViewMode) => {
    triggerHaptic(hapticEnabled, 'light');
    setViewMode(mode);
    StorageService.savePreferences({ mouseViewMode: mode });
  };

  // Touchpad state
  const [isTouching, setIsTouching] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [touchCoords, setTouchCoords] = useState<{ x: number; y: number } | null>(null);

  // Motion / Gyro Air Mouse state
  const [gyroEnabled, setGyroEnabled] = useState(false);
  const [isAirClutchActive, setIsAirClutchActive] = useState(false);
  const [gyroAngles, setGyroAngles] = useState({ pitch: 0, yaw: 0, roll: 0 });
  const isAirClutchRef = useRef(false);
  const gyroEnabledRef = useRef(false);

  // Synchronize refs for low-latency sensor loop
  useEffect(() => {
    isAirClutchRef.current = isAirClutchActive;
  }, [isAirClutchActive]);

  useEffect(() => {
    gyroEnabledRef.current = gyroEnabled;
  }, [gyroEnabled]);

  // Touch gesture physics refs
  const touchStartTime = useRef(0);
  const touchStartPos = useRef({ x: 0, y: 0 });
  const lastPos = useRef({ x: 0, y: 0 });
  const lastMoveTime = useRef(0);
  const touchCount = useRef(0);
  const hasMoved = useRef(false);
  const lastTapTime = useRef(0);
  const lastScrollY = useRef(0);
  const isTwoFingerScrolling = useRef(false);

  // Sub-pixel movement accumulator (prevents slow-speed precision aiming truncation)
  const subpixelDx = useRef(0);
  const subpixelDy = useRef(0);

  // Exponential Moving Average filter state (smoothing)
  const emaDx = useRef(0);
  const emaDy = useRef(0);
  const EMA_ALPHA = 0.72;

  // Scroll accumulator for ultra-smooth 2-finger and wheel scrolling
  const scrollAccumulator = useRef(0);

  // Wheel drag tracker & dynamic conveyor animation
  const wheelLastY = useRef(0);
  const wheelAccumulator = useRef(0);
  const wheelAnimOffset = useRef(new Animated.Value(0)).current;
  const currentWheelPos = useRef(0);

  // Gyroscope Air Mouse setup with Natural 3D Sensor Fusion & Dynamic Power Curve
  useEffect(() => {
    Gyroscope.setUpdateInterval(16); // 16ms ~ 60 FPS

    let lastSensorTime = Date.now();
    let pitchAccum = 0;
    let yawAccum = 0;
    let rollAccum = 0;

    const subscription = Gyroscope.addListener(gyroData => {
      const { x, y, z } = gyroData;
      const now = Date.now();
      const dt = Math.min(0.05, (now - lastSensorTime) / 1000);
      lastSensorTime = now;

      // Update orientation angles for HUD display
      pitchAccum = Math.round(x * 57.2958);
      yawAccum = Math.round(z * 57.2958);
      rollAccum = Math.round(y * 57.2958);
      setGyroAngles({ pitch: pitchAccum, yaw: yawAccum, roll: rollAccum });

      // Move if air mouse is active OR clutch button is held down
      const isSteering = gyroEnabledRef.current || isAirClutchRef.current || viewMode === 'fullscreen_gyro';
      if (!isSteering) return;

      // Natural 3D Sensor Fusion:
      // Tilting top of phone up/down:
      // On monitor coordinate space: dy < 0 is UP, dy > 0 is DOWN.
      // On Android gyro: tilting top up gives x < 0. We want dy < 0, so dy ~ x.
      // Tilting top down gives x > 0. We want dy > 0, so dy ~ x.
      const fusedVertical = x * 1.05;

      // Turning wrist left/right:
      // On monitor coordinate space: dx > 0 is RIGHT, dx < 0 is LEFT.
      // On Android gyro: turning wrist right gives z < 0 and y < 0.
      // So dx ~ -(z * 0.95 + y * 0.75).
      const fusedHorizontal = -(z * 0.95 + y * 0.75);

      const absH = Math.abs(fusedHorizontal);
      const absV = Math.abs(fusedVertical);

      // Noise floor deadzone filter: eliminate resting hand micro-jitter
      const NOISE_FLOOR = 0.015;

      // Smooth non-linear curve (power curve) with velocity boost:
      const applyCurve = (val: number, absVal: number) => {
        if (absVal < NOISE_FLOOR) return 0;
        const normalized = Math.min(2.5, (absVal - NOISE_FLOOR) / 1.2);
        // Exponential velocity response: slow moves are precise, fast wrist flick crosses monitor
        const speedMultiplier = 1.0 + Math.pow(normalized, 1.35) * 2.8;
        return Math.sign(val) * (absVal - NOISE_FLOOR) * speedMultiplier;
      };

      const curvedH = applyCurve(fusedHorizontal, absH);
      const curvedV = applyCurve(fusedVertical, absV);

      if (curvedH === 0 && curvedV === 0) return;

      // Air mouse sensitivity multiplier: 75.0 gives instant, natural, responsive cursor feel
      const SENS_BASE = 75.0;
      const rawDeltaX = curvedH * sensitivity * SENS_BASE;
      const rawDeltaY = curvedV * sensitivity * SENS_BASE;

      // Sub-pixel accumulator in JavaScript
      subpixelDx.current += rawDeltaX;
      subpixelDy.current += rawDeltaY;

      const intDx = Math.trunc(subpixelDx.current);
      const intDy = Math.trunc(subpixelDy.current);

      subpixelDx.current -= intDx;
      subpixelDy.current -= intDy;

      if (intDx !== 0 || intDy !== 0) {
        inputDispatcher.sendMouseMove(intDx, intDy);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [sensitivity, viewMode]);

  // Acceleration curve function for touchpad
  const applyPhysics = (rawDx: number, rawDy: number, dtMs: number): { dx: number; dy: number } => {
    emaDx.current = EMA_ALPHA * rawDx + (1 - EMA_ALPHA) * emaDx.current;
    emaDy.current = EMA_ALPHA * rawDy + (1 - EMA_ALPHA) * emaDy.current;

    const smoothDx = emaDx.current;
    const smoothDy = emaDy.current;

    // Base scale tuned for fluid edge-to-edge coverage of high-res displays
    const TRACKPAD_BASE_SCALE = 1.45;

    if (!acceleration) {
      return {
        dx: smoothDx * sensitivity * TRACKPAD_BASE_SCALE,
        dy: smoothDy * sensitivity * TRACKPAD_BASE_SCALE
      };
    }

    const distance = Math.hypot(smoothDx, smoothDy);
    const dt = Math.max(dtMs, 8);
    const velocity = distance / dt;

    let accelFactor = 1.0;
    if (velocity < 0.12) {
      accelFactor = 0.75;
    } else if (velocity > 1.2) {
      accelFactor = Math.min(3.4, 1.0 + Math.pow(velocity - 1.0, 1.25) * 1.8);
    } else {
      accelFactor = 0.75 + ((velocity - 0.12) / (1.2 - 0.12)) * 0.35;
    }

    return {
      dx: smoothDx * sensitivity * accelFactor * TRACKPAD_BASE_SCALE,
      dy: smoothDy * sensitivity * accelFactor * TRACKPAD_BASE_SCALE
    };
  };

  // PanResponder for Main Touchpad Area
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (evt: any) => {
        const touches = evt.nativeEvent.touches;
        const now = Date.now();
        touchCount.current = touches.length;
        touchStartTime.current = now;
        lastMoveTime.current = now;
        hasMoved.current = false;
        isTwoFingerScrolling.current = touches.length === 2;
        emaDx.current = 0;
        emaDy.current = 0;
        scrollAccumulator.current = 0;
        setIsTouching(true);

        if (touches.length === 1) {
          const x = touches[0].locationX || touches[0].pageX;
          const y = touches[0].locationY || touches[0].pageY;
          touchStartPos.current = { x: touches[0].pageX, y: touches[0].pageY };
          lastPos.current = { x: touches[0].pageX, y: touches[0].pageY };
          setTouchCoords({ x, y });
        } else if (touches.length === 2) {
          lastScrollY.current = (touches[0].pageY + touches[1].pageY) / 2;
        }
      },

      onPanResponderMove: (evt: any) => {
        const touches = evt.nativeEvent.touches;
        const now = Date.now();
        const dt = now - lastMoveTime.current;
        lastMoveTime.current = now;

        if (touches.length === 1) {
          // If user was two-finger scrolling and released 1 finger first, avoid cursor jumping
          if (isTwoFingerScrolling.current) return;

          const curX = touches[0].pageX;
          const curY = touches[0].pageY;
          const rawDx = curX - lastPos.current.x;
          const rawDy = curY - lastPos.current.y;

          if (Math.hypot(curX - touchStartPos.current.x, curY - touchStartPos.current.y) > 4) {
            hasMoved.current = true;
          }

          lastPos.current = { x: curX, y: curY };
          const locX = touches[0].locationX || touches[0].pageX;
          const locY = touches[0].locationY || touches[0].pageY;
          setTouchCoords({ x: locX, y: locY });

          const { dx, dy } = applyPhysics(rawDx, rawDy, dt);
          inputDispatcher.sendMouseMove(dx, dy);
        } else if (touches.length === 2) {
          hasMoved.current = true;
          isTwoFingerScrolling.current = true;
          const curScrollY = (touches[0].pageY + touches[1].pageY) / 2;

          // Handle seamless 1-to-2 finger touch transition
          if (touchCount.current !== 2) {
            touchCount.current = 2;
            lastScrollY.current = curScrollY;
            scrollAccumulator.current = 0;
            return;
          }

          const rawDeltaY = lastScrollY.current - curScrollY;
          lastScrollY.current = curScrollY;

          // Continuous fractional scroll accumulation
          scrollAccumulator.current += rawDeltaY * scrollSpeed * 0.32;

          const NOTCH = 1.0;
          if (Math.abs(scrollAccumulator.current) >= NOTCH) {
            const steps = Math.trunc(scrollAccumulator.current / NOTCH);
            scrollAccumulator.current -= steps * NOTCH;
            triggerHaptic(hapticEnabled, 'light');
            // Swiping fingers UP pushes page up (scroll down = -steps)
            inputDispatcher.sendMouseScroll(-steps);
          }
        }
      },

      onPanResponderRelease: () => {
        setIsTouching(false);
        setTouchCoords(null);
        scrollAccumulator.current = 0;
        const duration = Date.now() - touchStartTime.current;
        const now = Date.now();

        // Release 2-finger scroll cleanly without false tap clicks
        if (isTwoFingerScrolling.current) {
          isTwoFingerScrolling.current = false;
          return;
        }

        if (!hasMoved.current && duration < 240 && tapToClick) {
          if (touchCount.current === 1) {
            if (now - lastTapTime.current < 280) {
              triggerHaptic(hapticEnabled, 'medium');
              inputDispatcher.sendMouseClick('left', true);
              lastTapTime.current = 0;
            } else {
              triggerHaptic(hapticEnabled, 'light');
              inputDispatcher.sendMouseClick('left');
              lastTapTime.current = now;
            }
          } else if (touchCount.current === 2) {
            triggerHaptic(hapticEnabled, 'medium');
            inputDispatcher.sendMouseClick('right');
          }
        }

        if (isDragging) {
          setIsDragging(false);
          inputDispatcher.sendMouseButton('left', false);
        }
      }
    })
  ).current;

  // Center & Side Scroll Wheel PanResponder with tactile moving conveyor animation
  const wheelPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (evt: any) => {
        wheelLastY.current = evt.nativeEvent.pageY;
        wheelAccumulator.current = 0;
        triggerHaptic(hapticEnabled, 'light');
      },

      onPanResponderMove: (evt: any) => {
        const curY = evt.nativeEvent.pageY;
        const delta = wheelLastY.current - curY;
        wheelLastY.current = curY;
        wheelAccumulator.current += delta;

        // Animate the wheel conveyor translation (looping within 18px range)
        currentWheelPos.current = (currentWheelPos.current - delta * 0.9) % 18;
        wheelAnimOffset.setValue(currentWheelPos.current);

        // Responsive 8px notch drag
        const STEP = 8;
        if (Math.abs(wheelAccumulator.current) >= STEP) {
          const steps = Math.trunc(wheelAccumulator.current / STEP);
          wheelAccumulator.current -= steps * STEP;
          triggerHaptic(hapticEnabled, 'light');
          inputDispatcher.sendMouseScroll(steps * Math.max(1, Math.round(scrollSpeed)));
        }
      },

      onPanResponderRelease: () => {
        wheelAccumulator.current = 0;
        Animated.spring(wheelAnimOffset, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 4,
          speed: 12
        }).start(() => {
          currentWheelPos.current = 0;
        });
      }
    })
  ).current;

  const handleLeftClick = () => {
    triggerHaptic(hapticEnabled, 'light');
    inputDispatcher.sendMouseClick('left');
  };

  const handleRightClick = () => {
    triggerHaptic(hapticEnabled, 'light');
    inputDispatcher.sendMouseClick('right');
  };

  const handleMiddleClick = () => {
    triggerHaptic(hapticEnabled, 'medium');
    inputDispatcher.sendMouseClick('middle');
  };

  const toggleDrag = () => {
    const nextDrag = !isDragging;
    setIsDragging(nextDrag);
    triggerHaptic(hapticEnabled, 'heavy');
    inputDispatcher.sendMouseButton('left', nextDrag);
  };

  const toggleGyroMode = () => {
    const next = !gyroEnabled;
    setGyroEnabled(next);
    triggerHaptic(hapticEnabled, 'medium');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 0. TOP VIEW MODE SELECTOR PILLS */}
      <View style={[styles.modeSelectorBar, { backgroundColor: isDark ? '#0b0f19' : '#f1f5f9' }]}>
        <TouchableOpacity
          style={[
            styles.modePill,
            viewMode === 'split' && [styles.modePillActive, { backgroundColor: colors.accent }]
          ]}
          onPress={() => changeViewMode('split')}
          activeOpacity={0.8}
        >
          <Layers size={13} color={viewMode === 'split' ? (isDark ? '#000000' : '#ffffff') : colors.textSecondary} />
          <Text
            style={[
              styles.modePillText,
              { color: viewMode === 'split' ? (isDark ? '#000000' : '#ffffff') : colors.textSecondary }
            ]}
          >
            Split View
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.modePill,
            viewMode === 'fullscreen_trackpad' && [styles.modePillActive, { backgroundColor: colors.accent }]
          ]}
          onPress={() => changeViewMode('fullscreen_trackpad')}
          activeOpacity={0.8}
        >
          <Mouse size={13} color={viewMode === 'fullscreen_trackpad' ? (isDark ? '#000000' : '#ffffff') : colors.textSecondary} />
          <Text
            style={[
              styles.modePillText,
              { color: viewMode === 'fullscreen_trackpad' ? (isDark ? '#000000' : '#ffffff') : colors.textSecondary }
            ]}
          >
            Full Trackpad
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.modePill,
            viewMode === 'fullscreen_gyro' && [styles.modePillActive, { backgroundColor: '#10b981' }]
          ]}
          onPress={() => changeViewMode('fullscreen_gyro')}
          activeOpacity={0.8}
        >
          <Radio size={13} color={viewMode === 'fullscreen_gyro' ? '#ffffff' : colors.textSecondary} />
          <Text
            style={[
              styles.modePillText,
              { color: viewMode === 'fullscreen_gyro' ? '#ffffff' : colors.textSecondary }
            ]}
          >
            Full Air Mouse
          </Text>
        </TouchableOpacity>

        {onToggleImmersive && (
          <TouchableOpacity
            style={[
              styles.modePill,
              styles.immersivePill,
              isImmersive && [styles.modePillActive, { backgroundColor: colors.accent }]
            ]}
            onPress={onToggleImmersive}
            activeOpacity={0.8}
          >
            {isImmersive ? (
              <Minimize2 size={12} color={isDark ? '#000000' : '#ffffff'} />
            ) : (
              <Maximize2 size={12} color={colors.textSecondary} />
            )}
            <Text
              style={[
                styles.modePillText,
                { color: isImmersive ? (isDark ? '#000000' : '#ffffff') : colors.textSecondary }
              ]}
            >
              {isImmersive ? 'Show Menu' : 'Hide Menu'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ========================================================================= */}
      {/* MODE 1: FULL SCREEN GYRO AIR MOUSE (SPLIT LEFT & RIGHT CLICK HALVES)     */}
      {/* ========================================================================= */}
      {viewMode === 'fullscreen_gyro' && (
        <View style={styles.fullGyroContainer}>
          {/* Main Interactive Split Deck: Left Click Half | Center Scroll & Reticle | Right Click Half */}
          <View style={styles.fullGyroBody}>
            {/* Massive Left Click Half */}
            <TouchableOpacity
              style={[
                styles.gyroHalfBtn,
                styles.gyroHalfBtnLeft,
                {
                  backgroundColor: isDark ? '#080d1a' : '#f8fafc',
                  borderColor: colors.accent
                }
              ]}
              activeOpacity={0.65}
              onPressIn={() => {
                triggerHaptic(hapticEnabled, 'light');
                inputDispatcher.sendMouseButton('left', true);
              }}
              onPressOut={() => {
                inputDispatcher.sendMouseButton('left', false);
              }}
            >
              <View style={[styles.gyroHalfIndicatorStripe, { backgroundColor: colors.accent }]} />
              <MousePointerClick size={28} color={colors.accent} />
              <Text style={[styles.gyroHalfLetter, { color: colors.accent }]}>LEFT</Text>
              <Text style={[styles.gyroHalfSubtext, { color: colors.textSecondary }]}>TAP OR HOLD TO CLICK</Text>
            </TouchableOpacity>

            {/* Central Vertical Divider: Scroll Column & Gyro Horizon Reticle */}
            <View style={styles.gyroCenterColumn}>
              {/* Top Scroll Strip */}
              <View
                style={[
                  styles.gyroScrollStrip,
                  {
                    backgroundColor: isDark ? '#0b0f19' : '#f1f5f9',
                    borderColor: colors.accent
                  }
                ]}
                {...wheelPanResponder.panHandlers}
              >
                <ChevronUp size={14} color={colors.accent} />
                <Text style={[styles.gyroScrollLabel, { color: colors.accent }]}>SCROLL</Text>
                <Animated.View
                  style={[
                    styles.wheelRidgesConveyor,
                    { transform: [{ translateY: wheelAnimOffset }] }
                  ]}
                >
                  <View style={styles.wheelRidge} />
                  <View style={[styles.wheelRidge, styles.wheelRidgeActive, { backgroundColor: colors.accent }]} />
                  <View style={styles.wheelRidge} />
                  <View style={[styles.wheelRidge, styles.wheelRidgeActive, { backgroundColor: colors.accent }]} />
                </Animated.View>
                <ChevronDown size={14} color={colors.accent} />
              </View>

              {/* Central Dynamic Motion Compass / Reticle */}
              <View
                style={[
                  styles.gyroReticleCircle,
                  {
                    backgroundColor: isDark ? '#0b1120' : '#ffffff',
                    borderColor: '#10b981'
                  }
                ]}
              >
                <Compass size={20} color="#10b981" />
                <Text style={styles.gyroReticleDegrees}>
                  {gyroAngles.pitch}°
                </Text>
                <View style={styles.gyroReticleCrosshairH} />
                <View style={styles.gyroReticleCrosshairV} />
                <Text style={styles.gyroReticleFps}>60 FPS</Text>
              </View>

              {/* Middle Click Button */}
              <TouchableOpacity
                style={[
                  styles.gyroMiddleBtn,
                  { backgroundColor: isDark ? '#111827' : '#ffffff', borderColor: colors.border }
                ]}
                onPress={handleMiddleClick}
                activeOpacity={0.7}
              >
                <Text style={[styles.gyroMiddleText, { color: colors.accent }]}>M</Text>
              </TouchableOpacity>
            </View>

            {/* Massive Right Click Half */}
            <TouchableOpacity
              style={[
                styles.gyroHalfBtn,
                styles.gyroHalfBtnRight,
                {
                  backgroundColor: isDark ? '#061314' : '#f8fafc',
                  borderColor: '#10b981'
                }
              ]}
              activeOpacity={0.65}
              onPressIn={() => {
                triggerHaptic(hapticEnabled, 'light');
                inputDispatcher.sendMouseButton('right', true);
              }}
              onPressOut={() => {
                inputDispatcher.sendMouseButton('right', false);
              }}
            >
              <View style={[styles.gyroHalfIndicatorStripe, { backgroundColor: '#10b981' }]} />
              <Mouse size={28} color="#10b981" />
              <Text style={[styles.gyroHalfLetter, { color: '#10b981' }]}>RIGHT</Text>
              <Text style={[styles.gyroHalfSubtext, { color: colors.textSecondary }]}>TAP OR HOLD TO CLICK</Text>
            </TouchableOpacity>
          </View>

          {/* Bottom Clutch Steering Trigger */}
          <TouchableOpacity
            style={[
              styles.gyroClutchBar,
              isAirClutchActive && styles.gyroClutchBarActive,
              { borderColor: isAirClutchActive ? '#10b981' : colors.accent }
            ]}
            activeOpacity={0.8}
            onPressIn={() => {
              setIsAirClutchActive(true);
              triggerHaptic(hapticEnabled, 'medium');
            }}
            onPressOut={() => {
              setIsAirClutchActive(false);
              triggerHaptic(hapticEnabled, 'light');
            }}
          >
            <Move size={18} color={isAirClutchActive ? '#10b981' : colors.accent} />
            <Text style={[styles.gyroClutchText, { color: isAirClutchActive ? '#10b981' : colors.accent }]}>
              {isAirClutchActive ? 'STEERING MOTION ACTIVE' : 'HOLD TO RE-CENTER / STEER'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ========================================================================= */}
      {/* MODE 2: FULL SCREEN EDGE-TO-EDGE TRACKPAD                                 */}
      {/* ========================================================================= */}
      {viewMode === 'fullscreen_trackpad' && (
        <View style={styles.fullTrackpadContainer}>
          {/* Main Giant Touch Surface with Right-Edge Scroll Strip */}
          <View style={styles.fullTrackpadRow}>
            {/* Touchpad Canvas */}
            <View
              style={[
                styles.touchpad,
                styles.touchpadFullScreen,
                {
                  backgroundColor: colors.touchpadSurface,
                  borderColor: isTouching ? colors.accent : colors.touchpadBorder
                }
              ]}
              {...panResponder.panHandlers}
            >
              {/* Subtle crosshair grid overlay */}
              <View style={styles.crosshairCenter}>
                <Text style={[styles.crosshairPlus, { color: 'rgba(255, 255, 255, 0.15)' }]}>+</Text>
                <Text style={[styles.crosshairPlus, { color: 'rgba(255, 255, 255, 0.15)', marginTop: 40 }]}>+</Text>
                <Text style={[styles.touchpadSurfaceLabel, { color: colors.textSecondary }]}>
                  EDGE-TO-EDGE TRACKPAD
                </Text>
                <Text style={[styles.touchpadGestureHint, { color: colors.textMuted }]}>
                  1-Finger Move • Tap Click • 2-Finger Scroll / Right Click
                </Text>
              </View>

              {/* Corner brackets */}
              <View style={[styles.cornerTL, { borderColor: isDark ? '#334155' : '#cbd5e1' }]} />
              <View style={[styles.cornerTR, { borderColor: isDark ? '#334155' : '#cbd5e1' }]} />
              <View style={[styles.cornerBL, { borderColor: isDark ? '#334155' : '#cbd5e1' }]} />
              <View style={[styles.cornerBR, { borderColor: isDark ? '#334155' : '#cbd5e1' }]} />
            </View>
          </View>

          {/* Bottom Streamlined Mouse Bar */}
          <View style={styles.fullTrackpadBottomBar}>
            <TouchableOpacity
              style={[
                styles.fullTrackpadBottomBtn,
                { backgroundColor: isDark ? '#111827' : '#ffffff', borderColor: colors.accent }
              ]}
              onPress={handleLeftClick}
              activeOpacity={0.7}
            >
              <MousePointerClick size={16} color={colors.accent} />
              <Text style={[styles.fullTrackpadBottomBtnText, { color: colors.accent }]}>Left</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.fullTrackpadBottomBtn,
                {
                  backgroundColor: isDark ? '#111827' : '#ffffff',
                  borderColor: isDragging ? colors.warning : colors.border
                }
              ]}
              onPress={toggleDrag}
              activeOpacity={0.7}
            >
              {isDragging ? (
                <Lock size={15} color={colors.warning} />
              ) : (
                <Unlock size={15} color={colors.textSecondary} />
              )}
              <Text
                style={[
                  styles.fullTrackpadBottomBtnText,
                  { color: isDragging ? colors.warning : colors.textSecondary }
                ]}
              >
                {isDragging ? 'Locked' : 'Drag'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.fullTrackpadBottomBtn,
                { backgroundColor: isDark ? '#111827' : '#ffffff', borderColor: colors.border }
              ]}
              onPress={handleMiddleClick}
              activeOpacity={0.7}
            >
              <Text style={[styles.fullTrackpadBottomBtnText, { color: colors.textSecondary }]}>Middle</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.fullTrackpadBottomBtn,
                { backgroundColor: isDark ? '#111827' : '#ffffff', borderColor: colors.accent }
              ]}
              onPress={handleRightClick}
              activeOpacity={0.7}
            >
              <Mouse size={16} color={colors.accent} />
              <Text style={[styles.fullTrackpadBottomBtnText, { color: colors.accent }]}>Right</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ========================================================================= */}
      {/* MODE 3: SPLIT VIEW (HYBRID DECK + GYRO CARD + LOWER TRACKPAD)             */}
      {/* ========================================================================= */}
      {viewMode === 'split' && (
        <>
          {/* 1. TOP REAL-MOUSE DECK: Left Click | Scroll Wheel & Middle Click | Right Click */}
          <View style={styles.mouseHeadDeck}>
            {/* Large Left Click Button */}
            <TouchableOpacity
              style={[
                styles.mouseClickBtn,
                {
                  backgroundColor: isDark ? '#111827' : '#ffffff',
                  borderColor: colors.accent
                }
              ]}
              activeOpacity={0.7}
              onPress={handleLeftClick}
            >
              <View style={styles.topIndicatorStripe} />
              <Text style={[styles.clickLetter, { color: colors.accent }]}>L</Text>
              <View style={styles.clickLabelRow}>
                <MousePointerClick size={14} color={colors.accent} />
                <Text style={[styles.clickSubtext, { color: colors.textSecondary }]}>Left Click</Text>
              </View>
            </TouchableOpacity>

            {/* Center Utility Buttons (Middle Click & Drag Lock) */}
            <View style={styles.centerWheelActions}>
              <TouchableOpacity
                style={[
                  styles.wheelMiniBtn,
                  { backgroundColor: isDark ? '#111827' : '#ffffff', borderColor: colors.border }
                ]}
                activeOpacity={0.7}
                onPress={handleMiddleClick}
              >
                <Text style={[styles.wheelMiniText, { color: colors.accent }]}>M</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.wheelMiniBtn,
                  {
                    backgroundColor: isDark ? '#111827' : '#ffffff',
                    borderColor: isDragging ? colors.warning : colors.border
                  }
                ]}
                activeOpacity={0.7}
                onPress={toggleDrag}
              >
                {isDragging ? (
                  <Lock size={12} color={colors.warning} />
                ) : (
                  <Unlock size={12} color={colors.textSecondary} />
                )}
              </TouchableOpacity>
            </View>

            {/* Large Right Click Button */}
            <TouchableOpacity
              style={[
                styles.mouseClickBtn,
                {
                  backgroundColor: isDark ? '#111827' : '#ffffff',
                  borderColor: colors.accent
                }
              ]}
              activeOpacity={0.7}
              onPress={handleRightClick}
            >
              <View style={styles.topIndicatorStripe} />
              <Text style={[styles.clickLetter, { color: colors.accent }]}>R</Text>
              <View style={styles.clickLabelRow}>
                <Mouse size={14} color={colors.accent} />
                <Text style={[styles.clickSubtext, { color: colors.textSecondary }]}>Right Click</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* 2. PHYSICAL MOTION / GYRO AIR MOUSE CARD */}
          <View
            style={[
              styles.motionCard,
              {
                backgroundColor: isDark ? '#111827' : '#ffffff',
                borderColor: gyroEnabled || isAirClutchActive ? colors.accent : colors.border
              }
            ]}
          >
            <View style={styles.motionHeaderRow}>
              <View style={styles.motionTitleGroup}>
                <Radio size={16} color={gyroEnabled ? '#10b981' : colors.accent} />
                <Text style={[styles.motionTitleText, { color: colors.textPrimary }]}>
                  Gyro Air Mouse
                </Text>
                <View
                  style={[
                    styles.fpsBadge,
                    {
                      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ecfdf5',
                      borderColor: '#10b981'
                    }
                  ]}
                >
                  <Text style={styles.fpsBadgeText}>60 FPS</Text>
                </View>
              </View>

              {/* Toggle Button: Always-on Gyro */}
              <TouchableOpacity
                style={[
                  styles.gyroToggleBtn,
                  {
                    backgroundColor: gyroEnabled ? '#10b981' : isDark ? '#1e293b' : '#e2e8f0',
                    borderColor: gyroEnabled ? '#10b981' : colors.border
                  }
                ]}
                onPress={toggleGyroMode}
                activeOpacity={0.8}
              >
                <Text style={[styles.gyroToggleText, { color: gyroEnabled ? '#ffffff' : colors.textSecondary }]}>
                  {gyroEnabled ? 'ON' : 'OFF'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* PTT / Hold-to-Steer Clutch Trigger Button */}
            <TouchableOpacity
              style={[
                styles.airClutchTrigger,
                isAirClutchActive && styles.airClutchTriggerActive,
                { borderColor: isAirClutchActive ? '#10b981' : colors.accent }
              ]}
              activeOpacity={0.8}
              onPressIn={() => {
                setIsAirClutchActive(true);
                triggerHaptic(hapticEnabled, 'medium');
              }}
              onPressOut={() => {
                setIsAirClutchActive(false);
                triggerHaptic(hapticEnabled, 'light');
              }}
            >
              <Move size={16} color={isAirClutchActive ? '#10b981' : colors.accent} />
              <Text style={[styles.airClutchTextMain, { color: isAirClutchActive ? '#10b981' : colors.accent }]}>
                {isAirClutchActive ? 'STEERING CURSOR WITH MOTION' : 'HOLD TO STEER CURSOR'}
              </Text>
              <Text style={[styles.airClutchTextSub, { color: colors.textSecondary }]}>
                Tilt phone physically to guide pointer • Release to reposition
              </Text>
            </TouchableOpacity>
          </View>

          {/* 3. MAIN TOUCHPAD / HYBRID TRACKING SURFACE */}
          <View
            style={[
              styles.touchpad,
              {
                backgroundColor: colors.touchpadSurface,
                borderColor: colors.touchpadBorder
              },
              isTouching && { borderColor: colors.accent, shadowColor: colors.accent, elevation: 8 }
            ]}
            {...panResponder.panHandlers}
          >
            {/* Subtle crosshair grid overlay */}
            <View style={styles.crosshairCenter}>
              <Text style={[styles.crosshairPlus, { color: 'rgba(255, 255, 255, 0.15)' }]}>+</Text>
              <Text style={[styles.crosshairPlus, { color: 'rgba(255, 255, 255, 0.15)', marginTop: 40 }]}>+</Text>
              <Text style={[styles.touchpadSurfaceLabel, { color: colors.textSecondary }]}>
                SWIPE TO MOVE CURSOR
              </Text>
            </View>

            {/* Precision corner brackets */}
            <View style={[styles.cornerTL, { borderColor: isDark ? '#334155' : '#cbd5e1' }]} />
            <View style={[styles.cornerTR, { borderColor: isDark ? '#334155' : '#cbd5e1' }]} />
            <View style={[styles.cornerBL, { borderColor: isDark ? '#334155' : '#cbd5e1' }]} />
            <View style={[styles.cornerBR, { borderColor: isDark ? '#334155' : '#cbd5e1' }]} />
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 12,
    gap: 8
  },

  /* 0. TOP VIEW MODE SELECTOR BAR */
  modeSelectorBar: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 3,
    gap: 4
  },
  modePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 10,
    gap: 5
  },
  modePillActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2
  },
  modePillText: {
    fontSize: 11,
    fontWeight: '700'
  },
  immersivePill: {
    flex: 0.9,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)'
  },

  /* ========================================================================= */
  /* FULL GYRO AIR MOUSE STYLES                                               */
  /* ========================================================================= */
  fullGyroContainer: {
    flex: 1,
    gap: 8
  },
  fullGyroBody: {
    flex: 1,
    flexDirection: 'row',
    gap: 8
  },
  gyroHalfBtn: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    position: 'relative',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4
  },
  gyroHalfBtnLeft: {
    shadowColor: '#06b6d4'
  },
  gyroHalfBtnRight: {
    shadowColor: '#10b981'
  },
  gyroHalfIndicatorStripe: {
    position: 'absolute',
    top: 0,
    left: '25%',
    width: '50%',
    height: 4,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4
  },
  gyroHalfLetter: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 12
  },
  gyroHalfSubtext: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 6,
    textAlign: 'center'
  },
  gyroCenterColumn: {
    width: 60,
    alignItems: 'center',
    gap: 8
  },
  gyroScrollStrip: {
    flex: 1,
    width: '100%',
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10
  },
  gyroScrollLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  gyroReticleCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4
  },
  gyroReticleCrosshairH: {
    position: 'absolute',
    width: '80%',
    height: 1,
    backgroundColor: 'rgba(16, 185, 129, 0.25)'
  },
  gyroReticleCrosshairV: {
    position: 'absolute',
    width: 1,
    height: '80%',
    backgroundColor: 'rgba(16, 185, 129, 0.25)'
  },
  gyroReticleDegrees: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10b981',
    marginTop: 2
  },
  gyroReticleFps: {
    fontSize: 7,
    fontWeight: '700',
    color: '#10b981',
    letterSpacing: 0.5
  },
  gyroMiddleBtn: {
    width: '100%',
    height: 32,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center'
  },
  gyroMiddleText: {
    fontSize: 13,
    fontWeight: '800'
  },
  gyroClutchBar: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(6, 182, 212, 0.08)'
  },
  gyroClutchBarActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)'
  },
  gyroClutchText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1
  },

  /* ========================================================================= */
  /* FULL TRACKPAD STYLES                                                      */
  /* ========================================================================= */
  fullTrackpadContainer: {
    flex: 1,
    gap: 8
  },
  fullTrackpadRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 6
  },
  touchpadFullScreen: {
    flex: 1
  },
  edgeScrollStrip: {
    width: 22,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8
  },
  edgeScrollIndicator: {
    width: 6,
    height: 36,
    borderRadius: 3
  },
  touchpadGestureHint: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 6
  },
  fullTrackpadBottomBar: {
    flexDirection: 'row',
    gap: 6,
    height: 46
  },
  fullTrackpadBottomBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  fullTrackpadBottomBtnText: {
    fontSize: 12,
    fontWeight: '700'
  },

  /* ========================================================================= */
  /* SPLIT VIEW DECK STYLES                                                    */
  /* ========================================================================= */
  mouseHeadDeck: {
    flexDirection: 'row',
    height: 120,
    gap: 8
  },
  mouseClickBtn: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#06b6d4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4
  },
  topIndicatorStripe: {
    position: 'absolute',
    top: 0,
    left: '20%',
    width: '60%',
    height: 4,
    backgroundColor: '#06b6d4',
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4
  },
  clickLetter: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1
  },
  clickLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4
  },
  clickSubtext: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  scrollWheelCol: {
    width: 60,
    alignItems: 'center',
    gap: 6
  },
  scrollWheelCylinder: {
    flex: 1,
    width: '100%',
    borderRadius: 14,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 4,
    overflow: 'hidden',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3
  },
  wheelRidgesConveyor: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 80,
    gap: 6
  },
  wheelRidge: {
    width: '65%',
    height: 3,
    borderRadius: 2,
    backgroundColor: '#475569'
  },
  wheelRidgeActive: {
    height: 4
  },
  centerWheelActions: {
    flexDirection: 'row',
    width: '100%',
    gap: 4
  },
  wheelMiniBtn: {
    flex: 1,
    height: 26,
    borderRadius: 8,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center'
  },
  wheelMiniText: {
    fontSize: 11,
    fontWeight: '800'
  },

  /* MOTION CARD */
  motionCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 10,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2
  },
  motionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  motionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  motionTitleText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3
  },
  fpsBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1
  },
  fpsBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#10b981'
  },
  gyroToggleBtn: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1.5
  },
  gyroToggleText: {
    fontSize: 11,
    fontWeight: '800'
  },
  airClutchTrigger: {
    borderRadius: 10,
    borderWidth: 1.5,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: 'rgba(6, 182, 212, 0.06)'
  },
  airClutchTriggerActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)'
  },
  airClutchTextMain: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8
  },
  airClutchTextSub: {
    fontSize: 9,
    fontWeight: '600'
  },

  /* MAIN TOUCHPAD */
  touchpad: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 2,
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center'
  },
  crosshairCenter: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  crosshairPlus: {
    fontSize: 20,
    fontWeight: '200'
  },
  touchpadSurfaceLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 8
  },
  touchIndicator: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center'
  },
  touchIndicatorCore: {
    width: 14,
    height: 14,
    borderRadius: 7
  },
  cornerTL: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 14,
    height: 14,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderTopLeftRadius: 4
  },
  cornerTR: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 14,
    height: 14,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderTopRightRadius: 4
  },
  cornerBL: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    width: 14,
    height: 14,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderBottomLeftRadius: 4
  },
  cornerBR: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 14,
    height: 14,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderBottomRightRadius: 4
  }
});
