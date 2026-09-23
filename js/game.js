/**
 * GeoBerdsk — Game Engine
 */
window.GeoBerdsk = window.GeoBerdsk || {};

GeoBerdsk.Game = (function() {

    const MODES = {
        classic: {
            id: 'classic',
            name: 'Классический',
            description: 'Пять раундов без таймера. Смотри панораму, ставь метку на карте — чем ближе, тем больше очков.',
            meta: '5 раундов · без таймера',
            rounds: 5,
            timeLimit: 0,
        },
        timeattack: {
            id: 'timeattack',
            name: 'На время',
            description: 'Тот же формат, но на каждый раунд только 30 секунд. Думай быстро — иначе очки сгорят.',
            meta: '5 раундов · 30 сек',
            rounds: 5,
            timeLimit: 30,
        },
        districts: {
            id: 'districts',
            name: 'Районы',
            description: 'Десять панорам — угадай микрорайон Бердска. Карта не нужна: выбирай район из списка.',
            meta: '10 раундов · микрорайон',
            rounds: 10,
            timeLimit: 0,
        },
        marathon: {
            id: 'marathon',
            name: 'Марафон',
            description: 'Иди пока не ошибёшься. Промах дальше 500 м — конец. Серия очков растёт с каждым попаданием.',
            meta: 'без лимита · до ошибки',
            rounds: Infinity,
            timeLimit: 0,
        },
    };

    let state = createEmptyState();
    let onStateChange = null;
    let onTimerTick = null;
    let onTimeUp = null;
    let lastModeId = 'classic';

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

    function startGame(modeId, callbacks) {
        const mode = MODES[modeId];
        if (!mode) throw new Error('Unknown mode: ' + modeId);

        lastModeId = modeId;
        onStateChange = callbacks.onStateChange || null;
        onTimerTick = callbacks.onTimerTick || null;
        onTimeUp = callbacks.onTimeUp || null;

        stopTimer();

        const roundCount = mode.rounds === Infinity ? 50 : mode.rounds;
        const locations = GeoBerdsk.getRandomLocations(roundCount);

        state = {
            mode: mode,
            currentRound: 0,
            totalRounds: mode.rounds,
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

        if (state.mode.rounds !== Infinity && state.currentRound >= state.mode.rounds) {
            return null;
        }

        if (state.currentRound >= state.locations.length) {
            return null;
        }

        state.currentRound++;
        state.currentLocation = state.locations[state.currentRound - 1];

        if (state.mode.timeLimit > 0) {
            startTimer(state.mode.timeLimit);
        }

        emitStateChange('roundStarted');
        return state.currentLocation;
    }

    /**
     * Заменить текущую локацию (если нет панорамы) — раунд не сгорает
     */
    function replaceCurrentLocation() {
        if (!state.isActive || !state.currentLocation) return null;

        const usedIds = state.locations.map(l => l.id);
        const replacement = GeoBerdsk.getUnusedLocation(usedIds);
        if (!replacement) return null;

        state.locations[state.currentRound - 1] = replacement;
        state.currentLocation = replacement;
        return replacement;
    }

    function submitGuess(guessLat, guessLng) {
        stopTimer();

        const loc = state.currentLocation;
        const distance = GeoBerdsk.Map.haversineDistance(
            guessLat, guessLng, loc.lat, loc.lng
        );

        let score;
        if (state.mode.id === 'timeattack') {
            score = calculateTimeAttackScore(distance, state.timeLeft, state.mode.timeLimit);
        } else {
            score = calculateClassicScore(distance);
        }

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

        if (state.mode.id === 'marathon' && distance > 500) {
            state.isActive = false;
            roundResult.marathonEnd = true;
        }

        emitStateChange('roundComplete');
        return roundResult;
    }

    function submitDistrictGuess(districtId) {
        const loc = state.currentLocation;
        const correct = districtId === loc.district;
        const score = correct ? 1000 : 0;
        const xp = correct ? GeoBerdsk.XP.REWARDS.districtCorrect : 5;

        if (correct) {
            state.streak++;
            if (state.streak > state.bestStreak) state.bestStreak = state.streak;
        } else {
            state.streak = 0;
        }

        const roundResult = {
            round: state.currentRound,
            location: loc,
            guessedDistrict: districtId,
            correctDistrict: loc.district,
            correct,
            score,
            xp,
            xpReasons: [{ text: correct ? 'Правильный район!' : 'Неверно', xp }],
            streak: state.streak,
        };

        state.rounds.push(roundResult);
        state.totalScore += score;
        state.totalXP += xp;

        emitStateChange('roundComplete');
        return roundResult;
    }

    function endGame() {
        stopTimer();
        state.isActive = false;

        const data = GeoBerdsk.Storage.load();
        const modeId = state.mode ? state.mode.id : lastModeId;
        const roundCount = state.rounds.length;

        if (!state.mode || roundCount === 0) {
            return {
                mode: state.mode || MODES[modeId],
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

        const isNewRecord = state.totalScore > (data.records[modeId] || 0);
        const isPerfectGame = state.rounds.every(r =>
            r.distance !== undefined ? r.distance < 200 : r.correct
        );

        const bonusXP = GeoBerdsk.XP.calculateGameBonusXP({
            isNewRecord,
            isPerfectGame,
            marathonRounds: modeId === 'marathon' ? state.currentRound : 0,
        });

        state.totalXP += bonusXP.xp;
        const xpResult = GeoBerdsk.XP.addXP(state.totalXP);

        if (isNewRecord) {
            data.records[modeId] = state.totalScore;
        }

        data.player.gamesPlayed++;
        data.player.totalRounds += roundCount;
        data.player.perfectHits += state.rounds.filter(r =>
            r.distance !== undefined && r.distance < 50
        ).length;
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
        });

        if (state.totalScore > 0) {
            GeoBerdsk.Storage.addLeaderboardEntry({
                mode: modeId,
                score: state.totalScore,
                rounds: roundCount,
            });
        }

        const summary = {
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

        emitStateChange('gameEnded');
        return summary;
    }

    function getState() {
        return { ...state };
    }

    function getLastModeId() {
        return lastModeId;
    }

    function hasMoreRounds() {
        if (!state.isActive) return false;
        if (state.mode.rounds === Infinity) return true;
        return state.currentRound < state.mode.rounds;
    }

    function calculateClassicScore(distanceMeters) {
        if (distanceMeters < 10) return 5000;
        if (distanceMeters > 5000) return 0;
        return Math.round(Math.max(0, 5000 * Math.exp(-distanceMeters / 800)));
    }

    function calculateTimeAttackScore(distanceMeters, timeLeft, timeLimit) {
        const baseScore = calculateClassicScore(distanceMeters);
        const timeBonus = 1 + (timeLeft / timeLimit);
        return Math.round(baseScore * timeBonus);
    }

    function startTimer(seconds) {
        stopTimer();
        state.timeLeft = seconds;

        state.timerInterval = setInterval(() => {
            state.timeLeft = Math.max(0, state.timeLeft - 0.1);
            if (onTimerTick) onTimerTick(state.timeLeft);

            if (state.timeLeft <= 0) {
                stopTimer();
                if (onTimeUp) onTimeUp();
            }
        }, 100);
    }

    function stopTimer() {
        if (state.timerInterval) {
            clearInterval(state.timerInterval);
            state.timerInterval = null;
        }
    }

    function emitStateChange(event) {
        if (onStateChange) onStateChange(event, state);
    }

    return {
        MODES,
        startGame,
        nextRound,
        replaceCurrentLocation,
        submitGuess,
        submitDistrictGuess,
        endGame,
        getState,
        getLastModeId,
        hasMoreRounds,
    };
})();
