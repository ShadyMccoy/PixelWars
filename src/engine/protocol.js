// Shared message types crossing the engine/client boundary. Anything
// outside `src/engine/` should treat the engine as a black box: send
// these messages in, receive snapshots and events out. No engine
// internals leak through this file.

// Client -> engine
export const MSG_INIT_CUSTOM = "init:custom";
export const MSG_INIT_REPLAY = "init:replay";
export const MSG_RESET = "reset";
export const MSG_SET_PLAYING = "setPlaying";
export const MSG_SET_SPEED = "setSpeed";
export const MSG_STEP_ONCE = "stepOnce";
export const MSG_SET_SNAPSHOT_INTERVAL = "setSnapshotInterval";
export const MSG_SET_OVERLAY = "setOverlay";

// Engine -> client
export const EVT_SNAPSHOT = "snapshot";
export const EVT_PLAYERS_CHANGED = "players:changed";
export const EVT_WINNER = "winner";
export const EVT_DRAW = "draw";
export const EVT_LOG = "log";
export const EVT_READY = "ready";
