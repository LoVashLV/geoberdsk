/**
 * GeoBerdsk — Panorama
 * Скрываем адреса (setMarkers) и «Открыть в Яндекс.Картах» (CSS + suppressMapOpenBlock).
 * moveMode: free | look | fixed
 */
window.GeoBerdsk = window.GeoBerdsk || {};

GeoBerdsk.Panorama = (function() {
    let player = null;
    let spoilerObserver = null;
    let stylesInjected = false;
    let usedApi = false;
    let moveMode = 'free';
    let lockedDirection = null;
    let directionLockHandler = null;

    function init() {
        ensureSpoilerStyles();
    }

    function getApiKey() {
        return ((GeoBerdsk.CONFIG && GeoBerdsk.CONFIG.yandexApiKey) || '').trim();
    }

    function ensureYmaps(timeoutMs) {
        timeoutMs = timeoutMs || 15000;
        return new Promise((resolve) => {
            const start = Date.now();
            function tryReady() {
                if (typeof ymaps !== 'undefined') {
                    try {
                        ymaps.ready(function() { resolve(true); });
                        return;
                    } catch (e) {
                        resolve(false);
                        return;
                    }
                }
                if (Date.now() - start >= timeoutMs) {
                    resolve(false);
                    return;
                }
                setTimeout(tryReady, 120);
            }
            tryReady();
        });
    }

    async function load(containerId, lat, lng, options) {
        destroy();
        usedApi = false;
        moveMode = (options && options.moveMode) || 'free';

        const container = document.getElementById(containerId);
        if (!container) return false;
        container.innerHTML = '';

        const key = getApiKey();
        if (!key) {
            console.warn('GeoBerdsk: no API key');
            return false;
        }

        const ready = await ensureYmaps(15000);
        if (!ready) return false;
        if (ymaps.panorama.isSupported && !ymaps.panorama.isSupported()) return false;

        const panorama = await locateWithApi(lat, lng);
        if (!panorama) return false;

        const ok = createApiPlayer(containerId, panorama);
        if (!ok) return false;

        usedApi = true;
        installMasks(container);
        scrubSpoilers(container);
        startSpoilerWatch(container);
        applyMoveMode();
        return true;
    }

    function locateWithApi(lat, lng) {
        return new Promise((resolve) => {
            const point = [lat, lng];
            const radii = [100, 300, 600, 1200];
            let i = 0;
            function next() {
                if (i >= radii.length) {
                    resolve(null);
                    return;
                }
                const radius = radii[i++];
                const timeout = setTimeout(() => next(), 4500);
                try {
                    ymaps.panorama.locate(point, {
                        layer: 'yandex#panorama',
                        radius,
                    }).done(
                        (panoramas) => {
                            clearTimeout(timeout);
                            if (panoramas && panoramas.length) resolve(panoramas[0]);
                            else next();
                        },
                        () => {
                            clearTimeout(timeout);
                            resolve(null);
                        }
                    );
                } catch (e) {
                    clearTimeout(timeout);
                    resolve(null);
                }
            }
            next();
        });
    }

    function stripPanorama(panorama) {
        try {
            if (typeof panorama.setMarkers === 'function') {
                panorama.setMarkers([]);
            }
        } catch (e) { /* ignore */ }
        try { panorama._markers = []; } catch (e) { /* ignore */ }

        if (moveMode !== 'free') {
            try {
                if (typeof panorama.setConnectionArrows === 'function') {
                    panorama.setConnectionArrows([]);
                }
            } catch (e) { /* ignore */ }
            try { panorama._connectionArrows = []; } catch (e) { /* ignore */ }
            try { panorama._connections = []; } catch (e) { /* ignore */ }
        }

        try {
            return new Proxy(panorama, {
                get(target, prop, receiver) {
                    if (prop === 'getMarkers' || prop === 'getHotspots' || prop === 'getOrganizations') {
                        return () => [];
                    }
                    if (prop === 'getName') return () => '';
                    if (moveMode !== 'free' && (
                        prop === 'getConnectionMarkers' ||
                        prop === 'getConnections' ||
                        prop === 'getConnectionArrows'
                    )) {
                        return () => [];
                    }
                    const value = Reflect.get(target, prop, receiver);
                    return typeof value === 'function' ? value.bind(target) : value;
                },
            });
        } catch (e) {
            return panorama;
        }
    }

    function clearMarkersFromPlayer() {
        if (!player) return;
        try {
            const pan = player.getPanorama();
            if (!pan) return;
            if (typeof pan.setMarkers === 'function') pan.setMarkers([]);
            try { pan._markers = []; } catch (e) { /* ignore */ }
            if (moveMode !== 'free') {
                try {
                    if (typeof pan.setConnectionArrows === 'function') pan.setConnectionArrows([]);
                } catch (e) { /* ignore */ }
                try { pan._connectionArrows = []; } catch (e) { /* ignore */ }
            }
        } catch (e) { /* ignore */ }
    }

    function createApiPlayer(containerId, panorama) {
        try {
            const clean = stripPanorama(panorama);
            player = new ymaps.panorama.Player(containerId, clean, {
                direction: [Math.random() * 360, 0],
                span: [120, 60],
                controls: [],
                suppressMapOpenBlock: true,
                hotkeysEnabled: false,
            });

            clearMarkersFromPlayer();

            try {
                lockedDirection = player.getDirection ? player.getDirection() : null;
            } catch (e) {
                lockedDirection = null;
            }

            player.events.add('panoramachange', () => {
                clearMarkersFromPlayer();
                const el = document.getElementById(containerId);
                if (el) scrubSpoilers(el);
                if (moveMode === 'look' || moveMode === 'fixed') {
                    // при попытке смены точки — вернуть назад нельзя через API легко;
                    // стрелки уже убраны
                    clearMarkersFromPlayer();
                }
            });

            player.events.add(['markerexpand', 'markercreate'], () => {
                clearMarkersFromPlayer();
            });

            return true;
        } catch (e) {
            console.warn('GeoBerdsk: player error', e);
            player = null;
            return false;
        }
    }

    function applyMoveMode() {
        removeDirectionLock();
        const area = document.querySelector('.panorama-area');
        if (area) {
            area.classList.toggle('pano-fixed', moveMode === 'fixed');
            area.classList.toggle('pano-look', moveMode === 'look');
        }

        if (moveMode !== 'fixed' || !player) return;

        directionLockHandler = function() {
            if (!player || !lockedDirection) return;
            try {
                player.setDirection(lockedDirection);
            } catch (e) { /* ignore */ }
        };

        try {
            player.events.add('directionchange', directionLockHandler);
        } catch (e) { /* ignore */ }
    }

    function removeDirectionLock() {
        if (player && directionLockHandler) {
            try { player.events.remove('directionchange', directionLockHandler); } catch (e) { /* ignore */ }
        }
        directionLockHandler = null;
        const area = document.querySelector('.panorama-area');
        if (area) area.classList.remove('pano-fixed', 'pano-look');
    }

    function installMasks(container) {
        if (!container || container.querySelector('.pano-api-masks')) return;
        const masks = document.createElement('div');
        masks.className = 'pano-api-masks';
        masks.setAttribute('aria-hidden', 'true');
        masks.innerHTML =
            '<div class="pano-mask pano-mask-bl"></div>' +
            '<div class="pano-mask pano-mask-br"></div>' +
            '<div class="pano-mask pano-mask-tl"></div>';
        container.style.position = 'relative';
        container.appendChild(masks);
    }

    function scrubSpoilers(container) {
        if (!container) return;
        container.querySelectorAll('a[href*="yandex.ru/maps"], a[href*="maps.yandex"]').forEach(a => {
            a.remove();
        });
        container.querySelectorAll('[class*="gotoymaps"], [class*="goto-ymaps"]').forEach(el => el.remove());
        const killSel = [
            '[class*="map-open"]',
            '[class*="open-map"]',
            '[class*="gotoymaps"]',
            '[class*="goto-ymaps"]',
            '[class*="inception"]',
            '[class*="gototext"]',
            '[class*="panorama-name"]',
            '[class*="panoramaName"]',
            '[class*="copyright"]',
            '[class*="marker"]',
            '[class*="hotspot"]',
            '[class*="placemark"]',
            '[class*="organization"]',
        ].join(',');
        container.querySelectorAll(killSel).forEach(el => {
            if (el.querySelector && el.querySelector('canvas')) return;
            if (el.classList && el.classList.contains('pano-api-masks')) return;
            if (el.classList && el.classList.contains('pano-mask')) return;
            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('visibility', 'hidden', 'important');
            el.style.setProperty('pointer-events', 'none', 'important');
            el.style.setProperty('opacity', '0', 'important');
        });
    }

    function ensureSpoilerStyles() {
        if (stylesInjected) return;
        stylesInjected = true;
        const style = document.createElement('style');
        style.id = 'geoberdsk-spoiler-css';
        style.textContent = `
            .ymaps-panorama-player a[href*="yandex.ru/maps"],
            .ymaps-panorama-player a[href*="maps.yandex"],
            ymaps[class*="copyright"],
            ymaps[class*="map-open"],
            ymaps[class*="open-map"],
            ymaps[class*="gototext"],
            ymaps[class*="panorama-name"],
            ymaps[class*="control__name"],
            ymaps[class*="fullscreen"],
            ymaps[class*="marker"],
            ymaps[class*="hotspot"],
            ymaps[class*="placemark"],
            ymaps[class*="goto"],
            ymaps[class*="organization"],
            ymaps[class*="hint"],
            [class*="panorama-name"],
            [class*="panoramaName"],
            [class*="map-open"],
            [class*="open-map"],
            [class*="gotoymaps"],
            [class*="goto-ymaps"],
            [class*="inception"] {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
                width: 0 !important;
                height: 0 !important;
                overflow: hidden !important;
            }
            .pano-api-masks{position:absolute;inset:0;z-index:20;pointer-events:none}
            .pano-mask{position:absolute;background:#050805;pointer-events:auto}
            .pano-mask-bl{left:0;bottom:0;width:min(320px,70%);height:88px}
            .pano-mask-br{right:0;bottom:0;width:120px;height:56px}
            .pano-mask-tl{left:0;top:0;width:min(260px,55%);height:56px}
            .panorama-area.pano-fixed #panorama-container > *:not(.pano-api-masks){
                pointer-events:none!important;
            }
            .panorama-area.pano-look .ymaps-panorama-player [class*="connection"],
            .panorama-area.pano-look .ymaps-panorama-player [class*="arrow"]{
                display:none!important;
            }
        `;
        document.head.appendChild(style);
    }

    function startSpoilerWatch(container) {
        stopSpoilerWatch();
        const tick = () => {
            scrubSpoilers(container);
            clearMarkersFromPlayer();
        };
        tick();
        spoilerObserver = new MutationObserver(tick);
        spoilerObserver.observe(container, { childList: true, subtree: true });
        [200, 600, 1200, 2500, 5000].forEach(ms => setTimeout(tick, ms));
    }

    function stopSpoilerWatch() {
        if (spoilerObserver) {
            spoilerObserver.disconnect();
            spoilerObserver = null;
        }
    }

    function destroy() {
        removeDirectionLock();
        stopSpoilerWatch();
        if (player) {
            try { player.destroy(); } catch (e) { /* ignore */ }
            player = null;
        }
        usedApi = false;
        lockedDirection = null;
    }

    function isAvailable() { return true; }
    function hasCleanMode() { return usedApi; }

    return { init, load, destroy, isAvailable, hasCleanMode, getApiKey };
})();
