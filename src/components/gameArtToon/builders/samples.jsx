// The eight approved sample tiles (sampleScenes.js, animated by toonSamples.css), drawn in their
// own 100×100 box and scaled into the 64×64 tile. The approved tiles carry their own outlines, so
// the tile-wide ink stroke is switched off around them.
import { SAMPLE_SCENES } from './sampleScenes'

const tile = (type) => () => (
  <g stroke="none">
    <g transform="scale(0.64)" dangerouslySetInnerHTML={{ __html: SAMPLE_SCENES[type]() }} />
  </g>
)

export default Object.fromEntries(Object.keys(SAMPLE_SCENES).map((type) => [type, tile(type)]))
