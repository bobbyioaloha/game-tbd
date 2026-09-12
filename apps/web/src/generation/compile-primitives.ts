import { PrimitiveAppearanceSchema, type Primitive } from '@sky/shared';
import { BoxGeometry, SphereGeometry, CylinderGeometry, ConeGeometry, Color, Euler, Matrix4, Quaternion, Vector3 } from 'three';

// Fixed tessellation, independent of the raw model-written mesh's 512-face limit.
export const MAX_COMPILED_TRIANGLES = 10_000;
const createGeometry = (type: Primitive['type']) => {
  switch (type) {
    case 'box': return new BoxGeometry(1, 1, 1);
    case 'sphere': return new SphereGeometry(0.5, 16, 12);
    case 'cylinder': return new CylinderGeometry(0.5, 0.5, 1, 16);
    case 'cone': return new ConeGeometry(0.5, 1, 16);
  }
};

// Bake static parts into attributes for one geometry, one material, and one mesh.
// No geometry resources escape this function; R3F owns the final render geometry.
export function compilePrimitiveAppearance(data: unknown) {
  const appearance = PrimitiveAppearanceSchema.parse(data);
  const positions: number[] = [], normals: number[] = [], colors: number[] = [];
  for (const part of appearance.primitives) {
    const geometry = createGeometry(part.type);
    try {
      geometry.applyMatrix4(new Matrix4().compose(
        new Vector3(...part.position),
        new Quaternion().setFromEuler(new Euler(...part.rotation, 'XYZ')),
        new Vector3(...part.scale),
      ));
      const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
      const count = geometry.index?.count ?? position.count;
      if ((positions.length / 3 + count) / 3 > MAX_COMPILED_TRIANGLES) {
        throw new Error('Compiled visual exceeds its triangle budget.');
      }
      const color = new Color(part.color);
      for (let offset = 0; offset < count; offset++) {
        const index = geometry.index ? geometry.index.getX(offset) : offset;
        positions.push(position.getX(index), position.getY(index), position.getZ(index));
        normals.push(normal.getX(index), normal.getY(index), normal.getZ(index));
        colors.push(color.r, color.g, color.b);
      }
    } finally { geometry.dispose(); }
  }
  return {
    positions: new Float32Array(positions), normals: new Float32Array(normals),
    colors: new Float32Array(colors), triangleCount: positions.length / 9,
  };
}
