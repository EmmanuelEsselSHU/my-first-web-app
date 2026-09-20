PROJECT EXPLORER

A browser app for finding public GitHub repositories, inspecting their
activity and languages, and comparing a published npm package's declared
repository with the selected project.

Built for Web Technologies assessment using HTML, original
CSS and JavaScript modules. There is no framework, build step, application
server or account requirement.

RUN LOCALLY

Open this folder in Visual Studio Code. Serve it with Live Server, or run
the following from this folder with Python installed:

    python -m http.server 8766 --bind 127.0.0.1

Open http://127.0.0.1:8766/ in a browser. If that port is already serving
another copy, stop that server or use another available port, such as 8767,
in both the command and browser address.

Use an HTTP server: opening index.html directly as a file URL can prevent
JavaScript modules loading. Internet access is required for API requests.

TRY THE MAIN JOURNEY

1. Search for axios, choose JavaScript, enter 100 minimum stars and select
   Most stars.
2. Inspect axios/axios. Review its description, licence, last code push
   and language percentages.
3. Enter axios in the npm form. Its declared repository should match the
   selected project.
4. Enter react to see an example of a package pointing to a different
   repository. Metadata and versions can change.
5. Try pagination, edit a filter, and use Reset search. Back to selected
   result returns keyboard focus from the inspector to the chosen card.

FILES

index.html        Page structure, forms, labels and status regions.
styles.css        Mobile-first styling, grids, focus and component states.
app.js            Form events, DOM updates, feedback, focus and cancellation.
api.js            Validation, request URLs, response checking and caching.
assets/mark.svg   Local decorative brand mark.
tests/api.test.js Automated API tests with controlled responses.
package.json      JavaScript module mode and test command; no dependencies.
README.txt        This guide, comment information and source references.

HOW THE API FEATURES CONNECT

The search form's keywords, language, minimum stars and archived checkbox
become GitHub search qualifiers. Sort and page become query parameters.
The app fetches eight results per page, up to GitHub's first 1,000 results,
and handles partial search responses.

Selecting a card requests repository details and language totals from
GitHub. Language percentages describe code bytes, not project quality.
The requests settle separately so a language failure does not discard
otherwise available project details.

The npm form requests the latest published version of the entered name.
The app compares the package's declared GitHub owner/repository with the
selected project. It shows a match, a different repository or insufficient
metadata. Similar names alone are not evidence of a relationship.
A match is not an assurance of package safety or quality.

Successful, validated responses are cached in memory for five minutes,
up to 40 entries. Refresh details bypasses the cache. Requests time out
after 12 seconds. Reset and new selections cancel older requests; request
identifiers also prevent outdated responses replacing the current view.

DESIGN AND ACCESSIBILITY

The default layout is one column. At 600 CSS pixels, filters and result
cards gain columns. At 1,040 pixels, project details sit beside results.
Flexible tracks and wrapping accommodate long names and descriptions.

Controls have native labels and constraints. The app provides a skip link,
visible keyboard focus, concise status regions and a focus return button.
Errors use explanatory text rather than colour alone. External strings
are inserted with textContent; links are built for known GitHub/npm domains.

The original implementation was checked with keyboard interaction and
at widths from 320 to 1,280 pixels. This is targeted testing, not a full
WCAG audit or a screen-reader test. The restoration in this backup adds
comments and documentation, without changing the application logic.

TESTS

With a recent Node.js version supporting the built-in test runner, run
from this folder:

    node --test tests/api.test.js

The suite has 23 tests covering query construction, response validation,
package matching, caching, errors, timeout and cancellation. It uses
controlled responses rather than live API calls. No npm installation is
needed to run the app or the tests.

CODE COMMENTS AND SOURCE CITATIONS

Source citations and concise explanatory comments are included.
The comments identify the documentation informing the relevant
techniques and API response contracts. This reference list complements
the citations in the source files, it does not replace them.

- api.js cites GitHub and npm API documentation, Fetch and AbortController.
  Comments explain query construction, matching, rate limits and caching.
- app.js cites DOM textContent, form submit events and Promise.allSettled.
  Comments explain outdated-response protection, focus and package matching.
- index.html cites W3C guidance for labels and status announcements.
- styles.css cites CSS Grid and W3C visible-focus guidance, with comments
  describing the responsive layout changes.
- tests/api.test.js cites the Node.js test runner documentation.
- assets/mark.svg explains the mark's decorative role.

Keep the source citation comments when preparing the assessment: the brief
requires citations in code comments for borrowed algorithms, code samples
or inspiration. package.json remains standard JSON, which does not support
comments; its role is documented above.

LIMITS AND FUTURE IMPROVEMENTS

- Public API limits and availability can interrupt searches. Failed
  requests preserve search choices and offer retry.
- Only public repositories are searched. No credentials or private
  repository data are stored.
- Not every project has an npm package. Monorepos, moved repositories
  and absent or outdated metadata can require manual interpretation.
- Package names use a restricted lowercase format, including scoped
  names such as @scope/package. Advanced GitHub query syntax is excluded.
- Cached results may be up to five minutes old.
- Future work could add shareable searches and testing with screen-reader
  users and physical mobile devices.

REFERENCES

GitHub - Repository search:
https://docs.github.com/en/rest/search/search#search-repositories

GitHub - Repository endpoints:
https://docs.github.com/en/rest/repos/repos

GitHub - Rate limits:
https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api

npm - Registry API:
https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md

MDN - Using Fetch:
https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch

MDN - AbortController:
https://developer.mozilla.org/en-US/docs/Web/API/AbortController

MDN - textContent:
https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent

MDN - Form submit events:
https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement/submit_event

MDN - Promise.allSettled:
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled

MDN - CSS Grid:
https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout

W3C - Form labels:
https://www.w3.org/WAI/tutorials/forms/labels/

W3C - Status messages:
https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html

W3C - Visible focus:
https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html

Node.js - Test runner:
https://nodejs.org/api/test.html
