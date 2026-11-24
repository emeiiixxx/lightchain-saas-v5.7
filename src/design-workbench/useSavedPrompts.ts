import type { Notify } from './notification';
import { useSavedPrompts as useSharedSavedPrompts } from '../useSavedPrompts';

export function useSavedPrompts(onNotify: Notify) {
  return useSharedSavedPrompts(onNotify);
}
