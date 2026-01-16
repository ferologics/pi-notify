/**
 * badlogic-is-blind - Aligns editor text with message content padding
 *
 * Because apparently the misalignment wasn't obvious enough 🙄
 *
 * Usage: Add to ~/.pi/agent/settings.json extensions array
 */

import { CustomEditor, type ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
    pi.on("session_start", (_event, ctx) => {
        ctx.ui.setEditorComponent((tui, theme, kb) => {
            // @ts-ignore - EditorOptions added in next release
            return new CustomEditor(tui, theme, kb, { paddingX: 1 });
        });
    });
}
