/**
 * GeoBerdsk — Storage Manager
 * Handles all localStorage persistence (player data, history, settings).
 */
window.GeoBerdsk = window.GeoBerdsk || {};

GeoBerdsk.Storage = (function() {
    const STORAGE_KEY = 'geoberdsk_data';

    const DEFAULT_DATA = {
        player: {
            xp: 0,
            gamesPlayed: 0,
            totalRounds: 0,
            perfectHits: 0,    // < 50m
            bestStreak: 0,
        },
        records: {
            classic: 0,
            timeattack: 0,
            districts: 0,
            marathon: 0,
        },
        history: [],  // last 50 games
        settings: {
            soundEnabled: true,
            yandexApiKey: '',
        },
    };

    /**
     * Load all saved data
     * @returns {Object}
     */
    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return deepClone(DEFAULT_DATA);
            const data = JSON.parse(raw);
            // Merge with defaults to handle schema migrations
            return deepMerge(deepClone(DEFAULT_DATA), data);
        } catch (e) {
            console.warn('GeoBerdsk: Failed to load data, using defaults', e);
            return deepClone(DEFAULT_DATA);
        }
    }

    /**
     * Save all data
     * @param {Object} data
     */
    function save(data) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('GeoBerdsk: Failed to save data', e);
        }
    }

    /**
     * Update player data partially
     * @param {Function} updater - receives current data, should return updated data
     */
    function update(updater) {
        const data = load();
        const updated = updater(data);
        save(updated || data);
        return updated || data;
    }

    /**
     * Add a game to history
     * @param {Object} gameRecord
     */
    function addGameHistory(gameRecord) {
        return update(data => {
            data.history.unshift({
                ...gameRecord,
                timestamp: Date.now(),
            });
            // Keep only last 50 games
            if (data.history.length > 50) {
                data.history = data.history.slice(0, 50);
            }
            return data;
        });
    }

    /**
     * Reset all data
     */
    function reset() {
        save(deepClone(DEFAULT_DATA));
    }

    // ─── Helpers ────────────────────────────────────────────

    function deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function deepMerge(target, source) {
        for (const key of Object.keys(source)) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key]) target[key] = {};
                deepMerge(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
        return target;
    }

    return { load, save, update, addGameHistory, reset };
})();
