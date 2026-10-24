/* ============================================================
   SQUAD MODULE — Join, Leave, Waitlist, Lock
   ============================================================ */
const Squad = (() => {

    /** Check if player (by ID or mobile) is already present in a squad list */
    function isPlayerInList(list, playerId) {
        if (!Array.isArray(list) || !playerId) return false;
        if (list.includes(playerId)) return true;

        const candidate = (typeof Auth !== 'undefined' && Auth.getPlayerById) ? Auth.getPlayerById(playerId) : null;
        let candPhone = candidate && Auth.normalizePhone ? Auth.normalizePhone(candidate.mobile) : '';
        if (!candPhone && typeof playerId === 'string' && playerId.startsWith('p_')) {
            candPhone = playerId.slice(2);
        }

        return list.some(id => {
            if (id === playerId) return true;
            if (!candPhone) return false;
            let idPhone = typeof id === 'string' && id.startsWith('p_') ? id.slice(2) : '';
            if (!idPhone && typeof Auth !== 'undefined' && Auth.getPlayerById) {
                const p = Auth.getPlayerById(id);
                idPhone = p && Auth.normalizePhone ? Auth.normalizePhone(p.mobile) : '';
            }
            return idPhone && idPhone === candPhone;
        });
    }

    /**
     * Join a match (playing or waitlist).
     * Returns { success, message, status }
     */
    function joinMatch(matchId, playerId) {
        const match = Matches.getById(matchId);
        if (!match) return { success: false, message: 'Match not found' };
        if (match.locked) return { success: false, message: 'Squad is locked by admin' };

        // Already in? (Guards against duplicate IDs and duplicate phone numbers)
        if (isPlayerInList(match.playing, playerId)) {
            return { success: false, message: 'You\'re already in the playing squad' };
        }
        if (isPlayerInList(match.waiting, playerId)) {
            return { success: false, message: 'You\'re already on the waiting list' };
        }

        if (match.playing.length < match.maxPlayers) {
            // Spot available — add to playing
            match.playing.push(playerId);
            Matches.update(matchId, { playing: match.playing });
            return { success: true, message: 'You\'re in! 🏏', status: 'playing' };
        } else {
            // Full — add to waiting list
            match.waiting.push(playerId);
            Matches.update(matchId, { waiting: match.waiting });
            const pos = match.waiting.length;
            return { success: true, message: `Added to waiting list (#${pos})`, status: 'waiting' };
        }
    }

    /**
     * Leave a match (playing or waitlist).
     * Auto-promotes the first waitlisted player if a playing spot opens.
     * Returns { success, message, promoted }
     */
    function leaveMatch(matchId, playerId) {
        const match = Matches.getById(matchId);
        if (!match) return { success: false, message: 'Match not found' };
        if (match.locked) return { success: false, message: 'Squad is locked — contact admin' };

        const candidate = (typeof Auth !== 'undefined' && Auth.getPlayerById) ? Auth.getPlayerById(playerId) : null;
        let candPhone = candidate && Auth.normalizePhone ? Auth.normalizePhone(candidate.mobile) : '';
        if (!candPhone && typeof playerId === 'string' && playerId.startsWith('p_')) {
            candPhone = playerId.slice(2);
        }

        const matchesPlayer = (id) => {
            if (id === playerId) return true;
            if (!candPhone) return false;
            let idPhone = typeof id === 'string' && id.startsWith('p_') ? id.slice(2) : '';
            if (!idPhone && typeof Auth !== 'undefined' && Auth.getPlayerById) {
                const p = Auth.getPlayerById(id);
                idPhone = p && Auth.normalizePhone ? Auth.normalizePhone(p.mobile) : '';
            }
            return idPhone && idPhone === candPhone;
        };

        const wasPlaying = match.playing.some(matchesPlayer);
        const wasWaiting = match.waiting.some(matchesPlayer);

        if (!wasPlaying && !wasWaiting) {
            return { success: false, message: 'You are not in this match' };
        }

        // Remove from playing or waiting
        match.playing = match.playing.filter(id => !matchesPlayer(id));
        match.waiting = match.waiting.filter(id => !matchesPlayer(id));

        let promoted = null;
        const maxCap = match.maxPlayers || 22;

        // Auto-promote from waitlist if a playing slot opened and squad capacity allows
        if (wasPlaying && match.playing.length < maxCap && match.waiting.length > 0) {
            promoted = match.waiting.shift();
            match.playing.push(promoted);
        }

        Matches.update(matchId, { playing: match.playing, waiting: match.waiting });

        if (wasPlaying) {
            return { success: true, message: 'You\'ve left the squad', promoted };
        }
        return { success: true, message: 'Removed from waiting list', promoted };
    }

    /**
     * Get a player's status in a match.
     * Returns 'playing' | 'waiting:N' | 'none'
     */
    function getPlayerStatus(matchId, playerId) {
        const match = Matches.getById(matchId);
        if (!match) return 'none';

        if (isPlayerInList(match.playing, playerId)) return 'playing';

        const candidate = (typeof Auth !== 'undefined' && Auth.getPlayerById) ? Auth.getPlayerById(playerId) : null;
        let candPhone = candidate && Auth.normalizePhone ? Auth.normalizePhone(candidate.mobile) : '';
        if (!candPhone && typeof playerId === 'string' && playerId.startsWith('p_')) {
            candPhone = playerId.slice(2);
        }

        const waitIdx = match.waiting.findIndex(id => {
            if (id === playerId) return true;
            if (!candPhone) return false;
            let idPhone = typeof id === 'string' && id.startsWith('p_') ? id.slice(2) : '';
            if (!idPhone && typeof Auth !== 'undefined' && Auth.getPlayerById) {
                const p = Auth.getPlayerById(id);
                idPhone = p && Auth.normalizePhone ? Auth.normalizePhone(p.mobile) : '';
            }
            return idPhone && idPhone === candPhone;
        });

        if (waitIdx !== -1) return 'waiting:' + (waitIdx + 1);

        return 'none';
    }

    /**
     * Admin: remove a specific player from a match.
     */
    function removePlayer(matchId, playerId) {
        // Temporarily unlock to allow removal, then re-lock if needed
        const match = Matches.getById(matchId);
        if (!match) return { success: false, message: 'Match not found' };

        const wasLocked = match.locked;
        if (wasLocked) Matches.update(matchId, { locked: false });

        const result = leaveMatch(matchId, playerId);

        if (wasLocked) Matches.update(matchId, { locked: true });

        return result;
    }

    /**
     * Admin: manually add a player to Playing squad or Waiting list.
     * @param {string} matchId
     * @param {Object} options - { name, mobile, target: 'playing' | 'waiting' }
     */
    function adminAddPlayer(matchId, { name, mobile, target = 'playing' }) {
        const match = Matches.getById(matchId);
        if (!match) return { success: false, message: 'Match not found' };

        const player = Auth.getOrCreateGuestPlayer(name, mobile);
        const playerId = player.id;

        if (isPlayerInList(match.playing, playerId)) {
            return { success: false, message: `${player.name} is already in the playing squad` };
        }
        if (isPlayerInList(match.waiting, playerId)) {
            return { success: false, message: `${player.name} is already on the waiting list` };
        }

        if (target === 'waiting') {
            match.waiting.push(playerId);
            Matches.update(matchId, { waiting: match.waiting });
            return { success: true, message: `Added ${player.name} to waiting list (#${match.waiting.length})`, player };
        } else {
            match.playing.push(playerId);
            Matches.update(matchId, { playing: match.playing });
            return { success: true, message: `Added ${player.name} to playing squad! 🏏`, player };
        }
    }

    /**
     * Toggle lock/unlock on a match squad.
     */
    function toggleLock(matchId) {
        const match = Matches.getById(matchId);
        if (!match) return null;
        return Matches.update(matchId, { locked: !match.locked });
    }

    /**
     * Reorder a player's position within Playing squad or Waiting list.
     */
    function reorderPlayer(matchId, listType, index, direction) {
        const match = Matches.getById(matchId);
        if (!match) return { success: false, message: 'Match not found' };

        const list = listType === 'playing' ? [...match.playing] : [...match.waiting];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;

        if (targetIndex < 0 || targetIndex >= list.length) {
            return { success: false, message: 'Cannot move further in that direction' };
        }

        const temp = list[index];
        list[index] = list[targetIndex];
        list[targetIndex] = temp;

        const updates = listType === 'playing' ? { playing: list } : { waiting: list };
        Matches.update(matchId, updates);

        const player = typeof Auth !== 'undefined' ? Auth.getPlayerById(temp) : null;
        const name = player ? player.name : 'Player';
        return { success: true, message: `Moved ${name} ${direction}!`, match: Matches.getById(matchId) };
    }

    /**
     * Move a player between Playing Squad and Waiting List.
     */
    function transferPlayerList(matchId, playerId, targetList) {
        const match = Matches.getById(matchId);
        if (!match) return { success: false, message: 'Match not found' };

        const candidate = Auth.getPlayerById(playerId);
        const candPhone = candidate && Auth.normalizePhone ? Auth.normalizePhone(candidate.mobile) : '';

        const matchesPlayer = (id) => {
            if (id === playerId) return true;
            if (!candPhone) return false;
            const p = Auth.getPlayerById(id);
            return p && Auth.normalizePhone && Auth.normalizePhone(p.mobile) === candPhone;
        };

        let playing = (match.playing || []).filter(id => !matchesPlayer(id));
        let waiting = (match.waiting || []).filter(id => !matchesPlayer(id));

        const player = typeof Auth !== 'undefined' ? Auth.getPlayerById(playerId) : null;
        const name = player ? player.name : 'Player';

        if (targetList === 'playing') {
            playing.push(playerId);
            Matches.update(matchId, { playing, waiting });
            return { success: true, message: `Moved ${name} to Playing Squad! 🏏`, match: Matches.getById(matchId) };
        } else {
            waiting.push(playerId);
            Matches.update(matchId, { playing, waiting });
            return { success: true, message: `Moved ${name} to Waiting List! ⏳`, match: Matches.getById(matchId) };
        }
    }

    return {
        joinMatch,
        leaveMatch,
        getPlayerStatus,
        removePlayer,
        toggleLock,
        adminAddPlayer,
        reorderPlayer,
        transferPlayerList
    };
})();

// Export globally to window
if (typeof window !== 'undefined') {
    window.Squad = Squad;
}
