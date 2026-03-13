import type { DeviceModule, BridgeContext } from './types.js';
import {
  startESP32Serial,
  stopESP32Serial,
  broadcastESP32,
  setESP32StateProvider,
} from '../esp32-serial.js';
import type { BridgeEvent } from '../types.js';
import { existsSync } from 'fs';

export class SerialModule implements DeviceModule {
  readonly name = 'serial';
  private stateProvider: (() => BridgeEvent | null) | null = null;

  async shouldActivate(config: 'auto' | boolean): Promise<boolean> {
    if (config === false) return false;
    if (config === true) return true;
    // auto: check if any USB serial device is connected
    try {
      const { readdirSync } = await import('fs');
      const devFiles = readdirSync('/dev');
      return devFiles.some((f) => f.startsWith('tty.usbserial') || f.startsWith('tty.wchusbserial'));
    } catch {
      return false;
    }
  }

  /** Set a function that provides the latest state event for ESP32 heartbeat */
  setStateProvider(provider: () => BridgeEvent | null): void {
    this.stateProvider = provider;
  }

  async start(ctx: BridgeContext): Promise<void> {
    startESP32Serial();
    if (this.stateProvider) {
      setESP32StateProvider(this.stateProvider);
    }
    ctx.wsServer.onBroadcast(broadcastESP32);
  }

  async stop(): Promise<void> {
    stopESP32Serial();
  }
}
