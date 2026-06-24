#!/usr/bin/env node
// Usage: node scripts/set-version.mjs <versionCode> <versionName>
// Patches android/app/build.gradle in place. Idempotent and safe to skip if android/ not present.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [, , versionCodeStr, versionName] = process.argv;
if (!versionCodeStr || !versionName) {
  console.error('Usage: set-version.mjs <versionCode> <versionName>');
  process.exit(1);
}
const versionCode = parseInt(versionCodeStr, 10);
if (!Number.isInteger(versionCode) || versionCode <= 0) {
  console.error('versionCode must be a positive integer');
  process.exit(1);
}

const gradlePath = 'android/app/build.gradle';
if (!existsSync(gradlePath)) {
  console.error(`Skipping: ${gradlePath} not found yet.`);
  process.exit(0);
}

let src = readFileSync(gradlePath, 'utf8');
src = src.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
src = src.replace(/versionName\s+["'][^"']+["']/, `versionName "${versionName}"`);
writeFileSync(gradlePath, src);
console.log(`Set versionCode=${versionCode} versionName="${versionName}"`);
