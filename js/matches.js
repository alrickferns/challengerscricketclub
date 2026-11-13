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

    /** Cross-browser robust date parser (WebKit/Safari, Chrome, Firefox & Edge compatible) */
    function parseDateSafe(str) {
        if (!str) return null;
        if (str instanceof Date) return isNaN(str.getTime()) ? null : str;
        if (typeof str === 'number') {
            const d = new Date(str);
            return isNaN(d.getTime()) ? null : d;
        }
        if (typeof str !== 'string') return null;
        str = str.trim();
        if (!str) return null;

        // Try standard parse first
        let d = new Date(str);
        if (!isNaN(d.getTime())) return d;

        // If string is YYYY-MM-DDTHH:mm, append :00 seconds
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(str)) {
            d = new Date(str + ':00');
            if (!isNaN(d.getTime())) return d;
        }

        // Manual extraction for strict Safari/WebKit fallback
        const match = str.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
        if (match) {
            d = new Date(
                parseInt(match[1], 10),
                parseInt(match[2], 10) - 1,
                parseInt(match[3], 10),
                parseInt(match[4], 10),
                parseInt(match[5], 10),
                match[6] ? parseInt(match[6], 10) : 0
            );
            if (!isNaN(d.getTime())) return d;
        }
        return null;
    }

    /** Normalize opensAt to canonical ISO string */
    function normalizeOpensAt(val) {
        if (!val) return null;
        const d = parseDateSafe(val);
        return d ? d.toISOString() : null;
    }

    /** Format date string into local YYYY-MM-DDTHH:mm for input[type="datetime-local"] */
    function toDatetimeLocalValue(isoOrDateStr) {
        const d = parseDateSafe(isoOrDateStr);
        if (!d) return '';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${day}T${hh}:${mm}`;
    }

    /** Robust teaser check */
    function isTeaser(match) {
        if (!match || !match.opensAt) return false;
        const d = parseDateSafe(match.opensAt);
        if (!d) return false;
        return d.getTime() > Date.now();
    }

    // In-memory cache & fast lookup map
    let _matchesCache = null;
    let _matchesIdMap = new Map();

    function _rebuildMatchesIndex(matches) {
        _matchesCache = Array.isArray(matches) ? matches : [];
        _matchesIdMap.clear();
        for (const m of _matchesCache) {
            if (m && m.id) {
                _matchesIdMap.set(m.id, m);
            }
        }
    }

    /** Invalidate cache on external sync */
    function invalidateCache() {
        _matchesCache = null;
        _matchesIdMap.clear();
        if (typeof window !== 'undefined' && window.Badges && Badges.invalidateCache) {
            Badges.invalidateCache();
        }
    }

    /** Get all matches (cached in-memory) */
    function getAll() {
        if (_matchesCache !== null) {
            return _matchesCache;
        }
        const parsed = safeJsonParse(localStorage.getItem(STORAGE_KEY), []);
        _rebuildMatchesIndex(parsed);
        return _matchesCache;
    }

    /** Save matches array and sync in-memory cache */
    function save(matches) {
        _rebuildMatchesIndex(matches);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(_matchesCache));
        if (typeof window !== 'undefined' && window.Badges && Badges.invalidateCache) {
            Badges.invalidateCache();
        }
    }

    /** Get a single match by ID (O(1) in-memory lookup) */
    function getById(id) {
        if (!id) return null;
        if (_matchesCache === null) {
            getAll();
        }
        return _matchesIdMap.get(id) || null;
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
            opensAt: data.opensAt ? normalizeOpensAt(data.opensAt) : null,
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
        
        const cleanUpdates = { ...updates };
        if ('opensAt' in cleanUpdates) {
            cleanUpdates.opensAt = cleanUpdates.opensAt ? normalizeOpensAt(cleanUpdates.opensAt) : null;
        }

        matches[idx] = { ...matches[idx], ...cleanUpdates };
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

    /** Convert Date to local YYYY-MM-DD */
    function getLocalDateString(d = new Date()) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    /** Get upcoming matches (today onward), sorted by date */
    function getUpcoming() {
        const todayStr = getLocalDateString();
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
        invalidateCache,
        create,
        update,
        remove,
        getUpcoming,
        getMatchesForDate,
        getMatchDates,
        parseDateSafe,
        normalizeOpensAt,
        toDatetimeLocalValue,
        isTeaser
    };
})();

// Export globally to window
if (typeof window !== 'undefined') {
    window.Matches = Matches;
}
