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

        const isPendingAdmin = sessionStorage.getItem(ADMIN_PENDING_KEY) === 'true';

        if (player) {
            // Returning player — update name to full name if provided, ensure canonical ID and phone
            if (cleanName && cleanName.length >= (player.name || '').length) {
                player.name = cleanName;
            }
            player.mobile = cleanMobile;
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
        sessionStorage.removeItem(ADMIN_PENDING_KEY);

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
        sessionStorage.removeItem(ADMIN_PENDING_KEY);
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
        sessionStorage.setItem(ADMIN_PENDING_KEY, 'true');
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

    /** Look up a player by ID (O(1) in-memory lookup with phone match fallback) */
    function getPlayerById(id) {
        if (!id) return null;
        if (_playersCache === null) {
            getPlayers();
        }
        const byId = _playersIdMap.get(id);
        if (byId) return byId;

        // Fallback: if id is 'p_<phone>' or raw phone
        if (id.startsWith('p_')) {
            const phone = id.slice(2);
            return _playersPhoneMap.get(phone) || null;
        }
        const directPhone = normalizePhone(id);
        if (directPhone && _playersPhoneMap.has(directPhone)) {
            return _playersPhoneMap.get(directPhone);
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
                // Update to longer/better name if provided
                if (trimmedName && trimmedName.length > (existing.name || '').length) {
                    existing.name = trimmedName;
                    savePlayers(players);
                    if (typeof window !== 'undefined' && window.DB && DB.isLive()) {
                        DB.savePlayer(existing).catch(() => {});
                    }
                }
                return existing;
            }
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

                // Update current user if redirected
                const curUser = getCurrentUser();
                if (curUser) {
                    const curPhone = normalizePhone(curUser.mobile);
                    if (curPhone && phoneMap.has(curPhone)) {
                        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(phoneMap.get(curPhone)));
                    } else if (idRedirectMap[curUser.id]) {
                        curUser.id = idRedirectMap[curUser.id];
                        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(curUser));
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
