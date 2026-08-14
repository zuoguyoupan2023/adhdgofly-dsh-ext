/**
 * adhdgofly-dsh-ext — host half.
 *
 * v1 provides no host behavior: all highlighting runs client-side against the
 * embedded compact dictionaries.
 *
 * Reserved seam (future): register a package-private RPC for host-side
 * segmentation / dictionary management, e.g.
 *   harness.handle('adhdgofly/segment', async (args) => ({ hits: [] }))
 * Settings are persisted by the client settings page through the standard
 * settings channel — nothing to do here.
 */

export function apply(): void {
  // Intentionally empty for v1.
}
