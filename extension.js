import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const CURSOR_WIDTH = 26;
const CURSOR_HEIGHT = 38;
const CORNER_RADIUS = 10;
const POLL_INTERVAL_MS = 16; // ~60fps

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
        this._repaintId = this._area.connect('repaint', this._onRepaint.bind(this));
    }

    get actor() {
        return this._area;
    }

    setPosition(x, y) {
        this._area.set_position(x - 4, y - 4);
    }

    setPressedButton(button) {
        if (this._pressedButton === button)
            return;
        this._pressedButton = button;
        this._area.queue_repaint();
    }

    _onRepaint(area) {
        const cr = area.get_context();
        const [width, height] = area.get_surface_size();
        const buttonAreaHeight = height * 0.55;

        roundedRectPath(cr, 1, 1, width - 2, height - 2, CORNER_RADIUS);
        cr.clipPreserve();

        cr.setSourceRGBA(...BASE_FILL);
        cr.fill();

        cr.rectangle(1, 1, width / 2 - 0.5, buttonAreaHeight);
        cr.setSourceRGBA(...(this._pressedButton === Clutter.BUTTON_PRIMARY ? ACCENT : NEUTRAL));
        cr.fill();

        cr.rectangle(width / 2 + 0.5, 1, width / 2 - 0.5, buttonAreaHeight);
        cr.setSourceRGBA(...(this._pressedButton === Clutter.BUTTON_SECONDARY ? ACCENT : NEUTRAL));
        cr.fill();

        roundedRectPath(cr, width / 2 - 2, 5, 4, 11, 2);
        cr.setSourceRGBA(...(this._pressedButton === Clutter.BUTTON_MIDDLE ? ACCENT : NEUTRAL));
        cr.fill();

        roundedRectPath(cr, 1, 1, width - 2, height - 2, CORNER_RADIUS);
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

        // Poll the compositor's own pointer state directly instead of
        // listening for stage events. This is what makes it work
        // regardless of which window/surface currently has focus --
        // global.get_pointer() queries the real device state, not
        // Clutter's event-delivery pipeline, so it isn't affected by
        // a client window "owning" input once the pointer is over it.
        this._pollId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            POLL_INTERVAL_MS,
            this._onPoll.bind(this)
        );

        try {
            global.stage.hide_cursor();
            this._hidCursor = true;
        } catch (e) {
            log(`[Cursor Overlay] Could not hide system cursor: ${e}`);
            this._hidCursor = false;
        }
    }

    disable() {
        if (this._pollId) {
            GLib.source_remove(this._pollId);
            this._pollId = null;
        }

        if (this._hidCursor) {
            try {
                global.stage.show_cursor();
            } catch (e) {
                log(`[Cursor Overlay] Could not restore system cursor: ${e}`);
            }
            this._hidCursor = false;
        }

        if (this._cursor) {
            this._cursor.destroy();
            this._cursor = null;
        }
    }

    _onPoll() {
        const [x, y, mods] = global.get_pointer();
        this._cursor.setPosition(x, y);

        let pressedButton = null;
        if (mods & Clutter.ModifierType.BUTTON1_MASK)
            pressedButton = Clutter.BUTTON_PRIMARY;
        else if (mods & Clutter.ModifierType.BUTTON2_MASK)
            pressedButton = Clutter.BUTTON_MIDDLE;
        else if (mods & Clutter.ModifierType.BUTTON3_MASK)
            pressedButton = Clutter.BUTTON_SECONDARY;

        this._cursor.setPressedButton(pressedButton);

        return GLib.SOURCE_CONTINUE;
    }
}