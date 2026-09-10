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
