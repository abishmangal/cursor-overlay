#!/usr/bin/env bash
set -euo pipefail

# Builds a fully transparent Xcursor theme and installs it to ~/.icons/.
# This is the approach the extension's "Hide system cursor" toggle relies
# on -- switching org.gnome.desktop.interface cursor-theme is a stable,
# public API that every GNOME version (and every app) respects, unlike
# the private compositor cursor-hiding calls that keep shifting between
# GNOME releases.
#
# NOTE: this version builds the Xcursor binary file directly in Python
# rather than via xcursorgen -- xcursorgen's PNG reading turned out to
# be broken on modern libpng/libXcursor combinations (reproduced
# independently on two separate machines), so it's bypassed entirely.

THEME_NAME="cursor-overlay-blank"
THEME_DIR="$HOME/.icons/$THEME_NAME"
CURSORS_DIR="$THEME_DIR/cursors"

if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 not found -- it's required to build the cursor file."
    exit 1
fi

mkdir -p "$CURSORS_DIR"

python3 << 'PYEOF'
import struct
import os

def build_blank_cursor(path, size=32, xhot=0, yhot=0):
    magic = b'Xcur'
    header_bytes = 16
    version = 0x10000
    ntoc = 1

    file_header = struct.pack('<4sIII', magic, header_bytes, version, ntoc)

    toc_type = 0xfffd0002       # image chunk type
    toc_subtype = size          # nominal size
    toc_position = header_bytes + 12 * ntoc
    toc = struct.pack('<III', toc_type, toc_subtype, toc_position)

    chunk_header_bytes = 36
    chunk_type = 0xfffd0002
    chunk_subtype = size
    chunk_version = 1
    delay = 0

    chunk_header = struct.pack(
        '<IIIIIIIII',
        chunk_header_bytes, chunk_type, chunk_subtype, chunk_version,
        size, size, xhot, yhot, delay
    )

    pixels = b'\x00' * (size * size * 4)  # fully transparent ARGB

    with open(path, 'wb') as f:
        f.write(file_header)
        f.write(toc)
        f.write(chunk_header)
        f.write(pixels)

cursors_dir = os.path.expanduser("~/.icons/cursor-overlay-blank/cursors")
blank_path = os.path.join(cursors_dir, "__blank")
build_blank_cursor(blank_path, size=32)

cursor_names = [
    "default", "left_ptr", "arrow", "top_left_arrow",
    "pointer", "hand1", "hand2",
    "text", "xterm", "ibeam",
    "wait", "watch", "progress",
    "crosshair", "cross",
    "move", "fleur", "grab", "grabbing",
    "help", "question_arrow",
    "no-drop", "not-allowed", "forbidden",
    "copy", "alias", "context-menu", "cell",
    "col-resize", "row-resize",
    "n-resize", "s-resize", "e-resize", "w-resize",
    "ne-resize", "nw-resize", "se-resize", "sw-resize",
    "ew-resize", "ns-resize", "nesw-resize", "nwse-resize",
    "all-scroll", "zoom-in", "zoom-out",
]

for name in cursor_names:
    dest = os.path.join(cursors_dir, name)
    if os.path.lexists(dest):
        os.remove(dest)
    # Hardlink where possible (cheaper), fall back to copy.
    try:
        os.link(blank_path, dest)
    except OSError:
        import shutil
        shutil.copyfile(blank_path, dest)

os.remove(blank_path)
print(f"Wrote {len(cursor_names)} blank cursor files to {cursors_dir}")
PYEOF

cat > "$THEME_DIR/index.theme" << EOF
[Icon Theme]
Name=Cursor Overlay Blank
Comment=Fully transparent cursor, used while the Cursor Overlay extension's "Hide system cursor" option is on
Inherits=
EOF

echo
echo "Installed transparent cursor theme '$THEME_NAME' to:"
echo "  $THEME_DIR"
echo
echo "The extension will switch to this theme automatically when its"
echo "'Hide system cursor' preference is turned on, and restore your"
echo "original theme when it's turned off."