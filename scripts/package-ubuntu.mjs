import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = process.env.KIMO_VERSION || '1.2.0';
const arch = 'amd64';
const distDir = path.join(root, 'dist');
const stage = path.join(distDir, `kimo_${version}_${arch}`);
const cacheDir = path.join(root, '.cache', 'node-runtime');
const debName = `kimo_${version}_${arch}.deb`;
const debPath = path.join(distDir, debName);

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: 'inherit', ...options });
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function copy(source, target, mode) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  if (mode) fs.chmodSync(target, mode);
}

async function download(url, target) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  const data = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(target, data);
}

async function prepareNodeRuntime() {
  if (process.env.NODE_RUNTIME_BIN) {
    const bin = process.env.NODE_RUNTIME_BIN;
    if (!fs.existsSync(bin)) throw new Error(`NODE_RUNTIME_BIN does not exist: ${bin}`);
    return { bin, license: null, version: 'custom' };
  }

  if (process.arch !== 'x64') {
    throw new Error(`This build targets ${arch}, but the build host is ${process.arch}.`);
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  const stampFile = path.join(cacheDir, 'runtime.json');
  if (fs.existsSync(stampFile)) {
    try {
      const stamp = JSON.parse(fs.readFileSync(stampFile, 'utf8'));
      if (stamp.bin && fs.existsSync(stamp.bin)) {
        return { bin: stamp.bin, license: stamp.license, version: stamp.version };
      }
    } catch {}
  }

  try {
    const indexUrl = 'https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt';
    const indexResponse = await fetch(indexUrl, { redirect: 'follow' });
    if (!indexResponse.ok) throw new Error(`HTTP ${indexResponse.status}`);
    const index = await indexResponse.text();
    const line = index
      .split('\n')
      .map((entry) => entry.trim())
      .find((entry) => /^[0-9a-f]{64}\s+node-v[\d.]+-linux-x64\.tar\.xz$/.test(entry));
    if (!line) throw new Error('Could not find the Linux x64 Node 22 tarball in SHASUMS256.txt');

    const [expectedHash, fileName] = line.split(/\s+/);
    const tarball = path.join(cacheDir, fileName);
    const distUrl = `https://nodejs.org/dist/latest-v22.x/${fileName}`;

    if (!fs.existsSync(tarball) || sha256(tarball) !== expectedHash) {
      console.log(`Downloading Node runtime: ${fileName}`);
      await download(distUrl, tarball);
    }

    const actualHash = sha256(tarball);
    if (actualHash !== expectedHash) {
      throw new Error(`Node runtime checksum mismatch: expected ${expectedHash}, got ${actualHash}`);
    }

    const extractDir = path.join(cacheDir, 'extract');
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.mkdirSync(extractDir, { recursive: true });
    run('tar', ['-xJf', tarball, '-C', extractDir]);

    const folder = fileName.replace(/\.tar\.xz$/, '');
    const bin = path.join(extractDir, folder, 'bin', 'node');
    const license = path.join(extractDir, folder, 'LICENSE');
    if (!fs.existsSync(bin)) throw new Error('Node runtime binary missing after extraction');

    const nodeVersion = folder.replace(/^node-/, '').replace(/-linux-x64$/, '');
    fs.writeFileSync(stampFile, JSON.stringify({ bin, license, version: nodeVersion }, null, 2));
    return { bin, license, version: nodeVersion };
  } catch (error) {
    console.warn(`\n⚠️ Could not download a portable Node runtime: ${error.message}`);
    console.warn('   Falling back to the build host Node binary. The resulting .deb may require');
    console.warn('   a newer glibc than older Ubuntu releases. Use NODE_RUNTIME_BIN to override.\n');
    return { bin: process.execPath, license: null, version: process.version, fallback: true };
  }
}

function writeDebianMetadata() {
  const debian = path.join(stage, 'DEBIAN');
  fs.mkdirSync(debian, { recursive: true });

  fs.writeFileSync(
    path.join(debian, 'control'),
    `Package: kimo
Version: ${version}
Section: utils
Priority: optional
Architecture: ${arch}
Depends: python3, libc6, libstdc++6
Recommends: adb, ydotool, libnotify-bin
Maintainer: kiMo contributors <noreply@example.com>
Homepage: https://github.com/anomalyco/opencode
Description: kiMo phone keyboard and mouse companion for Ubuntu
 Connect an Android phone to an Ubuntu PC over USB/ADB, Wi-Fi, or Bluetooth HID.
 This package installs the background companion, the kimo command, desktop
 autostart, and the udev rule needed for direct /dev/uinput input injection.
`,
    'utf8'
  );

  for (const script of ['postinst', 'postrm']) {
    copy(path.join(root, 'packaging', script), path.join(debian, script), 0o755);
  }
}

function stagePackage(nodeRuntime) {
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });

  copy(path.join(root, 'packaging', 'kimo'), path.join(stage, 'usr/bin/kimo'), 0o755);
  copy(path.join(root, 'desktop/build/kimo-server.cjs'), path.join(stage, 'usr/lib/kimo/kimo-server.cjs'));
  copy(path.join(root, 'desktop/build/kimo-cli.cjs'), path.join(stage, 'usr/lib/kimo/kimo-cli.cjs'));
  copy(path.join(root, 'desktop/build/uinput_daemon.py'), path.join(stage, 'usr/lib/kimo/uinput_daemon.py'));
  copy(nodeRuntime.bin, path.join(stage, 'usr/lib/kimo/runtime/node'), 0o755);

  copy(path.join(root, 'packaging/kimo-autostart.desktop'), path.join(stage, 'etc/xdg/autostart/kimo.desktop'));
  copy(path.join(root, 'packaging/kimo-status.desktop'), path.join(stage, 'usr/share/applications/kimo-status.desktop'));
  copy(path.join(root, 'packaging/99-kimo-uinput.rules'), path.join(stage, 'usr/lib/udev/rules.d/99-kimo-uinput.rules'));
  copy(path.join(root, 'packaging/kimo-modules.conf'), path.join(stage, 'etc/modules-load.d/kimo.conf'));

  copy(path.join(root, 'packaging/README.md'), path.join(stage, 'usr/share/doc/kimo/README.md'));
  copy(path.join(root, 'packaging/TROUBLESHOOTING.md'), path.join(stage, 'usr/share/doc/kimo/TROUBLESHOOTING.md'));
  fs.writeFileSync(
    path.join(stage, 'usr/share/doc/kimo/copyright'),
    `kiMo

Copyright (c) kiMo contributors.

License: MIT

The bundled Node.js runtime is distributed under the Node.js license.
See /usr/share/doc/kimo/Node-LICENSE if present.
`,
    'utf8'
  );

  if (nodeRuntime.license && fs.existsSync(nodeRuntime.license)) {
    copy(nodeRuntime.license, path.join(stage, 'usr/share/doc/kimo/Node-LICENSE'));
  }

  fs.writeFileSync(
    path.join(stage, 'usr/share/doc/kimo/BUILD-INFO'),
    `Package version: ${version}
Architecture: ${arch}
Node runtime: ${nodeRuntime.version}${nodeRuntime.fallback ? ' (host fallback)' : ''}
Built at: ${new Date().toISOString()}
`,
    'utf8'
  );

  writeDebianMetadata();
}

async function main() {
  console.log(`\nBuilding kiMo ${version} for ${arch}\n`);
  run(process.execPath, [path.join(root, 'scripts', 'build-desktop.mjs')]);

  const nodeRuntime = await prepareNodeRuntime();
  if (nodeRuntime.fallback) {
    console.warn('⚠️ Using host Node runtime fallback. Prefer a portable runtime for release.');
  }

  stagePackage(nodeRuntime);
  fs.mkdirSync(distDir, { recursive: true });
  fs.rmSync(debPath, { force: true });
  run('dpkg-deb', ['--build', '--root-owner-group', stage, debPath]);

  const digest = sha256(debPath);
  const hashFile = `${debPath}.sha256`;
  fs.writeFileSync(hashFile, `${digest}  ${debName}\n`, 'utf8');

  const assetDir = path.join(root, 'mobile', 'android', 'app', 'src', 'main', 'assets', 'installer');
  fs.rmSync(assetDir, { recursive: true, force: true });
  fs.mkdirSync(assetDir, { recursive: true });
  fs.copyFileSync(debPath, path.join(assetDir, debName));
  fs.writeFileSync(
    path.join(assetDir, 'manifest.json'),
    JSON.stringify(
      {
        name: 'kimo',
        version,
        architecture: arch,
        file: debName,
        size: fs.statSync(debPath).size,
        sha256: digest,
        generatedAt: new Date().toISOString()
      },
      null,
      2
    ) + '\n',
    'utf8'
  );

  const sizeMb = (fs.statSync(debPath).size / (1024 * 1024)).toFixed(1);
  console.log(`\n✔ Package: ${debPath} (${sizeMb} MB)`);
  console.log(`✔ SHA-256: ${digest}`);
  console.log(`✔ APK asset: ${path.join(assetDir, debName)}`);
  console.log(`✔ Manifest: ${path.join(assetDir, 'manifest.json')}\n`);
}

main().catch((error) => {
  console.error(`\nPackaging failed: ${error.stack || error.message}\n`);
  process.exit(1);
});
