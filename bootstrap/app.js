const planner = document.getElementById('learning-planner');
const topicInput = document.getElementById('learning-topic');
const minutesInput = document.getElementById('learning-minutes');
const practiceInput = document.getElementById('include-practice');
const result = document.getElementById('planner-result');
const startingMessage = result.textContent;

const topics = {
  html: {
    name: 'HTML',
    reading: 'review headings, paragraphs and meaningful links',
    exercise: 'build a section with a heading, a paragraph and a link'
  },
  css: {
    name: 'CSS',
    reading: 'review selectors, spacing and media queries',
    exercise: 'adjust a layout and check it at phone and desktop widths'
  },
  javascript: {
    name: 'JavaScript',
    reading: 'review variables, events and updating page text',
    exercise: 'make a button update a message when clicked'
  }
};

planner.addEventListener('submit', function (event) {
  event.preventDefault();
  const topic = topics[topicInput.value];
  const minutes = minutesInput.valueAsNumber;

  if (!topic || !Number.isInteger(minutes) || minutes < 15 || minutes > 120 || minutes % 5 !== 0) {
    result.textContent = 'Choose a topic and enter 15 to 120 minutes in steps of 5.';
    return;
  }

  let readingMinutes = minutes - 5;
  let exerciseStep = '';

  if (practiceInput.checked) {
    readingMinutes = Math.max(5, Math.round(minutes * 0.3 / 5) * 5);
    const practiceMinutes = minutes - readingMinutes - 5;
    exerciseStep = `${practiceMinutes} minutes to ${topic.exercise}. `;
  }

  result.textContent = `Your ${minutes}-minute ${topic.name} plan: ` +
    `${readingMinutes} minutes to ${topic.reading}. ` + exerciseStep +
    'Finish with 5 minutes to note what you learnt and one thing to try next.';
});

function clearPlan() {
  if (result.textContent !== startingMessage) {
    result.textContent = startingMessage;
  }
}

planner.addEventListener('input', clearPlan);
planner.addEventListener('reset', clearPlan);
planner.hidden = false;

const loadProjectButton = document.getElementById('load-project');
const githubStatus = document.getElementById('github-status');
const githubDetails = document.getElementById('github-details');
const repositoryUrl = 'https://api.github.com/repos/EmmanuelEsselSHU/my-first-web-app';

loadProjectButton.addEventListener('click', async function () {
  if (loadProjectButton.disabled) return;
  loadProjectButton.disabled = true;
  loadProjectButton.textContent = 'Loading...';
  githubDetails.hidden = true;
  githubStatus.textContent = 'Loading project details from GitHub...';

  const controller = new AbortController();
  const timeoutId = setTimeout(function () { controller.abort(); }, 10000);
  let failureMessage = 'Could not load the project details. Check your connection and try again.';

  try {
    const response = await fetch(repositoryUrl, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2026-03-10'
      },
      signal: controller.signal
    });

    if (!response.ok) {
      if (response.status === 403 || response.status === 429) {
        failureMessage = 'GitHub is temporarily refusing requests. Please try again later.';
      } else if (response.status === 404) {
        failureMessage = 'This project could not be found on GitHub. Please try again later.';
      }
      throw new Error('The API request was unsuccessful.');
    }

    failureMessage = 'GitHub returned unexpected data. Please try again later.';
    const repository = await response.json();
    if (!repository || Array.isArray(repository) || typeof repository.name !== 'string' || !repository.name.trim()) {
      throw new Error('A project name was missing from the response.');
    }

    if (repository.pushed_at != null && typeof repository.pushed_at !== 'string') {
      throw new Error('The response contained an invalid date.');
    }
    const pushedAt = repository.pushed_at ? new Date(repository.pushed_at) : null;
    if (pushedAt && Number.isNaN(pushedAt.getTime())) {
      throw new Error('The response contained an invalid date.');
    }

    document.getElementById('project-name').textContent = repository.name;
    document.getElementById('project-description').textContent =
      typeof repository.description === 'string' && repository.description.trim()
        ? repository.description : 'No description provided.';
    document.getElementById('project-language').textContent =
      typeof repository.language === 'string' && repository.language.trim()
        ? repository.language : 'Not yet identified.';
    document.getElementById('project-pushed').textContent = pushedAt
      ? pushedAt.toLocaleString('en-GB', {
          dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London'
        }) + ' (UK time)'
      : 'Not available.';

    githubDetails.hidden = false;
    githubStatus.textContent = 'Project details loaded from GitHub.';
  } catch (error) {
    githubStatus.textContent = error.name === 'AbortError'
      ? 'GitHub took too long to respond. Please try again.'
      : failureMessage;
  } finally {
    clearTimeout(timeoutId);
    loadProjectButton.disabled = false;
    loadProjectButton.textContent = githubDetails.hidden ? 'Try again' : 'Refresh project details';
  }
});

document.getElementById('github-controls').hidden = false;
