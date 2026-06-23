import { networkInterfaces } from 'os';
import { execFileSync } from 'node:child_process';

/**
 * IPv4 of the *default-route* interface — the one the OS actually uses to reach
 * the LAN/internet. On a dual-homed host (e.g. en0 + en1 on the same subnet),
 * the raw interface scan below can return an arbitrary secondary address that a
 * remote device can't reliably reach; the default route is the stable, correct
 * one to advertise (pairing URL / mDNS / TRMNL BYOS URL). Returns null when the
 * platform's routing tool is unavailable (→ caller falls back to the heuristic).
 */
let routeCache: { ip: string | null; at: number } | null = null;
function defaultRouteIp(): string | null {
  const now = Date.now();
  // Short cache: cheap enough to re-probe often (keeps mDNS IP-change detection
  // responsive) without spawning `route` on every connect.
  if (routeCache && now - routeCache.at < 3000) return routeCache.ip;
  let iface: string | null = null;
  try {
    if (process.platform === 'darwin') {
      const out = execFileSync('route', ['-n', 'get', 'default'], { timeout: 1000, encoding: 'utf8' });
      iface = out.match(/interface:\s*(\S+)/)?.[1] ?? null;
    } else if (process.platform === 'linux') {
      const out = execFileSync('ip', ['route', 'get', '1.1.1.1'], { timeout: 1000, encoding: 'utf8' });
      iface = out.match(/\bdev\s+(\S+)/)?.[1] ?? null;
    }
  } catch {
    /* route tool missing / non-POSIX → null, fall back to the heuristic */
  }
  let ip: string | null = null;
  if (iface) {
    for (const net of networkInterfaces()[iface] ?? []) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) {
        ip = net.address;
        break;
      }
    }
  }
  routeCache = { ip, at: now };
  return ip;
}

/** Return the default-route IPv4 (preferred), else the first non-internal IPv4
 * LAN address, or '127.0.0.1' as fallback. */
export function getLanIp(): string {
  const primary = defaultRouteIp();
  if (primary) return primary;

  const nets = networkInterfaces();

  // Sort interfaces: physical wired (en1, en2...) first, then en0, then other non-virtual, then virtual.
  const sortedNames = Object.keys(nets).sort((a, b) => {
    const isPhysA = /^(en|eth|wlan)\d+/i.test(a);
    const isPhysB = /^(en|eth|wlan)\d+/i.test(b);

    if (isPhysA && !isPhysB) return -1;
    if (!isPhysA && isPhysB) return 1;

    if (isPhysA && isPhysB) {
      // Prioritize en1, en2... over en0 for wired-first setups
      if (a === 'en0' && b !== 'en0') return 1;
      if (b === 'en0' && a !== 'en0') return -1;
      return a.localeCompare(b);
    }

    const isVirtA = /^(utun|bridge|vboxnet|docker|lo|gif|stf|awdl|llw|ap)\d*/i.test(a);
    const isVirtB = /^(utun|bridge|vboxnet|docker|lo|gif|stf|awdl|llw|ap)\d*/i.test(b);

    if (!isVirtA && isVirtB) return -1;
    if (isVirtA && !isVirtB) return 1;

    return a.localeCompare(b);
  });

  for (const name of sortedNames) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}
