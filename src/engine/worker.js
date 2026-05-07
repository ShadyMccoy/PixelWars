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
  MSG_SET_OVERLAY,
} from "./protocol.js";

const host = new EngineHost({
  emit: (type, payload) => self.postMessage({ type, payload }),
});

self.addEventListener("message", (e) => {
  const { type, payload } = e.data || {};
  const log = (err) => self.postMessage({
    type: "log",
    payload: `engine: ${err?.message ?? String(err)}`,
  });
  switch (type) {
    case MSG_INIT_CUSTOM:
      Promise.resolve(host.initCustom(payload)).catch(log);
      break;
    case MSG_INIT_REPLAY:
      Promise.resolve(host.initReplay(payload)).catch(log);
      break;
    case MSG_RESET:
      Promise.resolve(host.reset()).catch(log);
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
    case MSG_SET_OVERLAY:
      host.setOverlay(payload);
      break;
  }
});
