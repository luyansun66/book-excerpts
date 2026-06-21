// ─── Library Building Illustration ──────────────────────────────────────────────
// SVG inlined via raw import.
// Uses the padding-bottom aspect-ratio hack (works on ALL browsers, including
// older Safari where `aspect-ratio` is unsupported).
//
// SVG viewBox: 0 0 882.2 781 → aspect ratio ≈ 781/882.2 ≈ 88.5%

import svgContent from '../../assets/library-decoration.svg?raw';

export default function LibraryBuilding() {
  return (
    <div style={{ width: '100%', maxWidth: 320, margin: '0 auto' }}>
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 0,
          paddingBottom: '88.5%',
          overflow: 'hidden',
        }}
      >
        <div
          dangerouslySetInnerHTML={{ __html: svgContent }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'block',
            lineHeight: 0,
          }}
        />
      </div>
    </div>
  );
}
