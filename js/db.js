/* ============================================================
   CLOUD DATABASE ADAPTER — Supabase Realtime & PostgreSQL
   ============================================================
   Provides real-time cloud synchronization across all players'
   phones with automatic local storage fallback.
   ============================================================ */
const DB = (() => {
    let client = null;
    let isInitialized = false;
    let realtimeChannel = null;

    /** Initialize Supabase if configured */
    async function init() {
        if (typeof window.isSupabaseConfigured === 'function' && window.isSupabaseConfigured()) {
            try {
                if (typeof window.supabase === 'undefined') {
                    console.warn('Supabase SDK script not loaded yet.');
                    return;
                }

                client = window.supabase.createClient(
                    window.supabaseConfig.url,
                    window.supabaseConfig.anonKey
                );

                isInitialized = true;
                console.log('⚡ Supabase Client Connected & Synchronized');

                // Initial fetch & sync
                await fetchAndSyncMatches();
                await fetchAndSyncPlayers();

                // Setup realtime channel subscriptions
                setupRealtime();
            } catch (err) {
                console.error('Supabase initialization error, using local fallback:', err);
                isInitialized = false;
            }
        } else {
            console.log('ℹ️ Supabase not configured yet. Running in offline LocalStorage mode.');
        }
    }

    /** Setup Supabase Realtime Channel */
    function setupRealtime() {
        if (!isLive()) return;

        try {
            realtimeChannel = client
                .channel('ccc-realtime-channel')
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'matches' },
                    () => {
                        fetchAndSyncMatches();
                    }
                )
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'players' },
                    () => {
                        fetchAndSyncPlayers();
                    }
                )
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log('🟢 Realtime Live Subscribed: Matches & Players sync active');
                    }
                });
        } catch (e) {
            console.warn('Could not bind Supabase realtime channel:', e);
        }
    }

    /** Check if live cloud sync is active */
    function isLive() {
        return isInitialized && client !== null;
    }

    let hasFormatColumn = null; // null = auto-detect, true = SQL column exists, false = fallback into turf
    let hasDraftColumn = null;  // null = auto-detect, true = SQL column exists, false = column missing in Supabase

    /* ----------------------------------------------------------
       HELPERS: MAP BETWEEN JS CAMELCASE & SQL SNAKE_CASE
    ---------------------------------------------------------- */
    function matchToDb(m) {
        const obj = {
            id: m.id,
            date: m.date,
            start_time: m.startTime || m.time || '',
            end_time: m.endTime || '',
            turf: m.turf,
            max_players: parseInt(m.maxPlayers, 10) || 22,
            playing: Array.isArray(m.playing) ? m.playing : [],
            waiting: Array.isArray(m.waiting) ? m.waiting : [],
            locked: Boolean(m.locked),
            created_at: m.createdAt || new Date().toISOString()
        };
        if (hasFormatColumn !== false) {
            obj.format = m.format || 'Turf Match';
        }
        if (hasDraftColumn !== false && typeof m.draft !== 'undefined') {
            obj.draft = m.draft;
        }
        return obj;
    }

    function dbToMatch(r) {
        let turf = r.turf || '';
        let format = r.format || '';
        if (!format && turf.includes(' • ')) {
            const parts = turf.split(' • ');
            turf = parts[0];
            format = parts.slice(1).join(' • ');
        }
        if (!format) {
            format = 'Turf Match';
        }
        const localMatch = (typeof Matches !== 'undefined' && Matches.getById) ? Matches.getById(r.id) : null;
        let resolvedDraft = null;
        if (r && 'draft' in r) {
            resolvedDraft = r.draft;
        } else if (localMatch && localMatch.draft) {
            resolvedDraft = localMatch.draft;
        }

        return {
            id: r.id,
            date: r.date,
            startTime: r.start_time || '',
            endTime: r.end_time || '',
            time: r.start_time || '',
            turf: turf,
            format: format,
            maxPlayers: parseInt(r.max_players, 10) || 22,
            playing: Array.isArray(r.playing) ? r.playing : [],
            waiting: Array.isArray(r.waiting) ? r.waiting : [],
            locked: Boolean(r.locked),
            draft: resolvedDraft,
            createdAt: r.created_at
        };
    }

    function playerToDb(p) {
        return {
            id: p.id,
            name: p.name,
            mobile: p.mobile || '',
            is_admin: Boolean(p.isAdmin),
            is_guest: Boolean(p.isGuest),
            joined_at: p.joinedAt || new Date().toISOString()
        };
    }

    function dbToPlayer(r) {
        return {
            id: r.id,
            name: r.name,
            mobile: r.mobile || '',
            isAdmin: Boolean(r.is_admin),
            isGuest: Boolean(r.is_guest),
            joinedAt: r.joined_at
        };
    }

    /* ----------------------------------------------------------
       FETCH & SYNC CACHE
    ---------------------------------------------------------- */
    async function fetchAndSyncMatches() {
        if (!isLive()) return;
        try {
            const { data, error } = await client
                .from('matches')
                .select('*');

            if (error) throw error;

            if (Array.isArray(data)) {
                if (data.length > 0) {
                    hasDraftColumn = ('draft' in data[0]);
                    hasFormatColumn = ('format' in data[0]);
                }
                const matches = data.map(dbToMatch);
                localStorage.setItem('ccc_matches', JSON.stringify(matches));

                // Trigger UI refresh
                if (window.App) {
                    if (App.renderTicker) App.renderTicker();
                    if (App.renderMatchCards) App.renderMatchCards();
                    if (App.renderDateStrip) App.renderDateStrip();
                    if (App.checkAndNotifyPersonalPromotion) App.checkAndNotifyPersonalPromotion();

                    const detailScreen = document.getElementById('match-detail-screen');
                    if (detailScreen && detailScreen.classList.contains('active')) {
                        const matchIdInput = document.getElementById('add-player-match-id');
                        const activeMatchId = matchIdInput ? matchIdInput.value : null;
                        if (activeMatchId && matches.find(m => m.id === activeMatchId)) {
                            App.showMatchDetail(activeMatchId);
                        } else if (activeMatchId) {
                            App.showToast('This match has been removed.');
                            App.showScreen('home');
                        }
                    }

                    // Auto-sync War Room / Draft Screen for captains in real-time
                    const draftScreen = document.getElementById('draft-screen');
                    if (draftScreen && draftScreen.classList.contains('active')) {
                        const activeDraftMatchId = (window.Draft && Draft.getCurrentMatchId) ? Draft.getCurrentMatchId() : null;
                        if (activeDraftMatchId) {
                            Draft.renderDraftScreen(activeDraftMatchId);
                        }
                    }
                }
                if (window.Admin && Admin.renderAdminPanel) {
                    Admin.renderAdminPanel();
                }
            }
        } catch (err) {
            console.warn('Error syncing matches from Supabase:', err);
        }
    }

    async function fetchAndSyncPlayers() {
        if (!isLive()) return;
        try {
            const { data, error } = await client
                .from('players')
                .select('*');

            if (error) throw error;

            if (Array.isArray(data)) {
                const players = data.map(dbToPlayer);
                localStorage.setItem('ccc_players', JSON.stringify(players));
                if (typeof Auth !== 'undefined' && Auth.deduplicatePlayersAndMatches) {
                    Auth.deduplicatePlayersAndMatches();
                }
            }
        } catch (err) {
            console.warn('Error syncing players from Supabase:', err);
        }
    }

    /* ----------------------------------------------------------
       MATCHES CRUD
    ---------------------------------------------------------- */

    /** Save / Upsert match to Supabase */
    async function saveMatch(match) {
        if (!isLive()) return match;
        try {
            const payload = matchToDb(match);
            if (hasFormatColumn === false) {
                delete payload.format;
                if (match.format && !payload.turf.includes(' • ')) {
                    payload.turf = `${match.turf} • ${match.format}`;
                }
            }
            if (hasDraftColumn === false) {
                delete payload.draft;
            }
            let { error } = await client.from('matches').upsert(payload);
            if (error && (error.code === 'PGRST204' || (error.message && error.message.toLowerCase().includes('format')))) {
                // 'format' column not yet in Supabase table schema
                console.warn('Supabase matches table format column not found, using backward compatible turf embedding.');
                hasFormatColumn = false;
                delete payload.format;
                if (match.format && !payload.turf.includes(' • ')) {
                    payload.turf = `${match.turf} • ${match.format}`;
                }
                const retry = await client.from('matches').upsert(payload);
                if (retry.error) throw retry.error;
            } else if (error && (error.code === 'PGRST204' || (error.message && error.message.toLowerCase().includes('draft')))) {
                hasDraftColumn = false;
                delete payload.draft;
                const retry = await client.from('matches').upsert(payload);
                if (retry.error) throw retry.error;
            } else if (!error) {
                if (hasFormatColumn === null) hasFormatColumn = true;
                if (hasDraftColumn === null && payload.draft !== undefined) hasDraftColumn = true;
            }
            return match;
        } catch (err) {
            console.error('Error saving match to Supabase:', err);
            throw err;
        }
    }

    /** Delete match from Supabase */
    async function deleteMatch(matchId) {
        if (!isLive()) return true;
        try {
            const { error } = await client.from('matches').delete().eq('id', matchId);
            if (error) throw error;
            return true;
        } catch (err) {
            console.error('Error deleting match from Supabase:', err);
            throw err;
        }
    }

    /** Save / Upsert player to Supabase */
    async function savePlayer(player) {
        if (!isLive()) return player;
        try {
            const payload = playerToDb(player);
            const { error } = await client.from('players').upsert(payload);
            if (error) throw error;
            return player;
        } catch (err) {
            console.error('Error saving player to Supabase:', err);
            throw err;
        }
    }

    /* ----------------------------------------------------------
       SQUAD ACTIONS (JOIN, LEAVE, PROMOTE, REMOVE, LOCK)
    ---------------------------------------------------------- */

    /** Check if player (by ID or mobile) is already present in a squad list */
    function isPlayerInList(list, playerId) {
        if (!Array.isArray(list) || !playerId) return false;
        if (list.includes(playerId)) return true;

        const candidate = (typeof Auth !== 'undefined' && Auth.getPlayerById) ? Auth.getPlayerById(playerId) : null;
        const candPhone = candidate && Auth.normalizePhone ? Auth.normalizePhone(candidate.mobile) : '';
        if (!candPhone) return false;

        return list.some(id => {
            if (id === playerId) return true;
            const p = (typeof Auth !== 'undefined' && Auth.getPlayerById) ? Auth.getPlayerById(id) : null;
            return p && Auth.normalizePhone && Auth.normalizePhone(p.mobile) === candPhone;
        });
    }

    /** Join a match */
    async function joinMatch(matchId, playerId) {
        if (!isLive()) {
            return Squad.joinMatch(matchId, playerId);
        }

        try {
            const { data: row, error } = await client
                .from('matches')
                .select('*')
                .eq('id', matchId)
                .single();

            if (error || !row) {
                return Squad.joinMatch(matchId, playerId);
            }

            const match = dbToMatch(row);
            if (match.locked) {
                return { success: false, message: 'Squad is locked by admin' };
            }

            const playing = match.playing || [];
            const waiting = match.waiting || [];
            const maxPlayers = match.maxPlayers || 22;

            if (isPlayerInList(playing, playerId)) {
                return { success: false, message: "You're already in the playing squad" };
            }
            if (isPlayerInList(waiting, playerId)) {
                return { success: false, message: "You're already on the waiting list" };
            }

            let resultStatus = 'playing';
            let resultMessage = "You're in! 🏏";

            if (playing.length < maxPlayers) {
                playing.push(playerId);
            } else {
                waiting.push(playerId);
                resultStatus = 'waiting';
                resultMessage = `Added to waiting list (#${waiting.length})`;
            }

            const { error: updateErr } = await client
                .from('matches')
                .update({ playing, waiting })
                .eq('id', matchId);

            if (updateErr) throw updateErr;

            // Sync locally immediately
            match.playing = playing;
            match.waiting = waiting;
            Matches.update(matchId, { playing, waiting });

            return { success: true, message: resultMessage, status: resultStatus };
        } catch (err) {
            console.error('Supabase joinMatch error:', err);
            return Squad.joinMatch(matchId, playerId);
        }
    }

    /** Leave a match */
    async function leaveMatch(matchId, playerId) {
        if (!isLive()) {
            return Squad.leaveMatch(matchId, playerId);
        }

        try {
            const { data: row, error } = await client
                .from('matches')
                .select('*')
                .eq('id', matchId)
                .single();

            if (error || !row) {
                return Squad.leaveMatch(matchId, playerId);
            }

            const match = dbToMatch(row);
            if (match.locked) {
                return { success: false, message: 'Squad is locked — contact admin' };
            }

            let playing = match.playing || [];
            let waiting = match.waiting || [];
            const maxPlayers = match.maxPlayers || 22;

            const candidate = Auth.getPlayerById(playerId);
            const candPhone = candidate && Auth.normalizePhone ? Auth.normalizePhone(candidate.mobile) : '';

            const matchesPlayer = (id) => {
                if (id === playerId) return true;
                if (!candPhone) return false;
                const p = Auth.getPlayerById(id);
                return p && Auth.normalizePhone && Auth.normalizePhone(p.mobile) === candPhone;
            };

            const wasPlaying = playing.some(matchesPlayer);
            const wasWaiting = waiting.some(matchesPlayer);

            if (!wasPlaying && !wasWaiting) {
                return { success: false, message: 'You are not in this match' };
            }

            playing = playing.filter(id => !matchesPlayer(id));
            waiting = waiting.filter(id => !matchesPlayer(id));

            let promoted = null;
            if (wasPlaying && playing.length < maxPlayers && waiting.length > 0) {
                promoted = waiting.shift();
                playing.push(promoted);
            }

            const { error: updateErr } = await client
                .from('matches')
                .update({ playing, waiting })
                .eq('id', matchId);

            if (updateErr) throw updateErr;

            // Sync locally immediately
            Matches.update(matchId, { playing, waiting });

            return {
                success: true,
                message: wasPlaying ? "You've left the squad" : "Removed from waiting list",
                promoted
            };
        } catch (err) {
            console.error('Supabase leaveMatch error:', err);
            return Squad.leaveMatch(matchId, playerId);
        }
    }

    /** Admin: manually add player */
    async function adminAddPlayer(matchId, { name, mobile, target = 'playing' }) {
        const player = Auth.getOrCreateGuestPlayer(name, mobile);
        const playerId = player.id;

        if (isLive()) {
            try {
                await savePlayer(player);

                const { data: row } = await client
                    .from('matches')
                    .select('*')
                    .eq('id', matchId)
                    .single();

                if (row) {
                    const match = dbToMatch(row);
                    let playing = match.playing || [];
                    let waiting = match.waiting || [];

                    if (isPlayerInList(playing, playerId)) {
                        return { success: false, message: `${player.name} is already in the playing squad` };
                    }
                    if (isPlayerInList(waiting, playerId)) {
                        return { success: false, message: `${player.name} is already on the waiting list` };
                    }

                    if (target === 'waiting') {
                        waiting.push(playerId);
                    } else {
                        playing.push(playerId);
                    }

                    await client.from('matches').update({ playing, waiting }).eq('id', matchId);
                    Matches.update(matchId, { playing, waiting });

                    return {
                        success: true,
                        message: target === 'waiting'
                            ? `Added ${player.name} to waiting list (#${waiting.length})`
                            : `Added ${player.name} to playing squad! 🏏`,
                        player
                    };
                }
            } catch (err) {
                console.error('Supabase adminAddPlayer error:', err);
            }
        }

        return Squad.adminAddPlayer(matchId, { name, mobile, target });
    }

    /** Admin: remove player */
    async function removePlayer(matchId, playerId) {
        if (!isLive()) {
            return Squad.removePlayer(matchId, playerId);
        }

        try {
            const { data: row } = await client
                .from('matches')
                .select('*')
                .eq('id', matchId)
                .single();

            if (row) {
                const match = dbToMatch(row);
                let playing = match.playing || [];
                let waiting = match.waiting || [];
                const maxPlayers = match.maxPlayers || 22;

                const candidate = Auth.getPlayerById(playerId);
                const candPhone = candidate && Auth.normalizePhone ? Auth.normalizePhone(candidate.mobile) : '';

                const matchesPlayer = (id) => {
                    if (id === playerId) return true;
                    if (!candPhone) return false;
                    const p = Auth.getPlayerById(id);
                    return p && Auth.normalizePhone && Auth.normalizePhone(p.mobile) === candPhone;
                };

                const wasPlaying = playing.some(matchesPlayer);
                const wasWaiting = waiting.some(matchesPlayer);

                if (!wasPlaying && !wasWaiting) {
                    return { success: false, message: 'Player is not in this match' };
                }

                playing = playing.filter(id => !matchesPlayer(id));
                waiting = waiting.filter(id => !matchesPlayer(id));

                let promoted = null;
                if (wasPlaying && playing.length < maxPlayers && waiting.length > 0) {
                    promoted = waiting.shift();
                    playing.push(promoted);
                }

                await client.from('matches').update({ playing, waiting }).eq('id', matchId);
                Matches.update(matchId, { playing, waiting });

                return { success: true, message: 'Removed player', promoted };
            }
        } catch (err) {
            console.error('Supabase removePlayer error:', err);
        }

        return Squad.removePlayer(matchId, playerId);
    }

    /** Admin: toggle lock */
    async function toggleLock(matchId) {
        if (!isLive()) {
            return Squad.toggleLock(matchId);
        }

        try {
            const { data: row } = await client
                .from('matches')
                .select('*')
                .eq('id', matchId)
                .single();

            if (row) {
                const newLocked = !row.locked;
                await client.from('matches').update({ locked: newLocked }).eq('id', matchId);
                Matches.update(matchId, { locked: newLocked });
                return { ...dbToMatch(row), locked: newLocked };
            }
        } catch (err) {
            console.error('Supabase toggleLock error:', err);
        }

        return Squad.toggleLock(matchId);
    }

    /** Save draft state for a match */
    async function saveMatchDraft(matchId, draft) {
        Matches.update(matchId, { draft });

        if (isLive()) {
            try {
                // Try to update Supabase if draft column exists
                const { error } = await client.from('matches').update({ draft }).eq('id', matchId);
                if (error) {
                    console.error('Supabase saveMatchDraft error:', error);
                    if (error.code === 'PGRST204' || (error.message && error.message.toLowerCase().includes('draft'))) {
                        hasDraftColumn = false;
                        console.warn('⚠️ Supabase matches table is missing "draft" column. Captains on mobiles will not see the War Room until the column is added in Supabase SQL Editor.');
                    }
                } else {
                    hasDraftColumn = true;
                }
            } catch (e) {
                console.warn('Draft saved locally (Supabase column may be pending):', e);
            }
        }
        return draft;
    }

    function isDraftColumnMissing() {
        return isLive() && hasDraftColumn === false;
    }

    return {
        init,
        isLive,
        isDraftColumnMissing,
        saveMatch,
        deleteMatch,
        savePlayer,
        joinMatch,
        leaveMatch,
        adminAddPlayer,
        removePlayer,
        toggleLock,
        saveMatchDraft
    };
})();

// Auto-boot DB on script load
if (typeof window !== 'undefined') {
    window.DB = DB;
}
