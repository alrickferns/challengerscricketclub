/* ============================================================
   APP CONTROLLER — Routing, Rendering, Event Binding
   ============================================================ */
const App = (() => {
    let currentScreen = 'login';
    let selectedDate = null;
    let weekOffset = 0;
    let currentMatchId = null;

    // Confirm modal callback
    let _confirmCallback = null;

    /* ----------------------------------------------------------
       INITIALIZATION
    ---------------------------------------------------------- */
    function init() {
        if (window.Auth && Auth.deduplicatePlayersAndMatches) {
            Auth.deduplicatePlayersAndMatches();
        }
        if (window.DB && DB.init) {
            DB.init();
        }
        const user = Auth.getCurrentUser();
        if (user) {
            showScreen('home');
        } else {
            showScreen('login');
        }
        bindEvents();
    }

    /* ----------------------------------------------------------
       SCREEN MANAGEMENT
    ---------------------------------------------------------- */
    function showScreen(name, data) {
        // Deactivate all screens
        document.querySelectorAll('.screen').forEach(s => {
            s.classList.remove('active');
        });

        const screen = document.getElementById(name + '-screen');
        if (!screen) return;

        // Small delay for transition effect
        requestAnimationFrame(() => {
            screen.classList.add('active');
        });

        currentScreen = name;

        // Clean up draft timers if navigating away from draft
        if (name !== 'draft' && typeof window.Draft !== 'undefined' && Draft.stopTurnTimer) {
            Draft.stopTurnTimer();
        }
        switch (name) {
            case 'home':
                renderHome();
                break;
            case 'match-detail':
                if (data && data.matchId) {
                    currentMatchId = data.matchId;
                    renderMatchDetail(data.matchId);
                }
                break;
            case 'admin':
                Admin.setMinDate();
                Admin.renderAdminPanel();
                break;
            case 'draft':
                if (data && data.matchId) {
                    currentMatchId = data.matchId;
                    if (typeof window.Draft !== 'undefined' && Draft.renderDraftScreen) {
                        Draft.renderDraftScreen(data.matchId);
                    }
                }
                break;
        }
    }

    /* ----------------------------------------------------------
       HOME SCREEN RENDERING
    ---------------------------------------------------------- */
    function renderHome() {
        const user = Auth.getCurrentUser();
        if (!user) return;

        // Update user name in top bar and make clickable to open Player Passport
        const userNameEl = document.getElementById('top-bar-user-name');
        if (userNameEl) {
            userNameEl.textContent = user.name;
            userNameEl.style.cursor = 'pointer';
            userNameEl.title = 'Click to view your Player Passport & Badges';
            userNameEl.onclick = () => {
                if (typeof Badges !== 'undefined') Badges.openPassportModal(user.id);
            };
        }

        // Show/hide admin controls
        const isAdmin = user.isAdmin === true;
        document.getElementById('admin-fab').style.display = isAdmin ? 'flex' : 'none';
        document.getElementById('admin-panel-btn').style.display = isAdmin ? 'flex' : 'none';

        renderDateStrip();
        renderMatchCards();
        renderTicker();
        checkAndNotifyPersonalPromotion();
    }

    /* ----------------------------------------------------------
       DATE STRIP
    ---------------------------------------------------------- */
    function renderDateStrip() {
        const strip = document.getElementById('date-strip');
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Calculate Monday of the target week
        const startOfWeek = new Date(today);
        const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Adjust to Monday
        startOfWeek.setDate(today.getDate() + diff + (weekOffset * 7));

        const matchDates = Matches.getMatchDates();
        const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

        let html = '';
        for (let i = 0; i < 7; i++) {
            const date = new Date(startOfWeek);
            date.setDate(startOfWeek.getDate() + i);
            const dateStr = toDateString(date);
            const todayStr = toDateString(today);
            const isToday = dateStr === todayStr;
            const hasMatch = matchDates.includes(dateStr);
            const isSelected = selectedDate === dateStr;

            html += `
                <button class="date-item ${isToday ? 'today' : ''} ${hasMatch ? 'has-match' : ''} ${isSelected ? 'selected' : ''}"
                        data-date="${dateStr}">
                    <span class="date-day">${dayNames[i]}</span>
                    <span class="date-num">${date.getDate()}</span>
                    ${hasMatch ? '<span class="date-dot"></span>' : ''}
                </button>`;
        }

        strip.innerHTML = html;

        // Update month label
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        // Use the middle of the week for the month label
        const midWeek = new Date(startOfWeek);
        midWeek.setDate(startOfWeek.getDate() + 3);
        document.getElementById('month-label').textContent =
            monthNames[midWeek.getMonth()] + ' ' + midWeek.getFullYear();
    }

    function selectDate(dateStr) {
        selectedDate = selectedDate === dateStr ? null : dateStr;
        renderDateStrip();
        renderMatchCards();

        // Update section heading
        if (selectedDate) {
            const d = new Date(selectedDate + 'T00:00:00');
            const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
            document.getElementById('section-heading').textContent = label;
        } else {
            document.getElementById('section-heading').textContent = 'Upcoming Matches';
        }
    }

    /* ----------------------------------------------------------
       MATCH CARDS
    ---------------------------------------------------------- */
    function renderMatchCards() {
        const container = document.getElementById('match-list');
        const emptyState = document.getElementById('empty-state');
        const user = Auth.getCurrentUser();
        if (!user) return;

        let matches;
        if (selectedDate) {
            matches = Matches.getMatchesForDate(selectedDate);
        } else {
            matches = Matches.getUpcoming();
        }

        if (matches.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'flex';
            return;
        }

        emptyState.style.display = 'none';

        container.innerHTML = matches.map(match => {
            const dateObj = new Date(match.date + 'T00:00:00');
            const dateStr = dateObj.toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric'
            });
            const playingCount = match.playing.length;
            const waitingCount = match.waiting.length;
            const emptyCount = Math.max(0, match.maxPlayers - playingCount);
            const fillPercent = Math.min(100, (playingCount / match.maxPlayers) * 100);

            const playerStatus = Squad.getPlayerStatus(match.id, user.id);
            let actionBtn = '';

            if (match.locked) {
                actionBtn = '<button class="btn btn-locked btn-sm" disabled>🔒 Locked</button>';
            } else if (playerStatus === 'playing') {
                actionBtn = `<button class="btn btn-leave btn-sm" data-action="leave" data-match-id="${match.id}">Leave</button>`;
            } else if (playerStatus.startsWith('waiting')) {
                actionBtn = `<button class="btn btn-leave btn-sm" data-action="leave" data-match-id="${match.id}">Leave Queue</button>`;
            } else if (playingCount < match.maxPlayers) {
                actionBtn = `<button class="btn btn-join btn-sm" data-action="join" data-match-id="${match.id}">I'm In!</button>`;
            } else {
                actionBtn = `<button class="btn btn-waitlist btn-sm" data-action="join" data-match-id="${match.id}">Join Waitlist</button>`;
            }

            let statusBadge = '';
            if (playerStatus === 'playing') {
                statusBadge = '<span class="player-status-badge playing">✓ Playing</span>';
            } else if (playerStatus.startsWith('waiting')) {
                const pos = playerStatus.split(':')[1];
                statusBadge = `<span class="player-status-badge waiting">⏳ #${pos} Waiting</span>`;
            }

            const timeStr = formatTimeRange(match.startTime || match.time, match.endTime);

            return `
                <div class="match-card" data-match-id="${match.id}">
                    <div class="match-card-header">
                        <div class="match-card-date-time">
                            <span class="match-date-text">${dateStr}</span>
                            <div class="match-meta-pills">
                                <span class="match-time-text">🕒 ${timeStr}</span>
                                <span class="match-format-text">🏏 ${escapeHtml(match.format || 'Turf Match')}</span>
                            </div>
                        </div>
                        ${statusBadge}
                    </div>
                    <div class="match-card-turf">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                             <circle cx="12" cy="10" r="3"/></svg>
                        <span>${escapeHtml(match.turf)}</span>
                    </div>
                    <div class="match-card-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${fillPercent}%"></div>
                        </div>
                        <span class="progress-text">${playingCount}/${match.maxPlayers} Spots Filled</span>
                    </div>
                    <div class="match-card-footer">
                        <div class="slot-badges">
                            <span class="badge badge-in">${playingCount} In</span>
                            <span class="badge badge-waiting">${waitingCount} Waiting</span>
                            <span class="badge badge-empty">${emptyCount} Open</span>
                        </div>
                        ${actionBtn}
                    </div>
                </div>`;
        }).join('');
    }

    /* ----------------------------------------------------------
       MOVING MATCH TICKER (STOCK MARKET STYLE)
    ---------------------------------------------------------- */
    function renderTicker() {
        const track = document.getElementById('ticker-track');
        if (!track) return;

        const matches = Matches.getUpcoming();
        if (matches.length === 0) {
            track.innerHTML = `
                <div class="ticker-item">
                    <span class="ticker-item-date">Challengers Cricket Club</span>
                    <span class="ticker-item-sep">•</span>
                    <span class="ticker-item-turf">No upcoming matches scheduled · Check back soon!</span>
                </div>
                <span class="ticker-divider">✦</span>
                <div class="ticker-item">
                    <span class="ticker-item-date">Challengers Cricket Club</span>
                    <span class="ticker-item-sep">•</span>
                    <span class="ticker-item-turf">No upcoming matches scheduled · Check back soon!</span>
                </div>
            `;
            return;
        }

        const itemsHtml = matches.map(match => {
            const dateObj = new Date(match.date + 'T00:00:00');
            const dateStr = dateObj.toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric'
            });
            const timeStr = formatTimeRange(match.startTime || match.time, match.endTime);
            const playingCount = match.playing.length;
            const waitingCount = match.waiting.length;
            const emptyCount = Math.max(0, match.maxPlayers - playingCount);

            let chipHtml = '';
            if (match.locked) {
                chipHtml = '<span class="ticker-item-chip locked">🔒 LOCKED</span>';
            } else if (emptyCount > 0) {
                chipHtml = `<span class="ticker-item-chip open">🟢 ${emptyCount} OPEN</span>`;
            } else if (waitingCount > 0) {
                chipHtml = `<span class="ticker-item-chip wait">⏳ FULL (${waitingCount} WAITING)</span>`;
            } else {
                chipHtml = `<span class="ticker-item-chip wait">⚡ FULL SQUAD</span>`;
            }

            return `
                <div class="ticker-item" onclick="App.showMatchDetail('${match.id}')" title="Click to view squad for ${escapeHtml(match.turf)}">
                    <span class="ticker-item-date">${dateStr}</span>
                    <span class="ticker-item-sep">•</span>
                    ${timeStr ? `<span class="ticker-item-time">🕒 ${timeStr}</span><span class="ticker-item-sep">•</span>` : ''}
                    <span class="ticker-item-format">🏏 ${escapeHtml(match.format || 'Turf Match')}</span>
                    <span class="ticker-item-sep">•</span>
                    <span class="ticker-item-turf">📍 ${escapeHtml(match.turf)}</span>
                    ${chipHtml}
                </div>
            `;
        }).join('<span class="ticker-divider">✦</span>');

        // Repeat sequence to guarantee smooth continuous marquee loop
        const repeatCount = Math.max(2, Math.ceil(6 / matches.length));
        let sequence = '';
        for (let i = 0; i < repeatCount; i++) {
            sequence += itemsHtml + '<span class="ticker-divider">✦</span>';
        }
        // Duplicate sequence for seamless 50% translateX loop
        track.innerHTML = sequence + sequence;

        // Dynamically compute relaxed speed (~38px/s for calm, easy reading)
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => {
                const halfWidth = track.scrollWidth / 2;
                if (halfWidth > 0) {
                    const speed = 38; // px/sec - relaxed stock market ticker speed
                    const duration = Math.max(45, Math.round(halfWidth / speed));
                    track.style.animationDuration = `${duration}s`;
                }
            });
        }
    }

    /* ----------------------------------------------------------
       MATCH DETAIL
    ---------------------------------------------------------- */
    function renderMatchDetail(matchId) {
        const match = Matches.getById(matchId);
        if (!match) return;

        const user = Auth.getCurrentUser();
        const isAdmin = Auth.isAdmin();
        const dateObj = new Date(match.date + 'T00:00:00');
        const dateStr = dateObj.toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
        });
        const timeStr = formatTimeRange(match.startTime || match.time, match.endTime);
        const playerStatus = Squad.getPlayerStatus(match.id, user ? user.id : '');
        const emptySlots = Math.max(0, match.maxPlayers - match.playing.length);

        // Build playing list
        const playingHtml = match.playing.length > 0
            ? match.playing.map((pid, idx) => {
                const player = Auth.getPlayerById(pid);
                const isMe = user && pid === user.id;
                const playerName = player ? player.name : 'Unknown Player';
                return `
                    <div class="squad-player ${isAdmin ? 'has-admin-tools' : ''} ${isMe ? 'is-me' : ''}">
                        <div class="squad-player-left">
                            <span class="squad-number">${idx + 1}</span>
                            <div class="player-avatar-badge">${getInitials(playerName)}</div>
                            <div class="squad-player-meta">
                                <div class="squad-name-row" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                    <span class="squad-name" onclick="Badges.openPassportModal('${pid}', event)" style="cursor:pointer;" title="View Player Passport">${escapeHtml(playerName)}</span>
                                    ${(typeof Badges !== 'undefined') ? Badges.renderBadgePillsHtml(pid, idx === 0) : ''}
                                </div>
                                ${isAdmin ? (player && player.mobile ? `
                                    <a class="squad-admin-phone" href="tel:${escapeHtml(player.mobile)}" title="Call ${escapeHtml(playerName)}">
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
                                        <span>${escapeHtml(formatPhone(player.mobile))}</span>
                                    </a>` : '<span class="squad-no-phone">No phone</span>') : ''}
                                ${player && player.isGuest ? '<span class="squad-guest-tag">Added by Admin</span>' : ''}
                            </div>
                        </div>
                        <div class="squad-player-right">
                            ${isMe ? '<span class="squad-you">You</span>' : ''}
                            ${isAdmin ? `
                                <div class="squad-admin-tools">
                                    <button class="squad-order-btn" title="Move Up" ${idx === 0 ? 'disabled' : ''}
                                            onclick="App.handleReorderPlayer('${match.id}', 'playing', ${idx}, 'up')">
                                        ▲
                                    </button>
                                    <button class="squad-order-btn" title="Move Down" ${idx === match.playing.length - 1 ? 'disabled' : ''}
                                            onclick="App.handleReorderPlayer('${match.id}', 'playing', ${idx}, 'down')">
                                        ▼
                                    </button>
                                    <button class="squad-transfer-btn" title="Move to Waiting List"
                                            onclick="App.handleTransferPlayer('${match.id}', '${pid}', 'waiting')">
                                        ⏳ Wait
                                    </button>
                                    <a class="squad-wa-btn" href="${getWhatsAppPlayerUrl(player, match, 'playing')}" target="_blank" rel="noopener" title="Message ${escapeHtml(playerName)} on WhatsApp">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                    </a>
                                    <button class="squad-remove-btn" title="Remove player from squad"
                                            onclick="App.handleAdminRemovePlayer('${match.id}', '${pid}')">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                    </button>
                                </div>` : ''}
                        </div>
                    </div>`;
            }).join('')
            : '<p class="squad-empty">No players yet — be the first! 🏏</p>';

        // Build waiting list (shown if has players OR if admin wants to add)
        const showWaitingSection = match.waiting.length > 0 || isAdmin;
        const waitingHtml = showWaitingSection
            ? `<div class="detail-card">
                    <div class="detail-squad-header">
                        <div class="squad-title-group">
                            <h3>Waiting List</h3>
                            <span class="waiting-count">${match.waiting.length} in queue</span>
                        </div>
                        ${isAdmin ? `
                            <button class="btn btn-xs btn-outline-gold"
                                    onclick="App.openAddPlayerModal('${match.id}', 'waiting')">
                                + Add to Waitlist
                            </button>` : ''}
                    </div>
                    <div class="squad-list waiting-list">
                        ${match.waiting.length > 0 ? match.waiting.map((pid, idx) => {
                            const player = Auth.getPlayerById(pid);
                            const isMe = user && pid === user.id;
                            const playerName = player ? player.name : 'Unknown Player';
                            return `
                                <div class="squad-player waiting-item ${isAdmin ? 'has-admin-tools' : ''} ${isMe ? 'is-me' : ''}">
                                    <div class="squad-player-left">
                                        <span class="squad-number wait">#${idx + 1}</span>
                                        <div class="player-avatar-badge wait">${getInitials(playerName)}</div>
                                        <div class="squad-player-meta">
                                            <div class="squad-name-row" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                                <span class="squad-name" onclick="Badges.openPassportModal('${pid}', event)" style="cursor:pointer;" title="View Player Passport">${escapeHtml(playerName)}</span>
                                                ${(typeof Badges !== 'undefined') ? Badges.renderBadgePillsHtml(pid, false) : ''}
                                            </div>
                                            ${isAdmin ? (player && player.mobile ? `
                                                <a class="squad-admin-phone" href="tel:${escapeHtml(player.mobile)}" title="Call ${escapeHtml(playerName)}">
                                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
                                                    <span>${escapeHtml(formatPhone(player.mobile))}</span>
                                                </a>` : '<span class="squad-no-phone">No phone</span>') : ''}
                                            ${player && player.isGuest ? '<span class="squad-guest-tag">Added by Admin</span>' : ''}
                                        </div>
                                    </div>
                                    <div class="squad-player-right">
                                        ${isMe ? '<span class="squad-you">You</span>' : ''}
                                        ${isAdmin ? `
                                            <div class="squad-admin-tools">
                                                <button class="squad-order-btn" title="Move Up in Queue" ${idx === 0 ? 'disabled' : ''}
                                                        onclick="App.handleReorderPlayer('${match.id}', 'waiting', ${idx}, 'up')">
                                                    ▲
                                                </button>
                                                <button class="squad-order-btn" title="Move Down in Queue" ${idx === match.waiting.length - 1 ? 'disabled' : ''}
                                                        onclick="App.handleReorderPlayer('${match.id}', 'waiting', ${idx}, 'down')">
                                                    ▼
                                                </button>
                                                <button class="squad-transfer-btn in" title="Promote to Playing Squad"
                                                        onclick="App.handleTransferPlayer('${match.id}', '${pid}', 'playing')">
                                                    🏏 Play
                                                </button>
                                                <a class="squad-wa-btn" href="${getWhatsAppPlayerUrl(player, match, 'waiting')}" target="_blank" rel="noopener" title="Message ${escapeHtml(playerName)} on WhatsApp">
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                                </a>
                                                <button class="squad-remove-btn" title="Remove from waitlist"
                                                        onclick="App.handleAdminRemovePlayer('${match.id}', '${pid}')">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                                </button>
                                            </div>` : ''}
                                    </div>
                                </div>`;
                        }).join('') : '<p class="squad-empty-subtle">No players in the waiting queue.</p>'}
                    </div>
                </div>`
            : '';

        // Action button
        let actionHtml = '';
        if (match.locked) {
            actionHtml = '<button class="btn btn-locked btn-full" disabled>🔒 Squad is Locked</button>';
        } else if (playerStatus === 'playing' || playerStatus.startsWith('waiting')) {
            actionHtml = `<button class="btn btn-leave btn-full" id="detail-leave-btn">
                            Leave Squad
                          </button>`;
        } else if (match.playing.length < match.maxPlayers) {
            actionHtml = `<button class="btn btn-join btn-full" id="detail-join-btn">
                            I'm In! 🏏
                          </button>`;
        } else {
            actionHtml = `<button class="btn btn-waitlist btn-full" id="detail-join-btn">
                            Join Waiting List
                          </button>`;
        }

        // Google Maps link based solely on Turf name
        const mapsQuery = encodeURIComponent(match.turf);
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

        document.getElementById('detail-content').innerHTML = `
            <div class="detail-card">
                <div class="detail-info-grid">
                    <div class="detail-info-item">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="4" width="18" height="18" rx="2"/>
                            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                            <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        <div>
                            <span class="detail-label">Date</span>
                            <span class="detail-value">${dateStr}</span>
                        </div>
                    </div>
                    <div class="detail-info-item">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <div>
                            <span class="detail-label">Match Timing</span>
                            <span class="detail-value">${timeStr}</span>
                        </div>
                    </div>
                    <div class="detail-info-item">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                        </svg>
                        <div>
                            <span class="detail-label">Match Format</span>
                            <span class="detail-value format-gold">🏏 ${escapeHtml(match.format || 'Turf Match')}</span>
                        </div>
                    </div>
                    <div class="detail-info-item full-width">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                            <circle cx="12" cy="10" r="3"/>
                        </svg>
                        <div>
                            <span class="detail-label">Venue</span>
                            <span class="detail-value">${escapeHtml(match.turf)}</span>
                            <a href="${mapsUrl}" target="_blank" rel="noopener"
                               style="font-size:0.78rem; color:var(--gold); display:inline-flex; align-items:center; gap:4px; margin-top:4px;">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                                    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                                </svg>
                                Search "${escapeHtml(match.turf)}" on Google Maps
                            </a>
                        </div>
                    </div>
                </div>
            </div>



            ${(match.locked && !match.draft) ? `
                <div class="detail-card draft-launch-card">
                    <div class="draft-launch-inner">
                        <div class="draft-launch-icon">⚔️</div>
                        <div class="draft-launch-text">
                            <strong>Team Draft War Room</strong>
                            <span>Squad locked! Configure captains &amp; flip coin toss</span>
                        </div>
                        <button class="btn btn-sm btn-gold" onclick="Draft.openDraftRoom('${match.id}')">
                            ⚔️ Launch Draft
                        </button>
                    </div>
                </div>
            ` : ''}

            ${(typeof window.Draft !== 'undefined' && match.draft && Draft.renderMatchTeamsInDetails) ? Draft.renderMatchTeamsInDetails(match) : ''}

            <div class="detail-card">
                <div class="detail-squad-header">
                    <div class="squad-title-group">
                        <h3>Playing Squad</h3>
                        <span class="squad-status ${match.locked ? 'locked' : 'open'}">
                            ${match.locked ? '🔒 LOCKED' : 'OPEN'}
                        </span>
                    </div>
                    ${isAdmin ? `
                        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                            <button class="btn btn-xs ${match.locked ? 'btn-danger' : 'btn-outline'}"
                                    onclick="App.handleToggleLock('${match.id}')" title="${match.locked ? 'Unlock squad for joins/leaves' : 'Lock squad to launch draft'}">
                                ${match.locked ? '🔒 Locked' : '🔓 Open'}
                            </button>
                            <button class="btn btn-xs" style="background:rgba(37,211,102,0.15); border:1px solid rgba(37,211,102,0.4); color:#25d366; font-weight:700;"
                                    onclick="App.shareSquadWhatsApp('${match.id}')" title="Share squad list to WhatsApp group">
                                📲 Share Squad
                            </button>
                            <button class="btn btn-xs btn-outline-gold"
                                    onclick="App.openAddPlayerModal('${match.id}', 'playing')">
                                + Add Player
                            </button>
                        </div>` : ''}
                </div>
                <div class="squad-stats">
                    <div class="squad-stat">
                        <span class="stat-num green">${match.playing.length}</span>
                        <span class="stat-label">Playing</span>
                    </div>
                    <div class="squad-stat">
                        <span class="stat-num amber">${match.waiting.length}</span>
                        <span class="stat-label">Waiting</span>
                    </div>
                    <div class="squad-stat">
                        <span class="stat-num gray">${emptySlots}</span>
                        <span class="stat-label">Open</span>
                    </div>
                </div>
                <div class="squad-list">${playingHtml}</div>
            </div>

            ${waitingHtml}

            <div class="detail-actions">
                ${actionHtml}
            </div>`;

        // Bind detail action buttons
        const joinBtn = document.getElementById('detail-join-btn');
        if (joinBtn) {
            joinBtn.addEventListener('click', () => {
                joinMatch(matchId);
                renderMatchDetail(matchId);
            });
        }

        const leaveBtn = document.getElementById('detail-leave-btn');
        if (leaveBtn) {
            leaveBtn.addEventListener('click', () => {
                leaveMatch(matchId);
                renderMatchDetail(matchId);
            });
        }
    }

    /* ----------------------------------------------------------
       MATCH ACTIONS
    ---------------------------------------------------------- */
    async function joinMatch(matchId) {
        const user = Auth.getCurrentUser();
        if (!user) return;
        const result = (window.DB && DB.isLive())
            ? await DB.joinMatch(matchId, user.id)
            : Squad.joinMatch(matchId, user.id);
        showToast(result.message);
        renderMatchCards();
        renderTicker();
    }

    async function leaveMatch(matchId) {
        const user = Auth.getCurrentUser();
        if (!user) return;
        const result = (window.DB && DB.isLive())
            ? await DB.leaveMatch(matchId, user.id)
            : Squad.leaveMatch(matchId, user.id);
        showToast(result.message);

        // Show promotion notification with WhatsApp link if someone was promoted
        if (result.promoted) {
            const match = Matches.getById(matchId);
            const promoted = Auth.getPlayerById(result.promoted);
            if (promoted && match) {
                showPromotionNotification(promoted, match);
            }
        }

        renderMatchCards();
        renderTicker();
    }

    function showMatchDetail(matchId) {
        showScreen('match-detail', { matchId });
    }

    async function handleToggleLock(matchId) {
        const match = (window.DB && DB.isLive())
            ? await DB.toggleLock(matchId)
            : Squad.toggleLock(matchId);
        if (match) {
            showToast(match.locked ? 'Squad locked 🔒' : 'Squad unlocked 🔓');
            renderMatchDetail(matchId);
            renderMatchCards();
            renderTicker();
        }
    }

    /* ----------------------------------------------------------
       UTILITIES & HELPERS
    ---------------------------------------------------------- */
    /** Format 24h time string to 12h AM/PM */
    function formatTime(timeStr) {
        if (!timeStr) return '';
        if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;
        const parts = timeStr.split(':');
        if (parts.length < 2) return timeStr;
        const h = parseInt(parts[0], 10);
        if (isNaN(h)) return timeStr;
        const m = parts[1];
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${m} ${ampm}`;
    }

    /** Format start and end time range nicely */
    function formatTimeRange(startTime, endTime) {
        if (!startTime && !endTime) return '';
        if (startTime && endTime) {
            return `${formatTime(startTime)} – ${formatTime(endTime)}`;
        }
        return formatTime(startTime || endTime);
    }

    /** Extract 2-letter player initials for avatar badges */
    function getInitials(name) {
        if (!name) return '🏏';
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    /** Format 10-digit mobile number cleanly: '98765 43210' */
    function formatPhone(mobile) {
        if (!mobile) return '';
        const clean = String(mobile).replace(/\D/g, '');
        if (clean.length === 10) {
            return clean.slice(0, 5) + ' ' + clean.slice(5);
        }
        return String(mobile).trim();
    }

    /** Basic HTML escaping */
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/'/g, '&#39;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /** Convert Date object to YYYY-MM-DD string (local timezone) */
    function toDateString(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /* ----------------------------------------------------------
       ADMIN SQUAD ACTIONS (MANUAL ADD / REMOVE)
    ---------------------------------------------------------- */
    function handleAdminRemovePlayer(matchId, playerId) {
        const player = Auth.getPlayerById(playerId);
        const playerName = player ? player.name : 'this player';
        showConfirm(
            'Remove Player',
            `Remove "${playerName}" from this match? If in playing squad, waitlist will auto-promote.`,
            '👤',
            async () => {
                const result = (window.DB && DB.isLive())
                    ? await DB.removePlayer(matchId, playerId)
                    : Squad.removePlayer(matchId, playerId);
                if (result.success) {
                    showToast(`Removed ${playerName}`);
                    if (result.promoted) {
                        const match = Matches.getById(matchId);
                        const promoted = Auth.getPlayerById(result.promoted);
                        if (promoted && match) {
                            showPromotionNotification(promoted, match);
                        }
                    }
                    renderMatchDetail(matchId);
                    renderMatchCards();
                    renderTicker();
                } else {
                    showToast(result.message || 'Failed to remove player');
                }
            }
        );
    }

    function openAddPlayerModal(matchId, target = 'playing') {
        const modal = document.getElementById('admin-add-player-modal');
        if (!modal) return;

        document.getElementById('add-player-match-id').value = matchId;
        document.getElementById('add-player-target-select').value = target;
        document.getElementById('add-player-modal-title').textContent =
            target === 'waiting' ? 'Add to Waiting List' : 'Add to Playing Squad';
        document.getElementById('add-player-modal-desc').textContent =
            target === 'waiting'
                ? 'Manually queue a player into the waiting list'
                : 'Directly add a player into the playing squad';

        document.getElementById('admin-add-player-form').reset();
        document.getElementById('add-player-match-id').value = matchId;
        document.getElementById('add-player-target-select').value = target;

        modal.style.display = 'flex';
        document.getElementById('add-player-name').focus();
    }

    function closeAddPlayerModal() {
        const modal = document.getElementById('admin-add-player-modal');
        if (modal) {
            modal.style.display = 'none';
            document.getElementById('admin-add-player-form').reset();
        }
    }

    function handleReorderPlayer(matchId, listType, index, direction) {
        const result = Squad.reorderPlayer(matchId, listType, index, direction);
        if (result.success) {
            renderMatchDetail(matchId);
            renderMatchCards();
            renderTicker();
        } else if (result.message) {
            showToast(result.message);
        }
    }

    function handleTransferPlayer(matchId, playerId, targetList) {
        const result = Squad.transferPlayerList(matchId, playerId, targetList);
        if (result.success) {
            showToast(result.message);
            renderMatchDetail(matchId);
            renderMatchCards();
            renderTicker();
        } else if (result.message) {
            showToast(result.message);
        }
    }

    /* ----------------------------------------------------------
       TOAST
    ---------------------------------------------------------- */
    let toastTimer = null;

    function showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
    }

    /* ----------------------------------------------------------
       PROMOTION NOTIFICATION (WhatsApp)
    ---------------------------------------------------------- */
    let promotionTimer = null;

    function showPromotionNotification(player, match) {
        const banner = document.getElementById('promotion-banner');
        const nameEl = document.getElementById('promotion-player-name');
        const linkEl = document.getElementById('promotion-whatsapp-link');

        nameEl.textContent = player.name;

        // Build WhatsApp message to the promoted player
        const dateObj = new Date(match.date + 'T00:00:00');
        const dateStr = dateObj.toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric'
        });
        const timeStr = formatTimeRange(match.startTime || match.time, match.endTime);
        const msg = [
            `🏏 Hey ${player.name}!`,
            '',
            `Great news — you've been moved from the *waitlist* to the *playing squad*!`,
            '',
            `📅 ${dateStr} (${timeStr})`,
            `🏏 Format: ${match.format || 'Turf Match'}`,
            `📍 Turf: ${match.turf}`,
            '',
            `See you on the turf! 🎉`,
            '— Challengers Cricket Club'
        ].join('\n');

        // Use wa.me/<number> to message the player directly
        const phone = player.mobile ? player.mobile.replace(/\D/g, '') : '';
        const finalPhone = phone.length === 10 ? '91' + phone : phone;
        const waUrl = finalPhone
            ? `https://wa.me/${finalPhone}?text=${encodeURIComponent(msg)}`
            : `https://wa.me/?text=${encodeURIComponent(msg)}`;

        linkEl.href = waUrl;

        // Show banner
        banner.style.display = 'flex';
        requestAnimationFrame(() => banner.classList.add('show'));

        // Auto-dismiss after 10 seconds
        clearTimeout(promotionTimer);
        promotionTimer = setTimeout(() => hidePromotionNotification(), 10000);
    }

    function hidePromotionNotification() {
        const banner = document.getElementById('promotion-banner');
        banner.classList.remove('show');
        clearTimeout(promotionTimer);
        setTimeout(() => { banner.style.display = 'none'; }, 350);
    }

    /**
     * Checks if current user was promoted from waitlist to playing squad
     * (e.g. while offline or via realtime sync) and shows a celebration modal.
     */
    function checkAndNotifyPersonalPromotion() {
        const user = Auth.getCurrentUser();
        if (!user) return;

        const matches = Matches.getUpcoming();
        const storageKey = `ccc_user_status_${user.id}`;
        let previousStatusMap = {};
        try {
            previousStatusMap = JSON.parse(localStorage.getItem(storageKey) || '{}');
        } catch (e) {
            previousStatusMap = {};
        }

        const newStatusMap = {};
        matches.forEach(match => {
            const currentStatus = Squad.getPlayerStatus(match.id, user.id);
            newStatusMap[match.id] = currentStatus;

            const prevStatus = previousStatusMap[match.id];
            // If user was previously in waitlist and is now in playing squad:
            if (prevStatus && prevStatus.startsWith('waiting') && currentStatus === 'playing') {
                const dateObj = new Date(match.date + 'T00:00:00');
                const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                showConfirm(
                    '🎉 You are in the Playing Squad!',
                    `A spot opened up and you were auto-promoted from the waitlist for the match on ${dateStr} at ${match.turf} (${match.format || 'Turf Match'})!`,
                    '🏏',
                    () => {
                        showMatchDetail(match.id);
                    }
                );
            }
        });

        localStorage.setItem(storageKey, JSON.stringify(newStatusMap));
    }

    /* ----------------------------------------------------------
       WHATSAPP HELPERS
    ---------------------------------------------------------- */
    function getWhatsAppPlayerUrl(player, match, status) {
        if (!player) return '#';
        const phone = player.mobile ? player.mobile.replace(/\D/g, '') : '';
        const finalPhone = phone.length === 10 ? '91' + phone : phone;
        const dateObj = new Date(match.date + 'T00:00:00');
        const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const timeStr = formatTimeRange(match.startTime || match.time, match.endTime);

        let msg = '';
        if (status === 'waiting') {
            const queuePos = match.waiting.indexOf(player.id) + 1;
            msg = [
                `🏏 Hey ${player.name}!`,
                '',
                `Update from Challengers Cricket Club regarding the upcoming match:`,
                `📅 ${dateStr} (${timeStr})`,
                `🏏 Format: ${match.format || 'Turf Match'}`,
                `📍 Turf: ${match.turf}`,
                `⏳ Status: #${queuePos || 1} on the Waiting List`,
                '',
                `We will notify you immediately as soon as a playing spot opens up! 🎉`
            ].join('\n');
        } else {
            msg = [
                `🏏 Hey ${player.name}!`,
                '',
                `Reminder for our upcoming match:`,
                `📅 ${dateStr} (${timeStr})`,
                `🏏 Format: ${match.format || 'Turf Match'}`,
                `📍 Turf: ${match.turf}`,
                `🟢 Status: Playing Squad Confirmed`,
                '',
                `See you on the turf! 🏆`,
                '— Challengers Cricket Club'
            ].join('\n');
        }

        return finalPhone
            ? `https://wa.me/${finalPhone}?text=${encodeURIComponent(msg)}`
            : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    }

    async function shareSquadWhatsApp(matchId) {
        const match = Matches.getById(matchId);
        if (!match) return;

        const dateObj = new Date(match.date + 'T00:00:00');
        const dateStr = !isNaN(dateObj.getTime())
            ? dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            : match.date;
        const timeStr = formatTimeRange(match.startTime || match.time, match.endTime);

        const playingLines = match.playing.map((pid, idx) => {
            const p = Auth.getPlayerById(pid);
            return `${idx + 1}. ${p ? p.name : 'Player'}`;
        });

        const waitingLines = match.waiting.map((pid, idx) => {
            const p = Auth.getPlayerById(pid);
            return `${idx + 1}. ${p ? p.name : 'Player'}`;
        });

        const lines = [
            `🏏 *CHALLENGERS CRICKET CLUB* 🏏`,
            `📅 *Date:* ${dateStr}`,
            `🕒 *Timing:* ${timeStr}`,
            `🏏 *Format:* ${match.format || 'Turf Match'}`,
            `📍 *Venue:* ${match.turf}`,
            '',
            `🟢 *PLAYING SQUAD (${match.playing.length}/${match.maxPlayers}):*`,
            playingLines.length > 0 ? playingLines.join('\n') : '(No players yet)',
            ''
        ];

        if (waitingLines.length > 0) {
            lines.push(`⏳ *WAITING LIST (${match.waiting.length}):*`);
            lines.push(waitingLines.join('\n'));
            lines.push('');
        }

        const msg = lines.join('\n');

        // 1. Silent clipboard backup
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(msg);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = msg;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
        } catch (e) {
            console.warn('Clipboard backup copy failed:', e);
        }

        // 2. Open WhatsApp with auto-generated message
        const encoded = encodeURIComponent(msg);
        const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');

        showToast('📲 WhatsApp opened! Select your group & tap Send 🏏');

        if (isMobile) {
            window.location.href = `whatsapp://send?text=${encoded}`;
        } else {
            window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank', 'noopener,noreferrer');
        }
    }

    /* ----------------------------------------------------------
       CONFIRM MODAL
    ---------------------------------------------------------- */
    function showConfirm(title, text, icon, callback) {
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-text').textContent = text;
        document.getElementById('confirm-icon').textContent = icon || '⚠️';
        document.getElementById('confirm-modal').style.display = 'flex';
        _confirmCallback = callback;
    }

    /* ----------------------------------------------------------
       EVENT BINDING
    ---------------------------------------------------------- */
    function bindEvents() {

        /* --- Login --- */
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('login-name').value.trim();
            const mobile = document.getElementById('login-mobile').value.trim();

            if (!name) { showToast('Please enter your name'); return; }
            
            const cleanMobile = (typeof Auth !== 'undefined' && Auth.normalizePhone)
                ? Auth.normalizePhone(mobile)
                : mobile.replace(/\D/g, '').slice(-10);

            if (!/^\d{10}$/.test(cleanMobile)) {
                showToast('Enter a valid 10-digit mobile number');
                return;
            }

            const user = Auth.login(name, cleanMobile);
            showScreen('home');
            showToast(`Welcome, ${user.name}! 🏏`);
        });

        /* --- Logout --- */
        document.getElementById('logout-btn').addEventListener('click', () => {
            Auth.logout();
            showScreen('login');
            document.getElementById('login-form').reset();
            showToast('Signed out');
        });

        /* --- Admin access (login screen) --- */
        document.getElementById('admin-access-btn').addEventListener('click', () => {
            document.getElementById('admin-modal').style.display = 'flex';
            document.getElementById('admin-passcode').focus();
        });

        /* --- Admin modal cancel --- */
        document.getElementById('admin-modal-cancel').addEventListener('click', () => {
            document.getElementById('admin-modal').style.display = 'none';
            document.getElementById('admin-login-form').reset();
        });

        /* --- Admin modal overlay click --- */
        document.getElementById('admin-modal').addEventListener('click', (e) => {
            if (e.target.id === 'admin-modal') {
                document.getElementById('admin-modal').style.display = 'none';
                document.getElementById('admin-login-form').reset();
            }
        });

        /* --- Admin passcode submit --- */
        document.getElementById('admin-login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const code = document.getElementById('admin-passcode').value;

            if (Auth.verifyAdminPasscode(code)) {
                document.getElementById('admin-modal').style.display = 'none';
                document.getElementById('admin-login-form').reset();

                // If user is already logged in, grant admin directly
                const user = Auth.getCurrentUser();
                if (user) {
                    Auth.grantAdmin();
                    showScreen('home');
                    showToast('Admin access granted! 🛡️');
                } else {
                    // Set pending admin for next login
                    Auth.setPendingAdmin();
                    showToast('Admin mode active — please sign in');
                }
            } else {
                showToast('Invalid passcode ❌');
                document.getElementById('admin-passcode').value = '';
                document.getElementById('admin-passcode').focus();
            }
        });

        /* --- Admin panel button (top bar) --- */
        document.getElementById('admin-panel-btn').addEventListener('click', () => {
            showScreen('admin');
        });

        /* --- Admin FAB --- */
        document.getElementById('admin-fab').addEventListener('click', () => {
            showScreen('admin');
        });

        /* --- Admin back --- */
        document.getElementById('admin-back-btn').addEventListener('click', () => {
            showScreen('home');
        });

        /* --- Create match form --- */
        document.getElementById('create-match-form').addEventListener('submit', (e) => {
            Admin.handleCreateMatch(e);
        });

        /* --- Detail back --- */
        document.getElementById('detail-back-btn').addEventListener('click', () => {
            showScreen('home');
        });

        /* --- Draft back --- */
        const draftBackBtn = document.getElementById('draft-back-btn');
        if (draftBackBtn) {
            draftBackBtn.addEventListener('click', () => {
                if (currentMatchId) {
                    showScreen('match-detail', { matchId: currentMatchId });
                } else {
                    showScreen('home');
                }
            });
        }

        /* --- Date strip navigation --- */
        document.getElementById('date-prev').addEventListener('click', () => {
            weekOffset--;
            selectedDate = null;
            document.getElementById('section-heading').textContent = 'Upcoming Matches';
            renderDateStrip();
            renderMatchCards();
        });

        document.getElementById('date-next').addEventListener('click', () => {
            weekOffset++;
            selectedDate = null;
            document.getElementById('section-heading').textContent = 'Upcoming Matches';
            renderDateStrip();
            renderMatchCards();
        });

        /* --- Date strip item clicks (delegated) --- */
        document.getElementById('date-strip').addEventListener('click', (e) => {
            const item = e.target.closest('.date-item');
            if (item) {
                selectDate(item.dataset.date);
            }
        });

        /* --- Match card clicks (delegated) --- */
        document.getElementById('match-list').addEventListener('click', (e) => {
            // Check if an action button was clicked
            const actionBtn = e.target.closest('[data-action]');
            if (actionBtn) {
                e.stopPropagation();
                const matchId = actionBtn.dataset.matchId;
                const action = actionBtn.dataset.action;
                if (action === 'join') joinMatch(matchId);
                else if (action === 'leave') leaveMatch(matchId);
                return;
            }

            // Otherwise, open match detail
            const card = e.target.closest('.match-card');
            if (card) {
                showMatchDetail(card.dataset.matchId);
            }
        });

        /* --- Confirm modal --- */
        document.getElementById('confirm-ok').addEventListener('click', () => {
            document.getElementById('confirm-modal').style.display = 'none';
            if (_confirmCallback) {
                _confirmCallback();
                _confirmCallback = null;
            }
        });

        document.getElementById('confirm-cancel').addEventListener('click', () => {
            document.getElementById('confirm-modal').style.display = 'none';
            _confirmCallback = null;
        });

        document.getElementById('confirm-modal').addEventListener('click', (e) => {
            if (e.target.id === 'confirm-modal') {
                document.getElementById('confirm-modal').style.display = 'none';
                _confirmCallback = null;
            }
        });

        /* --- Admin Add Player modal events --- */
        const addPlayerForm = document.getElementById('admin-add-player-form');
        if (addPlayerForm) {
            addPlayerForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const matchId = document.getElementById('add-player-match-id').value;
                const name = document.getElementById('add-player-name').value.trim();
                const mobile = document.getElementById('add-player-mobile').value.trim();
                const target = document.getElementById('add-player-target-select').value;

                if (!name) {
                    showToast('Please enter player name');
                    return;
                }

                let cleanMobile = '';
                if (mobile) {
                    cleanMobile = (typeof Auth !== 'undefined' && Auth.normalizePhone)
                        ? Auth.normalizePhone(mobile)
                        : mobile.replace(/\D/g, '').slice(-10);
                    if (!/^\d{10}$/.test(cleanMobile)) {
                        showToast('Mobile number must be 10 digits if provided');
                        return;
                    }
                }

                const result = (window.DB && DB.isLive())
                    ? await DB.adminAddPlayer(matchId, { name, mobile: cleanMobile, target })
                    : Squad.adminAddPlayer(matchId, { name, mobile: cleanMobile, target });
                if (result.success) {
                    showToast(result.message);
                    closeAddPlayerModal();
                    renderMatchDetail(matchId);
                    renderMatchCards();
                    renderTicker();
                } else {
                    showToast(result.message || 'Could not add player');
                }
            });
        }

        const cancelAddPlayerBtn = document.getElementById('admin-add-player-cancel');
        if (cancelAddPlayerBtn) {
            cancelAddPlayerBtn.addEventListener('click', closeAddPlayerModal);
        }

        const addPlayerModal = document.getElementById('admin-add-player-modal');
        if (addPlayerModal) {
            addPlayerModal.addEventListener('click', (e) => {
                if (e.target.id === 'admin-add-player-modal') {
                    closeAddPlayerModal();
                }
            });
        }

        /* --- Admin Edit Match modal events --- */
        const editMatchForm = document.getElementById('admin-edit-match-form');
        if (editMatchForm) {
            editMatchForm.addEventListener('submit', (e) => {
                Admin.handleEditMatch(e);
            });
        }

        const cancelEditMatchBtn = document.getElementById('admin-edit-match-cancel');
        if (cancelEditMatchBtn) {
            cancelEditMatchBtn.addEventListener('click', () => {
                Admin.closeEditModal();
            });
        }

        const editMatchModal = document.getElementById('admin-edit-match-modal');
        if (editMatchModal) {
            editMatchModal.addEventListener('click', (e) => {
                if (e.target.id === 'admin-edit-match-modal') {
                    Admin.closeEditModal();
                }
            });
        }

        /* --- Promotion banner dismiss --- */
        document.getElementById('promotion-dismiss').addEventListener('click', () => {
            hidePromotionNotification();
        });
    }

    /* ----------------------------------------------------------
       PUBLIC API
    ---------------------------------------------------------- */
    return {
        init,
        showScreen,
        renderHome,
        renderMatchDetail,
        selectDate,
        joinMatch,
        leaveMatch,
        showMatchDetail,
        showToast,
        showConfirm,
        renderMatchCards,
        renderTicker,
        renderDateStrip,
        formatTime,
        formatTimeRange,
        formatPhone,
        getInitials,
        escapeHtml,
        openAddPlayerModal,
        closeAddPlayerModal,
        handleAdminRemovePlayer,
        checkAndNotifyPersonalPromotion,
        getWhatsAppPlayerUrl,
        shareSquadWhatsApp,
        handleToggleLock,
        handleReorderPlayer,
        handleTransferPlayer,
        toDateString
    };
})();

// Export globally to window
if (typeof window !== 'undefined') {
    window.App = App;
}

/* --- Boot --- */
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', App.init);
}
