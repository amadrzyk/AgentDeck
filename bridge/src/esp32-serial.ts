/**
 * ESP32 Serial Bridge — broadcasts BridgeEvents over USB serial.
 *
 * Detects ESP32 devices (CH340/CP210x) on USB serial ports,
 * opens the port, and sends newline-delimited JSON matching
 * the same protocol as WebSocket.
 *
 * ESP32 side reads lines starting with '{' and passes to Protocol::parseMessage().
 */

import { execSync } from 'child_process';
import { createWriteStream, type WriteStream } from 'fs';
import type { BridgeEvent } from './types.js';
import { debug } from './logger.js';

// Serial port patterns for ESP32 devices
const ESP32_PORT_PATTERNS = [
  /\/dev\/cu\.usbserial-\d+/,   // CH340 (86 Box)
  /\/dev\/cu\.usbmodem\d+/,      // Native USB JTAG (IPS 3.5", Round AMOLED)
  /\/dev\/ttyUSB\d+/,            // Linux CH340
  /\/dev\/ttyACM\d+/,            // Linux native USB
];

// Exclude known non-ESP32 devices
const EXCLUDE_PATTERNS = [
  /Bluetooth/i,
  /WLAN/i,
];

interface SerialConnection {
  port: string;
  stream: WriteStream;
  connected: boolean;
}

let connections: SerialConnection[] = [];
let pollTimer: ReturnType<typeof setInterval> | null = null;

// Events to forward (same subset as Android WS client receives)
const FORWARDED_EVENTS = new Set([
  'state_update',
  'usage_update',
  'sessions_list',
  'connection',
  'timeline_event',
  'timeline_history',
]);

function detectESP32Ports(): string[] {
  try {
    // List serial ports on macOS/Linux
    const platform = process.platform;
    let ports: string[];

    if (platform === 'darwin') {
      const output = execSync('ls /dev/cu.usb* 2>/dev/null || true', {
        encoding: 'utf-8',
        timeout: 3000,
      });
      ports = output.trim().split('\n').filter(Boolean);
    } else if (platform === 'linux') {
      const output = execSync('ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null || true', {
        encoding: 'utf-8',
        timeout: 3000,
      });
      ports = output.trim().split('\n').filter(Boolean);
    } else {
      return [];
    }

    // Filter to ESP32 patterns, exclude known non-ESP32
    return ports.filter(port => {
      if (EXCLUDE_PATTERNS.some(p => p.test(port))) return false;
      return ESP32_PORT_PATTERNS.some(p => p.test(port));
    });
  } catch {
    return [];
  }
}

function openPort(port: string): SerialConnection | null {
  try {
    // Configure baud rate + disable DTR/RTS to prevent ESP32 reset
    const platform = process.platform;
    if (platform === 'darwin') {
      execSync(`stty -f ${port} 115200 cs8 -cstopb -parenb -hupcl`, { timeout: 3000 });
    } else if (platform === 'linux') {
      execSync(`stty -F ${port} 115200 cs8 -cstopb -parenb -hupcl`, { timeout: 3000 });
    }

    const stream = createWriteStream(port, { flags: 'w' });
    const conn: SerialConnection = { port, stream, connected: true };

    stream.on('error', (err) => {
      debug('ESP32', `Serial error on ${port}: ${err.message}`);
      conn.connected = false;
    });

    stream.on('close', () => {
      debug('ESP32', `Serial port closed: ${port}`);
      conn.connected = false;
    });

    debug('ESP32', `Opened serial port: ${port}`);
    return conn;
  } catch (err: any) {
    debug('ESP32', `Failed to open ${port}: ${err.message}`);
    return null;
  }
}

function sendToConnection(conn: SerialConnection, json: string): void {
  if (!conn.connected) return;
  try {
    conn.stream.write(json + '\n');
  } catch {
    conn.connected = false;
  }
}

/**
 * Start ESP32 serial bridge.
 * Detects USB serial ports and opens connections.
 * Call broadcast() to send events to all connected ESP32 devices.
 */
export function startESP32Serial(): void {
  // Initial detection
  pollForDevices();

  // Poll for new/disconnected devices every 10 seconds
  pollTimer = setInterval(pollForDevices, 10000);

  debug('ESP32', 'Serial bridge started');
}

function pollForDevices(): void {
  const ports = detectESP32Ports();

  // Remove disconnected
  connections = connections.filter(c => {
    if (!c.connected) {
      try { c.stream.end(); } catch { /* ignore */ }
      return false;
    }
    return true;
  });

  // Add new ports
  for (const port of ports) {
    if (!connections.some(c => c.port === port)) {
      const conn = openPort(port);
      if (conn) {
        connections.push(conn);
      }
    }
  }
}

/**
 * Broadcast a BridgeEvent to all connected ESP32 devices via serial.
 */
export function broadcastESP32(event: BridgeEvent): void {
  if (connections.length === 0) return;
  if (!FORWARDED_EVENTS.has(event.type)) return;

  const json = JSON.stringify(event);
  for (const conn of connections) {
    sendToConnection(conn, json);
  }
}

/**
 * Stop ESP32 serial bridge and close all connections.
 */
export function stopESP32Serial(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  for (const conn of connections) {
    conn.connected = false;
    try { conn.stream.end(); } catch { /* ignore */ }
  }
  connections = [];
  debug('ESP32', 'Serial bridge stopped');
}

/**
 * Get number of connected ESP32 devices.
 */
export function esp32ConnectionCount(): number {
  return connections.filter(c => c.connected).length;
}
