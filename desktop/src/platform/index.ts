import os from 'node:os';
import { InputBackend } from './InputBackend';
import { LinuxBackend } from './LinuxBackend';
import { WindowsBackend } from './WindowsBackend';

export function createInputBackend(): InputBackend {
  const platform = os.platform();
  if (platform === 'linux') {
    return new LinuxBackend();
  } else if (platform === 'win32') {
    return new WindowsBackend();
  } else {
    console.warn(`Platform ${platform} is not officially supported yet. Defaulting to Linux backend.`);
    return new LinuxBackend();
  }
}

export * from './InputBackend';
export * from './LinuxBackend';
export * from './WindowsBackend';
