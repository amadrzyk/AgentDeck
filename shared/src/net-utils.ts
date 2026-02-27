import { networkInterfaces } from 'os';

/** Return the first non-internal IPv4 LAN address, or '127.0.0.1' as fallback. */
export function getLanIp(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}
