// ============================================
// ACHIEVEMENTS
// Persisted to localStorage as a comma-joined list of unlocked IDs.
// Each unlock triggers a brief banner on the HUD; afterwards the
// achievement just stays unlocked.
// ============================================

const ACHIEVEMENT_LIST = [
    { id: 'FIRST_BLOOD',       name: 'First Blood',       desc: 'Defeat any enemy.' },
    { id: 'STAGE_1',           name: 'Office Survivor',   desc: 'Clear OFFICE JUNGLE.' },
    { id: 'STAGE_2',           name: 'Coffee Spilled',    desc: 'Clear BREAK ROOM RUMBLE.' },
    { id: 'STAGE_3',           name: 'Data Wiped',        desc: 'Clear SERVER FARM SHOWDOWN.' },
    { id: 'STAGE_4',           name: 'Boardroom Crasher', desc: 'Clear THE BOARDROOM.' },
    { id: 'STAGE_5',           name: 'Ballmer Defeated',  desc: 'Defeat CEO Ballmer.' },
    { id: 'STAGE_6',           name: 'The Real Villain',  desc: 'Defeat The Founder.' },
    { id: 'NO_DEATH_STAGE',    name: 'Untouchable',       desc: 'Clear a stage with zero deaths.' },
    { id: 'NO_DEATH_RUN',      name: 'Paperclip of Steel',desc: 'Complete the game without dying.' },
    { id: 'SECRET',            name: 'Snoop',             desc: 'Find a secret room.' },
    { id: 'KONAMI',            name: 'Contra Veteran',    desc: 'Input the Contra code.' },
    { id: 'ALL_WEAPONS',       name: 'Arms Dealer',       desc: 'Use every weapon at least once.' },
    { id: 'BOSS_RUSH',         name: 'Bosses Are Tools',  desc: 'Clear Boss Rush.' },
    { id: 'SPEEDRUN_5',        name: 'Speed Demon',       desc: 'Beat any stage in under 60 seconds.' },
    { id: 'HARD',              name: 'Why Are You Like This', desc: 'Beat the game on HARD.' }
];

class Achievements {
    constructor() {
        this.unlocked = new Set();
        this.notifyQueue = [];      // pending banners
        this.bannerTimer = 0;
        this.bannerCurrent = null;
        this.weaponsUsed = new Set();
        try {
            const raw = localStorage.getItem('clippy_first_blood_achievements');
            if (raw) raw.split(',').forEach(id => { if (id) this.unlocked.add(id); });
        } catch (e) { /* ignore */ }
    }

    has(id) { return this.unlocked.has(id); }

    grant(id) {
        if (this.unlocked.has(id)) return false;
        if (!ACHIEVEMENT_LIST.find(a => a.id === id)) return false;
        this.unlocked.add(id);
        try {
            localStorage.setItem('clippy_first_blood_achievements',
                Array.from(this.unlocked).join(','));
        } catch (e) {}
        // Queue a banner
        const ach = ACHIEVEMENT_LIST.find(a => a.id === id);
        this.notifyQueue.push(ach);
        if (typeof audio !== 'undefined') audio.sfxPickup();
        return true;
    }

    // Convenience event hooks
    onEnemyKilled() { this.grant('FIRST_BLOOD'); }
    onSecretFound() { this.grant('SECRET'); }
    onKonami()      { this.grant('KONAMI'); }
    onWeaponUsed(weaponName) {
        if (!weaponName) return;
        this.weaponsUsed.add(weaponName);
        if (this.weaponsUsed.size >= 5) this.grant('ALL_WEAPONS');
    }
    onStageCleared(stageNumber, stageTimeSeconds) {
        this.grant('STAGE_' + stageNumber);
        if (stageTimeSeconds > 0 && stageTimeSeconds < 60) this.grant('SPEEDRUN_5');
    }
    onBossRushCleared() { this.grant('BOSS_RUSH'); }
    onGameCleared(difficultyKey, deaths) {
        if (deaths === 0) this.grant('NO_DEATH_RUN');
        if (difficultyKey === 'HARD') this.grant('HARD');
    }
    onStageClearedNoDeath() { this.grant('NO_DEATH_STAGE'); }

    // Drive the banner timer + step queue. Returns the current banner or null.
    update() {
        if (this.bannerTimer > 0) this.bannerTimer--;
        if (this.bannerTimer === 0 && this.notifyQueue.length > 0) {
            this.bannerCurrent = this.notifyQueue.shift();
            this.bannerTimer = 180;     // 3 seconds
        }
        return this.bannerTimer > 0 ? this.bannerCurrent : null;
    }

    // Draws a small floating banner if a notification is currently active.
    drawBanner(ctx) {
        if (this.bannerTimer <= 0 || !this.bannerCurrent) return;
        const fadeIn = Math.min(1, (180 - this.bannerTimer) / 12);
        const fadeOut = Math.min(1, this.bannerTimer / 20);
        const alpha = Math.min(fadeIn, fadeOut);
        ctx.save();
        ctx.globalAlpha = alpha;
        const W = GAME.WIDTH;
        const y = 30;
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(20, y - 2, W - 40, 26);
        ctx.fillStyle = '#3a2855';
        ctx.fillRect(22, y, W - 44, 22);
        ctx.fillStyle = '#564468';
        ctx.fillRect(22, y, W - 44, 1);
        ctx.fillStyle = '#1a1140';
        ctx.fillRect(22, y + 21, W - 44, 1);

        // Trophy icon on the left
        ctx.fillStyle = '#ffd460';
        ctx.fillRect(28, y + 4, 12, 12);
        ctx.fillStyle = '#a8780a';
        ctx.fillRect(28, y + 14, 12, 2);
        ctx.fillStyle = '#fff8d0';
        ctx.fillRect(30, y + 5, 8, 1);

        if (typeof drawPixelTextOutlined === 'function') {
            drawPixelTextOutlined(ctx, 'ACHIEVEMENT', 46, y + 2, '#ffe070', '#1a0000', 1, 'left', 1);
        }
        if (typeof drawPixelText === 'function') {
            drawPixelText(ctx, this.bannerCurrent.name, 46, y + 12, '#ffffff', 1, 'left', 1);
            drawPixelText(ctx, this.bannerCurrent.desc, 46, y + 20 - 6 + 6, '#a890c0', 1, 'left', 1);
        }
        ctx.restore();
    }
}

const achievements = new Achievements();
