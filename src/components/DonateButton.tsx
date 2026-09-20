/**
 * DonateButton — a drop-in, theme-aware donation button built to travel
 * between projects. Copy this one file into any project, pass your donation
 * URL, and it picks up the host site's theme automatically.
 *
 * Usage:
 *   import DonateButton from "./components/DonateButton";
 *
 *   <DonateButton url="https://buymeacoffee.com/yourname" />
 *   <DonateButton url="https://ko-fi.com/yourname" label="Support my work" compact />
 *
 * Theming — no code changes needed in a new project:
 *   - Set `--donate-accent` anywhere above the button to recolor it, or
 *   - just define the host site's `--accent` custom property and the button
 *     inherits it, or
 *   - do nothing: it falls back to #3eb1f9.
 * Optional overrides: `--donate-text`, `--donate-bg`.
 *
 * Props:
 *   url       — your donation page (Buy Me a Coffee, Ko-fi, PayPal…), required
 *   label     — button text (default "Buy me a coffee")
 *   compact   — tighter padding for footers and other small spots
 *   className — extra classes if a project needs them
 */
type DonateButtonProps = {
  url: string;
  label?: string;
  compact?: boolean;
  className?: string;
};

function CoffeeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
      <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
      <line x1="6" x2="6" y1="2" y2="4" />
      <line x1="10" x2="10" y1="2" y2="4" />
      <line x1="14" x2="14" y1="2" y2="4" />
    </svg>
  );
}

export default function DonateButton({
  url,
  label = "Buy me a coffee",
  compact = false,
  className = "",
}: DonateButtonProps) {
  const classes = `donate-btn${compact ? " donate-btn-compact" : ""}${
    className ? ` ${className}` : ""
  }`;
  return (
    <a
      className={classes}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} (opens in a new tab)`}
    >
      <CoffeeIcon />
      <span>{label}</span>
    </a>
  );
}
