import { renderHook, act } from '@testing-library/react';
import { useWaterTracker } from './useWaterTracker';

describe('useWaterTracker parity', () => {
  it('calculates water progress correctly', () => {
    const initialLogs = [{ id: '1', amount_ml: 500, logged_at: new Date().toISOString() }];
    const { result } = renderHook(() => useWaterTracker(initialLogs));

    // Goal is 2000ml in current code
    expect(result.current.waterTotal).toBe(500);
    expect(result.current.waterProgress).toBe(0.25);
  });
});