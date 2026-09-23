/**
 * GeoBerdsk — Panorama Manager
 * Чистый режим: JS API + ключ (без адресов и ссылки на Карты).
 * Запасной: iframe с масками поверх хрома Яндекса.
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
                }
            }
        }

        return loadIframe(container, lat, lng);
    }

    function locateWithApi(lat, lng) {
        return new Promise((resolve) => {
            const point = [lat, lng];
            const radii = [80, 250, 500];
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

    /** Убираем маркеры с адресами / номерами домов */
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
                span: [110, 55],
                controls: ['zoomControl'],
                suppressMapOpenBlock: true,
                hotkeysEnabled: false,
            });
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
            // Источник без лишних слоёв карты — только панорама
            iframe.src =
                'https://yandex.ru/map-widget/v1/?ll=' + ll +
                '&z=17' +
                '&l=stv' +
                '&panorama%5Bpoint%5D=' + point +
                '&panorama%5Bdirection%5D=' + direction + '%2C0' +
                '&panorama%5Bspan%5D=120%2C60';

            // Маски закрывают хром Яндекса (ссылка, название улицы, футер)
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
            /* Скрываем спойлеры официального плеера Яндекса */
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
            [class*="panorama"][class*="hotspot"] {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
                width: 0 !important;
                height: 0 !important;
                overflow: hidden !important;
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
            container.querySelectorAll('[class*="marker"], [class*="hotspot"], [class*="gototext"], [class*="panorama-name"]').forEach(el => {
                // Не трогаем сам canvas/player root
                if (el.querySelector && el.querySelector('canvas')) return;
                el.style.setProperty('display', 'none', 'important');
                el.style.setProperty('visibility', 'hidden', 'important');
                el.style.setProperty('pointer-events', 'none', 'important');
            });
        };

        kill();
        spoilerObserver = new MutationObserver(kill);
        spoilerObserver.observe(container, { childList: true, subtree: true });
        // Яндекс дорисовывает маркеры с задержкой
        setTimeout(kill, 500);
        setTimeout(kill, 1500);
        setTimeout(kill, 3000);
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
        return !!getApiKey();
    }

    return { init, whenReady, load, destroy, isAvailable, hasCleanMode, getApiKey };
})();
