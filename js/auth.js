/* ============================================================
   AUTH MODULE — Login, Logout, Player Management
   ============================================================ */
const Auth = (() => {
    const CURRENT_USER_KEY = 'ccc_current_user';
    const PLAYERS_KEY = 'ccc_players';
    const ADMIN_PASSCODE = 'CCC2025';
    const ADMIN_PENDING_KEY = 'ccc_admin_pending';

    /** Safe JSON parse helper to guard against storage corruption */
    function safeJsonParse(str, fallback) {
        try {
            return str ? JSON.parse(str) : fallback;
        } catch (e) {
            console.warn('LocalStorage parse error, falling back:', e);
            return fallback;
        }
    }

    /** Get all registered players */
    function getPlayers() {
        return safeJsonParse(localStorage.getItem(PLAYERS_KEY), []);
    }

    /** Save players array */
    function savePlayers(players) {
        localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
    }

    /** Get currently logged-in user (or null) */
    function getCurrentUser() {
        return safeJsonParse(localStorage.getItem(CURRENT_USER_KEY), null);
    }

    /** Log in with name + mobile. Auto-registers new players. */
    function login(name, mobile) {
        const cleanName = (name || '').trim();
        const cleanMobile = (mobile || '').replace(/\D/g, '');
        const players = getPlayers();
        let player = players.find(p => p.mobile === cleanMobile);
        const isPendingAdmin = sessionStorage.getItem(ADMIN_PENDING_KEY) === 'true';

        if (player) {
            // Returning player — update name if changed
            player.name = cleanName;
            if (isPendingAdmin) player.isAdmin = true;
            savePlayers(players);
        } else {
            // New player — auto-register
            player = {
                id: 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
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

    /** Look up a player by ID */
    function getPlayerById(id) {
        return getPlayers().find(p => p.id === id) || null;
    }

    /** Find or create a player record for admin manual additions */
    function getOrCreateGuestPlayer(name, mobile) {
        const players = getPlayers();
        const trimmedName = name.trim();
        const cleanMobile = (mobile || '').replace(/\D/g, '');

        if (cleanMobile) {
            const existing = players.find(p => p.mobile === cleanMobile);
            if (existing) return existing;
        }

        const newPlayer = {
            id: 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
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

    return {
        getPlayers,
        getCurrentUser,
        login,
        logout,
        isAdmin,
        verifyAdminPasscode,
        setPendingAdmin,
        grantAdmin,
        getPlayerById,
        getOrCreateGuestPlayer
    };
})();

// Export globally to window
if (typeof window !== 'undefined') {
    window.Auth = Auth;
}
