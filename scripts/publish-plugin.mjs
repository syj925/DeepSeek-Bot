// Node.js 22+. Copy this file into your plugin repository; no npm dependencies.
// Required env: PLUGIN_ID, PLUGIN_PACKAGE_NAME, PLUGIN_DISPLAY_NAME, PACKAGE_DIR,
// PLUGIN_PUBLISHER_EMAIL, PLUGIN_PUBLISHER_PASSWORD, PLUGIN_CI_TOKEN.
// Optional env: PUBLIC_ORIGIN, EXPECTED_VERSION, EXPECTED_SHA256,
// RELEASE_CHANNEL, GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_STEP_SUMMARY.
// PACKAGE_DIR contains package.tgz, release.json and notes.md from the build job.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_PACKAGE_BYTES = 50 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const UNSAFE_TEXT = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

class PublicationError extends Error {}
function fail(message) { throw new PublicationError(message); }
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Invalid gateway response');
  return value;
}
function required(env, name) {
  if (typeof env[name] !== 'string' || !env[name].trim()) fail(`Configure ${name}`);
  return env[name];
}
function configuration(env) {
  const rawOrigin = env.PUBLIC_ORIGIN || 'https://desktop.qibitai.ai';
  let url;
  try { url = new URL(rawOrigin); } catch { fail('PUBLIC_ORIGIN must be an HTTPS root origin'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port
      || url.pathname !== '/' || url.search || url.hash
      || ![url.origin, `${url.origin}/`].includes(rawOrigin)) {
    fail('PUBLIC_ORIGIN must be an HTTPS root origin without credentials, path, query, fragment or custom port');
  }
  const pluginId = required(env, 'PLUGIN_ID');
  const packageName = required(env, 'PLUGIN_PACKAGE_NAME');
  const name = required(env, 'PLUGIN_DISPLAY_NAME');
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(pluginId) || RESERVED.test(pluginId)) fail('PLUGIN_ID is invalid');
  if (packageName.length > 214 || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(packageName)
      || packageName.replace(/^@/, '').split('/').some(part => RESERVED.test(part) || /[.]$/.test(part))) {
    fail('PLUGIN_PACKAGE_NAME is invalid');
  }
  if (name.length > 200 || name !== name.trim() || /[\x00-\x1f\x7f]/.test(name)) fail('PLUGIN_DISPLAY_NAME is invalid');
  return { origin: url.origin, pluginId, packageName, name };
}
function credentials(env) {
  const email = required(env, 'PLUGIN_PUBLISHER_EMAIL');
  const password = required(env, 'PLUGIN_PUBLISHER_PASSWORD');
  const token = required(env, 'PLUGIN_CI_TOKEN');
  if (email.length > 254 || password.length > 1024 || !/^[A-Za-z0-9_-]{43,128}$/.test(token)) fail('Publisher credentials have an invalid format');
  return { email, password, token };
}
function validateVersion(value) {
  const match = typeof value === 'string' && value.length <= 100 && VERSION.exec(value);
  if (!match || match.slice(1, 4).some(part => !Number.isSafeInteger(Number(part)))
      || match[4]?.split('.').some(part => /^\d+$/.test(part)
        && (part.length > 1 && part.startsWith('0') || !Number.isSafeInteger(Number(part))))) {
    fail('Plugin release version is invalid');
  }
  return match;
}
async function textFile(path, limit) {
  const file = await lstat(path);
  if (!file.isFile() || file.size > limit) fail('Plugin release input is not a bounded regular file');
  const bytes = await readFile(path);
  if (bytes.length !== file.size || bytes.length > limit) fail('Plugin release input changed while being read');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { fail('Plugin release input must contain valid UTF-8'); }
}
async function digestFile(path) {
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    size += chunk.length;
    if (size > MAX_PACKAGE_BYTES) fail('Plugin package exceeds 50 MiB');
    hash.update(chunk);
  }
  if (size < 18) fail('Plugin package is empty');
  return { size, sha256: hash.digest('hex') };
}
async function readInput(packageDir, config, env) {
  if (typeof packageDir !== 'string' || !packageDir.trim()) fail('Configure PACKAGE_DIR');
  let release;
  try { release = object(JSON.parse(await textFile(join(packageDir, 'release.json'), 8192))); }
  catch (error) {
    if (error instanceof PublicationError) throw error;
    fail('Cannot read a valid release.json');
  }
  const keys = ['pluginId', 'packageName', 'version', 'channel', 'sha256', 'source'];
  if (Object.keys(release).length !== keys.length || Object.keys(release).some(key => !keys.includes(key))
      || keys.some(key => typeof release[key] !== 'string') || release.pluginId !== config.pluginId
      || release.packageName !== config.packageName || !['stable', 'beta'].includes(release.channel)
      || !SHA256.test(release.sha256)
      || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[a-f0-9]{40}$/.test(release.source)) {
    fail('Plugin release metadata is invalid');
  }
  const version = validateVersion(release.version);
  if (release.channel === 'stable' && version[4]) fail('Stable releases cannot use a prerelease version');
  const notes = await textFile(join(packageDir, 'notes.md'), 8000);
  if (!notes.trim() || notes.length > 2000 || UNSAFE_TEXT.test(notes)) fail('notes.md must contain 1 to 2000 valid text characters');
  const path = join(packageDir, 'package.tgz');
  const file = await lstat(path);
  if (!file.isFile() || file.size < 18 || file.size > MAX_PACKAGE_BYTES) fail('Plugin archive must be a regular file of 18 bytes to 50 MiB');
  const digest = await digestFile(path);
  if (digest.size !== file.size || digest.sha256 !== release.sha256) fail('Plugin archive differs from the validated artifact');
  const [repository, commit] = release.source.split('@');
  if (env.EXPECTED_VERSION && release.version !== env.EXPECTED_VERSION
      || env.EXPECTED_SHA256 && digest.sha256 !== env.EXPECTED_SHA256
      || env.RELEASE_CHANNEL && release.channel !== env.RELEASE_CHANNEL
      || env.GITHUB_REPOSITORY && repository !== env.GITHUB_REPOSITORY
      || env.GITHUB_SHA && commit !== env.GITHUB_SHA) {
    fail('Plugin artifact does not match the workflow release');
  }
  // This header has exactly eight fields. source remains build provenance only.
  const metadata = { pluginId: release.pluginId, packageName: release.packageName, name: config.name,
    version: release.version, channel: release.channel, title: `${config.name} ${release.version}`,
    notes, sha256: digest.sha256 };
  const bytes = Buffer.from(JSON.stringify(metadata), 'utf8');
  if (metadata.title.length > 200 || bytes.length > 4096) fail('Plugin upload metadata exceeds the gateway limit');
  return { release, path, digest, metadataHeader: bytes.toString('base64url') };
}
async function request(fetcher, url, init = {}) {
  let response;
  try { response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(60_000), ...init }); }
  catch { fail('Gateway request failed or timed out; verify publication state before running again'); }
  if (!response.ok) fail(`Gateway HTTP ${response.status}; verify publication state before running again`);
  return response;
}
async function json(response) {
  try { return object(await response.json()); }
  catch { fail('Gateway returned invalid JSON'); }
}
function sessionCookies(response, csrfToken) {
  const values = response.headers.getSetCookie().map(value => value.split(';', 1)[0]);
  const selected = ['qibitai_admin_session', 'qibitai_admin_csrf'].map(name => {
    const matches = values.filter(value => value.startsWith(`${name}=`));
    if (matches.length !== 1 || !/^[A-Za-z0-9_.=-]+$/.test(matches[0].slice(name.length + 1))) {
      fail('Gateway did not return valid publisher session cookies');
    }
    return matches[0];
  });
  if (selected[1] !== `qibitai_admin_csrf=${csrfToken}`) fail('Gateway CSRF cookie and token differ');
  return selected.join('; ');
}
function checkRelease(value, input, origin) {
  const published = object(value);
  const download = object(published.download);
  const release = input.release;
  if (published.pluginId !== release.pluginId || published.packageName !== release.packageName
      || published.channel !== release.channel || published.version !== release.version
      || download.sha256 !== input.digest.sha256 || download.size !== input.digest.size) {
    fail('Gateway plugin release does not match the validated archive');
  }
  let immutable;
  try { immutable = new URL(download.url); } catch { fail('Public plugin download URL is invalid'); }
  const filename = `${release.pluginId}-${release.version}.tgz`;
  const path = `/api/v1/plugins/downloads/${release.pluginId}/${encodeURIComponent(release.version)}/${input.digest.sha256}/${encodeURIComponent(filename)}`;
  if (immutable.origin !== origin || immutable.username || immutable.password || immutable.search || immutable.hash
      || immutable.pathname !== path || download.filename !== filename) fail('Public plugin download URL is invalid');
  return immutable.href;
}
async function verifyPublic(fetcher, config, input) {
  const query = new URLSearchParams({ plugin: config.pluginId, channel: input.release.channel });
  const manifestUrl = `${config.origin}/api/v1/plugins/releases/latest?${query}`;
  const manifestResponse = await request(fetcher, manifestUrl);
  if (manifestResponse.status !== 200) fail('Public manifest did not return HTTP 200');
  const immutableUrl = checkRelease((await json(manifestResponse)).release, input, config.origin);
  let alias;
  try {
    alias = await fetcher(`${config.origin}/plugins/${config.pluginId}/${input.release.channel}/latest.tgz`, {
      method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(60_000),
    });
  } catch { fail('Public install URL request failed or timed out'); }
  if (alias.status !== 307 || alias.headers.get('location') !== immutableUrl) fail('Public latest.tgz does not point to the validated archive');
  const head = await request(fetcher, immutableUrl, { method: 'HEAD' });
  if (head.status !== 200 || head.headers.get('content-length') !== String(input.digest.size)) fail('Public plugin size differs');
  const response = await request(fetcher, immutableUrl, { signal: AbortSignal.timeout(600_000) });
  if (response.status !== 200 || !response.body) fail('Public plugin download is empty');
  const hash = createHash('sha256');
  let size = 0;
  try {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > input.digest.size) fail('Public plugin download exceeds the validated size');
      hash.update(chunk);
    }
  } catch (error) {
    if (error instanceof PublicationError) throw error;
    fail('Public plugin download failed or timed out');
  }
  if (size !== input.digest.size || hash.digest('hex') !== input.digest.sha256) fail('Public plugin download bytes differ');
  return { manifestUrl, downloadUrl: immutableUrl };
}

export async function publishPlugin({ env = process.env, packageDir = env.PACKAGE_DIR, fetcher = fetch } = {}) {
  const config = configuration(env);
  const input = await readInput(packageDir, config, env);
  const auth = credentials(env);
  const loginResponse = await request(fetcher, `${config.origin}/api/admin/session`, {
    method: 'POST', headers: { origin: config.origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email: auth.email, password: auth.password }),
  });
  const session = await json(loginResponse);
  if (session.role !== 'plugin_publisher' || typeof session.csrfToken !== 'string'
      || !/^[A-Za-z0-9_.-]{1,100}$/.test(session.csrfToken)) fail('Gateway requires a plugin publisher session');
  const publication = await request(fetcher, `${config.origin}/api/admin/v1/plugins/releases`, {
    method: 'POST', duplex: 'half', signal: AbortSignal.timeout(600_000),
    headers: {
      origin: config.origin, cookie: sessionCookies(loginResponse, session.csrfToken),
      'x-csrf-token': session.csrfToken, 'x-qibitai-plugin-token': auth.token,
      'x-qibitai-plugin-release': input.metadataHeader,
      'content-type': 'application/octet-stream', 'content-length': String(input.digest.size),
    },
    body: createReadStream(input.path),
  });
  if (publication.status !== 201) fail('Gateway publication did not create a release');
  checkRelease((await json(publication)).release, input, config.origin);
  const publicResult = await verifyPublic(fetcher, config, input);
  return { ...publicResult, pluginId: config.pluginId, version: input.release.version,
    channel: input.release.channel, sha256: input.digest.sha256 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  publishPlugin().then(async result => {
    console.log(`Published ${result.pluginId} ${result.version} (${result.channel}), SHA-256 ${result.sha256}`);
    console.log(`Manifest: ${result.manifestUrl}`);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `### Plugin gateway publication\n\n- Plugin: \`${result.pluginId}\`\n- Version: \`${result.version}\`\n- Channel: \`${result.channel}\`\n- SHA-256: \`${result.sha256}\`\n- Manifest: ${result.manifestUrl}\n`);
  }).catch(error => {
    // Never log raw network errors, response bodies, cookies or credentials.
    console.error(error instanceof PublicationError ? error.message : 'Plugin publication failed; inspect artifact inputs and verify gateway state before running again');
    process.exitCode = 1;
  });
}
