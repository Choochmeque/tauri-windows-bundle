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
 * Normalize a file-association name into a valid MSIX
 * `<uap:FileTypeAssociation Name>` identifier. Microsoft's manifest schema
 * requires that attribute to be "all lower case characters with no spaces" and
 * a string "between 1 and 64 characters in length"; MakeAppx rejects the
 * package otherwise.
 *
 * This matters because Tauri's `fileAssociations.name` is a human display
 * string (it maps to `CFBundleTypeName` on macOS, e.g. `iCalendar`), so it
 * can't be used as the Windows identifier as-is. bundle.config.json names are
 * normalized too, so a collision between the two sources dedupes on the same
 * key and neither source can emit an invalid manifest.
 */
function toMsixName(raw: string): string {
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '')
    .replace(/^[.-]+/, '')
    .slice(0, 64);
  return normalized || 'fileassociation';
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
      name: toMsixName(assoc.name ?? assoc.ext?.[0] ?? extensions[0]),
      extensions,
      description: assoc.description,
    });
  }

  // bundle.config.json takes precedence over tauri.conf.json on name collision.
  for (const assoc of bundleAssociations ?? []) {
    upsert({ ...assoc, name: toMsixName(assoc.name) });
  }

  return merged;
}
