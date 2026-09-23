/**
 * GeoBerdsk — Main Application Controller
 */
window.GeoBerdsk = window.GeoBerdsk || {};

GeoBerdsk.App = (function() {
    const $ = id => document.getElementById(id);

    let currentGuess = null;
    let panoramaRetries = 0;
    const MAX_PANORAMA_RETRIES = 8;
    let lastModeId = 'classic';
    let submitting = false;

    function init() {
        injectYandexScript().then(() => {
            GeoBerdsk.Panorama.init();
        });
        updatePlayerUI();
        updateApiKeyUI();
        bindEvents();
        showScreen('menu');
    }

    function getStoredApiKey() {
        const fromConfig = (GeoBerdsk.CONFIG && GeoBerdsk.CONFIG.yandexApiKey) || '';
        if (fromConfig) return String(fromConfig).trim();
        const data = GeoBerdsk.Storage.load();
        return (data.settings && data.settings.yandexApiKey) || '';
    }

    function injectYandexScript() {
        return new Promise((resolve) => {
            if (typeof ymaps !== 'undefined') {
                resolve();
                return;
            }

            const key = getStoredApiKey();
            const script = document.createElement('script');
            script.src = 'https://api-maps.yandex.ru/2.1/?lang=ru_RU&load=package.full' +
                (key ? '&apikey=' + encodeURIComponent(key) : '');
            script.onload = () => resolve();
            script.onerror = () => resolve();
            document.head.appendChild(script);
        });
    }

    function updateApiKeyUI() {
        const input = $('input-api-key');
        const status = $('api-key-status');
        const key = getStoredApiKey();

        if (input && key) {
            input.value = key;
            input.placeholder = 'Ключ сохранён';
        }
        if (status) {
            status.textContent = key
                ? 'Ключ активен — адреса скрыты'
                : 'Без ключа виджет может показывать названия улиц';
            status.classList.toggle('ok', !!key);
        }
    }

    function saveApiKey() {
        const input = $('input-api-key');
        if (!input) return;
        const key = input.value.trim();

        GeoBerdsk.Storage.update(data => {
            data.settings.yandexApiKey = key;
            return data;
        });

        if (GeoBerdsk.CONFIG) GeoBerdsk.CONFIG.yandexApiKey = key;

        const status = $('api-key-status');
        if (status) {
            status.textContent = key
                ? 'Сохранено. Перезагрузка…'
                : 'Ключ удалён. Перезагрузка…';
            status.classList.add('ok');
        }

        setTimeout(() => location.reload(), 500);
    }

    function toggleKeyPanel() {
        const panel = $('api-key-panel');
        if (!panel) return;
        panel.hidden = !panel.hidden;
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

    function bindEvents() {
        document.querySelectorAll('[data-mode]').forEach(btn => {
            btn.addEventListener('click', () => startGame(btn.getAttribute('data-mode')));
        });

        $('btn-guess').addEventListener('click', submitGuess);
        $('btn-next-round').addEventListener('click', goNextRound);

        document.querySelectorAll('[data-action="menu"]').forEach(btn => {
            btn.addEventListener('click', returnToMenu);
        });

        $('btn-stats')?.addEventListener('click', () => {
            updateStatsUI();
            showScreen('stats');
        });

        $('btn-play-again')?.addEventListener('click', () => {
            startGame(GeoBerdsk.Game.getLastModeId() || lastModeId);
        });

        $('btn-toggle-map')?.addEventListener('click', toggleMiniMap);
        $('btn-toggle-key')?.addEventListener('click', toggleKeyPanel);

        $('btn-save-api-key')?.addEventListener('click', saveApiKey);
        $('input-api-key')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveApiKey();
        });

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

        $('district-choices')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-district]');
            if (btn && !btn.disabled) submitDistrictGuess(btn.getAttribute('data-district'));
        });
    }

    async function startGame(modeId) {
        lastModeId = modeId;
        panoramaRetries = 0;
        submitting = false;

        GeoBerdsk.Game.startGame(modeId, {
            onStateChange: () => {},
            onTimerTick: handleTimerTick,
            onTimeUp: handleTimeUp,
        });

        showScreen('game');

        const isDistrict = modeId === 'districts';
        $('district-choices').style.display = isDistrict ? 'flex' : 'none';
        $('map-guess-area').style.display = isDistrict ? 'none' : 'flex';
        $('map-guess-area').classList.remove('expanded', 'locked');
        updateSheetLabel();

        if (isDistrict) renderDistrictChoices();

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

        const modeId = GeoBerdsk.Game.getState().mode.id;
        if (modeId !== 'districts') {
            GeoBerdsk.Map.reset();
            GeoBerdsk.Map.setGuessMode(true, (lat, lng) => {
                currentGuess = { lat, lng };
                $('btn-guess').disabled = false;
                $('btn-guess').classList.add('ready');
            });
            $('btn-guess').disabled = true;
            $('btn-guess').classList.remove('ready');
            $('map-guess-area').classList.remove('locked');
        } else {
            enableDistrictButtons(true);
        }

        showPanoramaLoading('Загрузка панорамы…');
        updateGameHUD();
        $('round-result-overlay').classList.remove('visible');
        $('screen-game')?.classList.remove('showing-result');

        const loaded = await GeoBerdsk.Panorama.load(
            'panorama-container',
            location.lat,
            location.lng
        );

        if (!loaded) {
            panoramaRetries++;

            if (panoramaRetries <= MAX_PANORAMA_RETRIES) {
                const replaced = GeoBerdsk.Game.replaceCurrentLocation();
                if (replaced) {
                    showPanoramaLoading('Ищем другую точку…');
                    const retry = await GeoBerdsk.Panorama.load(
                        'panorama-container',
                        replaced.lat,
                        replaced.lng
                    );
                    if (retry) {
                        panoramaRetries = 0;
                        return;
                    }
                    // recursively try again without consuming a round
                    setTimeout(() => retrySameRound(), 400);
                    return;
                }
            }

            showHintFallback(location);
        } else {
            panoramaRetries = 0;
        }
    }

    async function retrySameRound() {
        const loc = GeoBerdsk.Game.getState().currentLocation;
        if (!loc) return;

        const replaced = GeoBerdsk.Game.replaceCurrentLocation();
        const target = replaced || loc;

        showPanoramaLoading('Ищем другую точку…');
        const loaded = await GeoBerdsk.Panorama.load(
            'panorama-container',
            target.lat,
            target.lng
        );

        if (loaded) {
            panoramaRetries = 0;
            return;
        }

        panoramaRetries++;
        if (panoramaRetries <= MAX_PANORAMA_RETRIES && replaced) {
            setTimeout(() => retrySameRound(), 300);
            return;
        }

        showHintFallback(target);
    }

    function showPanoramaLoading(text) {
        $('panorama-container').innerHTML =
            `<div class="panorama-loading">
                <div class="spinner"></div>
                <span>${text}</span>
            </div>`;
    }

    function showHintFallback(location) {
        const district = GeoBerdsk.getDistrict(location.district);
        const difficultyLabel = {
            easy: 'Легко',
            medium: 'Средне',
            hard: 'Сложно',
        };

        $('panorama-container').innerHTML = `
            <div class="hint-fallback">
                <div class="hint-fallback-label">Панорама недоступна</div>
                <p class="hint-fallback-lead">Угадайте по подсказке</p>
                <p class="hint-fallback-hint">${escapeHtml(location.hint)}</p>
                <p class="hint-fallback-meta">
                    ${district ? escapeHtml(district.name) : ''}
                    · ${difficultyLabel[location.difficulty] || ''}
                </p>
            </div>
        `;
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

        $('map-guess-area').classList.add('expanded', 'locked');
        GeoBerdsk.Map.invalidateSize();

        showRoundResult(result);
    }

    function submitDistrictGuess(districtId) {
        if (submitting) return;
        submitting = true;
        enableDistrictButtons(false);

        const result = GeoBerdsk.Game.submitDistrictGuess(districtId);
        showRoundResult(result);
    }

    function enableDistrictButtons(enabled) {
        document.querySelectorAll('#district-choices .district-btn').forEach(btn => {
            btn.disabled = !enabled;
        });
    }

    function goNextRound() {
        if (GeoBerdsk.Game.hasMoreRounds()) {
            loadNextRound();
        } else {
            finishGame();
        }
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

        setRecord('record-classic', data.records.classic);
        setRecord('record-timeattack', data.records.timeattack);
        setRecord('record-districts', data.records.districts);
        setRecord('record-marathon', data.records.marathon);
    }

    function setRecord(id, value) {
        const el = $(id);
        if (!el) return;
        el.textContent = value ? value.toLocaleString('ru-RU') : '—';
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
            roundEl.textContent = state.mode.rounds === Infinity
                ? 'Раунд ' + state.currentRound
                : state.currentRound + ' / ' + state.mode.rounds;
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
        overlay.classList.add('visible');
        $('screen-game')?.classList.add('showing-result');

        const isDistrict = GeoBerdsk.Game.getState().mode.id === 'districts';
        const resultTitle = $('result-title');
        const resultDistance = $('result-distance');
        const resultScore = $('result-score');
        const resultXP = $('result-xp');
        const resultLocationName = $('result-location-name');
        const resultStreak = $('result-streak-info');

        if (isDistrict) {
            const correctDistrict = GeoBerdsk.getDistrict(result.correctDistrict);
            if (result.correct) {
                resultTitle.textContent = 'Верно';
                resultTitle.className = 'result-title success';
            } else {
                resultTitle.textContent = 'Неверно';
                resultTitle.className = 'result-title fail';
            }
            resultDistance.textContent = correctDistrict ? correctDistrict.name : '';
        } else {
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
            resultDistance.textContent = formatDistance(dist);
        }

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

        if (result.marathonEnd) {
            $('btn-next-round').textContent = 'Результаты';
        } else {
            $('btn-next-round').textContent = GeoBerdsk.Game.hasMoreRounds()
                ? 'Далее'
                : 'Результаты';
        }

        updateGameHUD();
    }

    function showGameSummary(summary) {
        showScreen('summary');

        $('summary-mode').textContent = summary.mode.name;
        $('summary-score').textContent = summary.totalScore.toLocaleString('ru-RU');
        $('summary-rounds').textContent = summary.roundCount;
        $('summary-xp').textContent = '+' + summary.totalXP + ' XP';

        if (summary.avgDistance !== undefined && !isNaN(summary.avgDistance)) {
            $('summary-avg-distance').textContent = formatDistance(summary.avgDistance);
        } else {
            $('summary-avg-distance').textContent = '—';
        }

        $('summary-streak').textContent = summary.streak || 0;

        const recordBadge = $('summary-new-record');
        if (recordBadge) recordBadge.hidden = !summary.isNewRecord;

        const perfectBadge = $('summary-perfect');
        if (perfectBadge) perfectBadge.hidden = !summary.isPerfectGame;

        const levelUpEl = $('summary-level-up');
        if (levelUpEl) {
            if (summary.xpResult.leveledUp) {
                levelUpEl.hidden = false;
                levelUpEl.textContent = 'Новый уровень — ' + summary.xpResult.newLevel.name;
            } else {
                levelUpEl.hidden = true;
            }
        }

        const breakdownEl = $('summary-xp-breakdown');
        if (breakdownEl) {
            breakdownEl.innerHTML = (summary.bonusXP.reasons || []).map(r =>
                `<div class="xp-reason"><span>${escapeHtml(r.text)}</span><span class="xp-value">+${r.xp}</span></div>`
            ).join('');
        }

        const roundsEl = $('summary-rounds-detail');
        if (roundsEl) {
            roundsEl.innerHTML = summary.rounds.map((r, i) => {
                const distText = r.distance !== undefined
                    ? formatDistance(r.distance)
                    : (r.correct ? 'верно' : 'мимо');
                return `<div class="round-detail-row">
                    <span class="round-num">${i + 1}</span>
                    <span class="round-name">${escapeHtml(r.location.name)}</span>
                    <span class="round-dist">${distText}</span>
                    <span class="round-score">+${r.score}</span>
                </div>`;
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

        $('stats-games').textContent = data.player.gamesPlayed;
        $('stats-rounds').textContent = data.player.totalRounds;
        $('stats-perfect').textContent = data.player.perfectHits;
        $('stats-streak').textContent = data.player.bestStreak;
        $('stats-xp-total').textContent = data.player.xp + ' XP';
        $('stats-level').textContent = info.name + ' · ур. ' + info.level;

        const historyEl = $('stats-history');
        if (historyEl && data.history.length > 0) {
            historyEl.innerHTML = data.history.slice(0, 20).map(g => {
                const mode = GeoBerdsk.Game.MODES[g.mode];
                const date = new Date(g.timestamp).toLocaleDateString('ru-RU');
                return `<div class="history-row">
                    <span class="history-mode">${mode ? escapeHtml(mode.name) : 'Игра'}</span>
                    <span>${date}</span>
                    <span>${g.score.toLocaleString('ru-RU')}</span>
                    <span>+${g.xpEarned} XP</span>
                </div>`;
            }).join('');
        } else if (historyEl) {
            historyEl.innerHTML = '<p class="text-muted">Пока нет сыгранных партий</p>';
        }
    }

    function renderDistrictChoices() {
        const container = $('district-choices');
        if (!container) return;

        container.innerHTML = GeoBerdsk.DISTRICTS.map(d =>
            `<button class="district-btn" data-district="${d.id}" style="--district-color: ${d.color}">
                <span class="district-name">${escapeHtml(d.name)}</span>
            </button>`
        ).join('');
    }

    function handleTimerTick(timeLeft) {
        const timerEl = $('hud-timer-value');
        if (timerEl) timerEl.textContent = Math.ceil(timeLeft);

        const timerBar = $('timer-bar-fill');
        if (timerBar) {
            const state = GeoBerdsk.Game.getState();
            const pct = (timeLeft / state.mode.timeLimit) * 100;
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

        const colors = ['#F5C518', '#111111', '#E10600', '#FFD84A', '#FFFFFF', '#2A2A2A'];
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
