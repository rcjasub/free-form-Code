import type { SVGProps } from "react";

// A person with a plus that draws itself in (SVG <animate>, so it plays when
// the icon mounts; give it a new `key` to play it again).
export function AccountAddIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg width={size} height={size} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...props}>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        <g strokeDasharray="22">
          <path d="M3 21v-1c0 -2.21 1.79 -4 4 -4h4c2.21 0 4 1.79 4 4v1">
            <animate fill="freeze" attributeName="stroke-dashoffset" dur="0.3s" values="22;0" />
          </path>
          <path strokeDashoffset="22" d="M9 13c-1.66 0 -3 -1.34 -3 -3c0 -1.66 1.34 -3 3 -3c1.66 0 3 1.34 3 3c0 1.66 -1.34 3 -3 3Z">
            <animate fill="freeze" attributeName="stroke-dashoffset" begin="0.3s" dur="0.3s" to="0" />
          </path>
        </g>
        <g strokeDasharray="8" strokeDashoffset="8">
          <path d="M15 6h6">
            <animate fill="freeze" attributeName="stroke-dashoffset" begin="0.7s" dur="0.2s" to="0" />
          </path>
          <path d="M18 3v6">
            <animate fill="freeze" attributeName="stroke-dashoffset" begin="0.9s" dur="0.2s" to="0" />
          </path>
        </g>
      </g>
    </svg>
  );
}
