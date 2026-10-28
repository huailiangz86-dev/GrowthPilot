import {createContext} from 'react';
import type {Action, Draft, Journal, Kind, Review} from './store';
export interface PersonalContext {
  journal: Journal; error: string; loading: boolean; saving: boolean; storageError: string;
  edit: (draft: Draft) => boolean; run: (kind: Kind, action: Action, entityId: string, data: Record<string, unknown>, version: number, updatedAt: string | null) => boolean;
  refresh: () => Promise<void>; retry: () => void; resolve: (id: string, useLocal: boolean) => void;
  cacheReview: (review: Review) => void;
}
export const PersonalContext = createContext<PersonalContext | null>(null);
