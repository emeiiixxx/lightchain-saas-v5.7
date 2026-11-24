export type ToastTone = 'success' | 'error' | 'info';
export type Notify = (message: string, tone?: ToastTone, options?: { durationMs?: number }) => void;
