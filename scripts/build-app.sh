#!/bin/bash
set -euo pipefail

APP_NAME="WatermarkTool"
APP_DIR="$APP_NAME.app"
CONTENTS="$APP_DIR/Contents"
RESOURCES="$CONTENTS/Resources"
MACOS="$CONTENTS/MacOS"

echo "Building $APP_NAME.app..."

# Clean and create bundle structure
rm -rf "$APP_DIR"
mkdir -p "$MACOS" "$RESOURCES/dist"

# Copy compiled JS output
cp -r dist/. "$RESOURCES/dist/"

# Copy package.json so Node recognises the output as ESM
cp package.json "$RESOURCES/package.json"

# Copy watermark asset
cp watermark.png "$RESOURCES/watermark.png"

# Copy node_modules (needed for native deps like sharp)
echo "Copying node_modules (this may take a moment)..."
cp -r node_modules "$RESOURCES/node_modules"

# ── Info.plist ────────────────────────────────────────────────────────────────
cat > "$CONTENTS/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>WatermarkTool</string>
    <key>CFBundleIdentifier</key>
    <string>com.watermarktool.app</string>
    <key>CFBundleName</key>
    <string>WatermarkTool</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.15</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
PLIST

# ── Launcher script ───────────────────────────────────────────────────────────
cat > "$MACOS/$APP_NAME" << 'LAUNCHER'
#!/bin/bash

# Resolve paths
MACOS_DIR="$(cd "$(dirname "$0")" && pwd)"
RESOURCES="$(cd "$MACOS_DIR/../Resources" && pwd)"
APP_BUNDLE="$(cd "$MACOS_DIR/../.." && pwd)"

export IMAGES_DIR="$(dirname "$APP_BUNDLE")"
export WATERMARK_PATH="$RESOURCES/watermark.png"

# If not running in a terminal, relaunch inside Terminal.app so we get
# full disk access (inherited from Terminal's permissions).
if [ ! -t 1 ]; then
    osascript -e "tell application \"Terminal\"
        activate
        do script \"bash '$MACOS_DIR/WatermarkTool'; exit\"
    end tell"
    exit 0
fi

# Load ANTHROPIC_API_KEY
if [ -f "$IMAGES_DIR/.env" ]; then
    set -a; source "$IMAGES_DIR/.env"; set +a
fi
if [ -f "$HOME/.watermark-tool.env" ]; then
    set -a; source "$HOME/.watermark-tool.env"; set +a
fi

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    osascript -e 'display alert "WatermarkTool" message "ANTHROPIC_API_KEY is not set. Create ~/.watermark-tool.env with: ANTHROPIC_API_KEY=your_key_here" as critical'
    exit 1
fi

# Find node
find_node() {
    for candidate in \
        /usr/local/bin/node \
        /opt/homebrew/bin/node \
        /usr/bin/node \
        "$HOME/.nvm/versions/node/"*/bin/node \
        "$HOME/.nodenv/shims/node" \
        "$HOME/.volta/bin/node"; do
        if [ -x "$candidate" ]; then
            echo "$candidate"
            return 0
        fi
    done
    return 1
}

NODE="$(find_node)" || {
    osascript -e 'display alert "WatermarkTool" message "Node.js is required but was not found. Please install Node.js from nodejs.org" as critical'
    exit 1
}

LOG_FILE="$IMAGES_DIR/watermark-tool.log"
echo "=== WatermarkTool $(date) ===" > "$LOG_FILE"

"$NODE" "$RESOURCES/dist/index.js" 2>&1 | tee -a "$LOG_FILE"
EXIT_CODE="${PIPESTATUS[0]}"

if [ "$EXIT_CODE" -ne 0 ]; then
    osascript -e "display alert \"WatermarkTool failed\" message \"Check watermark-tool.log in the folder for details.\" as critical"
else
    osascript -e "display alert \"WatermarkTool\" message \"Done! Watermarked images saved to the 'watermarked' folder.\""
fi

exit "$EXIT_CODE"
LAUNCHER

chmod +x "$MACOS/$APP_NAME"

echo ""
echo "✓ Built $APP_DIR"
echo ""
echo "Usage:"
echo "  1. Copy $APP_DIR into any folder containing images"
echo "  2. Double-click $APP_DIR"
echo "  3. Watermarked images appear in a 'watermarked/' subfolder"
echo ""
echo "Prerequisite: set ANTHROPIC_API_KEY in ~/.watermark-tool.env"
