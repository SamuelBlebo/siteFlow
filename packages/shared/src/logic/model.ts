// The architect's 3D model of a project: one file (IFC, or GLB / glTF) that everyone on the project
// can turn around in the browser. Managers upload it; a new upload replaces the old one.
// The type is told by the file's extension: browsers give IFC files no reliable content type.

export const MODEL_MAX_MB = 100;
export type ModelKind = 'ifc' | 'glb' | 'gltf';

const KINDS: Record<ModelKind, string> = {
  ifc: 'application/octet-stream',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
};

export interface SiteModel {
  file: string; kind: ModelKind; name: string; sizeMb: number;
  uploadedBy: string; uploadedByName: string; uploadedAt?: unknown;
}

export const MODEL_EXPORT_HINT = "SiteFlow can't open Revit or SketchUp files. Ask your architect for an IFC or GLB export.";

export function checkModelFile(name: string, sizeBytes: number): { kind: ModelKind; contentType: string; ext: string } | { error: string } {
  const ext = (/\.([a-z0-9]+)$/i.exec(name)?.[1] || '').toLowerCase();
  if (ext === 'rvt' || ext === 'rfa' || ext === 'skp') return { error: MODEL_EXPORT_HINT };
  if (!(ext in KINDS)) return { error: 'Choose an IFC or GLB file (glTF also works).' };
  const mb = sizeBytes / (1024 * 1024);
  if (mb > MODEL_MAX_MB) return { error: `This file is ${Math.round(mb)} MB. The 3D model can be up to ${MODEL_MAX_MB} MB.` };
  const kind = ext as ModelKind;
  return { kind, contentType: KINDS[kind], ext };
}
