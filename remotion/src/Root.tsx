import { Composition, Still } from 'remotion'
import { WattWeaveDemo } from './WattWeaveDemo'
import { YouTubeThumbnail } from './YouTubeThumbnail'
import timeline from './timeline.json'

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="WattWeaveDemo"
      component={WattWeaveDemo}
      durationInFrames={timeline.durationInFrames}
      fps={timeline.fps}
      width={timeline.width}
      height={timeline.height}
    />
    <Still
      id="YouTubeThumbnail"
      component={YouTubeThumbnail}
      width={1280}
      height={720}
    />
  </>
)

