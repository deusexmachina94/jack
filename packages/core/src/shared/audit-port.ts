/**
 * The audit capability, as seen by the modules that emit events. The audit module
 * implements this; other modules depend on the port, never on audit internals
 * (CLAUDE.md module-isolation rule).
 */
export interface Auditor {
  appendEntry(
    kind: string,
    payload: Record<string, unknown>,
  ): Promise<{ id: string; seq: number; entryHash: string }>;
}

/** A no-op auditor, for contexts where auditing is not wired (e.g. some tests). */
export const nullAuditor: Auditor = {
  async appendEntry() {
    return { id: '00000000-0000-0000-0000-000000000000', seq: 0, entryHash: 'noop' };
  },
};
