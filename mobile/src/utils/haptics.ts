import * as Haptics from 'expo-haptics';

export async function triggerHaptic(enabled = true, type: 'light' | 'medium' | 'heavy' = 'light') {
  if (!enabled) return;
  try {
    if (type === 'light') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else if (type === 'medium') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
  } catch (e) {
    // Graceful fallback for web/simulators
  }
}
