import { Composition } from 'remotion'
import { WattWeaveDemo } from './WattWeaveDemo'
import timeline from './timeline.json'

export const RemotionRoot: React.FC = () => (
  <Composition
    id="WattWeaveDemo"
    component={WattWeaveDemo}
    durationInFrames={timeline.durationInFrames}
    fps={timeline.fps}
    width={timeline.width}
    height={timeline.height}
  />
)
