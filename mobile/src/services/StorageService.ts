import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppThemeMode = 'oled' | 'dark' | 'light';

export interface UserPreferences {
  sensitivity: number;
  scrollSpeed: number;
  hapticEnabled: boolean;
  tapToClick: boolean;
  darkTheme: boolean;
  themeMode: AppThemeMode;
  acceleration: boolean;
  autoReconnect: boolean;
  mouseViewMode?: 'split' | 'fullscreen_trackpad' | 'fullscreen_gyro';
}

export interface SavedPC {
  id: string;
  name: string;
  host: string;
  port: number;
  pin?: string;
  token?: string;
  lastConnected: number;
}

const PREFS_KEY = '@pocketinput_preferences';
const SAVED_PCS_KEY = '@pocketinput_saved_pcs';
const ONBOARDING_KEY = '@pocketinput_onboarding';

export interface OnboardingState {
  completed: boolean;
  steps: Record<string, boolean>;
  updatedAt: number;
}

export const defaultOnboarding: OnboardingState = {
  completed: false,
  steps: {},
  updatedAt: 0
};

export const defaultPreferences: UserPreferences = {
  sensitivity: 1.8,
  scrollSpeed: 1.2,
  hapticEnabled: true,
  tapToClick: true,
  darkTheme: true,
  themeMode: 'oled',
  acceleration: true,
  autoReconnect: true,
  mouseViewMode: 'fullscreen_trackpad'
};

export class StorageService {
  static async getPreferences(): Promise<UserPreferences> {
    try {
      const data = await AsyncStorage.getItem(PREFS_KEY);
      if (data) {
        return { ...defaultPreferences, ...JSON.parse(data) };
      }
    } catch (e) {
      console.warn('Failed to load preferences from storage', e);
    }
    return defaultPreferences;
  }

  static async savePreferences(prefs: Partial<UserPreferences>): Promise<UserPreferences> {
    try {
      const current = await this.getPreferences();
      const updated = { ...current, ...prefs };
      await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(updated));
      return updated;
    } catch (e) {
      console.warn('Failed to save preferences', e);
      return defaultPreferences;
    }
  }

  static async getSavedPCs(): Promise<SavedPC[]> {
    try {
      const data = await AsyncStorage.getItem(SAVED_PCS_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.warn('Failed to load saved PCs', e);
    }
    return [];
  }

  static async savePC(pc: SavedPC): Promise<void> {
    try {
      const pcs = await this.getSavedPCs();
      const filtered = pcs.filter(item => item.host !== pc.host);
      filtered.unshift(pc);
      await AsyncStorage.setItem(SAVED_PCS_KEY, JSON.stringify(filtered.slice(0, 10)));
    } catch (e) {
      console.warn('Failed to save PC', e);
    }
  }

  static async removePC(id: string): Promise<void> {
    try {
      const pcs = await this.getSavedPCs();
      const filtered = pcs.filter(item => item.id !== id);
      await AsyncStorage.setItem(SAVED_PCS_KEY, JSON.stringify(filtered));
    } catch (e) {
      console.warn('Failed to remove PC', e);
    }
  }

  // USB/localhost entries only work while the ADB tunnel is up — drop them so
  // they don't pollute the Saved Computers list.
  static async removeLocalPCs(): Promise<void> {
    try {
      const pcs = await this.getSavedPCs();
      const filtered = pcs.filter(pc => pc.host !== '127.0.0.1' && pc.host !== 'localhost');
      if (filtered.length !== pcs.length) {
        await AsyncStorage.setItem(SAVED_PCS_KEY, JSON.stringify(filtered));
      }
    } catch (e) {
      console.warn('Failed to clean local PC entries', e);
    }
  }

  static async getOnboarding(): Promise<OnboardingState> {
    try {
      const data = await AsyncStorage.getItem(ONBOARDING_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        return { ...defaultOnboarding, ...parsed, steps: { ...(parsed.steps || {}) } };
      }
    } catch (e) {
      console.warn('Failed to load onboarding state', e);
    }
    return defaultOnboarding;
  }

  static async saveOnboarding(patch: Partial<OnboardingState>): Promise<OnboardingState> {
    try {
      const current = await this.getOnboarding();
      const updated: OnboardingState = {
        ...current,
        ...patch,
        steps: { ...current.steps, ...(patch.steps || {}) },
        updatedAt: Date.now()
      };
      await AsyncStorage.setItem(ONBOARDING_KEY, JSON.stringify(updated));
      return updated;
    } catch (e) {
      console.warn('Failed to save onboarding state', e);
      return defaultOnboarding;
    }
  }

  static async setOnboardingStep(step: string, done: boolean): Promise<OnboardingState> {
    const current = await this.getOnboarding();
    return this.saveOnboarding({ steps: { ...current.steps, [step]: done } });
  }

  static async completeOnboarding(): Promise<void> {
    await this.saveOnboarding({ completed: true });
  }

  static async resetOnboarding(): Promise<void> {
    await AsyncStorage.removeItem(ONBOARDING_KEY);
  }
}
