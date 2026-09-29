/**
 * Browser-safe failure vocabulary of the configuration surfaces this package
 * serves. The redacted views themselves live with their seam in
 * `@deepseek-ai/dsh-settings/types`, whose Cordis event declarations already
 * register that file for the Client compilation face.
 *
 * @module @deepseek-ai/dsh-api-settings-controller/types
 */

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /**
     * Every seam refusal that is not a stale write: an unregistered or malformed
     * namespace, a read-only provider, schema validation, storage.
     */
    'settings/rejected': { readonly ns: string }
    /**
     * The stored revision moved after the caller read it. Its own outcome rather
     * than an invalid request: the caller must re-read and re-apply.
     */
    'settings/conflict': { readonly ns: string; readonly expected: number; readonly actual: number }
    /**
     * The provider refused a valid credential write, for example because a
     * read-only source shadows the reference. The details name only the
     * reference, never the value.
     */
    'credential/rejected': { readonly ref: string }
  }
}

/** Confirmation that the settings document was handed to the native editor. */
export interface SettingsDocumentOpenValue {
  readonly opened: true
}

/** The data directory the Host currently resolves as `$DSH_HOME`. */
export interface DataDirectoryDescribeValue {
  /** Absolute path of the data directory in use. */
  readonly path: string
  /** Whether the Host can reveal this path in a native file manager. */
  readonly canOpen: boolean
}

/** Confirmation that the data directory was handed to the native file manager. */
export interface DataDirectoryOpenValue {
  readonly opened: true
}

/** Confirmation that a data-directory relocation was staged. */
export interface DataDirectoryMigrateValue {
  /** Directory the data was copied into and used after the restart. */
  readonly target: string
  /** Always true: relocating the data directory requires restarting dsh. */
  readonly restartRequired: true
}
