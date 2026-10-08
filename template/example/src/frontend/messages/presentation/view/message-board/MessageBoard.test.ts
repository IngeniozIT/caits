// @vitest-environment happy-dom
import { afterEach, describe, expect, globalWith, mountTemplate, settle, test, testPresentation } from "@ingeniozit/caits/testing/frontend/presentation";
import { AddMessageCommand } from "#context/application/command/add-message/add-message.dto.js";
import { EditMessageCommand } from "#context/application/command/edit-message/edit-message.dto.js";
import { RemoveMessageCommand } from "#context/application/command/remove-message/remove-message.dto.js";
import { MessageEditionRequested } from "#context/application/event/MessageEditionRequested.js";
import { MessageRemovalRequested } from "#context/application/event/MessageRemovalRequested.js";
import { MessagesChanged } from "#context/application/event/MessagesChanged.js";
import { MessagesChangeFailed } from "#context/application/event/MessagesChangeFailed.js";
import type { MessagesEvent } from "#context/application/event/MessagesEvent.js";
import { MessagesLoaded } from "#context/application/event/MessagesLoaded.js";
import { MessagesLoadFailed } from "#context/application/event/MessagesLoadFailed.js";
import { ListMessagesQuery } from "#context/application/query/list-messages/list-messages.dto.js";
import { Message } from "#context/domain/entity/Message.js";
import MessageBoard from "./MessageBoard.marko";

afterEach(() => { document.body.innerHTML = ""; });

const hello = new Message("m1", "Hello");
const bye = new Message("m2", "Bye");

/**
 * The board, with a real event bus and store, and a message bus that records what the store sends. `mount` gives the board the answer of
 * the handler to its request for the messages, then forgets the DTO it sent as it loaded.
 */
const setup = () => {
  const presentation = testPresentation("messages");
  const mount = async (answer: MessagesEvent = new MessagesLoaded([])) => {
    const mounted = await mountTemplate(MessageBoard, { $global: globalWith({ messages: presentation }) });
    presentation.events.publish(answer);
    await settle();
    const sentWhenLoading = [...presentation.sent];
    presentation.sent.length = 0;
    return { ...mounted, sentWhenLoading };
  };
  return { ...presentation, mount };
};

const textOf = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim();
const additionField = (container: Element) => container.querySelector("#new-message") as HTMLInputElement;
const editor = (container: Element, id: string) => container.querySelector<HTMLInputElement>(`#edit-${id}`);
const items = (container: Element) => [...container.querySelectorAll("li span")].map(textOf);
const alerts = (container: Element) => [...container.querySelectorAll('[role="alert"]')].map(textOf);
const button = (scope: Element, name: string) => [...scope.querySelectorAll("button")].find(candidate => textOf(candidate) === name) as HTMLButtonElement;
const itemOf = (container: Element, text: string) => [...container.querySelectorAll("li")].find(item => textOf(item.querySelector("span")) === text) as HTMLLIElement;
const type = (field: HTMLInputElement, value: string) => {
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
};
const submit = async (form: HTMLFormElement | null | undefined) => {
  form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await settle();
};
const click = async (target: HTMLButtonElement) => {
  target.click();
  await settle();
};
const add = async (container: Element, text: string) => {
  type(additionField(container), text);
  await submit(additionField(container).form);
};
const edit = async (container: Element, id: string, current: string, text: string) => {
  await click(button(itemOf(container, current), "Edit"));
  type(editor(container, id)!, text);
  await submit(editor(container, id)?.form);
};

describe("MessageBoard action → DTO", () => {
  test("asks for the messages when it loads, and the answer asks for nothing more", async () => {
    const { sent, mount } = setup();
    const { sentWhenLoading } = await mount();

    expect(sentWhenLoading).toStrictEqual([new ListMessagesQuery()]);
    expect(sent).toStrictEqual([]);
  });

  test("adding a message sends its text", async () => {
    const { sent, mount } = setup();
    const { container } = await mount();

    await add(container, "Hello");

    expect(sent).toStrictEqual([new AddMessageCommand("Hello")]);
  });

  test("the editor starts from the text of the message, and saving sends the id and the new text", async () => {
    const { sent, mount } = setup();
    const { container } = await mount(new MessagesLoaded([hello]));

    await click(button(itemOf(container, "Hello"), "Edit"));
    expect(editor(container, "m1")?.value).toBe("Hello");
    type(editor(container, "m1")!, "Hello again");
    await submit(editor(container, "m1")?.form);

    expect(sent).toStrictEqual([new EditMessageCommand("m1", "Hello again")]);
  });

  test("removing a message sends its id, and the buttons wait for the answer", async () => {
    const { sent, mount } = setup();
    const { container } = await mount(new MessagesLoaded([hello, bye]));

    await click(button(itemOf(container, "Bye"), "Remove"));

    expect(sent).toStrictEqual([new RemoveMessageCommand("m2")]);
    expect(button(container, "Add").disabled).toBe(true);
  });

  test("a change asked for while another is on its way sends nothing, and the first one stays the one on its way", async () => {
    const { events, sent, mount } = setup();
    const { container } = await mount(new MessagesLoaded([hello]));

    await add(container, "first");
    await add(container, "second");
    events.publish(new MessageEditionRequested("m1", "x"));
    events.publish(new MessageRemovalRequested("m1"));
    events.publish(new MessagesChanged());
    await settle();

    expect(sent).toStrictEqual([new AddMessageCommand("first"), new ListMessagesQuery()]);
    expect(additionField(container).value).toBe("");
  });

  test.for([new MessagesChanged(), new MessagesChangeFailed("addition", "HTTP 500")])("once a change is answered (%o), the next change is sent", async answer => {
    const { events, sent, mount } = setup();
    const { container } = await mount();

    await add(container, "first");
    events.publish(answer);
    await add(container, "second");

    expect(sent.filter(dto => dto instanceof AddMessageCommand)).toStrictEqual([new AddMessageCommand("first"), new AddMessageCommand("second")]);
  });

  test("once the server made a change, the board asks for the messages again", async () => {
    const { events, sent, mount } = setup();
    await mount();

    events.publish(new MessagesChanged());
    await settle();

    expect(sent).toStrictEqual([new ListMessagesQuery()]);
  });

  test("the other answers of the handlers send nothing", async () => {
    const { events, sent, mount } = setup();
    await mount();

    events.publish(new MessagesLoaded([hello]));
    events.publish(new MessagesLoadFailed("HTTP 503"));
    events.publish(new MessagesChangeFailed("removal", "HTTP 500"));
    await settle();

    expect(sent).toStrictEqual([]);
  });
});

describe("MessageBoard store → HTML", () => {
  test("lists the messages of the first answer", async () => {
    const { mount } = setup();
    const { container } = await mount(new MessagesLoaded([hello, bye]));

    expect(items(container)).toEqual(["Hello", "Bye"]);
    expect(container.textContent).not.toContain("No message yet.");
  });

  test("says so when there is no message", async () => {
    const { mount } = setup();
    const { container } = await mount();

    expect(items(container)).toEqual([]);
    expect(container.textContent).toContain("No message yet.");
  });

  test("says why the messages could not be loaded", async () => {
    const { mount } = setup();
    const { container } = await mount(new MessagesLoadFailed("HTTP 503"));

    expect(alerts(container)).toEqual(["The messages could not be loaded: HTTP 503"]);
  });

  test("shows the messages that the store holds after a change", async () => {
    const { events, mount } = setup();
    const { container } = await mount(new MessagesLoaded([hello]));

    events.publish(new MessagesLoaded([hello, bye]));
    await settle();

    expect(items(container)).toEqual(["Hello", "Bye"]);
  });

  test("while a change is on its way, the fields are read-only and the buttons wait for it", async () => {
    const { events, mount } = setup();
    const { container } = await mount(new MessagesLoaded([hello, bye]));
    await click(button(itemOf(container, "Hello"), "Edit"));
    const waiting = () => [
      additionField(container).readOnly,
      editor(container, "m1")?.readOnly,
      ...[button(container, "Add"), button(container, "Save"), button(itemOf(container, "Bye"), "Edit"), button(itemOf(container, "Bye"), "Remove")].map(target => target.disabled)
    ];
    expect(waiting()).toEqual([false, false, false, false, false, false]);

    await add(container, "Third");
    expect(waiting()).toEqual([true, true, true, true, true, true]);

    events.publish(new MessagesChangeFailed("addition", "HTTP 500"));
    await settle();
    expect(waiting()).toEqual([false, false, false, false, false, false]);
  });

  test("an addition that succeeds empties the field", async () => {
    const { events, mount } = setup();
    const { container } = await mount();

    await add(container, "Hello");
    events.publish(new MessagesChanged());
    await settle();

    expect(additionField(container).value).toBe("");
  });

  test("an addition that the server refuses keeps the text, and the field points to the reason", async () => {
    const { events, mount } = setup();
    const { container } = await mount();

    await add(container, " ");
    events.publish(new MessagesChangeFailed("addition", "A message cannot be empty."));
    await settle();

    expect(additionField(container).value).toBe(" ");
    expect(additionField(container).getAttribute("aria-invalid")).toBe("true");
    expect(additionField(container).getAttribute("aria-describedby")).toBe("new-message-error");
    expect(textOf(container.querySelector("#new-message-error"))).toBe("A message cannot be empty.");
    expect(alerts(container)).toEqual(["A message cannot be empty."]);
  });

  test("an edition that succeeds closes the editor", async () => {
    const { events, mount } = setup();
    const { container } = await mount(new MessagesLoaded([hello]));

    await edit(container, "m1", "Hello", "Hello again");
    events.publish(new MessagesChanged());
    await settle();

    expect(editor(container, "m1")).toBeNull();
    expect(button(itemOf(container, "Hello"), "Edit")).toBeDefined();
  });

  test.for([
    ["edition", "A message cannot be empty."],
    ["removal", "HTTP 500"]
  ] as const)("an %s that the server refuses is told above the list, not at the field of the addition", async ([change, reason]) => {
    const { events, mount } = setup();
    const { container } = await mount(new MessagesLoaded([hello]));

    events.publish(new MessagesChangeFailed(change, reason));
    await settle();

    expect(alerts(container)).toEqual([reason]);
    expect(additionField(container).getAttribute("aria-invalid")).toBeNull();
    expect(container.querySelector("#new-message-error")).toBeNull();
  });

  test("an edition that the server refuses keeps the editor open, with the text that the user typed", async () => {
    const { events, mount } = setup();
    const { container } = await mount(new MessagesLoaded([hello]));

    await edit(container, "m1", "Hello", " ");
    events.publish(new MessagesChangeFailed("edition", "A message cannot be empty."));
    await settle();

    expect(editor(container, "m1")?.value).toBe(" ");
  });

  test("Cancel closes the editor, and sends nothing", async () => {
    const { sent, mount } = setup();
    const { container } = await mount(new MessagesLoaded([hello]));

    await click(button(itemOf(container, "Hello"), "Edit"));
    await click(button(container, "Cancel"));

    expect(editor(container, "m1")).toBeNull();
    expect(sent).toStrictEqual([]);
  });

  test("a removal that succeeds leaves the field of the addition as the user typed it", async () => {
    const { events, mount } = setup();
    const { container } = await mount(new MessagesLoaded([hello]));

    type(additionField(container), "draft");
    await click(button(itemOf(container, "Hello"), "Remove"));
    events.publish(new MessagesChanged());
    await settle();

    expect(additionField(container).value).toBe("draft");
  });

  test("the board follows the store while it is mounted, and stops when it is destroyed", async () => {
    const { store, events, mount } = setup();
    const baseline = store.subscriberCount();
    const mounted = await mount();
    expect(store.subscriberCount()).toBe(baseline + 1);

    await mounted.destroy();

    expect(store.subscriberCount()).toBe(baseline);
    events.publish(new MessagesLoaded([hello]));
    await settle();
    expect(items(mounted.container)).toEqual([]);
  });
});

describe("MessageBoard as it loads", () => {
  test("the field of the addition has a label, and asks for a text", async () => {
    const { mount } = setup();
    const { container } = await mount();
    const field = additionField(container);

    expect(field.labels?.[0]?.textContent).toBe("New message");
    expect([field.name, field.required]).toEqual(["text", true]);
    expect(field.getAttribute("aria-invalid")).toBeNull();
    expect(field.getAttribute("aria-describedby")).toBeNull();
  });

  test("the forms never post to the server themselves: they have no method and no action", async () => {
    const { mount } = setup();
    const { container } = await mount(new MessagesLoaded([hello]));
    await click(button(itemOf(container, "Hello"), "Edit"));

    const forms = [...container.querySelectorAll("form")];
    expect(forms).toHaveLength(2);
    expect(forms.map(form => [form.getAttribute("method"), form.getAttribute("action")])).toEqual([[null, null], [null, null]]);
  });
});
