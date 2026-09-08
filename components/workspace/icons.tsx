export function IconPlus({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

export function IconX({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

export function IconDumbbell({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 9.5v5M17 9.5v5M9.5 12h5" />
      <rect x="3.5" y="8.2" width="3.2" height="7.6" rx="1" />
      <rect x="17.3" y="8.2" width="3.2" height="7.6" rx="1" />
    </svg>
  );
}

export function IconSpark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4.5 13.4 9l4.6.4-3.5 3.2 1.1 4.5L12 14.8 8.4 17.1 9.5 12.6 6 9.4 10.6 9Z" />
    </svg>
  );
}

export function IconPages({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="7" y="5.5" width="11" height="13" rx="1.4" />
      <path d="M6 8.2H5.2A1.2 1.2 0 0 0 4 9.4v9.4A1.2 1.2 0 0 0 5.2 20h9.2" />
    </svg>
  );
}

export function IconFile({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M7 4.5h7.2L19 9.3V19.5H7z" strokeLinejoin="round" />
      <path d="M14 4.5V9.3h4.8" strokeLinejoin="round" />
    </svg>
  );
}

export function IconSheet({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="6" y="4.5" width="12" height="15" rx="1.5" />
      <path d="M9 9h6M9 12.5h6M9 16h4" strokeLinecap="round" />
    </svg>
  );
}
