// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  REVIEW_PAGE_Z_INDEX,
  SHARE_SHEET_FULLSCREEN_Z_INDEX,
  SHARE_SHEET_Z_INDEX,
} from '../shareSheetLayers';

describe('share sheet overlay layers', () => {
  it('keeps loading, editor, and fullscreen layers above the review page', () => {
    expect(SHARE_SHEET_Z_INDEX).toBeGreaterThan(REVIEW_PAGE_Z_INDEX);
    expect(SHARE_SHEET_FULLSCREEN_Z_INDEX).toBeGreaterThan(SHARE_SHEET_Z_INDEX);
  });

  it('wires the shared layer constants into both dynamic and loaded states', () => {
    const host = readFileSync(
      path.resolve(process.cwd(), 'src/app/components/sheets/ShareSheetHost.tsx'),
      'utf8',
    );
    const sheet = readFileSync(
      path.resolve(process.cwd(), 'src/app/components/sheets/ShareSheet.tsx'),
      'utf8',
    );

    expect(host).toContain('zIndex: SHARE_SHEET_Z_INDEX');
    expect(sheet).toContain('zIndex: SHARE_SHEET_Z_INDEX');
    expect(sheet).toContain('zIndex: SHARE_SHEET_FULLSCREEN_Z_INDEX');
  });
});
