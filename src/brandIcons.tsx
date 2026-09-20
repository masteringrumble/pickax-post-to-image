/** Glyphs for the share sheet. Brand icons come from simple-icons paths;
 * networks simple-icons doesn't carry (LinkedIn, Truth Social, Teams,
 * Outlook, Yahoo Mail, Hacker News) plus the generic actions get small
 * hand-drawn glyphs in the same 24x24 grid. */
import type { ShareIcon } from "./share";

function Letter({ color, children, size = 15 }: { color: string; children: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <text
        x="12"
        y="17.5"
        textAnchor="middle"
        fontSize={size}
        fontWeight={800}
        fontFamily="Arial, Helvetica, sans-serif"
        fill={color}
      >
        {children}
      </text>
    </svg>
  );
}

function Envelope({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden="true">
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" stroke={color} strokeWidth="2" />
      <path
        d="M4.5 8l7.5 5.8L19.5 8"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StrokeIcon({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="26"
      height="26"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function ShareGlyph({ icon, color }: { icon: ShareIcon; color: string }) {
  if (icon.kind === "brand") {
    return (
      <svg viewBox="0 0 24 24" width="26" height="26" fill={color} aria-hidden="true">
        <path d={icon.path} />
      </svg>
    );
  }
  switch (icon.id) {
    case "linkedin":
      return <Letter color={color}>in</Letter>;
    case "truthsocial":
      return <Letter color={color} size={17}>T</Letter>;
    case "hackernews":
      return <Letter color={color} size={16}>Y</Letter>;
    case "teams":
      return (
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
          <circle cx="9" cy="8" r="3.2" fill={color} />
          <path
            d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6"
            stroke={color}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="16.8" cy="9" r="2.5" fill={color} opacity="0.6" />
          <path
            d="M15.8 14.8c2.2.3 3.8 1.7 4.2 3.9"
            stroke={color}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            opacity="0.6"
          />
        </svg>
      );
    case "email":
    case "outlook":
    case "yahoomail":
      return <Envelope color={color} />;
    case "sms":
      return (
        <StrokeIcon color={color}>
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </StrokeIcon>
      );
    case "link":
      return (
        <StrokeIcon color={color}>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </StrokeIcon>
      );
    case "image":
      return (
        <StrokeIcon color={color}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </StrokeIcon>
      );
    case "share":
      return (
        <StrokeIcon color={color}>
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
        </StrokeIcon>
      );
  }
}
