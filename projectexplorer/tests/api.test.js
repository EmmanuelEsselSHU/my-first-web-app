import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ApiError, createApiClient, searchUrl, validateFilters, validatePackageName,
  repositoryFromPackage, normaliseLanguages, normaliseRepository, normaliseSearch
} from '../api.js';

const filters = { keywords: 'axios', language: '', minStars: 0, sort: '', includeArchived: false };
const repo = {
  full_name: 'axios/axios', description: 'A HTTP client', language: 'JavaScript',
  stargazers_count: 100, forks_count: 10, archived: false,
  pushed_at: '2026-09-18T12:00:00Z', default_branch: 'main', license: { spdx_id: 'MIT' }
};
const packageData = { name: 'axios', version: '1.2.3', description: 'A client', repository: { url: 'git+https://github.com/axios/axios.git' }, license: 'MIT' };
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

test('form choices determine the search query, encoding, sort and page', () => {
  const url = new URL(searchUrl({ ...filters, keywords: '  useful   client ', language: 'C++', minStars: 25, sort: 'stars' }, 2));
  assert.equal(url.origin, 'https://api.github.com');
  assert.equal(url.searchParams.get('q'), 'useful client in:name,description stars:>=25 language:"C++" archived:false');
  assert.equal(url.searchParams.get('page'), '2');
  assert.equal(url.searchParams.get('per_page'), '8');
  assert.equal(url.searchParams.get('sort'), 'stars');
  assert.equal(url.searchParams.get('order'), 'desc');
  assert.ok(!new URL(searchUrl({ ...filters, includeArchived: true })).searchParams.get('q').includes('archived:false'));
});

test('invalid form values cannot bypass search constraints', () => {
  for (const keywords of ['', '  ', 'a', 'x'.repeat(81), 'axios archived:true', 'axios"']) assert.throws(() => validateFilters({ ...filters, keywords }));
  for (const minStars of [-1, 1.5, NaN, 1000001]) assert.throws(() => validateFilters({ ...filters, minStars }));
  assert.throws(() => validateFilters({ ...filters, language: 'JavaScript archived:true' }));
  assert.throws(() => validateFilters({ ...filters, sort: 'unrecognised' }));
  assert.throws(() => searchUrl(filters, 0));
  assert.throws(() => searchUrl(filters, 126));
  assert.doesNotThrow(() => searchUrl(filters, 125));
});

test('package names support scopes but reject invalid or ambiguous paths', () => {
  assert.equal(validatePackageName(' @scope/package '), '@scope/package');
  for (const name of ['', '../axios', '/axios', 'AXIOS', 'axios/extra', '@scope/', 'a'.repeat(215)]) assert.throws(() => validatePackageName(name));
});

test('npm repository matching recognises real GitHub URL formats', () => {
  for (const value of ['git+https://github.com/axios/axios.git', 'git://github.com/axios/axios.git', 'github:axios/axios', 'git@github.com:axios/axios.git', 'https://github.com/axios/axios/']) {
    assert.equal(repositoryFromPackage({ url: value }), 'axios/axios');
  }
  assert.equal(repositoryFromPackage('https://github.com/axios/axios.git#main'), 'axios/axios');
});

test('repository matching rejects spoof hosts, unrelated URLs and extra path segments', () => {
  for (const value of ['https://github.com.example.org/axios/axios', 'https://github.com@evil.example/axios/axios', 'https://example.org/axios/axios', 'javascript:alert(1)', 'https://github.com/axios/axios/tree/main', null, {}]) {
    assert.equal(repositoryFromPackage(value), null);
  }
});

test('repository and search shape checks reject broken data', () => {
  assert.throws(() => normaliseRepository({ ...repo, full_name: '../bad' }));
  assert.throws(() => normaliseRepository({ ...repo, stargazers_count: '100' }));
  assert.throws(() => normaliseRepository({ ...repo, pushed_at: 'yesterday' }));
  assert.throws(() => normaliseSearch({ total_count: 0, items: [repo] }));
  assert.throws(() => normaliseSearch({ total_count: 2, items: {} }));
  assert.deepEqual(normaliseSearch({ total_count: 0, items: [], incomplete_results: false }).items, []);
  assert.equal(normaliseRepository({ ...repo, description: null, pushed_at: null, license: null, language: null }).description, 'No description provided.');
});

test('language percentages reflect bytes, with zero and malformed cases handled', () => {
  const result = normaliseLanguages({ JavaScript: 75, HTML: 25 });
  assert.equal(result[0].percentage, 75);
  assert.equal(result[1].percentage, 25);
  assert.deepEqual(normaliseLanguages({}), []);
  assert.deepEqual(normaliseLanguages({ HTML: 0 }), []);
  assert.throws(() => normaliseLanguages([]));
  assert.throws(() => normaliseLanguages({ JavaScript: -1 }));
});

test('GitHub search sends public requests and exposes partial-result information', async () => {
  const api = createApiClient({ fetchImpl: async (url, options) => {
    assert.ok(url.startsWith('https://api.github.com/search/repositories?'));
    assert.equal(options.credentials, 'omit');
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers['X-GitHub-Api-Version'], '2026-03-10');
    return json({ total_count: 1, items: [repo], incomplete_results: true });
  } });
  const result = await api.search(filters, 1);
  assert.equal(result.items[0].fullName, 'axios/axios');
  assert.equal(result.incomplete, true);
});

test('cache reuses successful requests, refresh bypasses it, and expiry reloads', async () => {
  let calls = 0;
  let time = 1000;
  const api = createApiClient({ now: () => time, cacheMs: 100, fetchImpl: async () => { calls++; return json(repo); } });
  await api.repository('axios/axios');
  await api.repository('axios/axios');
  assert.equal(calls, 1);
  await api.repository('axios/axios', { refresh: true });
  assert.equal(calls, 2);
  time += 101;
  await api.repository('axios/axios');
  assert.equal(calls, 3);
});

test('invalid JSON and invalid response shapes are not cached, allowing a retry to recover', async () => {
  let calls = 0;
  const api = createApiClient({ fetchImpl: async () => {
    calls++;
    if (calls === 1) return new Response('invalid JSON');
    if (calls === 2) return json({ message: 'wrong shape' });
    return json(repo);
  } });
  await assert.rejects(api.repository('axios/axios'), error => error.kind === 'data');
  await assert.rejects(api.repository('axios/axios'), error => error.kind === 'data');
  assert.equal((await api.repository('axios/axios')).fullName, 'axios/axios');
  assert.equal(calls, 3);
});

test('HTTP failures produce distinct useful feedback', async t => {
  for (const [status, headers, kind] of [
    [403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '2000000000' }, 'rate-limit'],
    [429, { 'retry-after': '10' }, 'rate-limit'], [403, {}, 'forbidden'],
    [404, {}, 'not-found'], [500, {}, 'http']
  ]) {
    await t.test(`${status} / ${kind}`, async () => {
      const api = createApiClient({ fetchImpl: async () => json({}, status, headers) });
      await assert.rejects(api.repository('axios/axios'), error => error instanceof ApiError && error.kind === kind && error.status === status);
    });
  }
});

test('network failure is distinguished from data failure', async () => {
  const api = createApiClient({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(api.search(filters, 1), error => error.kind === 'network' && error.message.includes('GitHub'));
});

const waitingFetch = (_url, { signal }) => new Promise((_resolve, reject) => {
  signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
});
test('requests time out and release a stalled connection', async () => {
  const api = createApiClient({ timeoutMs: 8, fetchImpl: waitingFetch });
  await assert.rejects(api.repository('axios/axios'), error => error.kind === 'timeout');
});

test('user cancellation stays an AbortError, rather than an apparent failure', async () => {
  const api = createApiClient({ fetchImpl: waitingFetch });
  const controller = new AbortController();
  const promise = api.repository('axios/axios', { signal: controller.signal });
  controller.abort();
  await assert.rejects(promise, error => error.name === 'AbortError');
  await assert.rejects(api.repository('axios/axios', { signal: controller.signal }), error => error.name === 'AbortError');
});

test('a cancelled response is discarded even if a transport ignores abort', async () => {
  let resolve;
  const api = createApiClient({ fetchImpl: () => new Promise(done => { resolve = done; }) });
  const controller = new AbortController();
  const promise = api.repository('axios/axios', { signal: controller.signal });
  controller.abort();
  resolve(json(repo));
  await assert.rejects(promise, error => error.name === 'AbortError');
});

test('npm uses its own endpoint without GitHub headers and returns a repository link', async () => {
  const api = createApiClient({ fetchImpl: async (url, options) => {
    assert.equal(url, 'https://registry.npmjs.org/axios/latest');
    assert.equal(options.headers['X-GitHub-Api-Version'], undefined);
    return json(packageData);
  } });
  const result = await api.package('axios');
  assert.equal(result.repository, 'axios/axios');
  assert.equal(result.version, '1.2.3');
});

test('a returned npm name must match the requested package', async () => {
  const api = createApiClient({ fetchImpl: async () => json({ ...packageData, name: 'unrelated' }) });
  await assert.rejects(api.package('axios'), error => error.kind === 'data');
});

test('scoped packages are encoded as a single API path parameter', async () => {
  const api = createApiClient({ fetchImpl: async url => {
    assert.equal(url, 'https://registry.npmjs.org/%40scope%2Fpackage/latest');
    return json({ ...packageData, name: '@scope/package', repository: null });
  } });
  assert.equal((await api.package('@scope/package')).repository, null);
});
