/* ============================================================
   BADGES & MILESTONES MODULE — Player Loyalty & Speed Badges
   ============================================================ */
const Badges = (() => {

    /** Milestone Tiers (Scaled to current club history: 1, 5, 15, 30, 50) */
    const MILESTONE_TIERS = [
        {
            threshold: 50,
            id: 'hall_of_fame',
            icon: '👑',
            title: 'Hall of Fame',
            color: '#ffd700',
            bg: 'rgba(255, 215, 0, 0.16)',
            border: 'rgba(255, 215, 0, 0.45)',
            desc: 'Half-Century Legend (50+ Matches)'
        },
        {
            threshold: 30,
            id: 'veteran',
            icon: '🎖️',
            title: 'Club Veteran',
            color: '#e74c3c',
            bg: 'rgba(231, 76, 60, 0.16)',
            border: 'rgba(231, 76, 60, 0.45)',
            desc: 'Club Pillar (30+ Matches)'
        },
        {
            threshold: 15,
            id: 'iron_man',
            icon: '🛡️',
            title: 'Iron Man',
            color: '#3498db',
            bg: 'rgba(52, 152, 219, 0.16)',
            border: 'rgba(52, 152, 219, 0.45)',
            desc: 'Stamina & Loyalty (15+ Matches)'
        },
        {
            threshold: 5,
            id: 'regular',
            icon: '⚔️',
            title: 'Club Regular',
            color: '#2ecc71',
            bg: 'rgba(46, 204, 113, 0.16)',
            border: 'rgba(46, 204, 113, 0.45)',
            desc: 'Weekend Regular (5+ Matches)'
        },
        {
            threshold: 0,
            id: 'debutant',
            icon: '🧢',
            title: 'Debutant',
            color: '#f1c40f',
            bg: 'rgba(241, 196, 15, 0.16)',
            border: 'rgba(241, 196, 15, 0.45)',
            desc: 'CCC Cap (0 - 4 Matches)'
        }
    ];

    /** Speed Badge: First player to register on a match */
    const SPEED_BADGE = {
        id: 'first_on_sheet',
        icon: '⚡',
        title: 'First on the Sheet',
        color: '#ff9f43',
        bg: 'rgba(255, 159, 67, 0.16)',
        border: 'rgba(255, 159, 67, 0.45)',
        desc: 'Lightning Fast: Grabbed Slot #1 on Playing Squad'
    };

    /** Safe HTML escape helper */
    function safeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/'/g, '&#39;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /** Local YYYY-MM-DD date string helper */
    function getTodayStr() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    // In-memory pre-aggregated badge caches to avoid O(N*M) loops & repetitive storage parsing
    let _matchCountCache = null;
    let _firstOnSheetSet = null;
    let _playerCanonicalKeyMap = null;

    /** Invalidate cache whenever matches or players change */
    function invalidateCache() {
        _matchCountCache = null;
        _firstOnSheetSet = null;
        _playerCanonicalKeyMap = null;
    }

    /** Ensure canonical player keys map is populated */
    function _ensureCanonicalIndex() {
        if (_playerCanonicalKeyMap !== null) return;
        _playerCanonicalKeyMap = new Map();

        const players = (typeof Auth !== 'undefined' && Auth.getPlayers) ? Auth.getPlayers() : [];
        for (const p of players) {
            if (!p) continue;
            const normPhone = (typeof Auth !== 'undefined' && Auth.normalizePhone) ? Auth.normalizePhone(p.mobile) : '';
            const canon = normPhone ? `phone:${normPhone}` : `id:${p.id}`;
            if (p.id) _playerCanonicalKeyMap.set(p.id, canon);
            if (normPhone) {
                _playerCanonicalKeyMap.set(`p_${normPhone}`, canon);
                _playerCanonicalKeyMap.set(normPhone, canon);
            }
        }
    }

    /** Map any player identifier to a canonical key */
    function _getCanonicalKey(playerId) {
        if (!playerId) return '';
        _ensureCanonicalIndex();
        if (_playerCanonicalKeyMap.has(playerId)) {
            return _playerCanonicalKeyMap.get(playerId);
        }
        // Fallback for p_<phone> format
        if (String(playerId).startsWith('p_')) {
            const rawPhone = String(playerId).slice(2);
            const norm = (typeof Auth !== 'undefined' && Auth.normalizePhone) ? Auth.normalizePhone(rawPhone) : rawPhone;
            if (norm) {
                const canon = `phone:${norm}`;
                _playerCanonicalKeyMap.set(playerId, canon);
                return canon;
            }
        }
        const canon = `id:${playerId}`;
        _playerCanonicalKeyMap.set(playerId, canon);
        return canon;
    }

    /**
     * Compute badge aggregates in a single fast pass across all matches.
     * Takes < 1ms total and makes all subsequent player pill renders instant O(1).
     */
    function _ensureAggregates() {
        if (_matchCountCache !== null && _firstOnSheetSet !== null) return;

        _matchCountCache = new Map();
        _firstOnSheetSet = new Set();
        _ensureCanonicalIndex();

        const allMatches = (typeof Matches !== 'undefined' && Matches.getAll) ? Matches.getAll() : [];
        const todayStr = getTodayStr();

        for (const m of allMatches) {
            if (!m) continue;

            // Track who was first on sheet (#1 slot)
            if (Array.isArray(m.playing) && m.playing.length > 0) {
                const firstKey = _getCanonicalKey(m.playing[0]);
                if (firstKey) {
                    _firstOnSheetSet.add(firstKey);
                }
            }

            // Match is counted if:
            // 1. Date is in the past (completed game), OR
            // 2. Match was locked by admin (confirmed lineup), OR
            // 3. Draft was conducted/completed for this match
            const isPlayedMatch = (m.date && m.date < todayStr) || 
                                  Boolean(m.locked) || 
                                  Boolean(m.draft && (m.draft.status === 'completed' || m.draft.status === 'in_progress'));

            if (!isPlayedMatch) continue;

            // Collect unique players who played this match
            const matchPlayers = new Set();

            if (Array.isArray(m.playing)) {
                for (const pid of m.playing) {
                    const k = _getCanonicalKey(pid);
                    if (k) matchPlayers.add(k);
                }
            }

            if (m.draft && Array.isArray(m.draft.teams)) {
                for (const t of m.draft.teams) {
                    if (Array.isArray(t.players)) {
                        for (const pid of t.players) {
                            const k = _getCanonicalKey(pid);
                            if (k) matchPlayers.add(k);
                        }
                    }
                }
            }

            // Increment match count once per match per player
            for (const k of matchPlayers) {
                _matchCountCache.set(k, (_matchCountCache.get(k) || 0) + 1);
            }
        }
    }

    /**
     * Calculate total confirmed matches played by a player (O(1) lookup).
     */
    function getPlayerMatchCount(playerId) {
        if (!playerId) return 0;
        _ensureAggregates();
        const k = _getCanonicalKey(playerId);
        return _matchCountCache.get(k) || 0;
    }

    /**
     * Check if player was ever #1 on the playing sheet across matches (O(1) lookup).
     */
    function hasEverBeenFirstOnSheet(playerId) {
        if (!playerId) return false;
        _ensureAggregates();
        const k = _getCanonicalKey(playerId);
        return _firstOnSheetSet.has(k);
    }

    /**
     * Get player's milestone status, current tier, next tier, and progress
     */
    function getPlayerBadgeStatus(playerId) {
        const matchesCount = getPlayerMatchCount(playerId);

        // Find highest unlocked milestone
        let currentMilestone = null;
        for (const tier of MILESTONE_TIERS) {
            if (matchesCount >= tier.threshold) {
                currentMilestone = tier;
                break;
            }
        }

        // Find next milestone tier to work towards
        let nextMilestone = null;
        const reversedTiers = [...MILESTONE_TIERS].reverse(); // 1, 15, 25, 50, 100
        for (const tier of reversedTiers) {
            if (matchesCount < tier.threshold) {
                nextMilestone = tier;
                break;
            }
        }

        // Calculate progress percentage to next milestone
        let progressPercent = 100;
        let progressText = 'Top Rank Achieved! 🏆';

        if (nextMilestone) {
            const prevThreshold = currentMilestone ? currentMilestone.threshold : 0;
            const needed = nextMilestone.threshold - prevThreshold;
            const current = matchesCount - prevThreshold;
            progressPercent = Math.min(100, Math.max(0, Math.round((current / needed) * 100)));
            const remaining = nextMilestone.threshold - matchesCount;
            progressText = `${remaining} match${remaining > 1 ? 'es' : ''} to ${nextMilestone.icon} ${nextMilestone.title}`;
        }

        return {
            matchesCount,
            currentMilestone,
            nextMilestone,
            progressPercent,
            progressText,
            isFirstOnSheet: hasEverBeenFirstOnSheet(playerId)
        };
    }

    /**
     * Render inline badge pill HTML for squad lists, cards, and draft
     * @param {string} playerId
     * @param {boolean} isCurrentMatchSlotOne - If true, displays the ⚡ First on Sheet badge for the active match
     */
    function renderBadgePillsHtml(playerId, isCurrentMatchSlotOne = false) {
        const status = getPlayerBadgeStatus(playerId);
        let html = '';

        if (status.currentMilestone) {
            const m = status.currentMilestone;
            const capText = status.matchesCount === 0 ? 'Debut Match' : `${status.matchesCount} Caps`;
            html += `
                <span class="player-badge-pill milestone-pill" 
                      style="color:${m.color}; background:${m.bg}; border-color:${m.border};" 
                      title="${safeHtml(m.title)} (${capText})"
                      onclick="Badges.openPassportModal('${safeHtml(playerId)}', event)">
                    <span class="badge-icon">${m.icon}</span>
                    <span class="badge-label">${safeHtml(m.title)}</span>
                </span>`;
        }

        // Speed badge: if player grabbed slot #1 in current match
        if (isCurrentMatchSlotOne) {
            html += `
                <span class="player-badge-pill speed-pill" 
                      style="color:${SPEED_BADGE.color}; background:${SPEED_BADGE.bg}; border-color:${SPEED_BADGE.border};"
                      title="${SPEED_BADGE.title}: Grabbed Slot #1"
                      onclick="Badges.openPassportModal('${safeHtml(playerId)}', event)">
                    <span class="badge-icon">${SPEED_BADGE.icon}</span>
                    <span class="badge-label">#1 Pick</span>
                </span>`;
        }

        return html;
    }

    /**
     * Open the slick CCC Player Passport Modal
     */
    function openPassportModal(playerId, event) {
        if (event) {
            event.stopPropagation();
        }

        const modal = document.getElementById('player-passport-modal');
        if (!modal) return;

        const player = (typeof Auth !== 'undefined' && Auth.getPlayerById) ? Auth.getPlayerById(playerId) : null;
        if (!player) return;

        const status = getPlayerBadgeStatus(playerId);
        const nameEl = document.getElementById('passport-player-name');
        const phoneEl = document.getElementById('passport-player-phone');
        const avatarEl = document.getElementById('passport-player-avatar');
        const matchesCountEl = document.getElementById('passport-matches-count');
        const currentRankEl = document.getElementById('passport-current-rank');
        const progressFillEl = document.getElementById('passport-progress-fill');
        const progressTextEl = document.getElementById('passport-progress-text');
        const badgesListEl = document.getElementById('passport-badges-list');

        const initials = (typeof App !== 'undefined' && App.getInitials) ? App.getInitials(player.name) : '🏏';
        const formattedPhone = (typeof App !== 'undefined' && App.formatPhone) ? App.formatPhone(player.mobile) : player.mobile;

        if (nameEl) nameEl.textContent = player.name;
        if (phoneEl) phoneEl.textContent = formattedPhone ? `📱 ${formattedPhone}` : '';
        if (avatarEl) {
            avatarEl.textContent = initials;
            if (status.currentMilestone && status.currentMilestone.threshold >= 100) {
                avatarEl.classList.add('avatar-hall-of-fame');
            } else {
                avatarEl.classList.remove('avatar-hall-of-fame');
            }
        }
        if (matchesCountEl) matchesCountEl.textContent = `${status.matchesCount} Matches`;

        if (currentRankEl) {
            if (status.currentMilestone) {
                currentRankEl.innerHTML = `
                    <span class="passport-rank-badge" style="color:${status.currentMilestone.color}; background:${status.currentMilestone.bg}; border-color:${status.currentMilestone.border};">
                        ${status.currentMilestone.icon} ${safeHtml(status.currentMilestone.title)}
                    </span>`;
            } else {
                currentRankEl.innerHTML = `<span class="passport-rank-badge unranked">Unranked (Need 1 Match)</span>`;
            }
        }

        if (progressFillEl) {
            progressFillEl.style.width = `${status.progressPercent}%`;
            if (status.currentMilestone) {
                progressFillEl.style.background = `linear-gradient(90deg, ${status.currentMilestone.color}, #f1c40f)`;
            }
        }
        if (progressTextEl) {
            progressTextEl.textContent = status.progressText;
        }

        // Render Milestones Roadmap in Passport
        if (badgesListEl) {
            let listHtml = '';

            // 1. Milestone tiers roadmap
            for (const tier of MILESTONE_TIERS) {
                const isUnlocked = status.matchesCount >= tier.threshold;
                listHtml += `
                    <div class="passport-badge-row ${isUnlocked ? 'unlocked' : 'locked'}">
                        <div class="passport-badge-icon" style="${isUnlocked ? `border-color:${tier.border}; background:${tier.bg}; color:${tier.color};` : ''}">
                            ${tier.icon}
                        </div>
                        <div class="passport-badge-details">
                            <div class="passport-badge-top">
                                <strong>${safeHtml(tier.title)}</strong>
                                <span class="passport-badge-req">${tier.threshold}+ Matches</span>
                            </div>
                            <p class="passport-badge-desc">${safeHtml(tier.desc)}</p>
                        </div>
                        <div class="passport-badge-status">
                            ${isUnlocked ? '<span class="status-tick">✓ Unlocked</span>' : '<span class="status-lock">🔒 Locked</span>'}
                        </div>
                    </div>`;
            }

            // 2. Speed Badge: First on the Sheet
            const isSpeedUnlocked = status.isFirstOnSheet;
            listHtml += `
                <div class="passport-badge-row ${isSpeedUnlocked ? 'unlocked' : 'locked'}">
                    <div class="passport-badge-icon" style="${isSpeedUnlocked ? `border-color:${SPEED_BADGE.border}; background:${SPEED_BADGE.bg}; color:${SPEED_BADGE.color};` : ''}">
                        ${SPEED_BADGE.icon}
                    </div>
                    <div class="passport-badge-details">
                        <div class="passport-badge-top">
                            <strong>${safeHtml(SPEED_BADGE.title)}</strong>
                            <span class="passport-badge-req">Speed Run</span>
                        </div>
                        <p class="passport-badge-desc">${safeHtml(SPEED_BADGE.desc)}</p>
                    </div>
                    <div class="passport-badge-status">
                        ${isSpeedUnlocked ? '<span class="status-tick">✓ Unlocked</span>' : '<span class="status-lock">🔒 Be #1</span>'}
                    </div>
                </div>`;

            badgesListEl.innerHTML = listHtml;
        }

        modal.style.display = 'flex';
    }

    /** Close passport modal */
    function closePassportModal() {
        const modal = document.getElementById('player-passport-modal');
        if (modal) modal.style.display = 'none';
    }

    return {
        MILESTONE_TIERS,
        SPEED_BADGE,
        getPlayerMatchCount,
        hasEverBeenFirstOnSheet,
        getPlayerBadgeStatus,
        renderBadgePillsHtml,
        openPassportModal,
        closePassportModal,
        invalidateCache
    };
})();

// Export globally
if (typeof window !== 'undefined') {
    window.Badges = Badges;
}
