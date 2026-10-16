// Freeze the same tested runtime archive that the HTTPS publishing job receives.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function required(env, key) {
  if (typeof env[key] !== 'string' || !env[key].trim()) throw new Error(`Configure ${key}`);
  return env[key];
}

function configuration(env) {
  const origin = required(env, 'PUBLIC_ORIGIN');
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password || url.port) {
    throw new Error('PUBLIC_ORIGIN must be an HTTPS root origin');
  }
  const channel = required(env, 'RELEASE_CHANNEL');
  if (!['stable', 'beta'].includes(channel)) throw new Error('Invalid release channel');
  return {
    origin, channel, root: resolve(required(env, 'PLUGIN_DIR')),
    pluginId: required(env, 'PLUGIN_ID'), packageName: required(env, 'PLUGIN_PACKAGE_NAME'),
    name: required(env, 'PLUGIN_DISPLAY_NAME'),
  };
}

function validateManifest(manifest, config, update = false) {
  const version = typeof manifest.version === 'string' && manifest.version.length <= 100 && VERSION.exec(manifest.version);
  if (manifest.name !== config.packageName || !version
      || version.slice(1, 4).some(part => !Number.isSafeInteger(Number(part)))
      || version[4]?.split('.').some(part => /^\d+$/.test(part)
        && (part.length > 1 && part.startsWith('0') || !Number.isSafeInteger(Number(part))))
      || config.channel === 'stable' && version[4]) {
    throw new Error('Invalid package identity or version for the release channel');
  }
  const patch = manifest.dsh?.bundle?.patch;
  const path = typeof patch === 'string' ? patch.replace(/^\.\//, '') : '';
  if (!path || path.startsWith('/') || path.includes('\\') || path.includes(':')
      || path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Invalid bundle patch path');
  }
  if (update && (manifest.dsh?.update?.url !== config.origin
      || manifest.dsh.update.pluginId !== config.pluginId || manifest.dsh.update.channel !== config.channel)) {
    throw new Error('Packed update source differs from the release configuration');
  }
  return path;
}

export async function preparePluginRelease({ env = process.env } = {}) {
  const config = configuration(env);
  const path = join(config.root, 'package.json');
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  validateManifest(manifest, config);
  manifest.dsh.update = { url: config.origin, pluginId: config.pluginId, channel: config.channel };
  await writeFile(path, JSON.stringify(manifest, null, 2) + '\n');
  return { version: manifest.version, channel: config.channel };
}

function runNpm(args, options) {
  // On Windows npm.cmd cannot be spawned without a shell; run npm's JS entry directly.
  if (process.platform === 'win32') {
    const cli = process.env.npm_execpath || join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    if (!existsSync(cli)) throw new Error('Cannot locate npm-cli.js beside Node; run this script through npm');
    return execFileSync(process.execPath, [cli, ...args], options);
  }
  return execFileSync('npm', args, options);
}

export async function packagePluginRelease({ env = process.env } = {}) {
  const config = configuration(env);
  const out = resolve(required(env, 'PACKAGE_DIR'));
  const outputRelative = relative(config.root, out);
  if (!outputRelative || outputRelative !== '..'
      && !outputRelative.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(outputRelative)) {
    throw new Error('PACKAGE_DIR must be outside the runtime package directory');
  }
  for (const file of ['package.tgz', 'release.json', 'notes.md']) {
    if (existsSync(join(out, file))) throw new Error('PACKAGE_DIR already contains a frozen release; choose an empty directory');
  }
  const source = `${required(env, 'GITHUB_REPOSITORY')}@${required(env, 'GITHUB_SHA')}`;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[a-f0-9]{40}$/.test(source)) throw new Error('Invalid release source commit');
  const notesBytes = await readFile(resolve(required(env, 'PLUGIN_NOTES_FILE')));
  if (notesBytes.length > 8000) throw new Error('Release notes exceed gateway limits');
  const notes = new TextDecoder('utf-8', { fatal: true }).decode(notesBytes);
  if (!notes.trim() || notes.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(notes)) {
    throw new Error('Release notes must contain 1 to 2000 valid text characters');
  }
  await mkdir(out, { recursive: true });
  const packed = JSON.parse(runNpm(['pack', '--ignore-scripts', '--json', '--pack-destination', out], {
    cwd: config.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
  }));
  if (packed.length !== 1 || basename(packed[0].filename) !== packed[0].filename || !packed[0].filename.endsWith('.tgz')) {
    throw new Error('Unexpected npm pack result');
  }
  const path = join(out, packed[0].filename);
  const size = (await stat(path)).size;
  if (size < 18 || size > 50 * 1024 * 1024) throw new Error('Package exceeds gateway size limits');
  // Git Bash tar interprets the colon in a Windows drive path as a remote host.
  const manifest = JSON.parse(execFileSync('tar', ['-xzOf', basename(path), 'package/package.json'], {
    cwd: out, encoding: 'utf8', maxBuffer: 1024 * 1024,
  }));
  const patch = validateManifest(manifest, config, true);
  const patchBytes = execFileSync('tar', ['-xzOf', basename(path), `package/${patch}`], {
    cwd: out, maxBuffer: 100 * 1024 * 1024,
  });
  if (!patchBytes.length) throw new Error('Bundle patch is empty');
  const bytes = await readFile(path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const version = manifest.version;
  const metadata = {
    pluginId: config.pluginId, packageName: config.packageName, name: config.name,
    channel: config.channel, version, title: `${config.name} ${version}`, notes, sha256,
  };
  if (metadata.title.length > 200 || Buffer.byteLength(JSON.stringify(metadata), 'utf8') > 4096) {
    throw new Error('Shorten release notes or title to fit gateway metadata limits');
  }
  await rename(path, join(out, 'package.tgz'));
  await writeFile(join(out, 'notes.md'), notes);
  await writeFile(join(out, 'release.json'), JSON.stringify({
    pluginId: config.pluginId, packageName: config.packageName, version,
    channel: config.channel, sha256, source,
  }, null, 2) + '\n');
  if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, `version=${version}\nsha256=${sha256}\n`);
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY,
    `Plugin ${config.pluginId} ${version} (${config.channel})\n\nSHA-256: ${sha256}\n`);
  return { pluginId: config.pluginId, version, channel: config.channel, sha256, size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const command = process.argv[2];
  const action = command === 'prepare' ? preparePluginRelease : command === 'pack' ? packagePluginRelease : null;
  if (!action) {
    console.error('Usage: node scripts/package-plugin-release.mjs prepare|pack');
    process.exitCode = 1;
  } else {
    action().then(result => console.log(JSON.stringify(result))).catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}
