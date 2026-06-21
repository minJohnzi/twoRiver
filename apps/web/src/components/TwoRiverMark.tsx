export function TwoRiverMark() {
  return (
    <svg className="two-river-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path
        d="M6 8H22L10 24H26"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4"
      />
      <path
        d="M6 14H15.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3.2"
      />
      <path
        d="M16.5 18H26"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3.2"
      />
      <circle cx="16" cy="16" r="2" fill="var(--color-bg)" />
      <circle cx="16" cy="16" r="0.95" fill="currentColor" />
    </svg>
  );
}
