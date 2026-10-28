import { createContext } from 'react';
import type { ExecutionState } from './ExecutionContext';
export const ExecutionContext = createContext<{ data: ExecutionState | null; error: string; loading: boolean; refresh: () => void } | null>(null);
