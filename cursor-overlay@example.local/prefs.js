import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class CursorOverlayPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: 'Cursor Overlay',
        });
        page.add(group);

        const row = new Adw.ActionRow({
            title: 'Hide system cursor',
            subtitle: 'Hide the default OS pointer so only the custom cursor is shown. ' +
                'Support for this can vary by system -- toggle it and see what happens.',
        });
        group.add(row);

        const toggle = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
        });
        row.add_suffix(toggle);
        row.set_activatable_widget(toggle);

        settings.bind(
            'hide-system-cursor',
            toggle,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        window.add(page);
    }
}