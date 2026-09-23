/**
 * GeoBerdsk — Panorama Manager
 *
 * Улицы скрываются только в официальном JS API-плеере:
 * controls: [] (без panoramaName), getName→'', getMarkers→[].
 * Iframe всегда спойлерит адреса — при наличии ключа iframe НЕ используем.
 */
window.GeoBerdsk = window.GeoBerdsk || {};

GeoBerdsk.Panorama = (function() {
    let player = null;
    let spoilerObserver = null;
    let stylesInjected = false;
    let usedApi = false;

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

    async function load(containerId, lat, lng) {
        destroy();
        usedApi = false;

        const container = document.getElementById(containerId);
        if (!container) return false;
        container.innerHTML = '';

        const key = getApiKey();
        if (!key) {
            console.warn('GeoBerdsk: no API key');
            return loadIframe(container, lat, lng);
        }

        const ready = await ensureYmaps(15000);
        if (!ready) {
            console.warn('GeoBerdsk: ymaps not available');
            return false;
        }

        if (ymaps.panorama.isSupported && !ymaps.panorama.isSupported()) {
            console.warn('GeoBerdsk: panorama not supported in this browser');
            return false;
        }

        const panorama = await locateWithApi(lat, lng);
        if (!panorama) return false;

        const ok = createApiPlayer(containerId, panorama);
        if (!ok) return false;

        usedApi = true;
        startSpoilerWatch(container);
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

    function stripSpoilers(panorama) {
        try {
            return new Proxy(panorama, {
                get(target, prop, receiver) {
                    if (
                        prop === 'getMarkers' ||
                        prop === 'getHotspots' ||
                        prop === 'getOrganizations'
                    ) {
                        return () => [];
                    }
                    if (prop === 'getName') {
                        return () => '';
                    }
                    const value = Reflect.get(target, prop, receiver);
                    return typeof value === 'function' ? value.bind(target) : value;
                },
            });
        } catch (e) {
            return panorama;
        }
    }

    function createApiPlayer(containerId, panorama) {
        try {
            const clean = stripSpoilers(panorama);
            player = new ymaps.panorama.Player(containerId, clean, {
                direction: [Math.random() * 360, 0],
                span: [120, 60],
                controls: [],
                suppressMapOpenBlock: true,
                hotkeysEnabled: false,
            });

            try {
                player.events.add('panoramachange', () => {
                    const el = document.getElementById(containerId);
                    if (el) startSpoilerWatch(el);
                });
            } catch (e) { /* ignore */ }

            return true;
        } catch (e) {
            console.warn('GeoBerdsk: player error', e);
            player = null;
            return false;
        }
    }

    function loadIframe(container, lat, lng) {
        return new Promise((resolve) => {
            const direction = Math.floor(Math.random() * 360);
            const point = encodeURIComponent(lng + ',' + lat);
            const ll = encodeURIComponent(lng + ',' + lat);

            const shell = document.createElement('div');
            shell.className = 'panorama-shell';

            const iframe = document.createElement('iframe');
            iframe.className = 'panorama-iframe';
            iframe.title = 'Панорама Бердска';
            iframe.setAttribute('allowfullscreen', 'true');
            iframe.src =
                'https://yandex.ru/map-widget/v1/?ll=' + ll +
                '&z=17&l=stv' +
                '&panorama%5Bpoint%5D=' + point +
                '&panorama%5Bdirection%5D=' + direction + '%2C0' +
                '&panorama%5Bspan%5D=120%2C60';

            const masks = document.createElement('div');
            masks.className = 'panorama-spoiler-masks';
            masks.setAttribute('aria-hidden', 'true');
            masks.innerHTML =
                '<div class="pano-mask pano-mask-top"></div>' +
                '<div class="pano-mask pano-mask-top-right"></div>' +
                '<div class="pano-mask pano-mask-bottom"></div>' +
                '<div class="pano-mask pano-mask-bottom-right"></div>';

            shell.appendChild(iframe);
            shell.appendChild(masks);
            container.appendChild(shell);

            let settled = false;
            const finish = (ok) => {
                if (settled) return;
                settled = true;
                resolve(ok);
            };
            iframe.onload = () => finish(true);
            iframe.onerror = () => finish(false);
            setTimeout(() => finish(true), 2500);
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
            ymaps[class*="control_name"],
            ymaps[class*="fullscreen"],
            ymaps[class*="marker"],
            ymaps[class*="hotspot"],
            ymaps[class*="placemark"],
            ymaps[class*="goto"],
            ymaps[class*="organization"],
            ymaps[class*="hint"],
            [class*="panorama-name"],
            [class*="panoramaName"],
            [class*="panorama"][class*="marker"],
            [class*="panorama"][class*="hotspot"] {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    function startSpoilerWatch(container) {
        stopSpoilerWatch();
        const kill = () => {
            if (!container) return;
            container.querySelectorAll('a[href*="yandex.ru/maps"], a[href*="maps.yandex"]').forEach(a => a.remove());
            container.querySelectorAll(
                '[class*="marker"], [class*="hotspot"], [class*="gototext"], [class*="panorama-name"], [class*="panoramaName"]'
            ).forEach(el => {
                if (el.querySelector && el.querySelector('canvas')) return;
                el.style.setProperty('display', 'none', 'important');
                el.style.setProperty('visibility', 'hidden', 'important');
                el.style.setProperty('pointer-events', 'none', 'important');
            });
        };
        kill();
        spoilerObserver = new MutationObserver(kill);
        spoilerObserver.observe(container, { childList: true, subtree: true });
        [300, 800, 1600, 3000].forEach(ms => setTimeout(kill, ms));
    }

    function stopSpoilerWatch() {
        if (spoilerObserver) {
            spoilerObserver.disconnect();
            spoilerObserver = null;
        }
    }

    function destroy() {
        stopSpoilerWatch();
        if (player) {
            try { player.destroy(); } catch (e) { /* ignore */ }
            player = null;
        }
        const container = document.getElementById('panorama-container');
        if (container) {
            const iframe = container.querySelector('iframe');
            if (iframe) iframe.src = 'about:blank';
        }
        usedApi = false;
    }

    function isAvailable() { return true; }
    function hasCleanMode() { return usedApi; }

    return { init, load, destroy, isAvailable, hasCleanMode, getApiKey };
})();
