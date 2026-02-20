type TinyIconName =
  | "workflow"
  | "upload"
  | "submissions"
  | "bindings"
  | "reference"
  | "audit"
  | "qa"
  | "users"
  | "settings"
  | "status"
  | "refresh"
  | "ai"
  | "cost"
  | "local"
  | "app"
  | "grading";

export function TinyIcon({ name, className = "h-3.5 w-3.5" }: { name: TinyIconName; className?: string }) {
  const common = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "workflow":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M4 6h9" />
          <path d="M15 6h5" />
          <circle cx="12" cy="6" r="2" />
          <path d="M4 12h5" />
          <path d="M11 12h9" />
          <circle cx="9" cy="12" r="2" />
          <path d="M4 18h11" />
          <path d="M17 18h3" />
          <circle cx="15" cy="18" r="2" />
        </svg>
      );
    case "upload":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M12 16V4" />
          <path d="M7 9l5-5 5 5" />
          <path d="M4 20h16" />
        </svg>
      );
    case "submissions":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <rect x="5" y="4" width="14" height="16" rx="2" />
          <path d="M9 9h6" />
          <path d="M9 13h6" />
          <path d="M9 17h4" />
        </svg>
      );
    case "bindings":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M10 13a5 5 0 0 1 7 0l1 1a5 5 0 1 1-7 7l-1-1" />
          <path d="M14 11a5 5 0 0 1-7 0l-1-1a5 5 0 1 1 7-7l1 1" />
        </svg>
      );
    case "reference":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M6 4h10a2 2 0 0 1 2 2v14H8a2 2 0 0 0-2 2Z" />
          <path d="M6 4v16a2 2 0 0 0 2 2" />
          <path d="M10 9h6" />
          <path d="M10 13h6" />
        </svg>
      );
    case "audit":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      );
    case "qa":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
    case "users":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="10" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      );
    case "status":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M3 12a9 9 0 0 1 15.6-6.1" />
          <path d="M21 3v6h-6" />
          <path d="M21 12a9 9 0 0 1-15.6 6.1" />
          <path d="M3 21v-6h6" />
        </svg>
      );
    case "ai":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="2" />
          <path d="M9 9h.01" />
          <path d="M15 9h.01" />
          <path d="M9 15h6" />
          <path d="M3 10h3" />
          <path d="M3 14h3" />
          <path d="M18 10h3" />
          <path d="M18 14h3" />
        </svg>
      );
    case "cost":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M3 10h18" />
          <path d="M8 14h4" />
        </svg>
      );
    case "local":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <rect x="8" y="8" width="8" height="8" rx="1" />
          <path d="M9 2v2" />
          <path d="M15 2v2" />
          <path d="M9 20v2" />
          <path d="M15 20v2" />
        </svg>
      );
    case "app":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      );
    case "grading":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M4 7h16" />
          <path d="M4 12h10" />
          <path d="M4 17h8" />
          <path d="m16 16 2 2 3-4" />
        </svg>
      );
    default:
      return null;
  }
}
