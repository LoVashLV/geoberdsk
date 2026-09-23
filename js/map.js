/**
 * GeoBerdsk — Leaflet Map Manager
 */
window.GeoBerdsk = window.GeoBerdsk || {};

GeoBerdsk.Map = (function() {
    let map = null;
    let guessMarker = null;
    let resultGroup = null;
    let guessEnabled = false;
    let onGuessCallback = null;

    const BERDSK_CENTER = [54.758, 83.097];
    const DEFAULT_ZOOM = 13;

    const guessIcon = L.divIcon({
        className: 'custom-marker',
        html: '<div class="marker-pin guess-pin"></div>',
        iconSize: [28, 36],
        iconAnchor: [14, 36],
    });

    const actualIcon = L.divIcon({
        className: 'custom-marker',
        html: '<div class="marker-pin actual-pin"></div>',
        iconSize: [28, 36],
        iconAnchor: [14, 36],
    });

    function init(containerId) {
        if (map) {
            map.remove();
            map = null;
        }

        const el = document.getElementById(containerId);
        if (!el) return;

        map = L.map(containerId, {
            center: BERDSK_CENTER,
            zoom: DEFAULT_ZOOM,
            zoomControl: true,
            attributionControl: false,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap',
        }).addTo(map);

        map.on('click', function(e) {
            if (!guessEnabled) return;
            placeGuessMarker(e.latlng.lat, e.latlng.lng);
        });

        resultGroup = L.layerGroup().addTo(map);
    }

    function placeGuessMarker(lat, lng) {
        if (!map) return;

        if (guessMarker) {
            guessMarker.setLatLng([lat, lng]);
        } else {
            guessMarker = L.marker([lat, lng], { icon: guessIcon }).addTo(map);
        }
        if (onGuessCallback) onGuessCallback(lat, lng);
    }

    function setGuessMode(enabled, callback) {
        guessEnabled = enabled;
        onGuessCallback = callback || null;
        if (map) {
            map.getContainer().style.cursor = enabled ? 'crosshair' : '';
        }
    }

    function showResult(guessLat, guessLng, actualLat, actualLng) {
        if (!map || !resultGroup) return 0;

        resultGroup.clearLayers();

        resultGroup.addLayer(
            L.marker([actualLat, actualLng], { icon: actualIcon })
        );

        resultGroup.addLayer(
            L.polyline(
                [[guessLat, guessLng], [actualLat, actualLng]],
                {
                    color: '#E76F51',
                    weight: 3,
                    dashArray: '6, 8',
                    opacity: 0.9,
                }
            )
        );

        const bounds = L.latLngBounds(
            [guessLat, guessLng],
            [actualLat, actualLng]
        ).pad(0.35);
        map.fitBounds(bounds, { maxZoom: 16 });

        return haversineDistance(guessLat, guessLng, actualLat, actualLng);
    }

    function reset() {
        if (!map) return;

        if (guessMarker) {
            map.removeLayer(guessMarker);
            guessMarker = null;
        }
        if (resultGroup) resultGroup.clearLayers();

        map.setView(BERDSK_CENTER, DEFAULT_ZOOM);
    }

    function getGuess() {
        if (!guessMarker) return null;
        const latlng = guessMarker.getLatLng();
        return { lat: latlng.lat, lng: latlng.lng };
    }

    function invalidateSize() {
        if (map) {
            setTimeout(() => map.invalidateSize(), 120);
        }
    }

    function haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    function toRad(deg) {
        return deg * Math.PI / 180;
    }

    return {
        init,
        setGuessMode,
        showResult,
        reset,
        getGuess,
        invalidateSize,
        haversineDistance,
        BERDSK_CENTER,
    };
})();
