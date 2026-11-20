import { NativeModules, Platform } from 'react-native';

export interface InstallerInfo {
  name: string;
  version: string;
  architecture: string;
  file: string;
  size: number;
  sha256: string;
}

export interface SaveResult {
  cancelled: boolean;
  uri?: string;
  fileName?: string;
  bytes?: number;
}

const { InstallerModule } = NativeModules;

export class InstallerService {
  static isAvailable(): boolean {
    return Platform.OS === 'android' && Boolean(InstallerModule);
  }

  static async getInfo(): Promise<InstallerInfo | null> {
    if (!InstallerModule) return null;
    try {
      return await InstallerModule.getInstallerInfo();
    } catch {
      return null;
    }
  }

  static async saveToDownloads(): Promise<SaveResult> {
    if (!InstallerModule) {
      throw new Error('Installer transfer is only available in the Android app.');
    }
    return InstallerModule.saveToDownloads();
  }

  static async shareInstaller(): Promise<boolean> {
    if (!InstallerModule) {
      throw new Error('Installer sharing is only available in the Android app.');
    }
    return InstallerModule.shareInstaller();
  }

  static formatSize(bytes: number): string {
    if (!bytes || bytes <= 0) return 'unknown size';
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  }
}
