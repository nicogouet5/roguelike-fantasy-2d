import { Composition } from 'remotion';
import { DinoLikeLanding } from './DinoLikeLanding';

export const RemotionRoot = (): React.ReactElement => (
  <Composition
    id="DinoLikeLanding"
    component={DinoLikeLanding}
    durationInFrames={192}
    fps={24}
    width={768}
    height={1376}
  />
);
