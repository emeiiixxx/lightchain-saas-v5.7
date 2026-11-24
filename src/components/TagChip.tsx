import type { HTMLAttributes, ReactNode } from 'react';
import './tag-chip.css';

type Props = HTMLAttributes<HTMLSpanElement> & { children: ReactNode; leading?: ReactNode; trailing?: ReactNode; size?: 's' | 'm' | 'l'; appearance?: 'filled' | 'outline' | 'brand'; disabled?: boolean };

// 5.1 Beta TagChip: Filled S (141:24101), Outline M (162:15560).
export function TagChip({ children, leading, trailing, className = '', size = 's', appearance = 'filled', disabled = false, ...props }: Props) {
  return <span {...props} data-disabled={disabled} aria-disabled={disabled || undefined} className={`lc-tag-chip lc-tag-chip--${size} lc-tag-chip--${appearance} ${className}`}>
    <span className="lc-tag-chip-slot" aria-hidden={!leading}>{leading}</span>
    <span className="lc-tag-chip-label">{children}</span>
    <span className="lc-tag-chip-slot" aria-hidden={!trailing}>{trailing}</span>
  </span>;
}
