/**
 * GeoBerdsk — XP & Level System
 * Manages experience points, levels, and progression.
 */
window.GeoBerdsk = window.GeoBerdsk || {};

GeoBerdsk.XP = (function() {

    const LEVELS = [
        { level: 1,  xpRequired: 0,     name: 'Новичок',      emoji: '🌱' },
        { level: 2,  xpRequired: 200,   name: 'Турист',       emoji: '🎒' },
        { level: 3,  xpRequired: 500,   name: 'Исследователь', emoji: '🧭' },
        { level: 4,  xpRequired: 1000,  name: 'Знаток',       emoji: '📍' },
        { level: 5,  xpRequired: 2000,  name: 'Краевед',      emoji: '🗺️' },
        { level: 6,  xpRequired: 4000,  name: 'Эксперт',      emoji: '🔍' },
        { level: 7,  xpRequired: 7000,  name: 'Мастер',       emoji: '🏅' },
        { level: 8,  xpRequired: 11000, name: 'Гуру',         emoji: '🧠' },
        { level: 9,  xpRequired: 16000, name: 'Легенда',      emoji: '👑' },
        { level: 10, xpRequired: 25000, name: 'Бердчанин',    emoji: '🏆' },
    ];

    // XP reward constants
    const REWARDS = {
        roundComplete:      10,
        perfectHit:         100,   // < 50m
        closeHit:           50,    // < 200m
        goodHit:            25,    // < 500m
        gameComplete:       50,
        perfectGame:        200,   // all rounds < 200m
        newRecord:          150,
        marathonMilestone:  100,   // every 5 rounds in marathon
        districtCorrect:    30,    // correct district guess
    };

    /**
     * Get level info for a given XP amount
     * @param {number} xp
     * @returns {Object} { level, name, emoji, xpRequired, xpForNext, progress }
     */
    function getLevelInfo(xp) {
        let currentLevel = LEVELS[0];
        for (let i = LEVELS.length - 1; i >= 0; i--) {
            if (xp >= LEVELS[i].xpRequired) {
                currentLevel = LEVELS[i];
                break;
            }
        }

        const nextLevel = LEVELS.find(l => l.level === currentLevel.level + 1);
        const xpInLevel = xp - currentLevel.xpRequired;
        const xpNeeded = nextLevel ? nextLevel.xpRequired - currentLevel.xpRequired : 0;
        const progress = nextLevel ? Math.min(1, xpInLevel / xpNeeded) : 1;

        return {
            level: currentLevel.level,
            name: currentLevel.name,
            emoji: currentLevel.emoji,
            xpRequired: currentLevel.xpRequired,
            xpForNext: nextLevel ? nextLevel.xpRequired : currentLevel.xpRequired,
            xpInLevel: xpInLevel,
            xpNeeded: xpNeeded,
            progress: progress,
            isMaxLevel: !nextLevel,
        };
    }

    /**
     * Calculate XP reward for a round based on distance
     * @param {number} distanceMeters
     * @returns {Object} { xp, reasons[] }
     */
    function calculateRoundXP(distanceMeters) {
        const reasons = [];
        let totalXP = REWARDS.roundComplete;
        reasons.push({ text: 'Раунд завершён', xp: REWARDS.roundComplete });

        if (distanceMeters < 50) {
            totalXP += REWARDS.perfectHit;
            reasons.push({ text: 'Идеальное попадание! (<50м)', xp: REWARDS.perfectHit });
        } else if (distanceMeters < 200) {
            totalXP += REWARDS.closeHit;
            reasons.push({ text: 'Близкое попадание (<200м)', xp: REWARDS.closeHit });
        } else if (distanceMeters < 500) {
            totalXP += REWARDS.goodHit;
            reasons.push({ text: 'Хорошее попадание (<500м)', xp: REWARDS.goodHit });
        }

        return { xp: totalXP, reasons };
    }

    /**
     * Calculate bonus XP at end of game
     * @param {Object} params
     * @returns {Object} { xp, reasons[] }
     */
    function calculateGameBonusXP({ isNewRecord, isPerfectGame, marathonRounds }) {
        const reasons = [];
        let totalXP = REWARDS.gameComplete;
        reasons.push({ text: 'Игра завершена', xp: REWARDS.gameComplete });

        if (isPerfectGame) {
            totalXP += REWARDS.perfectGame;
            reasons.push({ text: 'Идеальная игра! 🌟', xp: REWARDS.perfectGame });
        }

        if (isNewRecord) {
            totalXP += REWARDS.newRecord;
            reasons.push({ text: 'Новый рекорд! 🎉', xp: REWARDS.newRecord });
        }

        if (marathonRounds) {
            const milestones = Math.floor(marathonRounds / 5);
            if (milestones > 0) {
                const bonus = milestones * REWARDS.marathonMilestone;
                totalXP += bonus;
                reasons.push({ text: `Марафон: ${marathonRounds} раундов`, xp: bonus });
            }
        }

        return { xp: totalXP, reasons };
    }

    /**
     * Add XP to player and save
     * @param {number} amount
     * @returns {Object} { oldLevel, newLevel, data }
     */
    function addXP(amount) {
        const data = GeoBerdsk.Storage.load();
        const oldInfo = getLevelInfo(data.player.xp);
        data.player.xp += amount;
        const newInfo = getLevelInfo(data.player.xp);
        GeoBerdsk.Storage.save(data);

        return {
            oldLevel: oldInfo,
            newLevel: newInfo,
            leveledUp: newInfo.level > oldInfo.level,
            data: data,
        };
    }

    return {
        LEVELS,
        REWARDS,
        getLevelInfo,
        calculateRoundXP,
        calculateGameBonusXP,
        addXP,
    };
})();
