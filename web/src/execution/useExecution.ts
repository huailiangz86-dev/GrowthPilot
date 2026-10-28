import { useContext } from 'react';
import { ExecutionContext } from './context';
export function useExecution() {
  const context = useContext(ExecutionContext);
  if (!context) throw new Error('ExecutionProvider required');
  return context;
}
