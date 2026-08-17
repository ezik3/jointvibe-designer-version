import { SVGProps } from 'react';

/**
 * XRP Ledger mark — stylised X.
 * Inherits color via `currentColor` so it themes with text-primary etc.
 */
export const XrpIcon = ({ className, ...props }: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 32 32"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
    {...props}
  >
    <path d="M6 6l9.2 9.2a1.2 1.2 0 0 0 1.6 0L26 6" />
    <path d="M6 26l9.2-9.2a1.2 1.2 0 0 1 1.6 0L26 26" />
  </svg>
);

export default XrpIcon;
