/**
 * GeoBerdsk — local email/password accounts (browser localStorage).
 * Сессия остаётся после перезахода на этом устройстве.
 */
window.GeoBerdsk = window.GeoBerdsk || {};

GeoBerdsk.Auth = (function() {
    const ACCOUNTS_KEY = 'geoberdsk_accounts';
    const SESSION_KEY = 'geoberdsk_session';

    function loadAccounts() {
        try {
            return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '{}') || {};
        } catch (e) {
            return {};
        }
    }

    function saveAccounts(map) {
        localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(map));
    }

    function normalizeEmail(email) {
        return String(email || '').trim().toLowerCase();
    }

    function normalizeNick(nick) {
        return String(nick || '').trim().replace(/\s+/g, ' ').slice(0, 16);
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
    }

    async function hashPassword(password, salt) {
        const data = new TextEncoder().encode(salt + '::' + password);
        const buf = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function randomSalt() {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function getSession() {
        try {
            return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
        } catch (e) {
            return null;
        }
    }

    function setSession(session) {
        if (!session) localStorage.removeItem(SESSION_KEY);
        else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }

    function isLoggedIn() {
        const s = getSession();
        if (!s || !s.email) return false;
        const accounts = loadAccounts();
        return !!accounts[s.email];
    }

    function currentUser() {
        if (!isLoggedIn()) return null;
        const s = getSession();
        const acc = loadAccounts()[s.email];
        return acc ? { email: acc.email, nick: acc.nick } : null;
    }

    async function register({ email, password, nick }) {
        const em = normalizeEmail(email);
        const n = normalizeNick(nick) || em.split('@')[0].slice(0, 16);
        if (!isValidEmail(em)) return { ok: false, error: 'Некорректная почта' };
        if (!password || String(password).length < 4) {
            return { ok: false, error: 'Пароль минимум 4 символа' };
        }
        if (n.length < 2) return { ok: false, error: 'Ник минимум 2 символа' };

        const accounts = loadAccounts();
        if (accounts[em]) return { ok: false, error: 'Такой аккаунт уже есть' };

        const salt = randomSalt();
        const passwordHash = await hashPassword(String(password), salt);
        accounts[em] = {
            email: em,
            nick: n,
            salt,
            passwordHash,
            createdAt: Date.now(),
        };
        saveAccounts(accounts);
        setSession({ email: em, at: Date.now() });
        syncPlayerNick(n);
        return { ok: true, user: { email: em, nick: n } };
    }

    async function login({ email, password }) {
        const em = normalizeEmail(email);
        const accounts = loadAccounts();
        const acc = accounts[em];
        if (!acc) return { ok: false, error: 'Аккаунт не найден' };
        const hash = await hashPassword(String(password || ''), acc.salt);
        if (hash !== acc.passwordHash) return { ok: false, error: 'Неверный пароль' };
        setSession({ email: em, at: Date.now() });
        syncPlayerNick(acc.nick);
        return { ok: true, user: { email: em, nick: acc.nick } };
    }

    function logout() {
        setSession(null);
    }

    function syncPlayerNick(nick) {
        try {
            GeoBerdsk.Storage.update(data => {
                data.player.nickname = normalizeNick(nick);
                data.player.registered = true;
                return data;
            });
        } catch (e) { /* ignore */ }
    }

    return {
        register, login, logout, isLoggedIn, currentUser,
        isValidEmail, normalizeEmail, normalizeNick,
    };
})();
