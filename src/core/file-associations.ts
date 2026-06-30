import type { FileAssociation, TauriFileAssociation } from '../types.js';

/**
 * Normalize a file extension to the leading-dot form MSIX `<uap:FileType>`
 * requires (e.g. `ics` -> `.ics`). Tauri's `bundle.fileAssociations.ext`
 * conventionally omits the dot, whereas bundle.config.json entries already
 * carry it.
 */
function withLeadingDot(ext: string): string {
  return ext.startsWith('.') ? ext : `.${ext}`;
}

/**
 * Merge file associations declared in tauri.conf.json (`bundle.fileAssociations`,
 * Tauri's schema) with the Windows-only `bundle.config.json` list. Tauri entries
 * are mapped to the MSIX {@link FileAssociation} shape; on a name collision the
 * bundle.config.json entry wins so existing projects keep their explicit Windows
 * overrides. Returns a new array; inputs are not mutated.
 */
export function mergeFileAssociations(
  tauriAssociations: TauriFileAssociation[] | undefined,
  bundleAssociations: FileAssociation[] | undefined
): FileAssociation[] {
  const merged: FileAssociation[] = [];
  const indexByName = new Map<string, number>();

  const upsert = (assoc: FileAssociation): void => {
    const existing = indexByName.get(assoc.name);
    if (existing !== undefined) {
      merged[existing] = assoc; // later entry wins on name collision
    } else {
      indexByName.set(assoc.name, merged.length);
      merged.push(assoc);
    }
  };

  for (const assoc of tauriAssociations ?? []) {
    const extensions = (assoc.ext ?? []).map(withLeadingDot);
    if (extensions.length === 0) continue;
    upsert({
      name: assoc.name ?? extensions[0],
      extensions,
      description: assoc.description,
    });
  }

  // bundle.config.json takes precedence over tauri.conf.json on name collision.
  for (const assoc of bundleAssociations ?? []) {
    upsert(assoc);
  }

  return merged;
}
