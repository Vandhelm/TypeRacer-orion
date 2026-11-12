// Inline SVG icons. They take the current text color.

export function ArrowIcon(props: { "aria-hidden"?: boolean }) {
  return (
    <svg width="24" height="14" viewBox="0 0 24 14" {...props}>
      <path d="M0 7h22M16 1l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function UserIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="5.5" r="3" />
      <path d="M2 15c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
    </svg>
  );
}

export function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
    </svg>
  );
}

export function GithubIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function DiscordIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M13.55 3.02A13.2 13.2 0 0 0 10.3 2a9 9 0 0 0-.42.85 12.3 12.3 0 0 0-3.67 0A9 9 0 0 0 5.78 2a13.2 13.2 0 0 0-3.26 1.02C.46 6.1-.1 9.1.18 12.06A13.3 13.3 0 0 0 4.18 14.1c.32-.44.6-.9.85-1.39a8.6 8.6 0 0 1-1.34-.64l.33-.26a9.5 9.5 0 0 0 8.16 0l.33.26c-.43.25-.88.47-1.34.64.24.49.53.95.85 1.39a13.3 13.3 0 0 0 4-2.04c.33-3.43-.57-6.4-2.47-9.04ZM5.35 10.24c-.79 0-1.44-.72-1.44-1.61s.63-1.61 1.44-1.61c.8 0 1.46.73 1.44 1.61 0 .89-.64 1.61-1.44 1.61Zm5.3 0c-.79 0-1.44-.72-1.44-1.61s.63-1.61 1.44-1.61c.81 0 1.46.73 1.44 1.61 0 .89-.63 1.61-1.44 1.61Z" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M1 6h10M6 1v10" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function MinusIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M1 6h10" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M10.5 3.5v-1h-8v8h1" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function LinkIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M7 9.5a2.5 2.5 0 0 0 3.5 0l2.5-2.5a2.5 2.5 0 0 0-3.5-3.5l-1 1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M9 6.5a2.5 2.5 0 0 0-3.5 0L3 9a2.5 2.5 0 0 0 3.5 3.5l1-1" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function ChevronIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg viewBox="0 0 12 12">
      <path d={direction === "up" ? "M2 7l4-4 4 4" : "M2 5l4 4 4-4"} fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
