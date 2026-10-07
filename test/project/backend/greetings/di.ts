import { bind } from "@ingeniozit/caits/di/Container";
import { Greeter } from "./domain/port/greeter/Greeter.js";
import { PoliteGreeter } from "./infra/greeter/polite-greeter.js";

export default [
  bind(Greeter).to(PoliteGreeter).with({ salutation: "Hello" })
];
