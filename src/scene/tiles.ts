import type { Map, Tile } from 'three-map-terrain'

/**
 * The terrain tiles in the scene: loaded and stitched. `map.terrain` also
 * holds the groups of the layers (features, base), so it is not a list of
 * tiles.
 */
export const placedTiles = (map: Map): Tile[] =>
  Object.values(map.tileCache).filter(
    (tile) => tile.loaded && tile.mesh.parent === map.terrain
  )
