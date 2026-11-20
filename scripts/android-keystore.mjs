import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(root, 'mobile', 'android');
const keystorePath = path.join(androidDir, 'kimo-release.jks');
const propertiesPath = path.join(androidDir, 'keystore.properties');

if (fs.existsSync(keystorePath) || fs.existsSync(propertiesPath)) {
  console.error('Refusing to overwrite an existing release keystore or keystore.properties.');
  console.error(`Keystore: ${keystorePath}`);
  console.error(`Properties: ${propertiesPath}`);
  process.exit(1);
}

const password = crypto.randomBytes(24).toString('base64url');
const alias = 'kimo';

execFileSync(
  'keytool',
  [
    '-genkeypair',
    '-v',
    '-storetype', 'PKCS12',
    '-keystore', keystorePath,
    '-alias', alias,
    '-keyalg', 'RSA',
    '-keysize', '4096',
    '-validity', '10000',
    '-storepass:env', 'KIMO_KEYSTORE_PASSWORD',
    '-keypass:env', 'KIMO_KEYSTORE_PASSWORD',
    '-dname', 'CN=kiMo, OU=Mobile, O=kiMo, L=Local, ST=Local, C=US'
  ],
  {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, KIMO_KEYSTORE_PASSWORD: password }
  }
);

fs.writeFileSync(
  propertiesPath,
  `storeFile=kimo-release.jks
storePassword=${password}
keyAlias=${alias}
keyPassword=${password}
`,
  { encoding: 'utf8', mode: 0o600 }
);
fs.chmodSync(keystorePath, 0o600);

console.log(`Created release keystore: ${keystorePath}`);
console.log(`Created signing properties: ${propertiesPath}`);
console.log('Back up BOTH files. They are not committed and cannot be recreated.');
