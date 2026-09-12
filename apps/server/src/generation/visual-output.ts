import { GeometryWireSchema, MeshAppearanceSchema, recipeToAppearance,
  type GeneratedCreation, type GeometryMode } from '@sky/shared';
import { PipelineFailure } from './pipeline-errors.js';

export function validateVisualOutput(data:unknown, mode:GeometryMode):GeneratedCreation['appearance'] {
  if (mode === 'primitives') {
    try { return recipeToAppearance(data); }
    catch { throw new PipelineFailure('INVALID_RECIPE', 'Visual recipe contains unsupported parts, transforms, colors, or extra fields.'); }
  }
  const wire = GeometryWireSchema.safeParse(data);
  if (!wire.success) throw new PipelineFailure('INVALID_MESH', 'Geometry response did not match the mesh structure.');
  const mesh = MeshAppearanceSchema.safeParse({
    type:'mesh', vertices:wire.data.vertices.map(v => [v.x,v.y,v.z]),
    triangles:wire.data.faces.map(f => [f.a,f.b,f.c]), faceColors:wire.data.faces.map(f => f.color),
  });
  if (!mesh.success) throw new PipelineFailure('INVALID_MESH', 'Mesh contains invalid coordinates, triangle indices, or degenerate faces.');
  return mesh.data;
}
