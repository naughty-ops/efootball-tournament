'use client';

import { useRef, useCallback } from 'react';

export interface UseSwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  minDeltaX?: number;
  maxDeltaYRatio?: number;
  maxDurationMs?: number;
  disabled?: boolean;
}

export function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  minDeltaX = 45,
  maxDeltaYRatio = 0.65,
  maxDurationMs = 700,
  disabled = false,
}: UseSwipeGestureOptions) {
  const touchState = useRef({
    startX: 0,
    startY: 0,
    startTime: 0,
    isScrollingVertical: false,
    isIgnored: false,
  });

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || e.touches.length !== 1) {
        touchState.current.isIgnored = true;
        return;
      }

      const touch = e.touches[0];
      const target = e.target as HTMLElement | null;

      // Ignore touches on interactive inputs, controls, or horizontally scrollable widgets
      if (
        target &&
        target.closest(
          'input, textarea, select, button, [role="button"], a, .no-swipe, [data-swipe-ignore="true"]'
        )
      ) {
        touchState.current.isIgnored = true;
        return;
      }

      touchState.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: Date.now(),
        isScrollingVertical: false,
        isIgnored: false,
      };
    },
    [disabled]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || touchState.current.isIgnored || touchState.current.isScrollingVertical) {
        return;
      }

      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - touchState.current.startX);
      const deltaY = Math.abs(touch.clientY - touchState.current.startY);

      // If user moves vertically more than horizontally, lock into vertical scroll
      if (deltaY > deltaX && deltaY > 8) {
        touchState.current.isScrollingVertical = true;
      }
    },
    [disabled]
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (
        disabled ||
        touchState.current.isIgnored ||
        touchState.current.isScrollingVertical ||
        e.changedTouches.length === 0
      ) {
        return;
      }

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchState.current.startX;
      const deltaY = touch.clientY - touchState.current.startY;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);
      const duration = Date.now() - touchState.current.startTime;

      // Validate gesture thresholds
      if (
        absDeltaX >= minDeltaX &&
        absDeltaY <= absDeltaX * maxDeltaYRatio &&
        duration <= maxDurationMs
      ) {
        if (deltaX < 0 && onSwipeLeft) {
          onSwipeLeft();
        } else if (deltaX > 0 && onSwipeRight) {
          onSwipeRight();
        }
      }
    },
    [disabled, minDeltaX, maxDeltaYRatio, maxDurationMs, onSwipeLeft, onSwipeRight]
  );

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}
