// Single source of truth for the on-screen release stamp (bottom-right HUD).
// Bump this in every release commit — tools/validate-assets.mjs fails the
// test suite if it falls behind the newest R-tag in git history (the old
// hardcoded stamp in game.js drifted R477 -> R658 before anyone noticed).
export const RELEASE = 'R711';
