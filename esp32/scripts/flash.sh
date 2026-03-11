#!/bin/bash
# AgentDeck ESP32 flash helper
# Detects connected device and flashes the correct environment

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Device port detection
detect_device() {
    if ls /dev/cu.usbmodem201301 2>/dev/null; then
        echo "ips_35"
        return
    fi
    if ls /dev/cu.usbserial-21130 2>/dev/null; then
        echo "box_86"
        return
    fi
    if ls /dev/cu.usbmodem211201 2>/dev/null; then
        echo "round_amoled"
        return
    fi
    echo ""
}

# Parse arguments
ENV="${1:-auto}"

if [ "$ENV" = "auto" ]; then
    ENV=$(detect_device)
    if [ -z "$ENV" ]; then
        echo "No ESP32 device detected!"
        echo "Available environments: ips_35, box_86, round_amoled"
        echo "Usage: $0 [environment]"
        exit 1
    fi
    echo "Detected device: $ENV"
fi

echo "Building and flashing: $ENV"
cd "$PROJECT_DIR"

# Build
pio run -e "$ENV"

# Upload
pio run -e "$ENV" -t upload

# Monitor
echo ""
echo "Flash complete! Starting monitor (Ctrl+C to exit)..."
pio device monitor -e "$ENV"
