import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './choice-chip.css';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> & { selected: boolean; size?: 's' | 'm' | 'l'; rightSlot?: ReactNode; selectable?: boolean };

// 5.1 Beta ChoiceChip / Outline. The consuming group owns selection.
export function ChoiceChip({ selected, size = 'm', className = '', children, rightSlot, selectable = true, ...props }: Props) {
  const classes = `lc-choice-chip lc-choice-chip--${size} nodrag nopan ${className}`;
  // A slotted action is a sibling of the selection button, never a nested button.
  if (rightSlot || !selectable) return <span className={`${classes} lc-choice-chip--with-slot`} data-selected={selected} data-disabled={!!props.disabled} data-selectable={selectable}>
    {selectable ? <button {...props} type="button" className="lc-choice-chip-select" aria-pressed={selected}>
      <span className="lc-choice-chip-label">{children}</span>
    </button> : <span className="lc-choice-chip-select" title={props.title}><span className="lc-choice-chip-label">{children}</span></span>}
    {rightSlot && <span className="lc-choice-chip-right-slot">{rightSlot}</span>}
  </span>;
  return <button {...props} type="button" className={classes} aria-pressed={selected}>
    {children}
  </button>;
}
