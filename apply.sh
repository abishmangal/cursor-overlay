rm -rf ~/.local/share/gnome-shell/extensions/cursor-overlay@example.local
cp -r cursor-overlay@example.local ~/.local/share/gnome-shell/extensions/
sudo ./install_blank_cursor_theme.sh
gnome-extensions enable cursor-overlay@example.local