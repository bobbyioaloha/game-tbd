const ARTWORK_WIDTH = 32;
const ARTWORK_HEIGHT = ARTWORK_WIDTH * 942 / 1670;

/** Fit the approved composition above a screen-space action area. */
export function launchFrustum(width: number, height: number, reservedBottom: number) {
  const canvasWidth = Math.max(1, width);
  const canvasHeight = Math.max(1, height);
  const artworkHeight = Math.max(1, canvasHeight - Math.max(0, reservedBottom));
  const unitsPerPixel = Math.max(ARTWORK_WIDTH / canvasWidth, ARTWORK_HEIGHT / artworkHeight);
  const top = ARTWORK_HEIGHT / 2;
  const bottom = top - canvasHeight * unitsPerPixel;
  return {
    left: -canvasWidth * unitsPerPixel / 2,
    right: canvasWidth * unitsPerPixel / 2,
    top,
    bottom,
    centerY: (top + bottom) / 2,
  };
}
