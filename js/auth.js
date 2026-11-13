/* ============================================================
   AUTH MODULE — Login, Logout, Player Management
   ============================================================ */
const Auth = (() => {
    const CURRENT_USER_KEY = 'ccc_current_user';
    const PLAYERS_KEY = 'ccc_players';
    const ADMIN_PASSCODE = 'CCC2025';
    const ADMIN_PENDING_KEY = 'ccc_admin_pending';

    /** Canonical 10-digit phone normalization */
    function normalizePhone(mobile) {
        if (!mobile) return '';
        const digits = String(mobile).replace(/\D/g, '');
        if (digits.length >= 10) {
            return digits.slice(-10);
        }
        return digits;
    }

    /** Deterministic player ID from phone number */
    function getPlayerIdForPhone(mobile) {
        const clean = normalizePhone(mobile);
        return clean ? `p_${clean}` : `player_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    }

    /** Safe JSON parse helper to guard against storage corruption */
    function safeJsonParse(str, fallback) {
        try {
            return str ? JSON.parse(str) : fallback;
        } catch (e) {
            console.warn('LocalStorage parse error, falling back:', e);
            return fallback;
        }
    }

    /** Safe sessionStorage helpers to protect against privacy mode blocks */
    function safeSessionGet(key) {
        try {
            return (typeof sessionStorage !== 'undefined') ? sessionStorage.getItem(key) : null;
        } catch (e) {
            return null;
        }
    }

    function safeSessionSet(key, val) {
        try {
            if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(key, val);
        } catch (e) {}
    }

    function safeSessionRemove(key) {
        try {
            if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(key);
        } catch (e) {}
    }

    // In-memory cache & fast lookup maps to prevent expensive repeated JSON parsing
    let _playersCache = null;
    let _playersIdMap = new Map();
    let _playersPhoneMap = new Map();

    function _rebuildPlayerIndex(players) {
        _playersCache = Array.isArray(players) ? players : [];
        _playersIdMap.clear();
        _playersPhoneMap.clear();
        for (const p of _playersCache) {
            if (!p) continue;
            if (p.id) _playersIdMap.set(p.id, p);
            const normPhone = normalizePhone(p.mobile);
            if (normPhone) {
                _playersPhoneMap.set(normPhone, p);
                if (!_playersIdMap.has(`p_${normPhone}`)) {
                    _playersIdMap.set(`p_${normPhone}`, p);
                }
            }
        }
    }

    /** Invalidate in-memory cache when external storage changes */
    function invalidatePlayerCache() {
        _playersCache = null;
        _playersIdMap.clear();
        _playersPhoneMap.clear();
        if (typeof window !== 'undefined' && window.Badges && Badges.invalidateCache) {
            Badges.invalidateCache();
        }
    }

    /** Get all registered players (cached in-memory) */
    function getPlayers() {
        if (_playersCache !== null) {
            return _playersCache;
        }
        const players = safeJsonParse(localStorage.getItem(PLAYERS_KEY), []);
        _rebuildPlayerIndex(players);
        return _playersCache;
    }

    /** Save players array and sync in-memory cache */
    function savePlayers(players) {
        _rebuildPlayerIndex(players);
        localStorage.setItem(PLAYERS_KEY, JSON.stringify(_playersCache));
        if (typeof window !== 'undefined' && window.Badges && Badges.invalidateCache) {
            Badges.invalidateCache();
        }
    }

    /** Get currently logged-in user (or null) */
    function getCurrentUser() {
        return safeJsonParse(localStorage.getItem(CURRENT_USER_KEY), null);
    }

    /** Log in with name + mobile. Uses phone as identifying factor without creating duplicates. */
    function login(name, mobile) {
        const cleanName = (name || '').trim();
        const cleanMobile = normalizePhone(mobile);
        const players = getPlayers();
        
        // Find existing by normalized mobile (primary) or deterministic ID
        const targetId = getPlayerIdForPhone(cleanMobile);
        let player = players.find(p => {
            const pPhone = normalizePhone(p.mobile);
            return (cleanMobile && pPhone === cleanMobile) || p.id === targetId;
        });

        const isPendingAdmin = safeSessionGet(ADMIN_PENDING_KEY) === 'true';

        if (player) {
            // Returning player — update name to full name if provided, ensure canonical ID and phone
            if (cleanName && cleanName.length >= (player.name || '').length) {
                player.name = cleanName;
            }
            player.mobile = cleanMobile;
            if (cleanMobile && targetId && player.id !== targetId) {
                player.id = targetId;
            }
            if (isPendingAdmin) player.isAdmin = true;
            savePlayers(players);
        } else {
            // New player — auto-register with deterministic ID
            player = {
                id: targetId,
                name: cleanName,
                mobile: cleanMobile,
                isAdmin: isPendingAdmin,
                joinedAt: new Date().toISOString()
            };
            players.push(player);
            savePlayers(players);
        }

        // Clear pending admin flag
        safeSessionRemove(ADMIN_PENDING_KEY);

        // Save current session
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(player));

        // Sync player to cloud
        if (typeof window !== 'undefined' && window.DB && DB.isLive()) {
            DB.savePlayer(player).catch(err => console.warn('Could not sync player to cloud:', err));
        }

        // Run deduplication to clean up any past duplicate entries
        deduplicatePlayersAndMatches();

        return player;
    }

    /** Log out current user */
    function logout() {
        localStorage.removeItem(CURRENT_USER_KEY);
        safeSessionRemove(ADMIN_PENDING_KEY);
    }

    /** Check if current user is admin */
    function isAdmin() {
        const user = getCurrentUser();
        return user ? user.isAdmin === true : false;
    }

    /** Verify admin passcode */
    function verifyAdminPasscode(code) {
        return code === ADMIN_PASSCODE;
    }

    /** Set the pending admin flag (used before login) */
    function setPendingAdmin() {
        safeSessionSet(ADMIN_PENDING_KEY, 'true');
    }

    /** Grant admin to currently logged-in user */
    function grantAdmin() {
        const user = getCurrentUser();
        if (!user) return;

        user.isAdmin = true;
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));

        const players = getPlayers();
        const idx = players.findIndex(p => p.id === user.id);
        if (idx !== -1) {
            players[idx].isAdmin = true;
            savePlayers(players);
        }

        if (typeof window !== 'undefined' && window.DB && DB.isLive()) {
            DB.savePlayer(user).catch(err => console.warn('Could not sync admin status:', err));
        }
    }

    // Track in-flight on-demand player fetches from Supabase
    const _pendingPlayerFetches = new Set();

    /** Look up a player by ID (O(1) in-memory lookup with phone match fallback) */
    function getPlayerById(id) {
        if (!id) return null;
        if (_playersCache === null) {
            getPlayers();
        }
        const byId = _playersIdMap.get(id);
        if (byId) return byId;

        // Fallback: check current logged-in user session
        const curUser = getCurrentUser();
        if (curUser && (curUser.id === id || (curUser.mobile && `p_${normalizePhone(curUser.mobile)}` === id))) {
            return curUser;
        }

        // Fallback: if id is 'p_<phone>' or raw phone
        if (id.startsWith('p_')) {
            const phone = id.slice(2);
            const foundPhone = _playersPhoneMap.get(phone);
            if (foundPhone) return foundPhone;
        }
        const directPhone = normalizePhone(id);
        if (directPhone && _playersPhoneMap.has(directPhone)) {
            return _playersPhoneMap.get(directPhone);
        }

        // Self-healing fallback: on-demand fetch from Supabase if missing from cache
        if (typeof window !== 'undefined' && window.DB && DB.isLive && DB.isLive() && !_pendingPlayerFetches.has(id)) {
            _pendingPlayerFetches.add(id);
            if (typeof DB.fetchSinglePlayer === 'function') {
                DB.fetchSinglePlayer(id).then(fetched => {
                    _pendingPlayerFetches.delete(id);
                    if (fetched && window.App) {
                        const detailScreen = document.getElementById('match-detail-screen');
                        if (detailScreen && detailScreen.classList.contains('active')) {
                            const matchIdInput = document.getElementById('add-player-match-id');
                            const activeMatchId = matchIdInput ? matchIdInput.value : null;
                            if (activeMatchId && App.renderMatchDetail) {
                                App.renderMatchDetail(activeMatchId);
                            }
                        }
                        if (App.renderMatchCards) App.renderMatchCards();
                    }
                }).catch(() => _pendingPlayerFetches.delete(id));
            }
        }

        return null;
    }

    /** Find or create a player record for admin manual additions */
    function getOrCreateGuestPlayer(name, mobile) {
        const players = getPlayers();
        const trimmedName = (name || '').trim();
        const cleanMobile = normalizePhone(mobile);

        if (cleanMobile) {
            const targetId = getPlayerIdForPhone(cleanMobile);
            const existing = players.find(p => normalizePhone(p.mobile) === cleanMobile || p.id === targetId);
            if (existing) {
                if (targetId && existing.id !== targetId) {
                    existing.id = targetId;
                }
                // Update to longer/better name if provided
                if (trimmedName && trimmedName.length > (existing.name || '').length) {
                    existing.name = trimmedName;
                }
                savePlayers(players);
                if (typeof window !== 'undefined' && window.DB && DB.isLive()) {
                    DB.savePlayer(existing).catch(() => {});
                }
                return existing;
            }
        } else if (trimmedName) {
            // Find existing guest with exact same name if no mobile provided
            const existingByName = players.find(p => (p.name || '').trim().toLowerCase() === trimmedName.toLowerCase() && !p.mobile);
            if (existingByName) return existingByName;
        }

        const newPlayer = {
            id: getPlayerIdForPhone(cleanMobile),
            name: trimmedName,
            mobile: cleanMobile,
            isAdmin: false,
            isGuest: true,
            joinedAt: new Date().toISOString()
        };
        players.push(newPlayer);
        savePlayers(players);

        if (typeof window !== 'undefined' && window.DB && DB.isLive()) {
            DB.savePlayer(newPlayer).catch(err => console.warn('Could not sync guest player:', err));
        }

        return newPlayer;
    }

    /**
     * Deduplicate players and match squads:
     * Identifies duplicate player entries with the same mobile number,
     * merges them to canonical ID (p_<mobile>), and updates all match squad rosters.
     */
    function deduplicatePlayersAndMatches() {
        try {
            const players = getPlayers();
            if (!Array.isArray(players) || players.length === 0) return;

            const phoneMap = new Map(); // normalizedPhone -> canonical player
            const idRedirectMap = {};   // oldId -> canonicalId
            let playersChanged = false;

            // 1. Find all duplicates by phone number
            players.forEach(p => {
                const phone = normalizePhone(p.mobile);
                if (!phone) return;

                if (!phoneMap.has(phone)) {
                    // Normalize to deterministic ID if possible
                    const canonicalId = `p_${phone}`;
                    if (p.id !== canonicalId) {
                        idRedirectMap[p.id] = canonicalId;
                        p.id = canonicalId;
                        playersChanged = true;
                    }
                    phoneMap.set(phone, p);
                } else {
                    // Duplicate found! Merge into canonical
                    const canonical = phoneMap.get(phone);
                    idRedirectMap[p.id] = canonical.id;
                    // Prefer longer/fuller name
                    if ((p.name || '').trim().length > (canonical.name || '').trim().length) {
                        canonical.name = p.name.trim();
                    }
                    if (p.isAdmin) canonical.isAdmin = true;
                    playersChanged = true;
                }
            });

            if (playersChanged || Object.keys(idRedirectMap).length > 0) {
                // Reconstruct unique players list
                const seenIds = new Set();
                const dedupedPlayers = [];
                players.forEach(p => {
                    const phone = normalizePhone(p.mobile);
                    const target = phone ? phoneMap.get(phone) : p;
                    if (target && !seenIds.has(target.id)) {
                        seenIds.add(target.id);
                        dedupedPlayers.push(target);
                    }
                });
                savePlayers(dedupedPlayers);

                // Update current user if redirected or not yet canonical
                const curUser = getCurrentUser();
                if (curUser) {
                    const curPhone = normalizePhone(curUser.mobile);
                    if (curPhone) {
                        const targetUser = phoneMap.get(curPhone) || curUser;
                        targetUser.id = `p_${curPhone}`;
                        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(targetUser));
                        if (typeof window !== 'undefined' && window.DB && DB.isLive && DB.isLive()) {
                            DB.savePlayer(targetUser).catch(() => {});
                        }
                    } else if (idRedirectMap[curUser.id]) {
                        curUser.id = idRedirectMap[curUser.id];
                        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(curUser));
                        if (typeof window !== 'undefined' && window.DB && DB.isLive && DB.isLive()) {
                            DB.savePlayer(curUser).catch(() => {});
                        }
                    }
                }

                // Note: Never mutate or truncate match squad rosters in background deduplication.
                // Admin and players manage match rosters directly via Supabase.
            }
        } catch (err) {
            console.warn('Deduplication check error:', err);
        }
    }

    return {
        getPlayers,
        savePlayers,
        invalidatePlayerCache,
        getCurrentUser,
        isLoggedIn: () => getCurrentUser() !== null,
        login,
        logout,
        isAdmin,
        verifyAdminPasscode,
        setPendingAdmin,
        grantAdmin,
        getPlayerById,
        getOrCreateGuestPlayer,
        normalizePhone,
        getPlayerIdForPhone,
        deduplicatePlayersAndMatches
    };
})();

// Export globally to window
if (typeof window !== 'undefined') {
    window.Auth = Auth;
}
