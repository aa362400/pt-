import { createContext } from 'react';
import type { ToastContextType } from './toast-types.js';

export const ToastContext = createContext<ToastContextType | null>(null);

export type { Toast, ToastType, ToastContextType } from './toast-types.js';