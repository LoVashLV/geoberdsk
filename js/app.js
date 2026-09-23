/**
 * GeoBerdsk — Main Application Controller
 */
window.GeoBerdsk = window.GeoBerdsk || {};

GeoBerdsk.App = (function() {
    const $ = id => document.getElementById(id);

    const TIME_OPTIONS = [
        { value: 0, label: '∞' },
        { value: 10, label: '10с' },
        { value: 15, label: '15с' },
        { value: 20, label: '20с' },
        { value: 30, label: '30с' },
        { value: 40, label: '40с' },
        { value: 60, label: '1м' },
        { value: 120, label: '2м' },
        { value: 180, label: '3м' },
        { value: 240, label: '4м' },
        { value: 300, label: '5м' },
    ];

    let currentGuess = null;
    let panoramaRetries = 0;
    const MAX_PANORAMA_RETRIES = 8;
    let submitting = false;

    let settings = {
        rounds: 5,
        timeLimit: 0,
        moveMode: 'free',
    };

    function init() {
        injectYandexScript().then(() => {
            GeoBerdsk.Panorama.init();
        });
        buildTimeOptions();
        syncSettingsUI();
        updatePlayerUI();
        bindEvents();
        showScreen('menu');
    }

    function getStoredApiKey() {
        return ((GeoBerdsk.CONFIG && GeoBerdsk.CONFIG.yandexApiKey) || '').trim();
    }

    function injectYandexScript() {
        return new Promise((resolve) => {
            if (typeof ymaps !== 'undefined') {
                resolve();
                return;
            }
            const key = getStoredApiKey();
            if (!key) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://api-maps.yandex.ru/2.1/?lang=ru_RU&load=package.full&apikey=' +
                encodeURIComponent(key);
            script.onload = () => resolve();
            script.onerror = () => resolve();
            document.head.appendChild(script);
        });
    }

    function showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
        const screen = $('screen-' + screenId);
        if (screen) screen.classList.add('active');

        if (screenId === 'game') {
            setTimeout(() => {
                GeoBerdsk.Map.init('guess-map');
                GeoBerdsk.Map.invalidateSize();
            }, 180);
        }
    }

    function buildTimeOptions() {
        const row = $('time-options');
        if (!row) return;
        row.innerHTML = TIME_OPTIONS.map(opt =>
            '<button type="button" class="time-chip' + (opt.value === settings.timeLimit ? ' on' : '') +
            '" data-time="' + opt.value + '">' + opt.label + '</button>'
        ).join('');
    }

    function formatTimeLabel(sec) {
        if (!sec) return '∞';
        if (sec < 60) return sec + ' сек';
        return (sec / 60) + ' мин';
    }

    function syncSettingsUI() {
        const roundsRange = $('rounds-range');
        const roundsValue = $('rounds-value');
        const timeValue = $('time-value');

        if (roundsRange) roundsRange.value = String(settings.rounds);
        if (roundsValue) roundsValue.textContent = String(settings.rounds);
        if (timeValue) timeValue.textContent = formatTimeLabel(settings.timeLimit);

        document.querySelectorAll('[data-time]').forEach(btn => {
            btn.classList.toggle('on', Number(btn.getAttribute('data-time')) === settings.timeLimit);
        });
        document.querySelectorAll('[data-move]').forEach(btn => {
            btn.classList.toggle('on', btn.getAttribute('data-move') === settings.moveMode);
        });
    }

    function setRounds(n) {
        settings.rounds = Math.max(5, Math.min(40, Number(n) || 5));
        syncSettingsUI();
    }

    function bindEvents() {
        $('btn-play')?.addEventListener('click', () => startGame(settings));

        $('rounds-range')?.addEventListener('input', (e) => setRounds(e.target.value));
        $('rounds-minus')?.addEventListener('click', () => setRounds(settings.rounds - 1));
        $('rounds-plus')?.addEventListener('click', () => setRounds(settings.rounds + 1));

        $('time-options')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-time]');
            if (!btn) return;
            settings.timeLimit = Number(btn.getAttribute('data-time'));
            syncSettingsUI();
        });

        document.querySelectorAll('[data-move]').forEach(btn => {
            btn.addEventListener('click', () => {
                settings.moveMode = btn.getAttribute('data-move') || 'free';
                syncSettingsUI();
            });
        });

        $('btn-guess')?.addEventListener('click', submitGuess);
        $('btn-next-round')?.addEventListener('click', goNextRound);

        document.querySelectorAll('[data-action="menu"]').forEach(btn => {
            btn.addEventListener('click', returnToMenu);
        });

        $('btn-stats')?.addEventListener('click', () => {
            try {
                updateStatsUI();
            } catch (e) {
                console.warn(e);
            }
            showScreen('stats');
        });

        $('btn-play-again')?.addEventListener('click', () => {
            startGame(GeoBerdsk.Game.getLastOptions());
        });

        $('btn-toggle-map')?.addEventListener('click', toggleMiniMap);

        const sheet = $('map-guess-area');
        sheet?.addEventListener('mouseenter', () => {
            if (window.innerWidth > 768) {
                sheet.classList.add('expanded');
                GeoBerdsk.Map.invalidateSize();
                updateSheetLabel();
            }
        });
        sheet?.addEventListener('mouseleave', () => {
            if (window.innerWidth > 768 && !sheet.classList.contains('locked')) {
                sheet.classList.remove('expanded');
                GeoBerdsk.Map.invalidateSize();
                updateSheetLabel();
            }
        });
    }

    async function startGame(opts) {
        panoramaRetries = 0;
        submitting = false;

        GeoBerdsk.Game.startGame(opts, {
            onStateChange: () => {},
            onTimerTick: handleTimerTick,
            onTimeUp: handleTimeUp,
        });

        showScreen('game');

        const mapArea = $('map-guess-area');
        if (mapArea) {
            mapArea.style.display = 'flex';
            mapArea.classList.remove('expanded', 'locked');
        }
        updateSheetLabel();
        updateGameHUD();
        await loadNextRound();
    }

    async function loadNextRound() {
        submitting = false;
        const location = GeoBerdsk.Game.nextRound();
        if (!location) {
            finishGame();
            return;
        }

        currentGuess = null;
        GeoBerdsk.Map.reset();
        GeoBerdsk.Map.setGuessMode(true, (lat, lng) => {
            currentGuess = { lat, lng };
            const guessBtn = $('btn-guess');
            if (guessBtn) {
                guessBtn.disabled = false;
                guessBtn.classList.add('ready');
            }
        });

        const guessBtn = $('btn-guess');
        if (guessBtn) {
            guessBtn.disabled = true;
            guessBtn.classList.remove('ready');
        }
        $('map-guess-area')?.classList.remove('locked');

        showPanoramaLoading('Загрузка панорамы…');
        updateGameHUD();
        $('round-result-overlay')?.classList.remove('visible');
        $('screen-game')?.classList.remove('showing-result');

        const moveMode = GeoBerdsk.Game.getState().mode.moveMode || 'free';
        const loaded = await GeoBerdsk.Panorama.load(
            'panorama-container',
            location.lat,
            location.lng,
            { moveMode }
        );

        if (!loaded) {
            panoramaRetries++;
            if (panoramaRetries <= MAX_PANORAMA_RETRIES) {
                const replaced = GeoBerdsk.Game.replaceCurrentLocation();
                if (replaced) {
                    showPanoramaLoading('Ищем другую точку…');
                    setTimeout(() => retrySameRound(), 200);
                    return;
                }
            }
            showPanoramaLoading('Панорама недоступна — следующий раунд…');
            setTimeout(() => {
                if (GeoBerdsk.Game.hasMoreRounds()) loadNextRound();
                else finishGame();
            }, 900);
        } else {
            panoramaRetries = 0;
        }
    }

    async function retrySameRound() {
        const loc = GeoBerdsk.Game.getState().currentLocation;
        if (!loc) return;
        const replaced = GeoBerdsk.Game.replaceCurrentLocation();
        const target = replaced || loc;
        const moveMode = GeoBerdsk.Game.getState().mode.moveMode || 'free';

        showPanoramaLoading('Ищем другую точку…');
        const loaded = await GeoBerdsk.Panorama.load(
            'panorama-container',
            target.lat,
            target.lng,
            { moveMode }
        );

        if (loaded) {
            panoramaRetries = 0;
            return;
        }

        panoramaRetries++;
        if (panoramaRetries <= MAX_PANORAMA_RETRIES && replaced) {
            setTimeout(() => retrySameRound(), 250);
            return;
        }

        if (GeoBerdsk.Game.hasMoreRounds()) loadNextRound();
        else finishGame();
    }

    function showPanoramaLoading(text) {
        const box = $('panorama-container');
        if (!box) return;
        box.innerHTML =
            '<div class="panorama-loading"><div class="spinner"></div><span>' +
            escapeHtml(text) + '</span></div>';
    }

    function submitGuess() {
        if (!currentGuess || submitting) return;
        submitting = true;

        const result = GeoBerdsk.Game.submitGuess(currentGuess.lat, currentGuess.lng);

        GeoBerdsk.Map.setGuessMode(false);
        GeoBerdsk.Map.showResult(
            currentGuess.lat, currentGuess.lng,
            result.location.lat, result.location.lng
        );

        $('map-guess-area')?.classList.add('expanded', 'locked');
        GeoBerdsk.Map.invalidateSize();
        showRoundResult(result);
    }

    function goNextRound() {
        if (GeoBerdsk.Game.hasMoreRounds()) loadNextRound();
        else finishGame();
    }

    function finishGame() {
        const summary = GeoBerdsk.Game.endGame();
        GeoBerdsk.Panorama.destroy();
        showGameSummary(summary);
        updatePlayerUI();
    }

    function returnToMenu() {
        GeoBerdsk.Panorama.destroy();
        const state = GeoBerdsk.Game.getState();
        if (state.isActive) {
            try { GeoBerdsk.Game.endGame(); } catch (e) { /* ignore */ }
        }
        updatePlayerUI();
        showScreen('menu');
    }

    function updatePlayerUI() {
        const data = GeoBerdsk.Storage.load();
        const info = GeoBerdsk.XP.getLevelInfo(data.player.xp);
        const levelBadge = $('player-level');
        const levelName = $('player-level-name');
        const xpBar = $('xp-bar-fill');
        const xpText = $('xp-text');

        if (levelBadge) levelBadge.textContent = 'Ур. ' + info.level;
        if (levelName) levelName.textContent = info.name;
        if (xpBar) xpBar.style.width = (info.progress * 100) + '%';
        if (xpText) {
            xpText.textContent = info.isMaxLevel
                ? data.player.xp + ' XP · максимум'
                : data.player.xp + ' / ' + info.xpForNext + ' XP';
        }
    }

    function updateGameHUD() {
        const state = GeoBerdsk.Game.getState();
        if (!state.mode) return;

        const roundEl = $('hud-round');
        const scoreEl = $('hud-score');
        const modeEl = $('hud-mode');
        const timerEl = $('hud-timer');
        const streakEl = $('hud-streak');

        if (roundEl) {
            roundEl.textContent = state.currentRound + ' / ' + state.mode.rounds;
        }
        if (scoreEl) scoreEl.textContent = state.totalScore.toLocaleString('ru-RU');
        if (modeEl) modeEl.textContent = state.mode.name;

        if (timerEl) {
            timerEl.style.display = state.mode.timeLimit > 0 ? 'flex' : 'none';
        }

        if (streakEl) {
            if (state.streak >= 2) {
                streakEl.hidden = false;
                streakEl.textContent = 'Серия ×' + state.streak;
            } else {
                streakEl.hidden = true;
            }
        }
    }

    function showRoundResult(result) {
        const overlay = $('round-result-overlay');
        overlay?.classList.add('visible');
        $('screen-game')?.classList.add('showing-result');

        const resultTitle = $('result-title');
        const resultDistance = $('result-distance');
        const resultScore = $('result-score');
        const resultXP = $('result-xp');
        const resultLocationName = $('result-location-name');
        const resultStreak = $('result-streak-info');

        const dist = result.distance;
        if (dist < 50) {
            resultTitle.textContent = 'Идеально';
            resultTitle.className = 'result-title perfect';
            spawnConfetti();
        } else if (dist < 200) {
            resultTitle.textContent = 'Отлично';
            resultTitle.className = 'result-title great';
        } else if (dist < 500) {
            resultTitle.textContent = 'Хорошо';
            resultTitle.className = 'result-title good';
        } else if (dist < 1000) {
            resultTitle.textContent = 'Неплохо';
            resultTitle.className = 'result-title ok';
        } else {
            resultTitle.textContent = 'Далековато';
            resultTitle.className = 'result-title miss';
        }

        if (resultDistance) resultDistance.textContent = formatDistance(dist);
        if (resultScore) resultScore.textContent = '+' + result.score.toLocaleString('ru-RU');
        if (resultXP) resultXP.textContent = '+' + result.xp + ' XP';
        if (resultLocationName) resultLocationName.textContent = result.location.name;

        if (resultStreak) {
            if (result.streak >= 2) {
                resultStreak.hidden = false;
                resultStreak.textContent = 'Серия ' + result.streak +
                    (result.streakMultiplier > 1 ? ' · множитель ×' + result.streakMultiplier : '');
            } else {
                resultStreak.hidden = true;
            }
        }

        const nextBtn = $('btn-next-round');
        if (nextBtn) {
            nextBtn.textContent = GeoBerdsk.Game.hasMoreRounds() ? 'Далее' : 'Результаты';
        }

        updateGameHUD();
    }

    function showGameSummary(summary) {
        showScreen('summary');

        if ($('summary-mode')) $('summary-mode').textContent = summary.mode.description || summary.mode.name;
        if ($('summary-score')) $('summary-score').textContent = summary.totalScore.toLocaleString('ru-RU');
        if ($('summary-rounds')) $('summary-rounds').textContent = summary.roundCount;
        if ($('summary-xp')) $('summary-xp').textContent = '+' + summary.totalXP + ' XP';

        if (summary.avgDistance !== undefined && !isNaN(summary.avgDistance)) {
            $('summary-avg-distance').textContent = formatDistance(summary.avgDistance);
        } else if ($('summary-avg-distance')) {
            $('summary-avg-distance').textContent = '—';
        }

        if ($('summary-streak')) $('summary-streak').textContent = summary.streak || 0;

        const recordBadge = $('summary-new-record');
        if (recordBadge) recordBadge.hidden = !summary.isNewRecord;
        const perfectBadge = $('summary-perfect');
        if (perfectBadge) perfectBadge.hidden = !summary.isPerfectGame;

        const levelUpEl = $('summary-level-up');
        if (levelUpEl) {
            if (summary.xpResult && summary.xpResult.leveledUp) {
                levelUpEl.hidden = false;
                levelUpEl.textContent = 'Новый уровень — ' + summary.xpResult.newLevel.name;
            } else {
                levelUpEl.hidden = true;
            }
        }

        const breakdownEl = $('summary-xp-breakdown');
        if (breakdownEl) {
            breakdownEl.innerHTML = ((summary.bonusXP && summary.bonusXP.reasons) || []).map(r =>
                '<div class="xp-reason"><span>' + escapeHtml(r.text) +
                '</span><span class="xp-value">+' + r.xp + '</span></div>'
            ).join('');
        }

        const roundsEl = $('summary-rounds-detail');
        if (roundsEl) {
            roundsEl.innerHTML = summary.rounds.map((r, i) => {
                return '<div class="round-detail-row">' +
                    '<span class="round-num">' + (i + 1) + '</span>' +
                    '<span class="round-name">' + escapeHtml(r.location.name) + '</span>' +
                    '<span class="round-dist">' + formatDistance(r.distance) + '</span>' +
                    '<span class="round-score">+' + r.score + '</span></div>';
            }).join('');
        }

        const info = GeoBerdsk.XP.getLevelInfo(GeoBerdsk.Storage.load().player.xp);
        const summaryXPBar = $('summary-xp-bar-fill');
        if (summaryXPBar) {
            summaryXPBar.style.width = '0%';
            setTimeout(() => {
                summaryXPBar.style.width = (info.progress * 100) + '%';
            }, 400);
        }
        const summaryLevelText = $('summary-level-text');
        if (summaryLevelText) {
            summaryLevelText.textContent = info.name + ' · ур. ' + info.level;
        }
    }

    function updateStatsUI() {
        const data = GeoBerdsk.Storage.load();
        const info = GeoBerdsk.XP.getLevelInfo(data.player.xp);

        if ($('stats-games')) $('stats-games').textContent = data.player.gamesPlayed;
        if ($('stats-rounds')) $('stats-rounds').textContent = data.player.totalRounds;
        if ($('stats-perfect')) $('stats-perfect').textContent = data.player.perfectHits;
        if ($('stats-streak')) $('stats-streak').textContent = data.player.bestStreak;
        if ($('stats-xp-total')) $('stats-xp-total').textContent = data.player.xp + ' XP';
        if ($('stats-level')) $('stats-level').textContent = info.name + ' · ур. ' + info.level;

        const historyEl = $('stats-history');
        if (!historyEl) return;

        if (data.history && data.history.length > 0) {
            historyEl.innerHTML = data.history.slice(0, 20).map(g => {
                const date = new Date(g.timestamp).toLocaleDateString('ru-RU');
                const label = g.label || 'Игра';
                return '<div class="history-row">' +
                    '<span class="history-mode">' + escapeHtml(label) + '</span>' +
                    '<span>' + date + '</span>' +
                    '<span>' + Number(g.score).toLocaleString('ru-RU') + '</span>' +
                    '<span>+' + g.xpEarned + ' XP</span></div>';
            }).join('');
        } else {
            historyEl.innerHTML = '<p class="muted">Пока нет сыгранных партий</p>';
        }
    }

    function handleTimerTick(timeLeft) {
        const timerEl = $('hud-timer-value');
        if (timerEl) timerEl.textContent = Math.ceil(timeLeft);

        const timerBar = $('timer-bar-fill');
        if (timerBar) {
            const state = GeoBerdsk.Game.getState();
            const pct = state.mode.timeLimit > 0
                ? (timeLeft / state.mode.timeLimit) * 100
                : 0;
            timerBar.style.width = pct + '%';
            timerBar.classList.toggle('urgent', pct < 25);
            timerBar.classList.toggle('warn', pct >= 25 && pct < 50);
        }
    }

    function handleTimeUp() {
        if (submitting) return;
        if (!currentGuess) {
            currentGuess = {
                lat: GeoBerdsk.Map.BERDSK_CENTER[0],
                lng: GeoBerdsk.Map.BERDSK_CENTER[1],
            };
        }
        submitGuess();
    }

    function toggleMiniMap() {
        const mapArea = $('map-guess-area');
        if (!mapArea) return;
        mapArea.classList.toggle('expanded');
        updateSheetLabel();
        GeoBerdsk.Map.invalidateSize();
    }

    function updateSheetLabel() {
        const mapArea = $('map-guess-area');
        const label = mapArea?.querySelector('.sheet-handle-text');
        if (!label) return;
        const open = mapArea.classList.contains('expanded') || mapArea.classList.contains('locked');
        label.textContent = open ? 'Карта' : 'Карта · поставь метку';
    }

    function spawnConfetti() {
        const container = $('confetti-container');
        if (!container) return;
        container.innerHTML = '';
        const colors = ['#6FBF3C', '#4F9A28', '#8FD15A', '#FFFFFF', '#A8E063'];
        for (let i = 0; i < 48; i++) {
            const piece = document.createElement('div');
            piece.className = 'confetti-piece';
            piece.style.left = Math.random() * 100 + '%';
            piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            piece.style.animationDelay = Math.random() * 0.4 + 's';
            piece.style.animationDuration = (1.2 + Math.random() * 1.6) + 's';
            const size = 5 + Math.random() * 7;
            piece.style.width = size + 'px';
            piece.style.height = size * (0.4 + Math.random() * 0.6) + 'px';
            container.appendChild(piece);
        }
        setTimeout(() => { container.innerHTML = ''; }, 2800);
    }

    function formatDistance(meters) {
        if (meters < 1000) return Math.round(meters) + ' м';
        return (meters / 1000).toFixed(1) + ' км';
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
    GeoBerdsk.App.init();
});
