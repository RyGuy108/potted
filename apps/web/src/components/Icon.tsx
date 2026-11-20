/** A few line icons, drawn inline so there is no icon font or emoji. */
const PATHS = {
  check: "M20 6 9 17l-5-5",
  shield: "M12 3 4.5 6v5.5c0 4.4 3 8.3 7.5 9.5 4.5-1.2 7.5-5.1 7.5-9.5V6L12 3Zm-3 9 2.2 2.2L15.5 10",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6M9 12h6M9 16h3",
  refund: "M4 12a8 8 0 1 0 2.6-5.9M4 4v5h5",
  data: "M4 19V9m5.3 10V5m5.4 14v-7M20 19v-11",
  clip: "M5 5h14v14H5V5Zm5 4.5v5l4.5-2.5L10 9.5Z",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6v-9Z",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  wallet: "M4 7.5A1.5 1.5 0 0 1 5.5 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7.5Zm0 0L15 3.5V6M16 12.5h1",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="icon"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
