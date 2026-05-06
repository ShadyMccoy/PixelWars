// Module worker entry. Boots an EngineHost and forwards messages
// between it and the main thread. Runs the simulation off the UI
// thread so a big map's tick cost doesn't starve scroll, hover, or
// HUD updates.

import { EngineHost } from "./host.js";
import {
  MSG_INIT_CUSTOM,
  MSG_INIT_REPLAY,
  MSG_RESET,
  MSG_SET_PLAYING,
  MSG_SET_SPEED,
  MSG_STEP_ONCE,
  MSG_SET_SNAPSHOT_INTERVAL,
} from "./protocol.js";

const host = new EngineHost({
  emit: (type, payload) => self.postMessage({ type, payload }),
});

self.addEventListener("message", (e) => {
  const { type, payload } = e.data || {};
  switch (type) {
    case MSG_INIT_CUSTOM:
      host.initCustom(payload);
      break;
    case MSG_INIT_REPLAY:
      host.initReplay(payload);
      break;
    case MSG_RESET:
      host.reset();
      break;
    case MSG_SET_PLAYING:
      host.setPlaying(!!payload);
      break;
    case MSG_SET_SPEED:
      host.setSpeed(payload);
      break;
    case MSG_STEP_ONCE:
      host.stepOnce();
      break;
    case MSG_SET_SNAPSHOT_INTERVAL:
      host.setSnapshotInterval(payload);
      break;
  }
});
