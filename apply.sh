#!/bin/bash
# Simple deploy script

EXTENSION_UUID="cursor-overlay@example.local"
EXTENSIONS_DIR="$HOME/.local/share/gnome-shell/extensions"

echo "📦 Deploying extension: $EXTENSION_UUID"

# Create extensions directory if needed
mkdir -p "$EXTENSIONS_DIR"

# Backup existing extension
if [ -d "$EXTENSIONS_DIR/$EXTENSION_UUID" ]; then
    echo "⚠️  Backup existing extension"
    mv "$EXTENSIONS_DIR/$EXTENSION_UUID" "$EXTENSIONS_DIR/$EXTENSION_UUID.backup.$(date +%s)"
fi

# Copy files
echo "📋 Copying files..."
mkdir -p "$EXTENSIONS_DIR/$EXTENSION_UUID"
cp -v *.js *.json *.css "$EXTENSIONS_DIR/$EXTENSION_UUID/" 2>/dev/null

# Enable extension
echo "🔌 Enabling extension..."
gnome-extensions enable "$EXTENSION_UUID" 2>/dev/null || \
    gnome-extensions enable --force "$EXTENSION_UUID"

# Show status
echo "✅ Extension deployed!"
gnome-extensions list --enabled | grep "$EXTENSION_UUID"

echo ""
echo "Restart GNOME Shell to see changes:"
echo "  X11: Alt+F2 → r → Enter"
echo "  Wayland: Log out and back in"