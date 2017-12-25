import { WorldState } from "./WorldState";

export class Goal {
  constructor(desiredWorldState: WorldState) {}

  static echo(input: string) {
    return input + input;
  }
}
