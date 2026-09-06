import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest, validateReleaseSource } from './pocketbase-release-lib.mjs';

function parseArgs(argv) {
  const outputIndex = argv.indexOf('--output');
  return {
    output: outputIndex >= 0 ? argv[outputIndex + 1] : null,
  };
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, '..', '..');
const args = parseArgs(process.argv.slice(2));
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const outputDirectory = path.resolve(args.output ?? path.join(workspaceRoot, '.local-observability', 'release-bundles', `fanzoom-pocketbase-0.30.0-${stamp}`));

if (!outputDirectory.startsWith(path.resolve(workspaceRoot) + path.sep)) {
  throw new Error('Output must remain inside the local workspace.');
}

const entries = await validateReleaseSource(workspaceRoot);
await mkdir(path.dirname(outputDirectory), { recursive: true });
await mkdir(outputDirectory, { recursive: false });
for (const group of ['pb_migrations', 'pb_hooks']) {
  await mkdir(path.join(outputDirectory, group));
}

for (const entry of entries) {
  await copyFile(path.join(workspaceRoot, entry.group, entry.name), path.join(outputDirectory, entry.group, entry.name));
}

const generatedAt = new Date().toISOString();
const manifest = buildManifest(entries, generatedAt);
await writeFile(path.join(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
const checksums = entries.map((entry) => `${entry.sha256}  ${entry.relativePath}`).join('\n');
await writeFile(path.join(outputDirectory, 'SHA256SUMS.txt'), `${checksums}\n`, { flag: 'wx' });

process.stdout.write(`${JSON.stringify({ outputDirectory, manifest }, null, 2)}\n`);
