import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { packagePluginRelease, preparePluginRelease } from '../package-plugin-release.mjs';
import { publishPlugin } from '../publish-plugin.mjs';

const ORIGIN = 'https://desktop.qibitai.ai';
const COMMIT = 'a'.repeat(40);

async function fixture(t, version = '0.1.7') {
  const root = await mkdtemp(join(tmpdir(), 'ds-bot-release-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5 }));
  const plugin = join(root, 'plugin');
  await mkdir(plugin);
  const env = {
    PUBLIC_ORIGIN: ORIGIN, PLUGIN_DIR: plugin, PLUGIN_ID: 'ds-bot',
    PLUGIN_PACKAGE_NAME: 'ds-bot', PLUGIN_DISPLAY_NAME: 'DS Bot', RELEASE_CHANNEL: 'stable',
    PLUGIN_NOTES_FILE: join(root, 'release-notes.md'), PACKAGE_DIR: join(root, 'release'),
    GITHUB_REPOSITORY: 'syj925/DeepSeek-Bot', GITHUB_SHA: COMMIT,
    PLUGIN_PUBLISHER_EMAIL: 'publisher@example.invalid', PLUGIN_PUBLISHER_PASSWORD: 'test-only-password',
    PLUGIN_CI_TOKEN: 't'.repeat(64),
  };
  const manifest = {
    name: 'ds-bot', version, type: 'module', main: 'index.js', files: ['index.js', 'cordis.patch.yml'],
    scripts: { prepack: 'node -e "require(\'node:fs\').writeFileSync(\'lifecycle-ran\', \'bad\')"' },
    dsh: { bundle: { patch: './cordis.patch.yml' }, update: { url: ORIGIN, pluginId: 'ds-bot', channel: 'stable' } },
  };
  await writeFile(join(plugin, 'package.json'), JSON.stringify(manifest));
  await writeFile(join(plugin, 'index.js'), 'export function apply() {}\n');
  await writeFile(join(plugin, 'cordis.patch.yml'), 'plugins:\n  ds-bot: {}\n');
  await writeFile(env.PLUGIN_NOTES_FILE, 'Automated plugin release.\n');
  return { root, plugin, env, manifest };
}

async function publisherInput(t) {
  const f = await fixture(t);
  await mkdir(f.env.PACKAGE_DIR);
  const bytes = Buffer.from('fixture compressed archive bytes, verified by the gateway in production');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const release = {
    pluginId: 'ds-bot', packageName: 'ds-bot', version: '0.1.7', channel: 'stable',
    sha256, source: `${f.env.GITHUB_REPOSITORY}@${COMMIT}`,
  };
  await writeFile(join(f.env.PACKAGE_DIR, 'package.tgz'), bytes);
  await writeFile(join(f.env.PACKAGE_DIR, 'notes.md'), 'Automated plugin release.\n');
  await writeFile(join(f.env.PACKAGE_DIR, 'release.json'), JSON.stringify(release));
  return { ...f, bytes, release, sha256 };
}

function gateway(input, { wrongDownload = false, uploadStatus = 201 } = {}) {
  const requests = [];
  const url = `${ORIGIN}/api/v1/plugins/downloads/ds-bot/0.1.7/${input.sha256}/ds-bot-0.1.7.tgz`;
  const release = { ...input.release, download: { url, filename: 'ds-bot-0.1.7.tgz',
    size: input.bytes.length, sha256: input.sha256 } };
  const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
  const fetcher = async (path, init = {}) => {
    requests.push({ path, init });
    assert.ok(['error', 'manual'].includes(init.redirect));
    if (path === `${ORIGIN}/api/admin/session`) {
      assert.equal(init.method, 'POST');
      const response = json({ role: 'plugin_publisher', csrfToken: 'csrf-test' });
      response.headers.append('set-cookie', 'qibitai_admin_session=session-test; Secure; HttpOnly');
      response.headers.append('set-cookie', 'qibitai_admin_csrf=csrf-test; Secure');
      return response;
    }
    if (path === `${ORIGIN}/api/admin/v1/plugins/releases`) {
      assert.equal(init.method, 'POST');
      assert.equal(init.headers.cookie, 'qibitai_admin_session=session-test; qibitai_admin_csrf=csrf-test');
      assert.equal(init.headers['x-csrf-token'], 'csrf-test');
      assert.equal(init.headers['x-qibitai-plugin-token'], input.env.PLUGIN_CI_TOKEN);
      const metadata = JSON.parse(Buffer.from(init.headers['x-qibitai-plugin-release'], 'base64url'));
      assert.deepEqual(Object.keys(metadata).sort(), ['pluginId', 'packageName', 'name', 'version', 'channel', 'title', 'notes', 'sha256'].sort());
      assert.equal(metadata.sha256, input.sha256);
      assert.equal(init.headers['content-length'], String(input.bytes.length));
      const chunks = [];
      for await (const chunk of init.body) chunks.push(chunk);
      assert.deepEqual(Buffer.concat(chunks), input.bytes);
      return new Response(JSON.stringify({ release }), { status: uploadStatus });
    }
    assert.equal(init.headers, undefined, 'Never forward credentials to public verification');
    if (path.startsWith(`${ORIGIN}/api/v1/plugins/releases/latest?`)) return json({ release });
    if (path === `${ORIGIN}/plugins/ds-bot/stable/latest.tgz`) {
      assert.equal(init.method, 'HEAD');
      return new Response(null, { status: 307, headers: { location: url } });
    }
    assert.equal(path, url);
    if (init.method === 'HEAD') return new Response(null, { headers: { 'content-length': String(input.bytes.length) } });
    return new Response(wrongDownload ? Buffer.alloc(input.bytes.length) : input.bytes);
  };
  return { fetcher, requests };
}

test('prepares beta metadata before validation without changing package identity', async t => {
  const f = await fixture(t, '0.1.7-beta.1');
  f.env.RELEASE_CHANNEL = 'beta';
  await preparePluginRelease({ env: f.env });
  const manifest = JSON.parse(await readFile(join(f.plugin, 'package.json'), 'utf8'));
  assert.equal(manifest.name, 'ds-bot');
  assert.equal(manifest.version, '0.1.7-beta.1');
  assert.deepEqual(manifest.dsh.update, { url: ORIGIN, pluginId: 'ds-bot', channel: 'beta' });
});

test('rejects a prerelease from stable before changing the manifest', async t => {
  const f = await fixture(t, '0.1.7-beta.1');
  const before = await readFile(join(f.plugin, 'package.json'), 'utf8');
  await assert.rejects(preparePluginRelease({ env: f.env }), /identity or version/);
  assert.equal(await readFile(join(f.plugin, 'package.json'), 'utf8'), before);
});

test('freezes a real archive, ignores npm lifecycle scripts, and records its digest and source', async t => {
  const f = await fixture(t);
  const result = await packagePluginRelease({ env: f.env });
  assert.equal(existsSync(join(f.plugin, 'lifecycle-ran')), false);
  const bytes = await readFile(join(f.env.PACKAGE_DIR, 'package.tgz'));
  assert.equal(result.sha256, createHash('sha256').update(bytes).digest('hex'));
  const metadata = JSON.parse(await readFile(join(f.env.PACKAGE_DIR, 'release.json'), 'utf8'));
  assert.deepEqual(metadata, { pluginId: 'ds-bot', packageName: 'ds-bot', version: '0.1.7',
    channel: 'stable', sha256: result.sha256, source: `${f.env.GITHUB_REPOSITORY}@${COMMIT}` });
  await assert.rejects(packagePluginRelease({ env: f.env }), /already contains a frozen release/);
});

test('rejects npm PAX records from Unicode asset paths before freezing a release', async t => {
  const f = await fixture(t);
  const asset = 'assets/\u5458\u5de5\u5934\u50cf.png';
  await mkdir(join(f.plugin, 'assets'));
  await writeFile(join(f.plugin, asset), 'fixture image bytes');
  f.manifest.files.push(asset);
  await writeFile(join(f.plugin, 'package.json'), JSON.stringify(f.manifest));
  await assert.rejects(packagePluginRelease({ env: f.env }), /unsupported tar entries.*PAX/);
  for (const name of ['package.tgz', 'release.json', 'notes.md']) {
    assert.equal(existsSync(join(f.env.PACKAGE_DIR, name)), false, `${name} must not be frozen`);
  }
});

test('refuses packaging when the tested package has a different update channel', async t => {
  const f = await fixture(t);
  f.env.RELEASE_CHANNEL = 'beta';
  await assert.rejects(packagePluginRelease({ env: f.env }), /Packed update source differs/);
  assert.equal(existsSync(join(f.env.PACKAGE_DIR, 'release.json')), false);
});

test('refuses an output directory inside the runtime package', async t => {
  const f = await fixture(t);
  f.env.PACKAGE_DIR = join(f.plugin, 'release');
  await assert.rejects(packagePluginRelease({ env: f.env }), /outside the runtime package/);
});

test('publishes the frozen artifact and validates public manifest, alias, length and bytes', async t => {
  const f = await publisherInput(t);
  const mock = gateway(f);
  const result = await publishPlugin({ env: f.env, fetcher: mock.fetcher });
  assert.equal(result.sha256, f.sha256);
  assert.equal(result.version, '0.1.7');
  assert.equal(mock.requests.length, 6);
});

test('refuses artifact tampering before any authenticated request', async t => {
  const f = await publisherInput(t);
  await writeFile(join(f.env.PACKAGE_DIR, 'package.tgz'), Buffer.alloc(f.bytes.length));
  await assert.rejects(publishPlugin({ env: f.env, fetcher: () => assert.fail('Must not log in') }), /differs from the validated artifact/);
});

test('refuses provenance mismatch before any authenticated request', async t => {
  const f = await publisherInput(t);
  f.env.GITHUB_SHA = 'b'.repeat(40);
  await assert.rejects(publishPlugin({ env: f.env, fetcher: () => assert.fail('Must not log in') }), /does not match the workflow release/);
});

test('fails a corrupt public download even if upload returned success', async t => {
  const f = await publisherInput(t);
  const mock = gateway(f, { wrongDownload: true });
  await assert.rejects(publishPlugin({ env: f.env, fetcher: mock.fetcher }), /Public plugin download bytes differ/);
});

test('does not retry a publication conflict', async t => {
  const f = await publisherInput(t);
  const mock = gateway(f, { uploadStatus: 409 });
  await assert.rejects(publishPlugin({ env: f.env, fetcher: mock.fetcher }), /Gateway HTTP 409/);
  assert.equal(mock.requests.length, 2);
});
