/**
 * A deliberately small icon set. Hand-drawn on a 16px grid at 1.25 stroke so
 * they sit at the same visual weight as the hairline borders — imported icon
 * packs come in heavier and make the UI look busier than it is.
 */

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 14, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7" cy="7" r="4.25" />
    <path d="M10.2 10.2 13.5 13.5" />
  </Icon>
);

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 3.25v9.5M3.25 8h9.5" />
  </Icon>
);

export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Icon>
);

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="m3.5 8.5 3 3 6-7" />
  </Icon>
);

export const IconChevronDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4 6 4 4 4-4" />
  </Icon>
);

export const IconChevronEnd = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 4 4 4-4 4" />
  </Icon>
);

export const IconChevronStart = (p: IconProps) => (
  <Icon {...p}>
    <path d="m10 4-4 4 4 4" />
  </Icon>
);

export const IconArrowUp = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 12.5v-9M4.5 7 8 3.5 11.5 7" />
  </Icon>
);

export const IconArrowDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 3.5v9M4.5 9 8 12.5 11.5 9" />
  </Icon>
);

export const IconEdit = (p: IconProps) => (
  <Icon {...p}>
    <path d="M11 2.75 13.25 5 5.5 12.75 2.5 13.5l.75-3z" />
  </Icon>
);

export const IconTrash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.75 4.25h10.5M6 4.25V2.75h4v1.5M4 4.25l.6 9h6.8l.6-9" />
  </Icon>
);

export const IconPrint = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 6V2.5h7V6M4.5 12H3a.75.75 0 0 1-.75-.75V7A1 1 0 0 1 3.25 6h9.5A1 1 0 0 1 13.75 7v4.25A.75.75 0 0 1 13 12h-1.5" />
    <path d="M4.5 9.5h7v4h-7z" />
  </Icon>
);

export const IconAlert = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 2.5 14.5 13.5h-13z" />
    <path d="M8 6.5v3M8 11.6v.01" />
  </Icon>
);

export const IconGlobe = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="5.75" />
    <path d="M2.5 8h11M8 2.25c1.6 1.7 2.4 3.6 2.4 5.75S9.6 12.05 8 13.75c-1.6-1.7-2.4-3.6-2.4-5.75S6.4 3.95 8 2.25" />
  </Icon>
);

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */
/*
 * One glyph per sidebar destination, drawn on the same 16px grid at the same
 * 1.25 stroke as the set above. A label alone makes a long sidebar hard to
 * scan; an imported pack would sit heavier than these hairlines.
 */

export const IconDashboard = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.25" y="2.25" width="5" height="5" rx="1" />
    <rect x="8.75" y="2.25" width="5" height="3" rx="1" />
    <rect x="8.75" y="6.75" width="5" height="7" rx="1" />
    <rect x="2.25" y="8.75" width="5" height="5" rx="1" />
  </Icon>
);

export const IconTag = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8.4 2.4H13.6v5.2l-6 6-5.2-5.2 6-6Z" />
    <circle cx="11" cy="5" r="0.9" />
  </Icon>
);

export const IconTooth = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.4 2.6c-1.4 0-2.2 1.2-2.1 2.7.1 1.7.7 2.4.9 3.9.3 1.5.2 3.6 1.3 3.6 1 0 .9-2 1.2-3.1.2-.7.6-1.1 1.2-1.1s1 .4 1.2 1.1c.3 1.1.3 3.1 1.3 3.1 1 0 1-2.1 1.3-3.6.2-1.5.8-2.2.9-3.9.1-1.5-.7-2.7-2.1-2.7-1 0-1.5.5-2.6.5s-1.5-.5-2.5-.5Z" />
  </Icon>
);

export const IconWrench = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10.4 2.4a3.2 3.2 0 0 0-3 4.3l-4.3 4.3a1.3 1.3 0 0 0 1.9 1.9l4.3-4.3a3.2 3.2 0 0 0 4.1-3.9l-1.9 1.9-1.8-.4-.4-1.8 1.9-1.9a3.2 3.2 0 0 0-.8-.1Z" />
  </Icon>
);

export const IconLayers = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 2.2 14 5.3 8 8.4 2 5.3l6-3.1Z" />
    <path d="m2 8.3 6 3.1 6-3.1M2 11.1l6 3.1 6-3.1" />
  </Icon>
);

export const IconWarehouse = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.2 6.6 8 2.6l5.8 4v6.8H2.2V6.6Z" />
    <path d="M5.4 13.4V8.6h5.2v4.8" />
  </Icon>
);

export const IconDocument = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 2.4h5l3 3v8.2H4V2.4Z" />
    <path d="M9 2.4v3h3M6 8.4h4M6 10.9h4" />
  </Icon>
);

export const IconCart = (p: IconProps) => (
  <Icon {...p}>
    <path d="M1.9 2.6h1.7l1.6 7.1h6.4l1.5-5.1H4.2" />
    <circle cx="5.8" cy="12.6" r="1" />
    <circle cx="11.2" cy="12.6" r="1" />
  </Icon>
);

export const IconUsers = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="6.2" cy="5.6" r="2.4" />
    <path d="M2.2 13.2c0-2.2 1.8-3.6 4-3.6s4 1.4 4 3.6" />
    <path d="M10.6 3.5a2.3 2.3 0 0 1 0 4.4M11.4 9.9c1.5.4 2.5 1.6 2.5 3.3" />
  </Icon>
);

export const IconTruck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M1.9 3.9h7.2v7H1.9v-7Z" />
    <path d="M9.1 6.4h2.6l2.4 2.3v2.2h-5" />
    <circle cx="4.5" cy="12.1" r="1.1" />
    <circle cx="11.3" cy="12.1" r="1.1" />
  </Icon>
);

export const IconCoins = (p: IconProps) => (
  <Icon {...p}>
    <ellipse cx="8" cy="4.3" rx="5" ry="1.9" />
    <path d="M3 4.3v3.4c0 1 2.2 1.9 5 1.9s5-.9 5-1.9V4.3" />
    <path d="M3 7.7v3.4c0 1 2.2 1.9 5 1.9s5-.9 5-1.9V7.7" />
  </Icon>
);

export const IconChart = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.4 13.2h11.2" />
    <path d="M4.4 13.2V8M7.5 13.2V4.6M10.6 13.2V9.8M13.6 13.2V6.4" />
  </Icon>
);

export const IconUser = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="5.4" r="2.6" />
    <path d="M3.2 13.4c0-2.4 2.1-4 4.8-4s4.8 1.6 4.8 4" />
  </Icon>
);

export const IconSettings = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="2.1" />
    <path d="M8 1.9v1.6M8 12.5v1.6M13.3 8h-1.6M4.3 8H2.7M11.7 4.3l-1.1 1.1M5.4 10.6l-1.1 1.1M11.7 11.7l-1.1-1.1M5.4 5.4 4.3 4.3" />
  </Icon>
);
