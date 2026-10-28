// Icons drawn as inline SVG for symbols that not every system font has (Windows fonts miss some of ⎘ ⧉ ⬭ ⛁).
// They take the text color, so they follow the button's color like a glyph would.

import type { ReactNode } from 'react';
import type { Shape } from '../shared/diagram';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className="icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      {children}
    </svg>
  );
}

// Two overlapping sheets: duplicate a step or a test.
export const DuplicateIcon = () => (
  <Icon>
    <rect x="5.5" y="5.5" width="8.5" height="8.5" rx="1.5" />
    <path d="M10.5 5.5V3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5h2" />
  </Icon>
);

// A clipboard: copy text to the clipboard.
export const CopyIcon = () => (
  <Icon>
    <rect x="3" y="3" width="10" height="11.5" rx="1.5" />
    <rect x="5.5" y="1.5" width="5" height="3" rx="1" fill="var(--bg, #fff)" />
  </Icon>
);

export const PencilIcon = () => (
  <Icon>
    <path d="M10.5 2.5l3 3L6 13H3v-3z" />
    <path d="M9 4l3 3" />
  </Icon>
);

// The canvas shapes, as they look on the canvas.
export function ShapeIcon({ shape }: { shape: Shape }) {
  switch (shape) {
    case 'rect':
      return (
        <Icon>
          <rect x="1.5" y="4" width="13" height="8" />
        </Icon>
      );
    case 'rounded':
      return (
        <Icon>
          <rect x="1.5" y="4" width="13" height="8" rx="2.5" />
        </Icon>
      );
    case 'diamond':
      return (
        <Icon>
          <path d="M8 2l6.5 6L8 14 1.5 8z" />
        </Icon>
      );
    case 'stadium':
      return (
        <Icon>
          <rect x="1" y="4.5" width="14" height="7" rx="3.5" />
        </Icon>
      );
    case 'circle':
      return (
        <Icon>
          <circle cx="8" cy="8" r="5.5" />
        </Icon>
      );
    case 'cylinder':
      return (
        <Icon>
          <ellipse cx="8" cy="4" rx="5" ry="2" />
          <path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4" />
        </Icon>
      );
  }
}
