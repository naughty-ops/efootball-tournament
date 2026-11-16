import React from 'react';

/**
 * Renders the iconic eFootball yellow angle decorations on screen borders.
 * Styled with clip-path polygon and positioned along the left and right edges.
 * Uses pointer-events-none so it never interferes with user interaction.
 */
export function ThemeSideAngles() {
  return (
    <div className="hidden xl:block pointer-events-none select-none z-10" aria-hidden="true">
      <div className="yellow-angle-left top-48" />
      <div className="yellow-angle-right top-48" />
      <div className="yellow-angle-left top-[750px]" />
      <div className="yellow-angle-right top-[750px]" />
      <div className="yellow-angle-left top-[1500px]" />
      <div className="yellow-angle-right top-[1500px]" />
      <div className="yellow-angle-left top-[2300px]" />
      <div className="yellow-angle-right top-[2300px]" />
      <div className="yellow-angle-left top-[3100px]" />
      <div className="yellow-angle-right top-[3100px]" />
    </div>
  );
}

/**
 * Ambient glow lighting that gives every page the electric stadium atmosphere of the homepage.
 */
export function ThemeAmbientGlow() {
  return (
    <div className="pointer-events-none select-none absolute inset-0 overflow-hidden z-0" aria-hidden="true">
      <div className="absolute top-10 right-0 w-80 sm:w-[500px] h-80 sm:h-[500px] bg-[#3434FF]/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-[600px] left-0 w-72 sm:w-[450px] h-72 sm:h-[450px] bg-[#FFFF00]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-[1300px] right-0 w-72 sm:w-[450px] h-72 sm:h-[450px] bg-[#FF168B]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-[2100px] left-0 w-72 sm:w-[450px] h-72 sm:h-[450px] bg-[#3434FF]/10 rounded-full blur-3xl pointer-events-none" />
    </div>
  );
}

export default ThemeSideAngles;
