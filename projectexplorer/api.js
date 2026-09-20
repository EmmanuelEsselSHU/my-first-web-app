export const PAGE_SIZE = 8;
export const MAX_RESULTS = 1000;
export const LANGUAGES = ['JavaScript', 'TypeScript', 'Python', 'HTML', 'CSS', 'Java', 'C#', 'C++', 'Go', 'Rust', 'Dart'];
const KEYWORDS = /^[\p{L}\p{N} ._+#-]{2,80}$/u;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const FULL_NAME = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})\/[a-zA-Z0-9_.-]{1,100}$/;

export class ApiError extends Error {
  constructor(message, kind = 'request', status = 0) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

export function validateFilters(filters) {
  const keywords = String(filters.keywords ?? '').trim().replace(/\s+/g, ' ');
  if (!KEYWORDS.test(keywords)) throw new Error('Use 2–80 characters: letters, numbers, spaces or . _ + # -');
  const language = filters.language ?? '';
  if (language && !LANGUAGES.includes(language)) throw new Error('Choose a language from the list.');
  const minStars = filters.minStars;
  if (!Number.isInteger(minStars) || minStars < 0 || minStars > 1000000) throw new Error('Enter a whole number from 0 to 1,000,000.');
  const sort = filters.sort ?? '';
  if (!['', 'stars', 'updated'].includes(sort)) throw new Error('Choose a sort option from the list.');
  return { keywords, language, minStars, sort, includeArchived: filters.includeArchived === true };
}

// Build qualifiers from validated form choices rather than accepting arbitrary
// GitHub query syntax. URLSearchParams encodes the complete request parameters.
export function searchUrl(filters, page = 1) {
  const values = validateFilters(filters);
  if (!Number.isInteger(page) || page < 1 || page > MAX_RESULTS / PAGE_SIZE) throw new Error('Invalid results page.');
  const query = [values.keywords, 'in:name,description', `stars:>=${values.minStars}`];
  if (values.language) query.push(`language:"${values.language}"`);
  if (!values.includeArchived) query.push('archived:false');
  const params = new URLSearchParams({ q: query.join(' '), per_page: String(PAGE_SIZE), page: String(page) });
  if (values.sort) { params.set('sort', values.sort); params.set('order', 'desc'); }
  return `https://api.github.com/search/repositories?${params}`;
}

export function validFullName(value) {
  return typeof value === 'string' && FULL_NAME.test(value) && !['.', '..'].includes(value.split('/')[1]);
}

export function repositoryPath(fullName) {
  if (!validFullName(fullName)) throw new Error('Invalid repository name.');
  return fullName.split('/').map(encodeURIComponent).join('/');
}

export function githubUrl(fullName) { return `https://github.com/${repositoryPath(fullName)}`; }

export function validatePackageName(value) {
  const name = String(value ?? '').trim();
  if (name.length > 214 || !PACKAGE_NAME.test(name)) throw new Error('Use a lowercase npm name, such as axios or @scope/package.');
  return name;
}


// npm repository metadata can use HTTPS, git+HTTPS or Git shortcuts. Match only
// an exact github.com host and a valid owner/repository pair, not package names.
export function repositoryFromPackage(repository) {
  let value = typeof repository === 'string' ? repository : repository?.url;
  if (typeof value !== 'string' || value.length > 2048) return null;
  value = value.trim().replace(/^git\+/, '');
  if (value.startsWith('github:')) value = `https://github.com/${value.slice(7)}`;
  if (value.startsWith('git@github.com:')) value = `https://github.com/${value.slice(15)}`;
  try {
    const url = new URL(value);
    if (url.hostname.toLowerCase() !== 'github.com' || url.port || !['https:', 'http:', 'git:', 'ssh:'].includes(url.protocol)) return null;
    const fullName = url.pathname.replace(/^\//, '').replace(/\/$/, '').replace(/\.git$/i, '');
    return validFullName(fullName) ? fullName : null;
  } catch { return null; }
}

function record(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object.');
  return value;
}
function count(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Expected a non-negative count.');
  return value;
}
function textOr(value, fallback) { return typeof value === 'string' && value.trim() ? value.trim() : fallback; }
function dateOrNull(value) {
  if (value == null) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new Error('Invalid date.');
  return value;
}

export function normaliseRepository(data) {
  record(data);
  if (!validFullName(data.full_name)) throw new Error('Invalid repository.');
  const [owner, name] = data.full_name.split('/');
  return {
    fullName: data.full_name, owner, name,
    description: textOr(data.description, 'No description provided.'),
    stars: count(data.stargazers_count), forks: count(data.forks_count),
    language: textOr(data.language, 'Not specified'),
    archived: data.archived === true,
    pushedAt: dateOrNull(data.pushed_at),
    branch: textOr(data.default_branch, 'Not specified'),
    license: data.license?.spdx_id && data.license.spdx_id !== 'NOASSERTION'
      ? textOr(data.license.spdx_id, 'Not specified') : textOr(data.license?.name, 'Not specified')
  };
}

export function normaliseSearch(data) {
  record(data);
  const total = count(data.total_count);
  if (!Array.isArray(data.items) || data.items.length > 100 || data.items.length > total) throw new Error('Invalid search results.');
  return { total, incomplete: data.incomplete_results === true, items: data.items.map(normaliseRepository) };
}

export function normaliseLanguages(data) {
  record(data);
  const entries = Object.entries(data).map(([name, bytes]) => ({ name, bytes: count(bytes) }));
  const total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  if (!Number.isSafeInteger(total)) throw new Error('Invalid language totals.');
  return total ? entries.filter(entry => entry.bytes > 0).sort((a, b) => b.bytes - a.bytes)
    .map(entry => ({ ...entry, percentage: entry.bytes / total * 100 })) : [];
}

export function normalisePackage(data) {
  record(data);
  const name = validatePackageName(data.name);
  if (typeof data.version !== 'string' || !data.version.trim()) throw new Error('Missing package version.');
  return {
    name, version: data.version.trim(),
    description: textOr(data.description, 'No description provided.'),
    license: typeof data.license === 'string' ? textOr(data.license, 'Not specified') : textOr(data.license?.type, 'Not specified'),
    repository: repositoryFromPackage(data.repository)
  };
}

/* Rate limit headers inform the retry message, no retry loop is started.
   https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api */
function responseError(response, service, now) {
  if (response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')) {
    const after = response.headers.get('retry-after');
    const reset = response.headers.get('x-ratelimit-reset');
    let retryTime = after && /^\d+$/.test(after) ? now + Number(after) * 1000 : Date.parse(after ?? '');
    if (!Number.isFinite(retryTime) && reset && /^\d+$/.test(reset)) retryTime = Number(reset) * 1000;
    const when = Number.isFinite(retryTime) && retryTime > now
      ? ` Try again after ${new Date(retryTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} (your local time).`
      : ' Please wait a little before trying again.';
    return new ApiError(`${service}'s request limit has been reached.${when}`, 'rate-limit', response.status);
  }
  if (response.status === 404) return new ApiError(service === 'npm'
    ? 'This package was not found. Check the published name and try again.'
    : 'This repository is no longer available. Search again or choose another project.', 'not-found', 404);
  if (response.status === 403) return new ApiError(`${service} refused the request. Please try again later.`, 'forbidden', 403);
  return new ApiError(`${service} could not complete the request. Please try again.`, 'http', response.status);
}

// Cache only validated successful responses. Injected fetch/time functions let
// tests exercise failures and expiry without calling or overwhelming live APIs.
export function createApiClient({ fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 12000, cacheMs = 300000 } = {}) {
  const cache = new Map();
  async function request(url, validate, { signal, refresh = false } = {}) {
    if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError');
    const saved = cache.get(url);
    if (!refresh && saved && now() - saved.time < cacheMs) return saved.data;
    const service = url.startsWith('https://api.github.com/') ? 'GitHub' : 'npm';
    // A request can be cancelled by the user or the timeout, report them
    // differently. https://developer.mozilla.org/en-US/docs/Web/API/AbortController
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const headers = service === 'GitHub'
      ? { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' }
      : { Accept: 'application/json' };
    try {
      const response = await fetchImpl(url, { headers, signal: controller.signal, credentials: 'omit' });
      if (!response.ok) throw responseError(response, service, now());
      let data;
      try { data = validate(await response.json()); }
      catch (error) {
        if (error.name === 'AbortError') throw error;
        throw new ApiError(`${service} returned unexpected data. Please try again.`, 'data');
      }
      if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError');
      if (cache.size >= 40) cache.delete(cache.keys().next().value);
      cache.set(url, { data, time: now() });
      return data;
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError');
      if (timedOut) throw new ApiError(`${service} took too long to respond. Please try again.`, 'timeout');
      if (error instanceof ApiError) throw error;
      throw new ApiError(`Could not reach ${service}. Check your connection and try again.`, 'network');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
  }
  return {
    search: (filters, page, options) => request(searchUrl(filters, page), normaliseSearch, options),
    repository: (fullName, options) => request(`https://api.github.com/repos/${repositoryPath(fullName)}`, normaliseRepository, options),
    languages: (fullName, options) => request(`https://api.github.com/repos/${repositoryPath(fullName)}/languages`, normaliseLanguages, options),
    package: (name, options) => {
      const expected = validatePackageName(name);
      return request(`https://registry.npmjs.org/${encodeURIComponent(expected)}/latest`, data => {
        const result = normalisePackage(data);
        if (result.name !== expected) throw new Error('A different package was returned.');
        return result;
      }, options);
    }
  };
}
