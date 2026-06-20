#!/usr/bin/env python3
"""Sync AgentDeck frames to a Divoom Timebox Mini (BLE variant) over BLE GATT.

Some Timebox Mini revisions expose the 11x11 LED screen via BLE GATT using an
ISSC transparent-UART service (49535343-...), NOT Bluetooth Classic SPP. The
device appears in macOS as "TimeBox-mini-light" (a BLE peripheral) and shares
its BD_ADDR with the Classic audio endpoint under "TimeBox-mini-audio".

This writer builds the Divoom static-image protocol packet and tunnels it
through BLE GATT writes to the transparent-UART TX characteristic. Requires the
`bleak` package in the venv.
"""

import argparse
import asyncio
import hashlib
import io
import signal
import sys
from typing import Iterable

from PIL import Image as PilImage, ImageEnhance

DEFAULT_URL = "http://127.0.0.1:9120"
POLL_INTERVAL = 1.5
RECONNECT_DELAY = 3.0

TIMEBOX_W = 11
TIMEBOX_H = 11
STATIC_IMAGE_CMD_LEN = 0x00BD

# ISSC transparent-UART service characteristics (discovered on Timebox Mini BLE)
WRITE_CHAR = "49535343-8841-43f4-a8d4-ecbe34729bb3"  # write + write-without-response
CHUNK_SIZE = 20  # safe ATT payload for write-without-response


def clamp_nibble(value: int) -> int:
    return max(0, min(15, value))


def escape_message(data: Iterable[int]) -> bytes:
    out = bytearray()
    out.append(0x01)
    for b in data:
        if b in (0x01, 0x02, 0x03):
            out.append(0x03)
            out.append(b + 0x03)
        else:
            out.append(b)
    out.append(0x02)
    return bytes(out)


def build_static_image_packet(image_bytes: bytes) -> bytes:
    cmd = bytes([
        STATIC_IMAGE_CMD_LEN & 0xFF,
        (STATIC_IMAGE_CMD_LEN >> 8) & 0xFF,
        0x44,
        0x00,
        0x0A,
        0x0A,
        0x04,
    ]) + image_bytes
    if len(cmd) != STATIC_IMAGE_CMD_LEN:
        raise ValueError(f"command length {len(cmd)} != {STATIC_IMAGE_CMD_LEN}")
    checksum = sum(cmd) & 0xFFFF
    return escape_message(cmd + bytes([checksum & 0xFF, (checksum >> 8) & 0xFF]))


def encode_image_bright(img: PilImage.Image, brightness: int, gamma: float, sat: float, contrast: float) -> bytes:
    """Encode the native 11x11 micro frame to a 182-byte Timebox payload.

    The source is `size=11&layout=micro` — a bold hand-authored creature glyph
    already drawn at the device resolution with final, device-tuned colors. So the
    pipeline is WYSIWYG by default (gamma/sat/contrast = 1.0): only the 0-100
    software `brightness` dim is applied, then 4-bit quantization. The gamma/sat/
    contrast args remain for manual tuning, but default to identity.
    """
    img = img.convert("RGB").resize((TIMEBOX_W, TIMEBOX_H), PilImage.Resampling.BOX)
    if brightness <= 0:
        return bytes(182)

    if gamma != 1.0:
        lut: list[int] = []
        for _c in range(3):
            lut.extend(min(255, int(255 * ((i / 255.0) ** gamma))) for i in range(256))
        img = img.point(lut)
    if sat != 1.0:
        img = ImageEnhance.Color(img).enhance(sat)
    if brightness != 100:
        img = ImageEnhance.Brightness(img).enhance(brightness / 100.0)
    if contrast != 1.0:
        img = ImageEnhance.Contrast(img).enhance(contrast)

    nibbles: list[int] = []
    px = img.load()
    for y in range(TIMEBOX_H):
        for x in range(TIMEBOX_W):
            r, g, b = px[x, y]
            nibbles.extend([
                clamp_nibble(round(r / 17)),
                clamp_nibble(round(g / 17)),
                clamp_nibble(round(b / 17)),
            ])

    out = bytearray()
    it = iter(nibbles)
    for low in it:
        high = next(it, 0)
        out.append(low | (high << 4))
    if len(out) != 182:
        raise ValueError(f"encoded Timebox image has {len(out)} bytes, expected 182")
    return bytes(out)


async def write_packet(client, packet: bytes) -> None:
    """Chunked write-without-response to the transparent-UART TX characteristic."""
    for i in range(0, len(packet), CHUNK_SIZE):
        await client.write_gatt_char(WRITE_CHAR, packet[i:i + CHUNK_SIZE], response=False)


async def run(address: str, url: str, brightness: int, gamma: float, sat: float, contrast: float, once: bool = False) -> None:
    print(f"Starting Timebox Mini BLE sync: {address} <- {url} brightness={brightness}% gamma={gamma}")
    stop = asyncio.Event()

    def handle_stop(*_):
        stop.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, handle_stop)
        except NotImplementedError:
            signal.signal(sig, lambda *_: None)

    last_hash = ""

    # Imported lazily so the module is usable for encoding tests without bleak.
    from bleak import BleakClient

    while not stop.is_set():
        try:
            print(f"Connecting BLE {address}...")
            async with BleakClient(address, timeout=15.0) as client:
                print(f"BLE connected (MTU={client.mtu_size})")
                while not stop.is_set():
                    try:
                        import urllib.request
                        # size=11&layout=micro: a NATIVE 11x11 frame — a bold
                        # hand-authored creature glyph on a status field, drawn
                        # pixel-for-pixel at the device resolution (no downscale).
                        frame_data = urllib.request.urlopen(
                            f"{url.rstrip('/')}/pixoo/frame?size=11&layout=micro", timeout=3.0
                        ).read()
                        frame_hash = hashlib.sha256(frame_data).hexdigest()
                        if frame_hash != last_hash:
                            img = PilImage.open(io.BytesIO(frame_data))
                            payload = encode_image_bright(img, brightness, gamma, sat, contrast)
                            packet = build_static_image_packet(payload)
                            await write_packet(client, packet)
                            last_hash = frame_hash
                            print(f"Frame sent ({frame_hash[:8]})")
                    except Exception as e:
                        print(f"Frame fetch/send error: {e}", file=sys.stderr)
                    if once:
                        return
                    try:
                        await asyncio.wait_for(stop.wait(), timeout=POLL_INTERVAL)
                    except asyncio.TimeoutError:
                        pass
        except Exception as e:
            print(f"BLE connection error: {e}", file=sys.stderr)
            if once:
                raise
            try:
                await asyncio.wait_for(stop.wait(), timeout=RECONNECT_DELAY)
            except asyncio.TimeoutError:
                pass


def main() -> None:
    parser = argparse.ArgumentParser(description="AgentDeck Timebox Mini BLE sync")
    parser.add_argument("--address", required=True, help="BLE address/UUID of TimeBox-mini-light")
    parser.add_argument("--url", default=DEFAULT_URL, help=f"AgentDeck bridge URL (default: {DEFAULT_URL})")
    parser.add_argument("--brightness", type=int, default=100, help="Software brightness 0-100")
    parser.add_argument("--gamma", type=float, default=1.0, help="Gamma (lower=brighter midtones; 1.0=off)")
    parser.add_argument("--sat", type=float, default=1.0, help="Saturation multiplier (1.0=off)")
    parser.add_argument("--contrast", type=float, default=1.0, help="Contrast multiplier (1.0=off)")
    parser.add_argument("--once", action="store_true", help="Send one frame and exit")
    args = parser.parse_args()

    if not (0 <= args.brightness <= 100):
        print("Brightness must be between 0 and 100.", file=sys.stderr)
        sys.exit(1)

    asyncio.run(run(args.address, args.url, args.brightness, args.gamma, args.sat, args.contrast, args.once))


if __name__ == "__main__":
    main()
