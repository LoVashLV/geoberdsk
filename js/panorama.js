/**
 * GeoBerdsk — Panorama Manager
 * С ключом: JS API без panoramaName / маркеров адресов.
 * Без ключа или при ошибке: iframe + маски.
 */
window.GeoBerdsk = window.GeoBerdsk || {};

GeoBerdsk.Panorama = (function() {
    let player = null;
    let isReady = false;
    let readyCallbacks = [];
    let initFailed = false;
    let spoilerObserver = null;
    let stylesInjected = false;

    function init() {
        ensureSpoilerStyles();

        if (typeof ymaps === 'undefined') {
            initFailed = true;
            return;
        }

        ymaps.ready(function() {
            isReady = true;
            flushReady();
        });

        setTimeout(() => {
            if (!isReady) {
                initFailed = true;
                flushReady();
            }
        }, 10000);
    }

    function flushReady() {
        readyCallbacks.forEach(cb => cb());
        readyCallbacks = [];
    }

    function whenReady() {
        return new Promise((resolve) => {
            if (isReady || initFailed) resolve();
            else readyCallbacks.push(resolve);
        });
    }

    function getApiKey() {
        const fromConfig = GeoBerdsk.CONFIG && GeoBerdsk.CONFIG.yandexApiKey;
        if (fromConfig) return String(fromConfig).trim();
        try {
            const data = GeoBerdsk.Storage.load();
            return (data.settings && data.settings.yandexApiKey) || '';
        } catch (e) {
            return '';
        }
    }

    async function load(containerId, lat, lng) {
        destroy();

        const container = document.getElementById(containerId);
        if (!container) return false;
        container.innerHTML = '';

        const hasKey = !!getApiKey();

        if (hasKey) {
            await whenReady();
            if (isReady && !initFailed) {
                const panorama = await locateWithApi(lat, lng);
                if (panorama) {
                    const ok = createApiPlayer(containerId, panorama);
                    if (ok) {
                        startSpoilerWatch(container);
                        return true;
                    }
                } else {
                    console.warn('GeoBerdsk: panorama.locate empty — check API key domains / quota');
                }
            } else {
                console.warn('GeoBerdsk: ymaps not ready — falling back to iframe');
            }
        }

        return loadIframe(container, lat, lng);
    }

    function locateWithApi(lat, lng) {
        return new Promise((resolve) => {
            const point = [lat, lng];
            const radii = [80, 250, 500, 1000];
            let i = 0;

            function next() {
                if (i >= radii.length) {
                    resolve(null);
                    return;
                }
                const radius = radii[i++];
                const timeout = setTimeout(() => next(), 4000);

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
                        (err) => {
                            clearTimeout(timeout);
                            console.warn('GeoBerdsk: panorama.locate error', err);
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

    /** Скрываем имя улицы и адресные маркеры */
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
            // controls без panoramaName — иначе сверху видна улица
            player = new ymaps.panorama.Player(containerId, clean, {
                direction: [Math.random() * 360, 0],
                span: [110, 55],
                controls: ['zoomControl'],
                suppressMapOpenBlock: true,
                hotkeysEnabled: false,
            });

            // на смене точки снова глушим маркеры
            try {
                player.events.add('panoramachange', () => {
                    const el = document.getElementById(containerId);
                    if (el) startSpoilerWatch(el);
                });
            } catch (e) { /* ignore */ }

            return true;
        } catch (e) {
            console.warn('GeoBerdsk: panorama player error', e);
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
            iframe.setAttribute('loading', 'eager');
            iframe.referrerPolicy = 'no-referrer-when-downgrade';
            iframe.src =
                'https://yandex.ru/map-widget/v1/?ll=' + ll +
                '&z=17' +
                '&l=stv' +
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
            ymaps[class*="inception"],
            ymaps[class*="fullscreen"],
            ymaps[class*="marker"],
            ymaps[class*="hotspot"],
            ymaps[class*="placemark"],
            ymaps[class*="goto"],
            ymaps[class*="organization"],
            ymaps[class*="hint"],
            .ymaps-e-hotspot-layer,
            [class*="panorama"][class*="marker"],
            [class*="panorama"][class*="hotspot"],
            [class*="panorama-name"],
            [class*="panoramaName"] {
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
            container.querySelectorAll('a[href*="yandex.ru/maps"], a[href*="maps.yandex"]').forEach(a => {
                a.remove();
            });
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
        setTimeout(kill, 400);
        setTimeout(kill, 1200);
        setTimeout(kill, 2500);
        setTimeout(kill, 4500);
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
    }

    function isAvailable() {
        return true;
    }

    function hasCleanMode() {
        return !!getApiKey() && isReady && !initFailed;
    }

    return { init, whenReady, load, destroy, isAvailable, hasCleanMode, getApiKey };
})();
