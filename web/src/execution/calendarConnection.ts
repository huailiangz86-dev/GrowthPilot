export function calendarSubscriptionUrl(value: unknown): string {
  try {
    if (typeof value !== 'string') throw new Error();
    const url = new URL(value);
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
    if (url.protocol !== 'https:' || url.username || url.password || url.hash
        || host === 'localhost' || host.endsWith('.localhost') || host.startsWith('127.')
        || ['::', '::1', '0.0.0.0', '::ffff:7f00:1'].includes(host)
        || !url.pathname.endsWith('/execution/calendar.ics') || !url.searchParams.get('token')) throw new Error();
    return url.href;
  } catch {
    throw new Error('服务端未返回可用的 HTTPS 订阅地址，请先配置部署域名后重试。');
  }
}
