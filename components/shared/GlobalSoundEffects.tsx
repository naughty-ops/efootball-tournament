'use client';

import { useEffect } from 'react';
import { preloadSounds, playTouch } from '@/src/lib/sounds/sound-manager';

/**
 * Global eFootball Sound Effects Controller
 * Listens for UI interactions across buttons, navigation tabs, sidebar links,
 * dropdowns, dialogs, and controls, triggering efootball-touch-2.mp3 with zero latency.
 */
export default function GlobalSoundEffects() {
  useEffect(() => {
    preloadSounds();

    const handleGlobalInteraction = (event: MouseEvent) => {
      // 1. Prevent duplicate playback within the same event dispatch (bubbling defense)
      if ((event as any).__efootballHandled) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (!target) return;

      // 2. Identify interactive elements: buttons, links, tabs, menu items, controls
      const interactiveEl = target.closest(
        'button, a, [role="button"], [role="tab"], [role="menuitem"], [role="option"], summary, input[type="submit"], input[type="button"], input[type="checkbox"], input[type="radio"]'
      ) as HTMLElement | null;

      if (!interactiveEl) return;

      // 3. Do NOT play for disabled controls
      if (
        interactiveEl.hasAttribute('disabled') ||
        interactiveEl.getAttribute('aria-disabled') === 'true' ||
        interactiveEl.classList.contains('disabled') ||
        interactiveEl.closest('[disabled], [aria-disabled="true"]')
      ) {
        return;
      }

      // 4. Do NOT play for text input fields, textareas or contenteditable areas
      if (
        (interactiveEl.tagName === 'INPUT' &&
          !['button', 'submit', 'checkbox', 'radio'].includes((interactiveEl as HTMLInputElement).type)) ||
        interactiveEl.tagName === 'TEXTAREA' ||
        interactiveEl.isContentEditable
      ) {
        return;
      }

      // 5. Mark as handled for this event
      (event as any).__efootballHandled = true;

      // 6. Play the touch SFX
      playTouch();
    };

    // Use capture phase to ensure interactions inside modals/popovers are captured reliably
    document.addEventListener('click', handleGlobalInteraction, { capture: true });

    return () => {
      document.removeEventListener('click', handleGlobalInteraction, { capture: true });
    };
  }, []);

  return null;
}
