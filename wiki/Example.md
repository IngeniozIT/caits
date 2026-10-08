# Example

`npx github:IngeniozIT/caits#v0.3.0 init my-app --example` makes a small app that shows how to write each layer and each kind of test. Read it, then change it or remove it.

## What the app does

- A home page and a page Messages. The two pages have the same menu.
- On the page Messages, the user adds, edits and removes messages.
- The backend keeps the messages in the file `tmp/messages.json` of the project (or in the folder `DATA_DIR`, when it is set).
- If the backend refuses a change (for example an empty message), the page shows why, and keeps what the user typed.

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
| `src/routes/_frontend/+layout.marko` | The menu, which each page shows. |
| `src/routes/_frontend/+page.marko`, `messages/+page.marko` | The pages: the HTML of the page and the View tags. A page has no test. |
| `src/routes/_backend/api/messages/` | The API routes. A route only gives the request to a controller. |
| `src/backend/messages/domain/` | An entity that refuses a text that is not valid, its errors, and a port with its contract. |
| `src/backend/messages/application/` | Four use cases: add, list, edit and remove. Each has its DTOs, its handler and its test. |
| `src/backend/messages/infra/message-repository/` | Two adapters of the port: one with a file (production), one in memory (tests). |
| `src/backend/messages/presentation/` | One controller for each use case: from a request to a DTO, and from the output or the error to a response. |
| `src/backend/messages/di.ts`, `test.di.ts` | The bindings of production, and those of the tests. |
| `src/frontend/messages/domain/` | The gateway port, its contract, and the entity that it gives. |
| `src/frontend/messages/application/` | The four use cases, and the events of the context, one file each. |
| `src/frontend/messages/infra/messages-gateway/` | The HTTP adapter (production) and the fake adapter (tests). |
| `src/frontend/messages/presentation/` | The store, the View with its presenter and its loader, and the type of the frontend. |

## The tests

| Test | Files | What they check |
|---|---|---|
| Backend application | `*.test.ts` in `src/backend/messages/application/` | The output or the error for a DTO, and what the repository keeps. |
| Backend presentation | `*-http.test.ts` | The response for a request, and the DTO that the controller sends. |
| Backend infra | `*-message-repository.test.ts` | Each adapter runs the contract of its port. |
| Backend integration | `src/backend/context-map.integration.test.ts` | The backend with the production bindings: the file in `DATA_DIR`, or in `tmp/`. |
| Frontend application | `*.test.ts` in `src/frontend/messages/application/` | The events that each handler publishes. |
| Frontend presentation | `MessageBoard.test.ts` | The DTO that each user action sends, and the HTML for each state of the store. |
| Frontend infra | `*-messages-gateway.test.ts` | Each adapter runs the contract of its port. |
| End-to-end | `test/e2e/messages.spec.ts` | The menu, then a message added, edited and removed in a browser, and a refused message. |

The example passes all the checks of a new project: the architecture rules, 100% coverage and 100% mutation score.

The backend has one context, thus no context map: its integration test is the only file next to the place of the map. When a second context reacts to the events of the first, write the map in `src/backend/context-map.ts`.

## Remove the example

Remove `src/backend/messages/`, `src/frontend/messages/`, `src/backend/context-map.integration.test.ts`, `src/routes/_backend/api/messages/`, `src/routes/_frontend/messages/` and `test/e2e/messages.spec.ts`. Then change the menu and the home page.
