import type { StoreDefinition } from "@ingenioz-it/caits/state/createStore";
import type { Loadable } from "@ingenioz-it/caits/state/Loadable";
import type { GreetingsEvent } from "../../application/event/GreetingsEvent.js";
import { ListGreetingsQuery } from "../../application/query/list-greetings/list-greetings.dto.js";

export type GreetingsState = { greetings: Loadable<string[]> };

const greetingsStore: StoreDefinition<GreetingsState, GreetingsEvent> = {
  initialState: { greetings: { status: "idle" } },
  reduce(state, event) {
    switch (event.type) {
      case "greetings.requested": return { ...state, greetings: { status: "loading" } };
      case "greetings.loaded": return { ...state, greetings: { status: "loaded", data: event.greetings } };
    }
  },
  send: (_state, event) => event.type === "greetings.requested" ? new ListGreetingsQuery() : undefined
};

export default greetingsStore;
