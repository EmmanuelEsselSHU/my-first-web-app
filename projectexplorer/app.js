import { ApiError, PAGE_SIZE, MAX_RESULTS, createApiClient, validateFilters, validatePackageName, githubUrl } from './api.js';

const api = createApiClient();
const byId = id => document.getElementById(id);
const ui = Object.fromEntries([
  'search-form', 'search-controls', 'keywords', 'language', 'min-stars', 'sort', 'include-archived',
  'search-button', 'setup-message', 'results-title', 'results-count', 'search-status', 'results-body',
  'results-placeholder', 'placeholder-title', 'placeholder-copy', 'examples', 'search-retry', 'results-list',
  'pagination', 'previous-page', 'next-page', 'page-label', 'inspector-title', 'details-status',
  'inspector-empty', 'details-retry', 'inspector-content', 'detail-description', 'github-link',
  'detail-facts', 'languages-status', 'language-list', 'package-form', 'package-controls',
  'package-name', 'package-button', 'package-status', 'package-result', 'inspector-actions',
  'back-results', 'refresh-details'
].map(id => [id, byId(id)]));
const state = {
  searchId: 0, detailId: 0, packageId: 0,
  searchController: null, detailController: null, packageController: null,
  filters: null, filtersChanged: false, page: 1, total: 0,
  selectedName: '', repository: null, resultButton: null
};
const number = value => new Intl.NumberFormat('en-GB').format(value);
const shortNumber = value => new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function message(id, text, kind = '') {
  ui[id].textContent = text;
  ui[id].dataset.state = kind;
}
function failureText(error) {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
}
// Abort the transport and advance the request identifier so an older response
// cannot update a view that has since been reset or changed.
function stopRequest(name) {
  state[`${name}Controller`]?.abort();
  state[`${name}Controller`] = null;
  state[`${name}Id`] += 1;
}
function setSearchBusy(busy) {
  ui['search-controls'].disabled = busy;
  ui['search-button'].firstElementChild.textContent = busy ? 'Searching…' : 'Search projects';
  ui['results-body'].setAttribute('aria-busy', String(busy));
  ui.examples.querySelectorAll('button').forEach(button => { button.disabled = busy; });
  updatePagination(busy);
}
function updatePagination(busy = false) {
  const pages = Math.ceil(Math.min(state.total, MAX_RESULTS) / PAGE_SIZE);
  ui['previous-page'].disabled = busy || state.filtersChanged || state.page <= 1;
  ui['next-page'].disabled = busy || state.filtersChanged || state.page >= pages;
  ui['page-label'].textContent = pages ? `Page ${state.page} of ${pages}` : '';
}
function placeholder(title, copy, { examples = false, retry = false } = {}) {
  ui['results-placeholder'].hidden = false;
  ui['placeholder-title'].textContent = title;
  ui['placeholder-copy'].textContent = copy;
  ui.examples.hidden = !examples;
  ui['search-retry'].hidden = !retry;
}
function clearInspector() {
  stopRequest('detail');
  stopRequest('package');
  state.selectedName = '';
  state.repository = null;
  state.resultButton = null;
  ui['inspector-title'].textContent = 'Project details';
  message('details-status', 'Select a result to explore the project.');
  ui['inspector-empty'].hidden = false;
  ui['inspector-content'].hidden = true;
  ui['details-retry'].hidden = true;
  ui['inspector-actions'].hidden = true;
  ui['refresh-details'].hidden = true;
  ui['package-form'].reset();
  ui['package-name'].setCustomValidity('');
  ui['package-controls'].disabled = false;
  ui['package-button'].firstChild.textContent = 'Check package ';
  ui['package-result'].hidden = true;
  message('package-status', '');
}

function readFilters() {
  return validateFilters({
    keywords: ui.keywords.value,
    language: ui.language.value,
    minStars: ui['min-stars'].valueAsNumber,
    sort: ui.sort.value,
    includeArchived: ui['include-archived'].checked
  });
}

ui['search-form'].addEventListener('submit', event => {
  event.preventDefault();
  if (state.searchController) return;
  let filters;
  try { filters = readFilters(); }
  catch (error) {
    ui.keywords.setCustomValidity(error.message);
    ui.keywords.reportValidity();
    return;
  }
  ui.keywords.value = filters.keywords;
  search(filters, 1);
});

ui['search-form'].addEventListener('input', () => {
  ui.keywords.setCustomValidity('');
  if (state.filters && !state.searchController) {
    state.filtersChanged = true;
    message('search-status', 'Your filters have changed. Select Search projects to apply them.');
    updatePagination();
  }
});

// Reset remains outside the disabled fieldset, so it can cancel a busy search.
ui['search-form'].addEventListener('reset', () => {
  stopRequest('search');
  clearInspector();
  state.filters = null;
  state.filtersChanged = false;
  state.page = 1;
  state.total = 0;
  ui.keywords.setCustomValidity('');
  setSearchBusy(false);
  ui['results-list'].replaceChildren();
  ui['results-list'].hidden = true;
  ui.pagination.hidden = true;
  ui['results-title'].textContent = 'Your discoveries';
  ui['results-count'].textContent = 'Ready when you are';
  message('search-status', 'Search reset. Enter a keyword or try a starting point.');
  placeholder('A good project starts with curiosity.', 'Find something to learn from, build with or contribute to.', { examples: true });
  requestAnimationFrame(() => ui.keywords.focus());
});

ui.examples.addEventListener('click', event => {
  const button = event.target.closest('button[data-example]');
  if (!button || button.disabled) return;
  ui['search-form'].reset();
  ui.keywords.value = button.dataset.example;
  ui.sort.value = 'stars';
  ui['search-form'].requestSubmit();
});
ui['search-retry'].addEventListener('click', () => ui['search-form'].requestSubmit());
ui['previous-page'].addEventListener('click', () => search(state.filters, state.page - 1));
ui['next-page'].addEventListener('click', () => search(state.filters, state.page + 1));

async function search(filters, page) {
  stopRequest('search');
  clearInspector();
  const requestId = state.searchId;
  const controller = new AbortController();
  state.searchController = controller;
  state.filters = filters;
  state.filtersChanged = false;
  state.page = page;
  state.total = 0;
  ui['results-list'].replaceChildren();
  ui['results-list'].hidden = true;
  ui.pagination.hidden = true;
  ui['results-title'].textContent = `Results for “${filters.keywords}”`;
  ui['results-count'].textContent = 'Searching';
  placeholder('Looking for your next discovery…', 'You can reset the search to cancel.');
  setSearchBusy(true);
  message('search-status', `Searching GitHub for “${filters.keywords}”…`, 'loading');
  try {
    const result = await api.search(filters, page, { signal: controller.signal });
    if (requestId !== state.searchId) return;
    state.total = result.total;
    ui['results-count'].textContent = `${number(result.total)} ${result.total === 1 ? 'match' : 'matches'}`;
    if (result.items.length) {
      renderResults(result.items);
      const start = (page - 1) * PAGE_SIZE + 1;
      const end = start + result.items.length - 1;
      let status = `Showing ${start}–${end} of ${number(result.total)} matches.`;
      if (filters.language) status += ` Language: ${filters.language}.`;
      if (result.total > MAX_RESULTS) status += ' GitHub makes the first 1,000 results available; narrow your filters for a smaller selection.';
      if (result.incomplete) status += ' GitHub returned a partial search. Try a more specific keyword.';
      message('search-status', status);
      ui.pagination.hidden = result.total <= PAGE_SIZE;
    } else {
      placeholder('No projects found.', 'Try a broader keyword, another language or a lower minimum star count.');
      message('search-status', result.incomplete ? 'GitHub returned an incomplete search with no matches. Try again with a more specific keyword.' : 'No matches for this search. Adjust the options above and try again.');
    }
  } catch (error) {
    if (requestId !== state.searchId || error.name === 'AbortError') return;
    ui['results-count'].textContent = 'Search unavailable';
    placeholder('We couldn’t load those projects.', 'Your search options are still here. You can edit them or try again.', { retry: true });
    message('search-status', failureText(error), 'error');
  } finally {
    if (requestId === state.searchId) {
      state.searchController = null;
      setSearchBusy(false);
      ui['results-title'].focus();
    }
  }
}

function renderResults(repositories) {
  const fragment = document.createDocumentFragment();
  repositories.forEach(repo => {
    const item = element('li');
    const card = element('article', 'repo-card');
    card.append(element('p', 'repo-owner', repo.owner));
    const heading = element('h3');
    const button = element('button', 'repo-open');
    button.type = 'button';
    button.dataset.repository = repo.fullName;
    button.setAttribute('aria-label', `Inspect ${repo.fullName}`);
    button.setAttribute('aria-controls', 'inspector-content');
    const arrow = element('span', '', '↗');
    arrow.setAttribute('aria-hidden', 'true');
    button.append(element('span', '', repo.name), arrow);
    heading.append(button);
    card.append(heading, element('p', 'repo-description', repo.description.length > 190 ? `${repo.description.slice(0, 187)}…` : repo.description));
    const facts = element('ul', 'card-facts');
    facts.append(element('li', '', `${shortNumber(repo.stars)} stars`), element('li', '', repo.language));
    if (repo.archived) facts.append(element('li', 'archive-badge', 'Archived'));
    card.append(facts);
    item.append(card);
    fragment.append(item);
  });
  ui['results-list'].replaceChildren(fragment);
  ui['results-list'].hidden = false;
  ui['results-placeholder'].hidden = true;
}

ui['results-list'].addEventListener('click', event => {
  const button = event.target.closest('button[data-repository]');
  if (button) openProject(button.dataset.repository, button);
});
ui['details-retry'].addEventListener('click', () => openProject(state.selectedName, state.resultButton, true));
ui['refresh-details'].addEventListener('click', () => openProject(state.selectedName, state.resultButton, true));
// Restore the visitor's place after inspecting details, including when the
// inspector is below the result list on a narrow screen.
ui['back-results'].addEventListener('click', () => {
  (state.resultButton?.isConnected ? state.resultButton : ui['results-title']).focus();
});

async function openProject(fullName, button, refresh = false) {
  stopRequest('detail');
  stopRequest('package');
  const requestId = state.detailId;
  const controller = new AbortController();
  state.detailController = controller;
  state.selectedName = fullName;
  state.repository = null;
  state.resultButton = button;
  ui['results-list'].querySelectorAll('button[data-repository]').forEach(control => {
    const selected = control === button;
    control.closest('article').classList.toggle('is-selected', selected);
    if (selected) control.setAttribute('aria-current', 'true');
    else control.removeAttribute('aria-current');
  });
  ui['inspector-title'].textContent = fullName;
  ui['inspector-empty'].hidden = true;
  ui['inspector-content'].hidden = true;
  ui['details-retry'].hidden = true;
  ui['inspector-actions'].hidden = false;
  ui['refresh-details'].hidden = true;
  ui['package-result'].hidden = true;
  ui['package-controls'].disabled = false;
  ui['package-button'].firstChild.textContent = 'Check package ';
  ui['package-name'].setCustomValidity('');
  ui['package-form'].reset();
  message('package-status', '');
  message('details-status', 'Loading the repository and language breakdown…', 'loading');
  ui['inspector-title'].focus();
  try {
    const options = { signal: controller.signal, refresh };
    /* Keep usable repository details if the independent language call fails.
       Promise outcome handling follows the API documented at:
       https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled */
    const [repository, languages] = await Promise.allSettled([
      api.repository(fullName, options), api.languages(fullName, options)
    ]);
    if (requestId !== state.detailId) return;
    if (repository.status === 'rejected') throw repository.reason;
    const repo = repository.value;
    state.repository = repo;
    state.selectedName = repo.fullName;
    ui['inspector-title'].textContent = repo.fullName;
    ui['detail-description'].textContent = repo.description;
    ui['github-link'].href = githubUrl(repo.fullName);
    renderFacts(repo);
    renderLanguages(languages);
    ui['inspector-content'].hidden = false;
    ui['refresh-details'].hidden = false;
    let summary = repo.archived ? 'GitHub marks this repository as archived.' : 'Project details loaded from GitHub.';
    if (languages.status === 'rejected') summary += ' The language breakdown could not be loaded. Use Refresh details to try again.';
    message('details-status', summary);
  } catch (error) {
    if (requestId !== state.detailId || error.name === 'AbortError') return;
    message('details-status', failureText(error), 'error');
    ui['details-retry'].hidden = false;
  } finally {
    if (requestId === state.detailId) state.detailController = null;
  }
}

function renderFacts(repo) {
  const pushed = repo.pushedAt ? new Date(repo.pushedAt).toLocaleDateString('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }) : 'Not available';
  const facts = [['Stars', number(repo.stars)], ['Forks', number(repo.forks)], ['Last code push (UTC)', pushed], ['Default branch', repo.branch], ['Licence', repo.license], ['Status', repo.archived ? 'Archived' : 'Not archived']];
  ui['detail-facts'].replaceChildren(...facts.map(([label, value]) => {
    const group = element('div');
    group.append(element('dt', '', label), element('dd', '', value));
    return group;
  }));
}

function renderLanguages(result) {
  ui['language-list'].replaceChildren();
  if (result.status === 'rejected') {
    ui['languages-status'].textContent = `${failureText(result.reason)} Use Refresh details to try the language breakdown again.`;
    return;
  }
  const languages = result.value;
  ui['languages-status'].textContent = languages.length ? '' : 'GitHub has not identified any language data for this project.';
  // Keep the breakdown readable while retaining the smaller languages' share.
  const display = languages.length > 5 ? [...languages.slice(0, 4), { name: 'Other languages', percentage: languages.slice(4).reduce((sum, item) => sum + item.percentage, 0) }] : languages;
  display.forEach(language => {
    const item = element('li');
    const row = element('div', 'language-row');
    row.append(element('span', '', language.name), element('span', '', language.percentage < 0.1 ? '<0.1%' : `${language.percentage.toFixed(1)}%`));
    const track = element('div', 'language-track');
    track.setAttribute('aria-hidden', 'true');
    const fill = element('span', 'language-fill');
    fill.style.width = `${language.percentage}%`;
    track.append(fill);
    item.append(row, track);
    ui['language-list'].append(item);
  });
}

ui['package-name'].addEventListener('input', () => {
  ui['package-name'].setCustomValidity('');
  ui['package-result'].hidden = true;
  message('package-status', 'Select Check package to look up this name.');
});
ui['package-form'].addEventListener('submit', event => {
  event.preventDefault();
  if (!state.repository || state.packageController) return;
  let name;
  try { name = validatePackageName(ui['package-name'].value); }
  catch (error) {
    ui['package-name'].setCustomValidity(error.message);
    ui['package-name'].reportValidity();
    return;
  }
  ui['package-name'].value = name;
  lookupPackage(name);
});

async function lookupPackage(name) {
  stopRequest('package');
  const requestId = state.packageId;
  const selectedRepository = state.repository.fullName;
  const controller = new AbortController();
  state.packageController = controller;
  ui['package-controls'].disabled = true;
  ui['package-button'].firstChild.textContent = 'Checking… ';
  ui['package-result'].hidden = true;
  message('package-status', `Checking “${name}” on npm…`, 'loading');
  try {
    const pkg = await api.package(name, { signal: controller.signal });
    if (requestId !== state.packageId || state.repository?.fullName !== selectedRepository) return;
    const matchMessage = renderPackage(pkg, selectedRepository);
    message('package-status', `${matchMessage}. ${pkg.name} v${pkg.version} loaded from npm.`);
  } catch (error) {
    if (requestId !== state.packageId || error.name === 'AbortError') return;
    message('package-status', failureText(error), 'error');
  } finally {
    if (requestId === state.packageId) {
      state.packageController = null;
      ui['package-controls'].disabled = false;
      ui['package-button'].firstChild.textContent = 'Check package ';
      ui['package-name'].focus({ preventScroll: true });
    }
  }
}

// Compare declared repository metadata, not similar names. A match does not
// establish the package's safety, quality or suitability.
function renderPackage(pkg, selectedRepository) {
  const match = pkg.repository ? (pkg.repository.toLowerCase() === selectedRepository.toLowerCase() ? 'matched' : 'different') : 'unknown';
  const label = { matched: 'Repository link matches', different: 'Different repository', unknown: 'Repository link unavailable' }[match];
  const result = ui['package-result'];
  result.dataset.match = match;
  result.replaceChildren(element('p', 'package-match', label), element('h4', '', `${pkg.name} · v${pkg.version}`));
  result.append(element('p', '', pkg.description), element('p', '', `Licence: ${pkg.license}`));
  if (match === 'matched') result.append(element('p', '', 'The package metadata on npm points to the GitHub project you selected.'));
  if (match === 'different') {
    result.append(element('p', '', `npm lists ${pkg.repository}. It does not match ${selectedRepository}.`));
    const repoLink = element('a', '', 'View the declared repository ↗');
    repoLink.href = githubUrl(pkg.repository);
    result.append(repoLink);
  }
  if (match === 'unknown') result.append(element('p', '', 'npm did not provide a recognisable GitHub repository link, so a match could not be established.'));
  const link = element('a', '', 'View package on npm ↗');
  link.href = `https://www.npmjs.com/package/${pkg.name.split('/').map(encodeURIComponent).join('/')}`;
  const paragraph = element('p');
  paragraph.append(link);
  result.append(paragraph);
  result.hidden = false;
  return label;
}

// Enable interaction only after all handlers have been attached.
ui['search-controls'].disabled = false;
ui.examples.querySelectorAll('button').forEach(button => { button.disabled = false; });
ui['setup-message'].hidden = true;
