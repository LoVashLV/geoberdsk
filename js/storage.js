/**
 * GeoBerdsk — Storage Manager
 */
window.GeoBerdsk = window.GeoBerdsk || {};

GeoBerdsk.Storage = (function() {
    const STORAGE_KEY = 'geoberdsk_data';

    const DEFAULT_DATA = {
        player: {
            xp: 0,
            gamesPlayed: 0,
            totalRounds: 0,
            perfectHits: 0,
            bestStreak: 0,
        },
        records: {
            classic: 0,
            timeattack: 0,
            marathon: 0,
            districts: 0,
        },
        history: [],
        settings: {
            soundEnabled: true,
        },
    };

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return deepClone(DEFAULT_DATA);
            return deepMerge(deepClone(DEFAULT_DATA), JSON.parse(raw));
        } catch (e) {
            console.warn('GeoBerdsk: Failed to load data', e);
            return deepClone(DEFAULT_DATA);
        }
    }

    function save(data) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('GeoBerdsk: Failed to save data', e);
        }
    }

    function update(updater) {
        const data = load();
        const updated = updater(data);
        save(updated || data);
        return updated || data;
    }

    function addGameHistory(gameRecord) {
        return update(data => {
            data.history.unshift({ ...gameRecord, timestamp: Date.now() });
            if (data.history.length > 50) data.history = data.history.slice(0, 50);
            return data;
        });
    }

    function reset() {
        save(deepClone(DEFAULT_DATA));
    }

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
