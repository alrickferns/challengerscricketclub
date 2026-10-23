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
            threshold: 1,
            id: 'debutant',
            icon: '🧢',
            title: 'Debutant',
            color: '#f1c40f',
            bg: 'rgba(241, 196, 15, 0.16)',
            border: 'rgba(241, 196, 15, 0.45)',
            desc: 'CCC Cap (1+ Match)'
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

    /**
     * Calculate total confirmed matches played by a player.
     * Checks playing squad as well as drafted team rosters,
     * matching by both ID and canonical 10-digit mobile number.
     */
    function getPlayerMatchCount(playerId) {
        if (!playerId || typeof Matches === 'undefined' || !Matches.getAll) return 0;
        const player = (typeof Auth !== 'undefined' && Auth.getPlayerById) ? Auth.getPlayerById(playerId) : null;
        const targetPhone = player && Auth.normalizePhone ? Auth.normalizePhone(player.mobile) : '';
        const allMatches = Matches.getAll() || [];
        const todayStr = getTodayStr();

        const matchesPlayer = (id) => {
            if (!id) return false;
            if (id === playerId) return true;
            if (!targetPhone) return false;
            const p = Auth.getPlayerById(id);
            return p && Auth.normalizePhone && Auth.normalizePhone(p.mobile) === targetPhone;
        };

        let count = 0;
        for (const m of allMatches) {
            if (!m) continue;

            // Match is counted if:
            // 1. Date is in the past (completed game), OR
            // 2. Match was locked by admin (confirmed lineup), OR
            // 3. Draft was conducted/completed for this match
            const isPlayedMatch = (m.date && m.date < todayStr) || 
                                  Boolean(m.locked) || 
                                  Boolean(m.draft && (m.draft.status === 'completed' || m.draft.status === 'in_progress'));

            if (!isPlayedMatch) continue;

            let playedInThisMatch = false;

            // Check if player was in confirmed playing squad
            if (Array.isArray(m.playing) && m.playing.some(matchesPlayer)) {
                playedInThisMatch = true;
            }

            // Also check if player was drafted into any team roster
            if (!playedInThisMatch && m.draft && Array.isArray(m.draft.teams)) {
                for (const t of m.draft.teams) {
                    if (Array.isArray(t.players) && t.players.some(matchesPlayer)) {
                        playedInThisMatch = true;
                        break;
                    }
                }
            }

            if (playedInThisMatch) {
                count++;
            }
        }
        return count;
    }

    /**
     * Check if player was ever #1 on the playing sheet across matches
     */
    function hasEverBeenFirstOnSheet(playerId) {
        if (!playerId || typeof Matches === 'undefined' || !Matches.getAll) return false;
        const player = (typeof Auth !== 'undefined' && Auth.getPlayerById) ? Auth.getPlayerById(playerId) : null;
        const targetPhone = player && Auth.normalizePhone ? Auth.normalizePhone(player.mobile) : '';
        const allMatches = Matches.getAll() || [];

        const matchesPlayer = (id) => {
            if (!id) return false;
            if (id === playerId) return true;
            if (!targetPhone) return false;
            const p = Auth.getPlayerById(id);
            return p && Auth.normalizePhone && Auth.normalizePhone(p.mobile) === targetPhone;
        };

        return allMatches.some(m => Array.isArray(m.playing) && m.playing.length > 0 && matchesPlayer(m.playing[0]));
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
            html += `
                <span class="player-badge-pill milestone-pill" 
                      style="color:${m.color}; background:${m.bg}; border-color:${m.border};" 
                      title="${safeHtml(m.title)}: ${m.threshold}+ Matches (${status.matchesCount} Caps)"
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
        closePassportModal
    };
})();

// Export globally
if (typeof window !== 'undefined') {
    window.Badges = Badges;
}
