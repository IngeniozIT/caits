# Example

`npx github:IngeniozIT/caits#v0.3.0 init my-app --example` makes a small app that shows how to write each layer and each kind of test. Read it, then change it or remove it.

The app is in the repository [IngeniozIT/caits-example](https://github.com/IngeniozIT/caits-example), not in the package of CAITS: `init` gets it with git, at the tag of its version.

## What the app does

- A home page and a page Example. The two pages have the same menu, with the logo of CAITS, and its name in the colors of the logo. The menu marks the page that shows.
- The home page starts the developer: the promise of the harness, the list of its checks and two more guarantees (no debates, no bloat), the first steps after the one that is done already, the commands of every day, and how to work with an AI agent, with a prompt to start with. A button copies each command, and the prompt.
- A button of the menu switches between the light theme and the dark theme.
- On the page Example, the user adds, edits and removes messages.
- The backend keeps the messages in the file `tmp/messages.json` of the project (or in the folder `DATA_DIR`, when it is set).
- If the backend refuses a change (for example an empty message), the page shows why, and keeps what the user typed.
- The pages have the light colors or the dark colors, as the system of the user.

## The way of a new message

```
MessageBoard.marko                      the View publishes MessageAdditionRequested
  → messagesStore.ts                    the store sends an AddMessageCommand (frontend DTO)
  → add-message.handler.ts (frontend)   the handler calls the MessagesGateway port
  → http-messages-gateway.ts            the adapter posts the text to /api/messages
  → routes/_backend/api/messages        the route gives the request to the controller
  → add-message-http.controller.ts      the controller sends an AddMessageCommand (backend DTO)
  → add-message.handler.ts (backend)    the handler asks the domain, then the MessageRepository port
  → Message.ts                          the domain refuses an empty text, or a text that is too long
  → file-message-repository.ts          the adapter keeps the message in tmp/messages.json
```

The answer goes back the same way. The frontend handler publishes MessagesChanged or MessagesChangeFailed. The store keeps the result, and after a change it asks for the messages again. The View shows the new list, or the reason of the refusal.

An edition (`PUT /api/messages/{id}`) and a removal (`DELETE /api/messages/{id}`) go the same way.

## The files

| Folder | What it shows |
|---|---|
| `src/routes/_frontend/+layout.marko` | The menu, which each page shows. It imports the stylesheet of the app. |
| `src/routes/_frontend/style/` | The stylesheet of the app, `app.scss`, and the partials that it loads: the values, the theme, the HTML elements, the parts of each page, and the menu. |
| `src/routes/_frontend/component/Logo.marko` | The logo: an SVG, with the colors of the theme (`Logo.scss`). The menu and the home page show it. |
| `src/routes/_frontend/component/ThemeSwitch.marko` | The button of the theme, in the menu, with its stylesheet. |
| `src/routes/_frontend/component/CopyButton.marko` | The button that copies a command or the prompt of the home page, with its stylesheet. |
| `src/routes/_frontend/+page.marko`, `messages/+page.marko` | The pages: the HTML of the page and the View tags, and next to each page its stylesheet (`home-page.scss`, `messages-page.scss`). A page has no test. |
| `src/routes/_backend/api/messages/` | The API routes. A route only gives the request to a controller. |
| `src/backend/messages/domain/` | An entity that refuses a text that is not valid, its errors, and a port with its contract. |
| `src/backend/messages/application/` | Four use cases: add, list, edit and remove. Each has its DTOs, its handler and its test. |
| `src/backend/messages/infra/message-repository/` | Two adapters of the port: one with a file (production), one in memory (tests). |
| `src/backend/messages/presentation/` | One controller for each use case: from a request to a DTO, and from the output or the error to a response. |
| `src/backend/messages/di.ts`, `test.di.ts` | The bindings of production, and those of the tests. |
| `src/frontend/messages/domain/` | The gateway port, its contract, and the entity that it gives. |
| `src/frontend/messages/application/` | The four use cases, and the events of the context, one file each. |
| `src/frontend/messages/infra/messages-gateway/` | The HTTP adapter (production) and the fake adapter (tests). |
| `src/frontend/messages/presentation/` | The store, the View with its stylesheet, its presenter and its loader, and the type of the frontend. |

## The design

The design comes from the logo: an arch of indigo stones, held by a keystone of teal. The pages are calm: a paper of warm stone (or of ink, in the dark), with a fine grain, and the two colors of the logo. On the home page, the logo floats on a card of frosted glass.

The styles are in SCSS files, apart from the HTML (see [Styles](Styles.md)). The layout imports `style/app.scss`, the CSS of all the pages, which loads the partials of `style/`, in this order:

| Partial | What it holds |
|---|---|
| The fonts | The packages of the fonts (Fontsource), loaded with `@use`. |
| `_theme.scss` | The colors and the fonts as CSS variables, light and dark, from two mixins. |
| `_elements.scss` | The paper, the HTML elements, and the class `button`. |
| `_page.scss` | The parts of each page: its width, the classes `eyebrow` and `lead`, and the rise of its blocks. |
| `_menu.scss` | The menu. |

`_values.scss` gives the widths (`$page`, `$narrow`, `$phone`) to the stylesheets of the routes, and no CSS.

Each page, each component and the View import their own stylesheet, next to them:

| Stylesheet | The pages that load it | What it holds |
|---|---|---|
| `home-page.scss` | The home page | The logo on its glass and the name of CAITS, the cards of the guarantees with the list of the checks, the cards of the first steps, the terminal of the commands, and the prompt for an AI agent. |
| `messages/messages-page.scss` | The page Example | The width of the page. |
| `component/Logo.scss` | All the pages (the menu shows the logo) | The two colors of the logo, from the theme: `--caits-primary` and `--caits-accent`. |
| `component/ThemeSwitch.scss` | All the pages | The button and its two icons: the moon in the light theme, the sun in the dark theme. |
| `component/CopyButton.scss` | The home page | The small button of the terminals, in their colors. |
| `MessageBoard.scss` | The page Example | The classes of the View: the form, the cards of the messages, the empty board. |

Each class of a page, a component or a View starts with its name: `home-page__hero`, `theme-switch__moon`, `message-board__composer`. The build makes three CSS files: one for all the pages, one for the home page, and one for the page Example.

- **The fonts**: Instrument Serif for the titles, Geist for the text, Geist Mono for the code and the labels. `init --example` adds their packages (Fontsource) to the dependencies. The build puts the files of the fonts in the app: the pages load nothing from another site.
- **The theme**: the colors follow the system of the user, until the user clicks the button of the theme. The button puts `data-theme="light"` or `data-theme="dark"` on `<html>`, and keeps the choice in the cookie `theme`. The layout reads this cookie: the server sends each page in the theme of the user, thus a page never shows the other theme first. The icon of the button comes from `light-dark()`, which reads the theme: it is right before the page runs any script.
- **The motion**: the blocks of a page rise into place; on the home page, the logo draws itself, takes its colors, then floats; a new message rises into the list; while a change is on its way, a light runs under the form. The users who ask for less motion (`prefers-reduced-motion`) see no motion.
- **The busy board**: while a change is on its way, the View puts `aria-busy="true"` on the board. The styles use it, and the screen readers tell it.

The menu marks the page that shows: the layout reads the route in `$global.route`, and gives `aria-current="page"` to the link of this route.

## The tests

| Test | Files | What they check |
|---|---|---|
| Backend application | `*.test.ts` in `src/backend/messages/application/` | The output or the error for a DTO, and what the repository keeps. |
| Backend presentation | `*-http.test.ts` | The response for a request, and the DTO that the controller sends. |
| Backend infra | `*-message-repository.test.ts` | Each adapter runs the contract of its port. |
| Backend integration | `src/backend/context-map.integration.test.ts` | The backend with the production bindings: the file in `DATA_DIR`, or in `tmp/`. |
| Frontend application | `*.test.ts` in `src/frontend/messages/application/` | The events that each handler publishes. |
| Frontend presentation | `MessageBoard.test.ts` | The DTO that each user action sends, and the HTML for each state of the store (also `aria-busy`). |
| Frontend infra | `*-messages-gateway.test.ts` | Each adapter runs the contract of its port. |
| End-to-end | `test/e2e/layout.spec.ts` | The title of the home page, the menu and the page that it marks, and the switch of the theme, also after a reload. |
| End-to-end | `test/e2e/home.spec.ts` | The buttons of the home page copy the prompt and a command. |
| End-to-end | `test/e2e/messages.spec.ts` | A message added, edited and removed in a browser, and a refused message. |

The example passes all the checks of a new project: the architecture rules, 100% coverage and 100% mutation score.

The backend has one context, thus no context map: its integration test is the only file next to the place of the map. When a second context reacts to the events of the first, write the map in `src/backend/context-map.ts`.

## Remove the example

Remove `src/backend/messages/`, `src/frontend/messages/`, `src/backend/context-map.integration.test.ts`, `src/routes/_backend/api/messages/`, `src/routes/_frontend/messages/` and `test/e2e/messages.spec.ts`. Then change the menu, the logo, the home page with its test (`test/e2e/home.spec.ts`), and the fonts (`@fontsource…` in `package.json`, and their `@use` in `app.scss`).
