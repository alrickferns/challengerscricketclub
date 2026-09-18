/* ============================================================
   ADMIN MODULE — Create/Manage Matches, Lock/Unlock
   ============================================================ */
const Admin = (() => {

    /** Render the admin match management list */
    function renderAdminPanel() {
        const listEl = document.getElementById('admin-match-list');
        if (!listEl) return;

        // In Admin Panel, show ALL matches sorted by date
        const allMatches = (typeof Matches !== 'undefined' && Matches.getAll) ? Matches.getAll() : [];
        const matches = (Array.isArray(allMatches) ? allMatches : []).filter(m => m && typeof m === 'object').sort((a, b) => {
            const dateComp = (a.date || '').localeCompare(b.date || '');
            if (dateComp !== 0) return dateComp;
            return (a.startTime || a.time || '').localeCompare(b.startTime || b.time || '');
        });

        if (matches.length === 0) {
            const isLiveDb = typeof window !== 'undefined' && window.DB && window.DB.isLive && window.DB.isLive();
            listEl.innerHTML = `
                <div class="empty-state-small">
                    <p>${isLiveDb ? 'No matches found in database. Create one above!' : 'No matches found. Create one above!'}</p>
                </div>`;
            return;
        }

        const todayStr = new Date().toISOString().split('T')[0];

        listEl.innerHTML = matches.map(match => {
            const dateObj = new Date((match.date || todayStr) + 'T00:00:00');
            const dateStr = !isNaN(dateObj.getTime())
                ? dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                : (match.date || 'TBD');
            const timeStr = (typeof window !== 'undefined' && window.App && window.App.formatTimeRange)
                ? window.App.formatTimeRange(match.startTime || match.time, match.endTime)
                : (match.startTime || match.time || '');
            const safeTurf = (typeof window !== 'undefined' && window.App && window.App.escapeHtml)
                ? window.App.escapeHtml(match.turf || '')
                : (match.turf || '');
            const safeFormat = (typeof window !== 'undefined' && window.App && window.App.escapeHtml)
                ? window.App.escapeHtml(match.format || 'Turf Match')
                : (match.format || 'Turf Match');
            const playingCount = Array.isArray(match.playing) ? match.playing.length : 0;
            const waitingCount = Array.isArray(match.waiting) ? match.waiting.length : 0;
            const maxPlayers = parseInt(match.maxPlayers, 10) || 22;
            const isPast = match.date && match.date < todayStr;

            return `
                <div class="admin-match-card ${isPast ? 'is-past' : ''}" data-match-id="${match.id}">
                    <div class="admin-match-info" onclick="Admin.openMatchSquad('${match.id}')" style="cursor:pointer;">
                        <div class="admin-match-date">
                            ${dateStr}
                            ${isPast ? '<span class="count-tag wait" style="margin-left:6px; font-size:0.65rem;">Past</span>' : ''}
                        </div>
                        <div class="admin-match-details">${timeStr} · ${safeTurf} <span class="format-badge-sm">🏏 ${safeFormat}</span></div>
                        <div class="admin-match-count">
                            <span class="count-tag in">${playingCount}/${maxPlayers} Playing</span>
                            <span class="count-tag wait">${waitingCount} Waiting</span>
                        </div>
                    </div>
                    <div class="admin-match-actions">
                        <button class="btn btn-sm btn-outline" title="Manage Squad & Players"
                                onclick="Admin.openMatchSquad('${match.id}')">
                            👥 Squad
                        </button>
                        <button class="btn btn-sm btn-outline-gold" title="Edit Match Details"
                                onclick="Admin.openEditModal('${match.id}')">
                            ✏️ Edit
                        </button>
                        <button class="btn btn-sm ${match.locked ? 'btn-danger' : 'btn-outline'}"
                                onclick="Admin.handleToggleLock('${match.id}')">
                            ${match.locked ? '🔒 Locked' : '🔓 Open'}
                        </button>
                        <button class="btn btn-sm btn-ghost-danger" title="Delete Match"
                                onclick="Admin.handleDelete('${match.id}')">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                            </svg>
                            <span>Delete</span>
                        </button>
                    </div>
                </div>`;
        }).join('');

        // Also refresh player directory
        renderPlayersDirectory();
    }

    /** Open match detail to manage squad */
    function openMatchSquad(matchId) {
        App.showMatchDetail(matchId);
    }

    /** Toggle lock/unlock */
    async function handleToggleLock(matchId) {
        const match = (window.DB && DB.isLive())
            ? await DB.toggleLock(matchId)
            : Squad.toggleLock(matchId);
        if (match) {
            App.showToast(match.locked ? 'Squad locked 🔒' : 'Squad unlocked 🔓');
            renderAdminPanel();
            if (window.App) {
                if (App.renderTicker) App.renderTicker();
                if (App.renderMatchCards) App.renderMatchCards();
            }
        }
    }

    /** Delete a match with confirmation */
    function handleDelete(matchId) {
        App.showConfirm(
            'Delete Match',
            'This will permanently remove this match and all squad data. Continue?',
            '🗑️',
            () => {
                Matches.remove(matchId);
                App.showToast('Match deleted 🗑️');
                renderAdminPanel();
                if (window.App) {
                    if (App.renderTicker) App.renderTicker();
                    if (App.renderMatchCards) App.renderMatchCards();
                    if (App.renderDateStrip) App.renderDateStrip();
                    const detailScreen = document.getElementById('match-detail-screen');
                    if (detailScreen && detailScreen.classList.contains('active')) {
                        App.showScreen('home');
                    }
                }
            }
        );
    }

    /** Handle create match form submission */
    function handleCreateMatch(e) {
        e.preventDefault();
        const form = e.target;

        const date = form.querySelector('#match-date').value;
        const startTime = form.querySelector('#match-start-time').value;
        const endTime = form.querySelector('#match-end-time').value;
        const turf = form.querySelector('#match-turf').value.trim();
        const formatInput = form.querySelector('#match-format');
        const format = formatInput ? (formatInput.value.trim() || 'Turf Match') : 'Turf Match';
        const maxPlayers = parseInt(form.querySelector('#match-max-players').value, 10);

        if (!date || !startTime || !turf) {
            App.showToast('Please fill all required fields');
            return;
        }

        if (isNaN(maxPlayers) || maxPlayers < 2 || maxPlayers > 100) {
            App.showToast('Squad capacity must be between 2 and 100');
            return;
        }

        Matches.create({ date, startTime, endTime, turf, format, maxPlayers });

        // Reset form but keep default max players
        form.reset();
        form.querySelector('#match-max-players').value = '22';

        // Set min date to today
        setMinDate();

        renderAdminPanel();
        if (window.App) {
            if (App.renderTicker) App.renderTicker();
            if (App.renderMatchCards) App.renderMatchCards();
            if (App.renderDateStrip) App.renderDateStrip();
        }
        App.showToast('Match created! 🏏');
    }

    /** Open edit match modal */
    function openEditModal(matchId) {
        const match = Matches.getById(matchId);
        if (!match) return;

        const modal = document.getElementById('admin-edit-match-modal');
        if (!modal) return;

        document.getElementById('edit-match-id').value = match.id;
        document.getElementById('edit-match-date').value = match.date || '';
        document.getElementById('edit-match-start-time').value = match.startTime || match.time || '';
        document.getElementById('edit-match-end-time').value = match.endTime || '';
        document.getElementById('edit-match-turf').value = match.turf || '';
        document.getElementById('edit-match-format').value = match.format || 'Turf Match';
        document.getElementById('edit-match-max-players').value = match.maxPlayers || 22;

        modal.style.display = 'flex';
    }

    /** Close edit match modal */
    function closeEditModal() {
        const modal = document.getElementById('admin-edit-match-modal');
        if (modal) modal.style.display = 'none';
    }

    /** Handle edit match form submission */
    function handleEditMatch(e) {
        e.preventDefault();
        const form = e.target;
        const matchId = form.querySelector('#edit-match-id').value;
        const date = form.querySelector('#edit-match-date').value;
        const startTime = form.querySelector('#edit-match-start-time').value;
        const endTime = form.querySelector('#edit-match-end-time').value;
        const turf = form.querySelector('#edit-match-turf').value.trim();
        const format = (form.querySelector('#edit-match-format').value || 'Turf Match').trim();
        const maxPlayers = parseInt(form.querySelector('#edit-match-max-players').value, 10);

        if (!date || !startTime || !turf) {
            App.showToast('Please fill all required fields');
            return;
        }

        if (isNaN(maxPlayers) || maxPlayers < 2 || maxPlayers > 100) {
            App.showToast('Squad capacity must be between 2 and 100');
            return;
        }

        const updated = Matches.update(matchId, {
            date,
            startTime,
            endTime,
            time: startTime,
            turf,
            format,
            maxPlayers
        });

        if (updated) {
            App.showToast('Match updated! 🏏');
            closeEditModal();
            renderAdminPanel();
            if (window.App) {
                if (App.renderTicker) App.renderTicker();
                if (App.renderMatchCards) App.renderMatchCards();
                if (App.renderDateStrip) App.renderDateStrip();
                const detailScreen = document.getElementById('match-detail-screen');
                if (detailScreen && detailScreen.classList.contains('active')) {
                    App.showMatchDetail(matchId);
                }
            }
        }
    }

    /** Set min date on the date input to today */
    function setMinDate() {
        const dateInput = document.getElementById('match-date');
        if (dateInput) {
            const today = new Date().toISOString().split('T')[0];
            dateInput.setAttribute('min', today);
        }
    }

    /** Render the registered club members / players directory for Admin */
    function renderPlayersDirectory() {
        const listEl = document.getElementById('admin-players-list');
        const countEl = document.getElementById('admin-players-count');
        if (!listEl) return;

        const allPlayers = (typeof Auth !== 'undefined' && Auth.getPlayers) ? Auth.getPlayers() : [];
        const players = (Array.isArray(allPlayers) ? allPlayers : []).filter(p => p && p.name).sort((a, b) => {
            return (a.name || '').localeCompare(b.name || '');
        });

        if (countEl) countEl.textContent = `${players.length} Players`;

        if (players.length === 0) {
            listEl.innerHTML = '<div class="empty-state-small"><p>No registered players found yet.</p></div>';
            return;
        }

        listEl.innerHTML = players.map(p => {
            const phone = p.mobile || '';
            const cleanPhone = phone.replace(/\D/g, '');
            const formattedPhone = (typeof window !== 'undefined' && window.App && window.App.formatPhone)
                ? window.App.formatPhone(phone)
                : phone;
            const initials = (typeof window !== 'undefined' && window.App && window.App.getInitials)
                ? window.App.getInitials(p.name)
                : (p.name.slice(0, 2).toUpperCase());
            const safeName = (typeof window !== 'undefined' && window.App && window.App.escapeHtml)
                ? window.App.escapeHtml(p.name)
                : p.name;
            const waNumber = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;

            return `
                <div class="admin-player-card">
                    <div class="admin-player-info">
                        <div class="player-avatar-badge" style="width:34px; height:34px; font-size:0.75rem;">${initials}</div>
                        <div class="admin-player-details">
                            <div class="admin-player-name">
                                ${safeName}
                                ${p.isAdmin ? '<span class="count-tag in" style="font-size:0.62rem; padding:1px 6px;">Admin</span>' : ''}
                                ${p.isGuest ? '<span class="squad-guest-tag">Guest</span>' : ''}
                            </div>
                            ${cleanPhone ? `
                                <a class="admin-player-phone" href="tel:${cleanPhone}" title="Call ${safeName}">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
                                    <span>+91 ${formattedPhone}</span>
                                </a>` : '<span class="squad-no-phone">No phone recorded</span>'}
                        </div>
                    </div>
                    ${cleanPhone ? `
                        <div class="admin-player-actions">
                            <a class="admin-player-btn call" href="tel:${cleanPhone}" title="Call ${safeName}">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
                            </a>
                            <a class="admin-player-btn wa" href="https://wa.me/${waNumber}?text=Hey%20${encodeURIComponent(p.name)}!%20Update%20from%20Challengers%20Cricket%20Club." target="_blank" rel="noopener" title="Message on WhatsApp">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                            </a>
                        </div>` : ''}
                </div>`;
        }).join('');
    }

    return {
        renderAdminPanel,
        renderPlayersDirectory,
        openMatchSquad,
        openEditModal,
        closeEditModal,
        handleEditMatch,
        handleToggleLock,
        handleDelete,
        handleCreateMatch,
        setMinDate
    };
})();

// Export globally to window
if (typeof window !== 'undefined') {
    window.Admin = Admin;
}
