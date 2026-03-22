#!/usr/bin/env node

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const distDir = path.join(__dirname, '..', '..', 'dist');

console.log('Cleaning previous build...');
try {
  fs.rmSync(distDir, { recursive: true, force: true });
} catch {
  // ignore
}

fs.mkdirSync(distDir, { recursive: true });
fs.mkdirSync(path.join(distDir, 'logs'), { recursive: true });

console.log('Compiling TypeScript...');
execSync('tsc', { stdio: 'inherit' });

console.log('Copying config files...');
const stdioConfigSourcePath = path.join(__dirname, '..', 'mcp', 'stdio-config.json');
const stdioConfigDestPath = path.join(distDir, 'mcp', 'stdio-config.json');
fs.mkdirSync(path.dirname(stdioConfigDestPath), { recursive: true });
if (fs.existsSync(stdioConfigSourcePath)) {
  fs.copyFileSync(stdioConfigSourcePath, stdioConfigDestPath);
} else {
  console.error(`Missing config file: ${stdioConfigSourcePath}`);
}

console.log('Writing dist/README.md...');
const packageJson = require('../../package.json');
const readmeContent = `# ${packageJson.name}

This folder contains the compiled runtime for the Chrome Native Messaging host + local MCP server.

## Install

\`\`\`bash
npm install -g ${packageJson.name}
\`\`\`

## Register the Native Messaging host

\`\`\`bash
# User-level registration (recommended)
${packageJson.name} register

# System-level registration (requires admin / sudo)
${packageJson.name} register --system
\`\`\`

## Usage

The native host is started automatically by the browser extension via Native Messaging.
`;

fs.writeFileSync(path.join(distDir, 'README.md'), readmeContent, 'utf8');

console.log('Copying wrapper scripts...');
const scriptsSourceDir = __dirname;
const macOsWrapperSourcePath = path.join(scriptsSourceDir, 'run_host.sh');
const windowsWrapperSourcePath = path.join(scriptsSourceDir, 'run_host.bat');

const macOsWrapperDestPath = path.join(distDir, 'run_host.sh');
const windowsWrapperDestPath = path.join(distDir, 'run_host.bat');

if (fs.existsSync(macOsWrapperSourcePath)) {
  fs.copyFileSync(macOsWrapperSourcePath, macOsWrapperDestPath);
} else {
  console.error(`Missing wrapper script: ${macOsWrapperSourcePath}`);
}

if (fs.existsSync(windowsWrapperSourcePath)) {
  fs.copyFileSync(windowsWrapperSourcePath, windowsWrapperDestPath);
} else {
  console.error(`Missing wrapper script: ${windowsWrapperSourcePath}`);
}

console.log('Setting executable permissions...');
const filesToMakeExecutable = ['index.js', 'cli.js', 'run_host.sh'];
for (const file of filesToMakeExecutable) {
  const filePath = path.join(distDir, file);
  if (!fs.existsSync(filePath)) continue;
  try {
    fs.chmodSync(filePath, '755');
  } catch (error) {
    console.warn(
      `Unable to chmod ${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

console.log('Writing dist/node_path.txt (dev convenience; excluded from npm publish)...');
fs.writeFileSync(path.join(distDir, 'node_path.txt'), process.execPath, 'utf8');

console.log('✅ Build complete');
