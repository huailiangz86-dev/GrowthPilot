export const KNOWLEDGE_ROUTES = {
  records: '/app/knowledge',
  sources: '/app/knowledge/sources',
  summaries: '/app/knowledge/summaries',
} as const;

export function isPersonalKnowledgeRoute(pathname: string) {
  return Object.values(KNOWLEDGE_ROUTES).some(path => pathname === path);
}

export function loginDestination(next: string | null) {
  if (next === 'fitness') return '/app/fitness';
  if (next === 'sources') return KNOWLEDGE_ROUTES.sources;
  if (next === 'summaries') return KNOWLEDGE_ROUTES.summaries;
  if (next === 'knowledge') return KNOWLEDGE_ROUTES.records;
  if (next?.startsWith('/app/knowledge')) {
    const parsed = new URL(next, 'https://growthpilot.local');
    if (parsed.origin === 'https://growthpilot.local' && isPersonalKnowledgeRoute(parsed.pathname)) {
      return parsed.pathname + parsed.search + parsed.hash;
    }
  }
  return '/app';
}
