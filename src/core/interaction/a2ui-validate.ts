/**
 * A2UI v0.9.1 presentation validation with a safe fallback ladder.
 *
 * The production wire is locked to v0.9.1 with a pinned catalog digest.
 * When the wire version or catalog digest does not match, the tray falls
 * back to the canonical JSON schema form; when that is unsupported it
 * falls back to plain approve/reject/text controls. A validation failure
 * is never mapped to an approval.
 */
import type { A2uiPresentation, Interaction } from './types.js';
import { a2uiCatalog, catalogDigest } from '../a2ui/catalog.js';
import { A2uiSurfaces } from '../a2ui/surfaces.js';

export const A2UI_WIRE_VERSION = '0.9.1';

/** Deterministic digest of the local A2UI catalog. */
export function computeA2uiCatalogDigest(catalog: unknown): string {
  return catalogDigest(catalog);
}

export type A2uiRenderMode =
  | 'a2ui'
  | 'json-schema-form'
  | 'basic-controls';

/**
 * Decide how an Interaction's presentation may render. Unknown components
 * or a catalog mismatch never yield 'a2ui'; the safest usable fallback
 * wins.
 */
export function validateA2uiPresentation(
  presentation: A2uiPresentation | null | undefined,
  localCatalog: unknown,
): A2uiRenderMode {
  if (!presentation) return basicFallbackFor(null);
  if (presentation.wireVersion !== A2UI_WIRE_VERSION) {
    return basicFallbackFor(presentation);
  }
  if (!presentation.messages || presentation.messages.length === 0) {
    return basicFallbackFor(presentation);
  }
  try {
    const localDigest = computeA2uiCatalogDigest(localCatalog);
    if (!presentation.catalogDigest || presentation.catalogDigest !== localDigest) {
      // Catalog mismatch: never render the unknown catalog and never
      // auto-approve anything.
      return 'json-schema-form';
    }
    const model = new A2uiSurfaces(() => {});
    try { model.apply(presentation.messages); } finally { model.dispose(); }
  } catch {
    return 'json-schema-form';
  }
  return 'a2ui';
}

function basicFallbackFor(
  presentation: A2uiPresentation | null | undefined,
): A2uiRenderMode {
  return presentation && hasUsableSchema(presentation) ? 'json-schema-form' : 'basic-controls';
}

function hasUsableSchema(presentation: A2uiPresentation): boolean {
  return presentation.messages.some((message) => {
    const schema =
      (message as { inputSchema?: unknown }).inputSchema
      ?? (message as { input_schema?: unknown }).input_schema
      ?? (message as { schema?: unknown }).schema;
    return typeof schema === 'object' && schema !== null;
  });
}


/** Approval details always use this renderer's pinned catalog, live or restored. */
export function validatedApprovalA2ui(interaction: Pick<Interaction, 'kind' | 'presentation'>): A2uiPresentation | null {
  const a2ui = interaction.kind === 'approval' ? interaction.presentation?.a2ui : null;
  return a2ui && validateA2uiPresentation(a2ui, a2uiCatalog) === 'a2ui' ? a2ui : null;
}
