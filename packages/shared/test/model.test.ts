import { describe, expect, it } from 'vitest';
import { MODEL_MAX_MB, checkModelFile, paths } from '../src';

const MB = 1024 * 1024;
const REVIT = "SiteFlow can't open Revit or SketchUp files. Ask your architect for an IFC or GLB export.";

describe('3D model files', () => {
  it('IFC, GLB and glTF, whatever the case of the extension', () => {
    expect(checkModelFile('House.IFC', 5 * MB)).toEqual({ kind: 'ifc', contentType: 'application/octet-stream', ext: 'ifc' });
    expect(checkModelFile('plan.final.glb', MB)).toMatchObject({ kind: 'glb', contentType: 'model/gltf-binary' });
    expect(checkModelFile('a.gltf', MB)).toMatchObject({ kind: 'gltf', contentType: 'model/gltf+json' });
  });
  it('Revit and SketchUp files: ask the architect for an export', () => {
    expect(checkModelFile('x.rvt', MB)).toEqual({ error: REVIT });
    expect(checkModelFile('x.SKP', MB)).toEqual({ error: REVIT });
  });
  it('other files are refused', () => {
    const r = checkModelFile('model.ifc.zip', MB);
    expect('error' in r && r.error).toContain('IFC or GLB');
    expect('error' in checkModelFile('noext', MB)).toBe(true);
  });
  it('over the size limit, with the size in the message', () => {
    expect(MODEL_MAX_MB).toBe(100);
    const r = checkModelFile('big.ifc', 150 * MB);
    expect('error' in r && r.error).toContain('150 MB');
    expect('error' in r && r.error).toContain('100 MB');
    expect('kind' in checkModelFile('edge.ifc', 100 * MB)).toBe(true);
  });
  it('stored under the project', () => {
    expect(paths.modelFile('c', 's', 'm.ifc')).toBe('companies/c/sites/s/model/m.ifc');
  });
});
