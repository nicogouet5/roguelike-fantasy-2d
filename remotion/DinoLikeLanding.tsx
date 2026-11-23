import {
  AbsoluteFill,
  Img,
  staticFile,
} from 'remotion';

export const DinoLikeLanding = (): React.ReactElement => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#0c0b12', overflow: 'hidden' }}>
      <Img
        src={staticFile('landing/concept-art-dark-fantasy.jpg')}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
          imageRendering: 'pixelated',
          filter: 'contrast(1.05) saturate(0.92) brightness(1)',
        }}
      />
    </AbsoluteFill>
  );
};
