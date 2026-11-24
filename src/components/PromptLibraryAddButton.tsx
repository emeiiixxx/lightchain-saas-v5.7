import type { MouseEventHandler } from 'react';
import { Button, Icon } from './ui';

// Figma 152:12151: IconButton / Ghost / M = 32px control with a 20px icon.
export function PromptLibraryAddButton({ label, disabled, onClick }: {
  label: string;
  disabled?: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
}) {
  return <Button variant="ghost" size="s" data-component="IconButton" data-size="M" data-node-id="152:12151" aria-label={label} disabled={disabled} onClick={onClick}>
    <Icon name="promptLibraryAdd" size={20}/>
  </Button>;
}
