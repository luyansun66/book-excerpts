import { useEffect, useMemo, useState } from 'react';
import {
  loadCoverPalette,
  paletteFromColors,
  peekCoverPalette,
  type CoverPalette,
} from './coverPalette';

/** 默认书脊在封面尚未解码时先画同书名的占位色，随后再换成真实封面派生色。 */
export function useCoverPalette(coverData: string | null | undefined, fallbackBase: string): CoverPalette {
  const fallback = useMemo(() => paletteFromColors(fallbackBase), [fallbackBase]);
  const src = coverData?.trim() || null;
  const [resolved, setResolved] = useState<{ src: string | null; palette: CoverPalette | null }>(() => ({
    src,
    palette: src ? peekCoverPalette(src) ?? null : null,
  }));

  useEffect(() => {
    if (!src) {
      setResolved({ src: null, palette: null });
      return;
    }

    const cached = peekCoverPalette(src);
    if (cached !== undefined) {
      setResolved({ src, palette: cached });
      return;
    }

    let active = true;
    setResolved({ src, palette: null });
    void loadCoverPalette(src).then((palette) => {
      if (active) setResolved({ src, palette });
    });
    return () => {
      active = false;
    };
  }, [src]);

  return resolved.src === src && resolved.palette ? resolved.palette : fallback;
}
