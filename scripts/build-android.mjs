import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(root, 'mobile', 'android');
const gradleFile = path.join(androidDir, 'app', 'build.gradle');
const buildGradle = fs.readFileSync(gradleFile, 'utf8');
const version = process.env.KIMO_VERSION || buildGradle.match(/versionName\s+"([^"]+)"/)?.[1] || '1.2.0';
const versionCode = buildGradle.match(/versionCode\s+(\d+)/)?.[1] || '0';
const expectedAbis = ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'];

function fail(message) {
  console.error(`\n✘ ${message}\n`);
  process.exit(1);
}

function exists(file) {
  try {
    fs.accessSync(file);
    return true;
  } catch {
    return false;
  }
}

function javaHome() {
  const candidates = [
    process.env.KIMO_JAVA_HOME,
    process.env.JAVA_HOME,
    '/usr/lib/jvm/java-17-openjdk-amd64',
    '/usr/lib/jvm/java-21-openjdk-amd64',
    '/usr/lib/jvm/java-17-openjdk',
    '/usr/lib/jvm/java-21-openjdk'
  ].filter(Boolean);

  for (const candidate of candidates) {
    const java = path.join(candidate, 'bin', 'java');
    if (!exists(java)) continue;
    const result = spawnSync(java, ['-version'], { encoding: 'utf8' });
    const text = `${result.stdout || ''}\n${result.stderr || ''}`;
    const match = text.match(/version "(\d+)/);
    if (match && Number(match[1]) >= 17) return candidate;
  }
  return null;
}

function androidSdk() {
  if (process.env.ANDROID_HOME && exists(process.env.ANDROID_HOME)) return process.env.ANDROID_HOME;
  if (process.env.ANDROID_SDK_ROOT && exists(process.env.ANDROID_SDK_ROOT)) return process.env.ANDROID_SDK_ROOT;
  const localProperties = path.join(androidDir, 'local.properties');
  if (exists(localProperties)) {
    const match = fs.readFileSync(localProperties, 'utf8').match(/^sdk\.dir=(.+)$/m);
    if (match && exists(match[1].trim())) return match[1].trim();
  }
  const fallback = path.join(os.homedir(), 'Android', 'Sdk');
  if (exists(fallback)) return fallback;
  return null;
}

function latestBuildTool(sdk, name) {
  const buildToolsDir = path.join(sdk, 'build-tools');
  if (!exists(buildToolsDir)) fail(`Android build-tools not found under ${buildToolsDir}`);
  const versions = fs
    .readdirSync(buildToolsDir)
    .filter((entry) => exists(path.join(buildToolsDir, entry, name)))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (versions.length === 0) fail(`Could not find ${name} in ${buildToolsDir}`);
  return path.join(buildToolsDir, versions[versions.length - 1], name);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const keystoreProperties =
  process.env.KIMO_KEYSTORE_PROPERTIES || path.join(os.homedir(), '.config', 'kimo', 'keystore.properties');
if (!exists(keystoreProperties)) {
  fail(
    `Release signing is not configured. Expected ${keystoreProperties}.\n` +
      'Create a keystore and a properties file containing storeFile, storePassword, keyAlias, keyPassword.'
  );
}

const configuredJava = javaHome();
if (!configuredJava) fail('Java 17 or newer is required to build the Android release.');
const sdk = androidSdk();
if (!sdk) fail('Android SDK not found. Set ANDROID_HOME or create mobile/android/local.properties.');

const env = {
  ...process.env,
  JAVA_HOME: configuredJava,
  ANDROID_HOME: sdk,
  ANDROID_SDK_ROOT: sdk,
  KIMO_KEYSTORE_PROPERTIES: keystoreProperties
};

console.log(`\nBuilding kiMo ${version} (versionCode ${versionCode})`);
console.log(`Java: ${configuredJava}`);
console.log(`Android SDK: ${sdk}`);
console.log(`Keystore properties: ${keystoreProperties}\n`);

const gradle = spawnSync(path.join(androidDir, 'gradlew'), [':app:assembleRelease'], {
  cwd: androidDir,
  env,
  stdio: 'inherit'
});
if (gradle.status !== 0) fail(`Gradle build failed with exit code ${gradle.status ?? 'unknown'}.`);

const builtApk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!exists(builtApk)) fail(`Expected release APK was not produced: ${builtApk}`);

const aapt2 = latestBuildTool(sdk, 'aapt2');
const apksigner = latestBuildTool(sdk, 'apksigner');
const zipalign = latestBuildTool(sdk, 'zipalign');

const badging = execFileSync(aapt2, ['dump', 'badging', builtApk], { encoding: 'utf8' });
if (/application-debuggable/.test(badging)) fail('Release APK is marked debuggable.');
const packageLine = badging.match(/^package:.*$/m)?.[0] || '';
if (!packageLine.includes(`versionCode='${versionCode}'`)) {
  fail(`APK versionCode does not match ${versionCode}: ${packageLine}`);
}
if (!packageLine.includes(`versionName='${version}'`)) {
  fail(`APK versionName does not match ${version}: ${packageLine}`);
}
const nativeLine = badging.match(/^native-code:.*$/m)?.[0] || '';
for (const abi of expectedAbis) {
  if (!nativeLine.includes(`'${abi}'`)) fail(`APK is missing ABI ${abi}. ${nativeLine}`);
}

const signature = execFileSync(apksigner, ['verify', '--verbose', '--print-certs', builtApk], { encoding: 'utf8' });
if (!/Verified using v2 scheme \(APK Signature Scheme v2\): true/.test(signature)) {
  fail('APK is not signed with APK Signature Scheme v2.');
}

const alignCheck = spawnSync(zipalign, ['-c', '-P', '16', '4', builtApk], { encoding: 'utf8' });
if (alignCheck.status !== 0) {
  fail(`APK is not 16 KB zip-aligned:\n${alignCheck.stdout || ''}${alignCheck.stderr || ''}`);
}

const distDir = path.join(root, 'dist');
fs.mkdirSync(distDir, { recursive: true });
const outputName = `kiMo-${version}-android.apk`;
const outputPath = path.join(distDir, outputName);
fs.copyFileSync(builtApk, outputPath);
fs.copyFileSync(builtApk, path.join(root, 'kiMo-release.apk'));

const digest = sha256(outputPath);
fs.writeFileSync(`${outputPath}.sha256`, `${digest}  ${outputName}\n`, 'utf8');
fs.writeFileSync(
  path.join(distDir, `kiMo-${version}-build.json`),
  JSON.stringify(
    {
      version,
      versionCode,
      builtAt: new Date().toISOString(),
      abis: expectedAbis,
      sha256: digest,
      size: fs.statSync(outputPath).size,
      signed: true,
      debuggable: false
    },
    null,
    2
  ) + '\n',
  'utf8'
);

console.log(`\n✔ APK: ${outputPath}`);
console.log(`✔ Root copy: ${path.join(root, 'kiMo-release.apk')}`);
console.log(`✔ SHA-256: ${digest}`);
console.log(`✔ Size: ${(fs.statSync(outputPath).size / (1024 * 1024)).toFixed(1)} MB`);
console.log('✔ Non-debuggable, release-signed, all ABIs, 16 KB zip-aligned\n');
