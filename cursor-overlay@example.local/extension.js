import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const CURSOR_WIDTH = 26;
const CURSOR_BODY_HEIGHT = 38;
const ARROW_HEIGHT = 6;
const ARROW_HALF_WIDTH = 3;
const CURSOR_HEIGHT = CURSOR_BODY_HEIGHT + ARROW_HEIGHT;
const CORNER_RADIUS = 9;
const CURSOR_ROTATION_DEG = -25; // classic arrow-cursor-like slant
const POLL_INTERVAL_MS = 16; // ~60fps
const DEFAULT_CURSOR_SCALE_PCT = 100;

const INTERFACE_SCHEMA = 'org.gnome.desktop.interface';
const BLANK_CURSOR_THEME = 'cursor-overlay-blank';

const ACCENT = [0.20, 0.52, 0.89, 0.95]; // GNOME blue
const NEUTRAL = [1, 1, 1, 0.12];
const OUTLINE = [1, 1, 1, 0.9];
const BASE_FILL = [0.08, 0.08, 0.08, 0.35];

function roundedRectPath(cr, x, y, w, h, r) {
    cr.newSubPath();
    cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    cr.arc(x + r, y + r, r, Math.PI, 3 * Math.PI / 2);
    cr.closePath();
}

class MouseCursor {
    constructor() {
        this._pressedButton = null; // Clutter.BUTTON_PRIMARY / SECONDARY / MIDDLE

        this._area = new St.DrawingArea({
            style_class: 'mouse-cursor-shape',
            reactive: false,
            width: CURSOR_WIDTH,
            height: CURSOR_HEIGHT,
        });
        this._area.set_size(CURSOR_WIDTH, CURSOR_HEIGHT);

        // Pivot at the top-center of the shape (fraction 0.5, 0) --
        // that's the top end of the left/right button divider line,
        // and it's what we want glued to the real pointer position.
        this._area.set_pivot_point(0.5, 0);
        this._area.rotation_angle_z = CURSOR_ROTATION_DEG;
        this._area.scale_x = DEFAULT_CURSOR_SCALE_PCT / 100;
        this._area.scale_y = DEFAULT_CURSOR_SCALE_PCT / 100;

        this._repaintId = this._area.connect('repaint', this._onRepaint.bind(this));
    }

    get actor() {
        return this._area;
    }

    setPosition(x, y) {
        // Actor position is its top-left corner; shift left by half the
        // width so the pivot (top-center) lands exactly on (x, y).
        this._area.set_position(x - CURSOR_WIDTH / 2, y);
    }

    setScale(percent) {
        // Scaling happens around the same pivot used for rotation
        // (top-center, where the arrowhead tip sits), so the hotspot
        // stays glued to the real cursor position at any size.
        const scale = percent / 100;
        this._area.scale_x = scale;
        this._area.scale_y = scale;
    }

    setPressedButton(button) {
        if (this._pressedButton === button)
            return;
        this._pressedButton = button;
        this._area.queue_repaint();
    }

    _onRepaint(area) {
        const cr = area.get_context();
        const [totalWidth, totalHeight] = area.get_surface_size();
        const bodyTop = ARROW_HEIGHT;
        const w = totalWidth - 1;
        const h = totalHeight - bodyTop - 1;
        const buttonAreaHeight = h * 0.55;

        // Arrowhead: apex sits exactly at (totalWidth / 2, 0), which is
        // also the pivot point and therefore the real click location --
        // this is what makes it usable as an accuracy reference rather
        // than just decoration.
        cr.moveTo(totalWidth / 2, 0);
        cr.lineTo(totalWidth / 2 - ARROW_HALF_WIDTH, ARROW_HEIGHT);
        cr.lineTo(totalWidth / 2 + ARROW_HALF_WIDTH, ARROW_HEIGHT);
        cr.closePath();
        cr.setSourceRGBA(...(this._pressedButton !== null ? ACCENT : OUTLINE));
        cr.fill();

        roundedRectPath(cr, 0, bodyTop, w, h, CORNER_RADIUS);
        cr.clipPreserve();

        cr.setSourceRGBA(...BASE_FILL);
        cr.fill();

        cr.rectangle(0, bodyTop, w / 2, buttonAreaHeight);
        cr.setSourceRGBA(...(this._pressedButton === Clutter.BUTTON_PRIMARY ? ACCENT : NEUTRAL));
        cr.fill();

        cr.rectangle(w / 2, bodyTop, w / 2, buttonAreaHeight);
        cr.setSourceRGBA(...(this._pressedButton === Clutter.BUTTON_SECONDARY ? ACCENT : NEUTRAL));
        cr.fill();

        roundedRectPath(cr, w / 2 - 2, bodyTop + 4, 4, 11, 2);
        cr.setSourceRGBA(...(this._pressedButton === Clutter.BUTTON_MIDDLE ? ACCENT : NEUTRAL));
        cr.fill();

        roundedRectPath(cr, 0, bodyTop, w, h, CORNER_RADIUS);
        cr.setSourceRGBA(...OUTLINE);
        cr.setLineWidth(1.5);
        cr.stroke();

        cr.$dispose();
    }

    destroy() {
        if (this._repaintId) {
            this._area.disconnect(this._repaintId);
            this._repaintId = null;
        }
        this._area.destroy();
        this._area = null;
    }
}

export default class CursorOverlayExtension extends Extension {
    enable() {
        this._cursor = new MouseCursor();
        Main.layoutManager.addChrome(this._cursor.actor);

        this._pollId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            POLL_INTERVAL_MS,
            this._onPoll.bind(this)
        );

        this._settings = this.getSettings();
        this._interfaceSettings = new Gio.Settings({schema: INTERFACE_SCHEMA});
        this._settingsChangedId = this._settings.connect(
            'changed::hide-system-cursor',
            () => this._updateSystemCursorVisibility()
        );
        this._scaleChangedId = this._settings.connect(
            'changed::cursor-scale',
            () => this._updateCursorScale()
        );
        this._updateSystemCursorVisibility();
        this._updateCursorScale();
    }

    disable() {
        if (this._pollId) {
            GLib.source_remove(this._pollId);
            this._pollId = null;
        }

        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        if (this._scaleChangedId) {
            this._settings.disconnect(this._scaleChangedId);
            this._scaleChangedId = null;
        }

        // Always restore the real cursor theme on disable, regardless of
        // the current toggle state, so we never leave the user stuck
        // with the blank one. Reads the actual current state rather than
        // memory, and falls back to the persisted saved theme (or
        // Adwaita) if we're recovering from a previous unclean exit.
        if (this._interfaceSettings) {
            const current = this._interfaceSettings.get_string('cursor-theme');
            if (current === BLANK_CURSOR_THEME) {
                const saved = this._settings ? this._settings.get_string('saved-cursor-theme') : '';
                this._interfaceSettings.set_string('cursor-theme', saved || 'Adwaita');
            }
        }

        this._settings = null;
        this._interfaceSettings = null;

        if (this._cursor) {
            this._cursor.destroy();
            this._cursor = null;
        }
    }

    // Swapping org.gnome.desktop.interface's cursor-theme is a public,
    // stable API respected by every app and GNOME version -- unlike the
    // private compositor cursor-visibility calls, which vary (and
    // sometimes vanish) between Mutter releases. Requires the blank
    // theme to be installed first via install-blank-cursor-theme.sh.
    //
    // The "real" theme is persisted to a GSettings key rather than kept
    // only in memory, so recovery survives crashes, forced logouts, or
    // anything else that skips a clean disable() while the blank theme
    // is active -- otherwise a future session has no way to know what
    // to restore, and the cursor stays stuck invisible forever.
    _updateSystemCursorVisibility() {
        const current = this._interfaceSettings.get_string('cursor-theme');
        if (current !== BLANK_CURSOR_THEME)
            this._settings.set_string('saved-cursor-theme', current);

        const hide = this._settings.get_boolean('hide-system-cursor');
        if (hide) {
            this._interfaceSettings.set_string('cursor-theme', BLANK_CURSOR_THEME);
        } else if (current === BLANK_CURSOR_THEME) {
            // Stuck blank from a previous unclean exit -- self-heal.
            const saved = this._settings.get_string('saved-cursor-theme');
            this._interfaceSettings.set_string('cursor-theme', saved || 'Adwaita');
        }
    }

    _updateCursorScale() {
        const percent = this._settings.get_int('cursor-scale');
        this._cursor.setScale(percent);
    }

    _onPoll() {
        // The panel and things like the Quick Settings menu get added
        // to the same chrome layer as our cursor, but potentially
        // *after* it (e.g. any popup menu opened post-enable()), and
        // later-added children paint on top in Clutter. Re-raising
        // every tick keeps us above all of that regardless of when
        // it appeared.
        const parent = this._cursor.actor.get_parent();
        if (parent)
            parent.set_child_above_sibling(this._cursor.actor, null);

        const [x, y, mods] = global.get_pointer();
        this._cursor.setPosition(x, y);

        // On this system: BUTTON1_MASK = left, BUTTON2_MASK = right,
        // BUTTON3_MASK = middle (2 and 3 are swapped from the usual
        // convention). If this ever changes on another machine, swap
        // the BUTTON2_MASK / BUTTON3_MASK lines below.
        let pressedButton = null;
        if (mods & Clutter.ModifierType.BUTTON1_MASK)
            pressedButton = Clutter.BUTTON_PRIMARY;
        else if (mods & Clutter.ModifierType.BUTTON2_MASK)
            pressedButton = Clutter.BUTTON_SECONDARY;
        else if (mods & Clutter.ModifierType.BUTTON3_MASK)
            pressedButton = Clutter.BUTTON_MIDDLE;

        this._cursor.setPressedButton(pressedButton);

        return GLib.SOURCE_CONTINUE;
    }
}