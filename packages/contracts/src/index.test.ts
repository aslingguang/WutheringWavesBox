import { describe, expect, it } from 'vitest';
import {
  MAX_CUSTOM_LAUNCH_ARGUMENTS_LENGTH,
  isValidCustomLaunchArguments,
  normalizeCustomLaunchArguments,
} from './index';

describe('custom launch arguments', () => {
  it('accepts typical Unreal command-line switches', () => {
    expect(isValidCustomLaunchArguments('-nologo -nosplash -ResX=2560 -ResY=1440')).toBe(true);
    expect(isValidCustomLaunchArguments('  -dx12  ')).toBe(true);
  });

  it('treats missing and blank values as no custom arguments', () => {
    expect(isValidCustomLaunchArguments(undefined)).toBe(true);
    expect(isValidCustomLaunchArguments(null)).toBe(true);
    expect(isValidCustomLaunchArguments('   ')).toBe(true);
    expect(normalizeCustomLaunchArguments(undefined)).toBe('');
    expect(normalizeCustomLaunchArguments('  -dx11 ')).toBe('-dx11');
  });

  it('rejects oversized arguments after trimming', () => {
    const limit = 'a'.repeat(MAX_CUSTOM_LAUNCH_ARGUMENTS_LENGTH);
    expect(isValidCustomLaunchArguments(limit)).toBe(true);
    expect(isValidCustomLaunchArguments(`  ${limit}  `)).toBe(true);
    expect(isValidCustomLaunchArguments(`${limit}a`)).toBe(false);
  });

  it('rejects control characters and non-string input', () => {
    expect(isValidCustomLaunchArguments('-dx12\n-dx11')).toBe(false);
    expect(isValidCustomLaunchArguments('-dx12\t-dx11')).toBe(false);
    expect(isValidCustomLaunchArguments(42)).toBe(false);
    expect(isValidCustomLaunchArguments({ customArguments: '-dx12' })).toBe(false);
  });
});
