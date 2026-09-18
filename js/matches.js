/* ============================================================
   MATCHES MODULE — CRUD, Calendar, Querying
   ============================================================ */
const Matches = (() => {
    const STORAGE_KEY = 'ccc_matches';

    /** Safe JSON parse helper */
    function safeJsonParse(str, fallback) {
        try {
            return str ? JSON.parse(str) : fallback;
        } catch (e) {
            console.warn('LocalStorage matches parse error:', e);
            return fallback;
        }
    }

    /** Get all matches */
    function getAll() {
        const parsed = safeJsonParse(localStorage.getItem(STORAGE_KEY), []);
        return Array.isArray(parsed) ? parsed : [];
    }

    /** Save matches array */
    function save(matches) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(matches));
    }

    /** Get a single match by ID */
    function getById(id) {
        return getAll().find(m => m.id === id) || null;
    }

    /** Create a new match */
    function create(data) {
        const matches = getAll();
        const startTime = data.startTime || data.time || '';
        const endTime = data.endTime || '';
        const match = {
            id: 'match_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            date: data.date,
            startTime: startTime,
            endTime: endTime,
            time: startTime, // backward compatibility
            turf: (data.turf || '').trim(),
            format: (data.format || 'Turf Match').trim(),
            location: data.location || '',
            maxPlayers: parseInt(data.maxPlayers, 10) || 22,
            playing: [],
            waiting: [],
            locked: false,
            createdAt: new Date().toISOString()
        };
        matches.push(match);
        save(matches);

        // Sync to cloud if live
        if (typeof window !== 'undefined' && window.DB && DB.isLive()) {
            DB.saveMatch(match).catch(err => console.warn('Could not sync created match to cloud:', err));
        }

        return match;
    }

    /** Update a match by ID (partial update) */
    function update(id, updates) {
        const matches = getAll();
        const idx = matches.findIndex(m => m.id === id);
        if (idx === -1) return null;
        matches[idx] = { ...matches[idx], ...updates };
        save(matches);

        // Sync to cloud if live
        if (typeof window !== 'undefined' && window.DB && DB.isLive()) {
            DB.saveMatch(matches[idx]).catch(err => console.warn('Could not sync updated match to cloud:', err));
        }

        return matches[idx];
    }

    /** Delete a match by ID */
    function remove(id) {
        const matches = getAll();
        save(matches.filter(m => m.id !== id));

        // Sync to cloud if live
        if (typeof window !== 'undefined' && window.DB && DB.isLive()) {
            DB.deleteMatch(id).catch(err => console.warn('Could not delete match from cloud:', err));
        }
    }

    /** Helper to get primary sort time */
    function getMatchStartTime(m) {
        return m.startTime || m.time || '';
    }

    /** Get upcoming matches (today onward), sorted by date */
    function getUpcoming() {
        const todayStr = new Date().toISOString().split('T')[0];
        return getAll()
            .filter(m => m.date >= todayStr)
            .sort((a, b) => {
                const dateComp = a.date.localeCompare(b.date);
                if (dateComp !== 0) return dateComp;
                return getMatchStartTime(a).localeCompare(getMatchStartTime(b));
            });
    }

    /** Get matches for a specific date (YYYY-MM-DD) */
    function getMatchesForDate(dateStr) {
        return getAll()
            .filter(m => m.date === dateStr)
            .sort((a, b) => getMatchStartTime(a).localeCompare(getMatchStartTime(b)));
    }

    /** Get unique dates that have matches (for calendar highlights) */
    function getMatchDates() {
        return [...new Set(getAll().map(m => m.date))];
    }

    return {
        getAll,
        getById,
        save,
        create,
        update,
        remove,
        getUpcoming,
        getMatchesForDate,
        getMatchDates
    };
})();

// Export globally to window
if (typeof window !== 'undefined') {
    window.Matches = Matches;
}
