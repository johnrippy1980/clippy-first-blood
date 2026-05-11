// ============================================
// ONLINE LEADERBOARD
// ============================================
// Two complementary mechanisms:
//   1. Shareable URL - encodes one entry into the location hash. On
//      load, the game offers to import any score it finds there.
//      This works zero-server: players paste links in chat.
//   2. Configurable HTTPS endpoint - if window.CLIPPY_LEADERBOARD_URL
//      is set, we POST new entries and GET the global top-10 from it.
//      Format: GET returns [{name, score, time, difficulty, ngplus}, ...].
//              POST accepts a single entry of the same shape.
//      Without the endpoint we silently no-op.

const OnlineLeaderboard = {
    // Returns true if a remote endpoint is configured.
    isOnline() {
        return typeof window !== 'undefined' && !!window.CLIPPY_LEADERBOARD_URL;
    },

    // Submit an entry to the configured endpoint. Resolves silently on
    // any failure - the local leaderboard is the source of truth.
    async submit(entry) {
        if (!this.isOnline()) return false;
        try {
            const r = await fetch(window.CLIPPY_LEADERBOARD_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entry)
            });
            return r.ok;
        } catch (e) {
            return false;
        }
    },

    // Fetch the global top entries (up to 10). Returns [] on any error.
    async fetchTop() {
        if (!this.isOnline()) return [];
        try {
            const r = await fetch(window.CLIPPY_LEADERBOARD_URL, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });
            if (!r.ok) return [];
            const j = await r.json();
            if (!Array.isArray(j)) return [];
            return j.slice(0, 10);
        } catch (e) {
            return [];
        }
    },

    // ---- Shareable URL helpers ----
    // Encode one entry into a base64url string suitable for a URL hash.
    encodeShare(entry) {
        try {
            const json = JSON.stringify({
                v: 1,
                n: (entry.name || 'AAA').slice(0, 3),
                s: entry.score | 0,
                t: Math.round((entry.time || 0) * 10) / 10,
                d: entry.difficulty || 'NORMAL',
                p: entry.ngplus ? 1 : 0
            });
            // UTF-8 -> base64url. TextEncoder handles non-Latin names correctly.
            const bytes = new TextEncoder().encode(json);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            const b64 = btoa(binary);
            return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        } catch (e) { return ''; }
    },

    decodeShare(s) {
        try {
            const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const json = new TextDecoder().decode(bytes);
            const obj = JSON.parse(json);
            if (obj && obj.v === 1) return {
                name: String(obj.n || 'AAA').slice(0, 3),
                score: obj.s | 0,
                time: obj.t || 0,
                difficulty: obj.d || 'NORMAL',
                ngplus: !!obj.p
            };
        } catch (e) {}
        return null;
    },

    // Build a shareable URL for the current page including the entry.
    shareUrl(entry) {
        if (typeof window === 'undefined' || !window.location) return '';
        const enc = this.encodeShare(entry);
        const base = window.location.origin + window.location.pathname;
        return `${base}#score=${enc}`;
    },

    // Parse and return any entry found in the page hash (e.g. on first load
    // after clicking a shared link). Returns null when there is none.
    consumeIncomingShare() {
        if (typeof window === 'undefined' || !window.location) return null;
        const h = window.location.hash || '';
        const m = h.match(/[#&]score=([^&]+)/);
        if (!m) return null;
        const entry = this.decodeShare(m[1]);
        if (!entry) return null;
        // Clear the fragment so reloading doesn't re-import
        try {
            history.replaceState(null, '', window.location.pathname + window.location.search);
        } catch (e) {}
        return entry;
    },

    // Copy a string to the clipboard. Falls back to a textarea+execCommand
    // path on older browsers. Returns true on success.
    async copyToClipboard(text) {
        try {
            if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (e) {}
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch (e) {
            return false;
        }
    }
};
