import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function toCleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function main() {
  const root = process.cwd();
  const pkgPath = path.join(root, 'package.json');
  const pluginPath = path.join(root, 'openclaw.plugin.json');

  const pkg = await readJson(pkgPath);
  const plugin = await readJson(pluginPath);

  const pkgVersion = toCleanString(pkg?.version);
  const pluginVersion = toCleanString(plugin?.version);

  if (!pkgVersion) {
    throw new Error('package.json is missing a valid "version"');
  }
  if (!pluginVersion) {
    throw new Error('openclaw.plugin.json is missing a valid "version"');
  }
  if (pkgVersion !== pluginVersion) {
    throw new Error(
      `Version mismatch: package.json version is ${pkgVersion} but openclaw.plugin.json version is ${pluginVersion}`,
    );
  }
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exitCode = 1;
});
