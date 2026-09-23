/**
 * GeoBerdsk — Game Engine (custom rounds / time / move)
 */
window.GeoBerdsk = window.GeoBerdsk || {};

GeoBerdsk.Game = (function() {
    let state = createEmptyState();
    let onStateChange = null;
    let onTimerTick = null;
    let onTimeUp = null;
    let lastOptions = { rounds: 5, timeLimit: 0, moveMode: 'free' };

    function createEmptyState() {
        return {
            mode: null,
            currentRound: 0,
            totalRounds: 0,
            locations: [],
            currentLocation: null,
            rounds: [],
            totalScore: 0,
            totalXP: 0,
            streak: 0,
            bestStreak: 0,
            timerInterval: null,
            timeLeft: 0,
            isActive: false,
            isPaused: false,
        };
    }

    function normalizeOptions(options) {
        const rounds = Math.max(5, Math.min(40, Number(options.rounds) || 5));
        let timeLimit = Number(options.timeLimit);
        if (!Number.isFinite(timeLimit) || timeLimit < 0) timeLimit = 0;
        const moveMode = ['free', 'look', 'fixed'].includes(options.moveMode)
            ? options.moveMode
            : 'free';
        return { rounds, timeLimit, moveMode };
    }

    function buildMode(opts) {
        const timeLabel = opts.timeLimit <= 0
            ? 'без таймера'
            : (opts.timeLimit < 60 ? opts.timeLimit + ' сек' : (opts.timeLimit / 60) + ' мин');
        const moveLabel = {
            free: 'движение',
            look: 'только осмотр',
            fixed: 'без осмотра',
        }[opts.moveMode];
        return {
            id: 'custom',
            name: 'Игра',
            description: opts.rounds + ' раундов · ' + timeLabel + ' · ' + moveLabel,
            rounds: opts.rounds,
            timeLimit: opts.timeLimit,
            moveMode: opts.moveMode,
        };
    }

    function startGame(options, callbacks) {
        const opts = normalizeOptions(options || lastOptions);
        lastOptions = opts;

        onStateChange = (callbacks && callbacks.onStateChange) || null;
        onTimerTick = (callbacks && callbacks.onTimerTick) || null;
        onTimeUp = (callbacks && callbacks.onTimeUp) || null;

        stopTimer();

        const mode = buildMode(opts);
        const locations = GeoBerdsk.getRandomLocations(opts.rounds);

        state = {
            mode: mode,
            currentRound: 0,
            totalRounds: opts.rounds,
            locations: locations,
            currentLocation: null,
            rounds: [],
            totalScore: 0,
            totalXP: 0,
            streak: 0,
            bestStreak: 0,
            timerInterval: null,
            timeLeft: 0,
            isActive: true,
            isPaused: false,
        };

        emitStateChange('gameStarted');
        return state;
    }

    function nextRound() {
        if (!state.isActive) return null;
        if (state.currentRound >= state.mode.rounds) return null;
        if (state.currentRound >= state.locations.length) return null;

        state.currentRound++;
        state.currentLocation = state.locations[state.currentRound - 1];

        if (state.mode.timeLimit > 0) {
            startTimer(state.mode.timeLimit);
        }

        emitStateChange('roundStarted');
        return state.currentLocation;
    }

    function replaceCurrentLocation() {
        if (!state.isActive || !state.currentLocation) return null;
        const usedIds = state.locations.map(l => l.id);
        const replacement = GeoBerdsk.getUnusedLocation(usedIds);
        if (!replacement) return null;
        state.locations[state.currentRound - 1] = replacement;
        state.currentLocation = replacement;
        return replacement;
    }

    function calculateClassicScore(distance) {
        if (distance < 25) return 5000;
        if (distance > 5000) return 0;
        return Math.round(5000 * Math.exp(-distance / 1500));
    }

    function calculateTimedScore(distance, timeLeft, timeLimit) {
        const base = calculateClassicScore(distance);
        if (timeLimit <= 0) return base;
        const bonus = Math.round(base * 0.35 * (timeLeft / timeLimit));
        return base + bonus;
    }

    function submitGuess(guessLat, guessLng) {
        stopTimer();

        const loc = state.currentLocation;
        const distance = GeoBerdsk.Map.haversineDistance(
            guessLat, guessLng, loc.lat, loc.lng
        );

        let score = state.mode.timeLimit > 0
            ? calculateTimedScore(distance, state.timeLeft, state.mode.timeLimit)
            : calculateClassicScore(distance);

        const xpResult = GeoBerdsk.XP.calculateRoundXP(distance);

        if (distance < 500) {
            state.streak++;
            if (state.streak > state.bestStreak) state.bestStreak = state.streak;
        } else {
            state.streak = 0;
        }

        let streakMultiplier = 1;
        if (state.streak >= 3) streakMultiplier = 1.5;
        if (state.streak >= 5) streakMultiplier = 2;
        score = Math.round(score * streakMultiplier);

        const roundResult = {
            round: state.currentRound,
            location: loc,
            guessLat,
            guessLng,
            distance: Math.round(distance),
            score,
            xp: xpResult.xp,
            xpReasons: xpResult.reasons,
            streak: state.streak,
            streakMultiplier,
            timeLeft: state.timeLeft,
        };

        state.rounds.push(roundResult);
        state.totalScore += score;
        state.totalXP += xpResult.xp;

        emitStateChange('roundComplete');
        return roundResult;
    }

    function endGame() {
        stopTimer();
        state.isActive = false;

        const data = GeoBerdsk.Storage.load();
        const roundCount = state.rounds.length;
        const modeId = 'custom';

        if (!state.mode || roundCount === 0) {
            return {
                mode: state.mode || buildMode(lastOptions),
                totalScore: 0,
                rounds: [],
                roundCount: 0,
                totalXP: 0,
                bonusXP: { xp: 0, reasons: [] },
                xpResult: { leveledUp: false, newLevel: GeoBerdsk.XP.getLevelInfo(data.player.xp) },
                isNewRecord: false,
                isPerfectGame: false,
                streak: 0,
                avgDistance: NaN,
            };
        }

        const prevBest = data.records.classic || 0;
        const isNewRecord = state.totalScore > prevBest;
        const isPerfectGame = state.rounds.every(r => r.distance < 200);

        const bonusXP = GeoBerdsk.XP.calculateGameBonusXP({
            isNewRecord,
            isPerfectGame,
            marathonRounds: 0,
        });

        state.totalXP += bonusXP.xp;
        const xpResult = GeoBerdsk.XP.addXP(state.totalXP);

        if (isNewRecord) {
            data.records.classic = state.totalScore;
        }

        data.player.gamesPlayed++;
        data.player.totalRounds += roundCount;
        data.player.perfectHits += state.rounds.filter(r => r.distance < 50).length;
        if (state.bestStreak > data.player.bestStreak) {
            data.player.bestStreak = state.bestStreak;
        }
        GeoBerdsk.Storage.save(data);

        const distSum = state.rounds.reduce((sum, r) => sum + (r.distance || 0), 0);
        const avgDistance = Math.round(distSum / roundCount);

        GeoBerdsk.Storage.addGameHistory({
            mode: modeId,
            score: state.totalScore,
            rounds: roundCount,
            xpEarned: state.totalXP,
            avgDistance,
            label: state.mode.description,
        });

        emitStateChange('gameEnded');
        return {
            mode: state.mode,
            totalScore: state.totalScore,
            rounds: state.rounds,
            roundCount,
            totalXP: state.totalXP,
            bonusXP,
            xpResult,
            isNewRecord,
            isPerfectGame,
            streak: state.bestStreak,
            avgDistance,
        };
    }

    function startTimer(seconds) {
        stopTimer();
        state.timeLeft = seconds;
        if (onTimerTick) onTimerTick(state.timeLeft);

        state.timerInterval = setInterval(() => {
            if (state.isPaused) return;
            state.timeLeft -= 0.1;
            if (state.timeLeft <= 0) {
                state.timeLeft = 0;
                stopTimer();
                if (onTimerTick) onTimerTick(0);
                if (onTimeUp) onTimeUp();
                return;
            }
            if (onTimerTick) onTimerTick(state.timeLeft);
        }, 100);
    }

    function stopTimer() {
        if (state.timerInterval) {
            clearInterval(state.timerInterval);
            state.timerInterval = null;
        }
    }

    function emitStateChange(type) {
        if (onStateChange) onStateChange(type, getState());
    }

    function getState() {
        return { ...state };
    }

    function getLastOptions() {
        return { ...lastOptions };
    }

    function hasMoreRounds() {
        if (!state.isActive) return false;
        return state.currentRound < state.mode.rounds;
    }

    // Legacy stub for old UI bits
    const MODES = {
        custom: { id: 'custom', name: 'Игра' },
        classic: { id: 'classic', name: 'Игра' },
    };

    return {
        MODES,
        startGame,
        nextRound,
        replaceCurrentLocation,
        submitGuess,
        endGame,
        getState,
        getLastOptions,
        getLastModeId: () => 'custom',
        hasMoreRounds,
    };
})();
