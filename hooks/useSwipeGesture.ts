'use client';

import { useRef, useCallback, useEffect } from 'react';

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
  const touchState = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    isScrollingVertical: boolean;
    isIgnored: boolean;
    target: HTMLElement | null;
  }>({
    startX: 0,
    startY: 0,
    startTime: 0,
    isScrollingVertical: false,
    isIgnored: false,
    target: null,
  });

  const suppressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const suppressHandlerRef = useRef<((ev: MouseEvent) => void) | null>(null);

  // Clean up any pending click suppression handlers on unmount
  useEffect(() => {
    return () => {
      if (suppressHandlerRef.current && typeof window !== 'undefined') {
        window.removeEventListener('click', suppressHandlerRef.current, true);
      }
      if (suppressTimerRef.current) {
        clearTimeout(suppressTimerRef.current);
      }
    };
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || e.touches.length !== 1) {
        touchState.current.isIgnored = true;
        return;
      }

      const touch = e.touches[0];
      const target = e.target as HTMLElement | null;

      // Strictly ignore touches on text inputs, form controls, and explicit swipe-ignore surfaces
      if (
        target &&
        target.closest(
          'input, textarea, select, [contenteditable="true"], .no-swipe, [data-swipe-ignore="true"]'
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
        target,
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

      // If user moves vertically more than horizontally, lock into natural vertical scroll
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

      // Validate gesture thresholds for genuine horizontal swipe
      if (
        absDeltaX >= minDeltaX &&
        absDeltaY <= absDeltaX * maxDeltaYRatio &&
        duration <= maxDurationMs
      ) {
        // Suppress synthetic click on links/buttons that was part of the horizontal swipe drag
        const target = touchState.current.target;
        if (target && target.closest('a, button, [role="button"]') && typeof window !== 'undefined') {
          if (suppressHandlerRef.current) {
            window.removeEventListener('click', suppressHandlerRef.current, true);
            if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
          }

          const suppressClick = (ev: MouseEvent) => {
            ev.preventDefault();
            ev.stopPropagation();
            window.removeEventListener('click', suppressClick, true);
            suppressHandlerRef.current = null;
          };

          suppressHandlerRef.current = suppressClick;
          window.addEventListener('click', suppressClick, { capture: true, once: true });
          suppressTimerRef.current = setTimeout(() => {
            window.removeEventListener('click', suppressClick, true);
            suppressHandlerRef.current = null;
          }, 350);
        }

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
