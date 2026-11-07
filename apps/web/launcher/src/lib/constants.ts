/** Shared launcher UI constants, so a value is not duplicated across modules. */

/** Interval between backend status polls, in milliseconds. */
export const POLL_INTERVAL_MS = 2000

/** Maximum number of log entries retained in the buffer and rendered. */
export const MAX_LOG_ENTRIES = 200

/** How long the chained open waits for the service address after a start. */
export const SERVER_READY_TIMEOUT_MS = 10000

/** Interval between service-address probes while the chained open waits. */
export const SERVER_READY_POLL_MS = 250
