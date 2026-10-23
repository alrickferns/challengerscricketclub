/* ============================================================
   DRAFT MODULE — Team Draft War Room, Coin Toss, Spin Wheel,
                  Snake Draft, Live Audio FX, Particle Confetti,
                  Roster Editing, Redraw & WhatsApp Exporter
   ============================================================ */
const Draft = (() => {
    // Default team themes (colors & badges)
    const DEFAULT_TEAM_THEMES = [
        { name: 'CCC Titans', color: '#f1c40f', bg: 'rgba(241, 196, 15, 0.12)', border: 'rgba(241, 196, 15, 0.45)', icon: '🟡' },
        { name: 'CCC Warriors', color: '#2ecc71', bg: 'rgba(46, 204, 113, 0.12)', border: 'rgba(46, 204, 113, 0.45)', icon: '🟢' },
        { name: 'CCC Strikers', color: '#3498db', bg: 'rgba(52, 152, 219, 0.12)', border: 'rgba(52, 152, 219, 0.45)', icon: '🔵' },
        { name: 'CCC Kings', color: '#e74c3c', bg: 'rgba(231, 76, 60, 0.12)', border: 'rgba(231, 76, 60, 0.45)', icon: '🔴' },
        { name: 'CCC Royals', color: '#9b59b6', bg: 'rgba(155, 89, 182, 0.12)', border: 'rgba(155, 89, 182, 0.45)', icon: '🟣' }
    ];

    let currentMatchId = null;
    let wheelAnimationId = null;
    let poolSearchQuery = '';
    let turnTimerInterval = null;
    let turnSecondsRemaining = 60;
    let currentTrackingPickIndex = -1;

    /** Stop active turn timer */
    function stopTurnTimer() {
        if (turnTimerInterval) {
            clearInterval(turnTimerInterval);
            turnTimerInterval = null;
        }
    }

    /** Start 60s turn countdown with auto-pick fallback */
    function startTurnTimer(matchId, activeTeamId, expectedPickIndex) {
        stopTurnTimer();

        if (currentTrackingPickIndex !== expectedPickIndex) {
            currentTrackingPickIndex = expectedPickIndex;
            turnSecondsRemaining = 60;
        }

        const updateTimerDisplay = () => {
            const countEl = document.getElementById('turn-timer-countdown');
            const fillEl = document.getElementById('draft-timer-progress-fill');
            if (countEl) countEl.textContent = `${turnSecondsRemaining}s remaining`;
            if (fillEl) {
                const percent = Math.max(0, Math.round((turnSecondsRemaining / 60) * 100));
                fillEl.style.width = `${percent}%`;
                fillEl.className = 'draft-timer-progress ' + (turnSecondsRemaining > 20 ? 'green' : (turnSecondsRemaining > 10 ? 'yellow' : 'red'));
            }
        };

        updateTimerDisplay();

        turnTimerInterval = setInterval(() => {
            turnSecondsRemaining--;
            updateTimerDisplay();

            if (turnSecondsRemaining <= 0) {
                stopTurnTimer();

                const match = Matches.getById(matchId);
                if (match && match.draft && match.draft.status === 'in_progress' && match.draft.currentPickIndex === expectedPickIndex) {
                    const pool = match.draft.unpickedPool || [];
                    if (pool.length > 0) {
                        const fallbackPlayerId = pool[0];
                        const player = Auth.getPlayerById(fallbackPlayerId);
                        const curUser = Auth.getCurrentUser();
                        const activeTeam = getActiveTeam(match.draft);
                        const isMyTurn = activeTeam && activeTeam.captainId === (curUser ? curUser.id : '');
                        const isAdmin = Auth.isAdmin();

                        // Only the active captain or admin triggers the auto-pick execution
                        if (isMyTurn || isAdmin) {
                            if (typeof window.App !== 'undefined' && App.showToast) {
                                App.showToast(`⏰ Time expired! Auto-picked ${player ? player.name : 'player'} for ${activeTeam ? activeTeam.name : 'team'}`);
                            }
                            Draft.executePick(matchId, activeTeamId, fallbackPlayerId);
                        }
                    }
                }
            }
        }, 1000);
    }

    /**
     * Safe HTML escaping helper
     */
    function safeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/'/g, '&#39;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /* ----------------------------------------------------------
       WEB AUDIO SYNTHESIZER (Native Browser Sound FX Engine)
       Zero external bandwidth, zero latency, 100% reliable
    ---------------------------------------------------------- */
    const SoundFX = (() => {
        let audioCtx = null;
        let soundEnabled = true;

        try {
            soundEnabled = localStorage.getItem('ccc_draft_sound') !== 'false';
        } catch (e) {
            soundEnabled = true;
        }

        function getAudioContext() {
            if (!audioCtx && typeof window !== 'undefined') {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (AudioContextClass) {
                    audioCtx = new AudioContextClass();
                }
            }
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume().catch(() => {});
            }
            return audioCtx;
        }

        function isEnabled() {
            return soundEnabled;
        }

        function toggle() {
            soundEnabled = !soundEnabled;
            try {
                localStorage.setItem('ccc_draft_sound', String(soundEnabled));
            } catch (e) {}
            return soundEnabled;
        }

        /** Crisp metallic coin spin frequency */
        function playCoinFlip() {
            if (!soundEnabled) return;
            try {
                const ctx = getAudioContext();
                if (!ctx) return;
                const now = ctx.currentTime;

                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, now);
                osc.frequency.exponentialRampToValueAtTime(1760, now + 0.15);
                osc.frequency.exponentialRampToValueAtTime(880, now + 0.35);

                gain.gain.setValueAtTime(0.18, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.4);
            } catch (e) {}
        }

        /** Bell victory chime when toss settles */
        function playCoinLand() {
            if (!soundEnabled) return;
            try {
                const ctx = getAudioContext();
                if (!ctx) return;
                const now = ctx.currentTime;

                [1046.5, 1318.5, 1567.98].forEach((freq, idx) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(freq, now + idx * 0.04);
                    gain.gain.setValueAtTime(0.2, now + idx * 0.04);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.6);

                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(now + idx * 0.04);
                    osc.stop(now + idx * 0.04 + 0.6);
                });
            } catch (e) {}
        }

        /** Mechanical wheel tick as slice boundary passes */
        function playWheelTick() {
            if (!soundEnabled) return;
            try {
                const ctx = getAudioContext();
                if (!ctx) return;
                const now = ctx.currentTime;

                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(620, now);
                osc.frequency.exponentialRampToValueAtTime(220, now + 0.035);

                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.035);
            } catch (e) {}
        }

        /** Resonant stadium pick buzzer/chord */
        function playPick() {
            if (!soundEnabled) return;
            try {
                const ctx = getAudioContext();
                if (!ctx) return;
                const now = ctx.currentTime;

                [523.25, 659.25, 783.99].forEach((freq, idx) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, now + idx * 0.05);
                    gain.gain.setValueAtTime(0.22, now + idx * 0.05);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.45);

                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(now + idx * 0.05);
                    osc.stop(now + idx * 0.05 + 0.45);
                });
            } catch (e) {}
        }

        /** Multi-tone celebration arpeggio on completion */
        function playFanfare() {
            if (!soundEnabled) return;
            try {
                const ctx = getAudioContext();
                if (!ctx) return;
                const now = ctx.currentTime;

                const notes = [523.25, 659.25, 783.99, 1046.5];
                notes.forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(freq, now + i * 0.12);
                    gain.gain.setValueAtTime(0.25, now + i * 0.12);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + (i === 3 ? 0.9 : 0.4));

                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(now + i * 0.12);
                    osc.stop(now + i * 0.12 + (i === 3 ? 0.9 : 0.4));
                });
            } catch (e) {}
        }

        return {
            isEnabled,
            toggle,
            playCoinFlip,
            playCoinLand,
            playWheelTick,
            playPick,
            playFanfare
        };
    })();

    /* ----------------------------------------------------------
       CONFETTI PARTICLE SYSTEM (Canvas 60fps Explosion)
    ---------------------------------------------------------- */
    function launchConfetti() {
        const screenEl = document.getElementById('draft-screen');
        if (!screenEl || typeof window === 'undefined') return;

        let canvas = document.getElementById('draft-confetti-canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'draft-confetti-canvas';
            canvas.className = 'draft-confetti-canvas';
            screenEl.appendChild(canvas);
        }
        if (!canvas || typeof canvas.getContext !== 'function') return;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const colors = ['#f1c40f', '#2ecc71', '#3498db', '#e74c3c', '#9b59b6', '#ffffff', '#ffd700'];
        const particles = [];
        const count = 75;

        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * -canvas.height * 0.4,
                w: Math.random() * 9 + 4,
                h: Math.random() * 7 + 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                vx: (Math.random() - 0.5) * 4.5,
                vy: Math.random() * 4.5 + 3,
                angle: Math.random() * 360,
                vAngle: (Math.random() - 0.5) * 9,
                opacity: 1
            });
        }

        const startT = performance.now();
        function renderParticles(now) {
            const elapsed = now - startT;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.angle += p.vAngle;
                if (elapsed > 2400) {
                    p.opacity = Math.max(0, 1 - (elapsed - 2400) / 1100);
                }

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate((p.angle * Math.PI) / 180);
                ctx.globalAlpha = p.opacity;
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                ctx.restore();
            });

            if (elapsed < 3600) {
                requestAnimationFrame(renderParticles);
            } else {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                if (canvas.parentNode) {
                    canvas.parentNode.removeChild(canvas);
                }
            }
        }

        requestAnimationFrame(renderParticles);
    }

    /**
     * Compute sequential Round-Robin pick sequence:
     * Captain 1 -> Captain 2 -> Captain 3 -> Captain 1 -> Captain 2 -> Captain 3 ...
     * Each captain picks 1 player at a time in rotating sequence until all players are drafted.
     */
    function computeSnakeOrder(teamIds, totalPicksNeeded) {
        const order = [];
        const n = teamIds.length;
        if (n === 0 || totalPicksNeeded <= 0) return order;

        let pickCount = 0;
        while (pickCount < totalPicksNeeded) {
            for (let i = 0; i < n; i++) {
                if (pickCount < totalPicksNeeded) {
                    order.push(teamIds[i]);
                    pickCount++;
                } else {
                    break;
                }
            }
        }
        return order;
    }

    /**
     * Initialize Draft state
     * STRICT ENFORCEMENT: ONLY players in match.playing, NEVER match.waiting
     */
    function createInitialDraftState(matchId, numTeams, captainConfigs) {
        const match = Matches.getById(matchId);
        if (!match) throw new Error('Match not found');

        // Strictly exclude any waiting list players from playing squad
        const playingSquad = (Array.isArray(match.playing) ? match.playing : [])
            .filter(pid => !(match.waiting || []).includes(pid));
        const captainIds = captainConfigs.map(c => c.captainId);

        const teams = captainConfigs.map((cfg, idx) => {
            const defaultTheme = DEFAULT_TEAM_THEMES[idx] || DEFAULT_TEAM_THEMES[0];
            return {
                id: `team_${idx + 1}`,
                name: (cfg.name || defaultTheme.name).trim(),
                captainId: cfg.captainId,
                color: cfg.color || defaultTheme.color,
                bg: defaultTheme.bg,
                border: defaultTheme.border,
                icon: defaultTheme.icon,
                players: [cfg.captainId]
            };
        });

        const unpickedPool = playingSquad.filter(pid => !captainIds.includes(pid));

        return {
            status: 'toss', // 'toss' | 'in_progress' | 'completed'
            numTeams,
            teams,
            unpickedPool,
            tossWinnerId: null,
            tossType: numTeams === 2 ? 'coin' : 'wheel',
            tossOrder: [],
            pickOrder: [],
            currentPickIndex: 0,
            history: []
        };
    }

    /**
     * Record toss result
     */
    function recordToss(draft, winningTeamId, orderedTeamIds = null) {
        draft.tossWinnerId = winningTeamId;
        
        let teamOrder = [];
        if (Array.isArray(orderedTeamIds) && orderedTeamIds.length === draft.teams.length) {
            teamOrder = [...orderedTeamIds];
        } else {
            const otherTeams = draft.teams.map(t => t.id).filter(id => id !== winningTeamId);
            teamOrder = [winningTeamId, ...otherTeams];
        }

        draft.tossOrder = teamOrder;
        draft.pickOrder = computeSnakeOrder(teamOrder, draft.unpickedPool.length);
        draft.currentPickIndex = 0;
        draft.status = 'in_progress';
        return draft;
    }

    /**
     * Make a draft pick
     */
    function makePick(draft, teamId, playerId) {
        if (draft.status !== 'in_progress') {
            return { success: false, message: 'Draft is not active' };
        }

        const expectedTeamId = draft.pickOrder[draft.currentPickIndex];
        if (expectedTeamId !== teamId) {
            return { success: false, message: 'It is not this team’s turn to pick' };
        }

        const playerIdx = draft.unpickedPool.indexOf(playerId);
        if (playerIdx === -1) {
            return { success: false, message: 'Player is not available in the draft pool' };
        }

        const team = draft.teams.find(t => t.id === teamId);
        if (!team) {
            return { success: false, message: 'Team not found' };
        }

        draft.unpickedPool.splice(playerIdx, 1);
        team.players.push(playerId);

        draft.history.push({
            pickNumber: draft.currentPickIndex + 1,
            teamId,
            playerId,
            timestamp: new Date().toISOString()
        });

        draft.currentPickIndex++;

        if (draft.unpickedPool.length === 0 || draft.currentPickIndex >= draft.pickOrder.length) {
            draft.status = 'completed';
        }

        return { success: true, draft };
    }

    /**
     * Undo last draft pick (Admin or active captain)
     */
    function undoPick(draft) {
        if (!draft || !draft.history || draft.history.length === 0 || draft.currentPickIndex === 0) {
            return { success: false, message: 'No picks to undo' };
        }

        const lastPick = draft.history.pop();
        const team = draft.teams.find(t => t.id === lastPick.teamId);
        if (team) {
            team.players = team.players.filter(pid => pid !== lastPick.playerId);
        }

        if (!draft.unpickedPool.includes(lastPick.playerId)) {
            draft.unpickedPool.push(lastPick.playerId);
        }

        draft.currentPickIndex--;
        draft.status = 'in_progress';

        return { success: true, draft, undonePlayerId: lastPick.playerId };
    }

    /**
     * Check if user can pick
     */
    function canUserPick(draft, userId, isAdminUser) {
        if (isAdminUser) return true;
        if (!draft || draft.status !== 'in_progress') return false;

        const currentTeamId = draft.pickOrder[draft.currentPickIndex];
        const currentTeam = draft.teams.find(t => t.id === currentTeamId);
        return currentTeam && currentTeam.captainId === userId;
    }

    /**
     * Get active team
     */
    function getActiveTeam(draft) {
        if (!draft || draft.status !== 'in_progress') return null;
        const currentTeamId = draft.pickOrder[draft.currentPickIndex];
        return draft.teams.find(t => t.id === currentTeamId) || null;
    }

    /**
     * WhatsApp formatted message generator (Pristine, clean text with emojis, bold markdown, NO dead link preview)
     */
    function formatWhatsAppTeamsMessage(match, draft) {
        if (!match || !draft || !draft.teams) return '';

        const dateObj = new Date(match.date + 'T00:00:00');
        const dateStr = !isNaN(dateObj.getTime())
            ? dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
            : match.date;
        const timeStr = (typeof window !== 'undefined' && window.App && window.App.formatTimeRange)
            ? window.App.formatTimeRange(match.startTime || match.time, match.endTime)
            : `${match.startTime || match.time || ''} – ${match.endTime || ''}`;

        const isMulti = draft.teams.length > 2;
        const title = isMulti
            ? `🏆 *CHALLENGERS CRICKET CLUB — ${draft.teams.length}-TEAM SQUADS DECLARED!* 🏆`
            : `🏏 *CHALLENGERS CRICKET CLUB — MATCH DAY SQUADS!* 🏏`;

        let msg = `${title}\n\n`;
        msg += `📅 *Date:* ${dateStr}\n`;
        msg += `⏰ *Timing:* ${timeStr}\n`;
        msg += `🏟️ *Venue:* ${match.turf}\n`;
        if (match.format) msg += `🏏 *Format:* ${match.format}\n`;
        msg += `\n`;

        draft.teams.forEach((team, tIdx) => {
            const captainPlayer = Auth.getPlayerById(team.captainId);
            const capName = captainPlayer ? captainPlayer.name : 'Captain';
            const icon = team.icon || (tIdx === 0 ? '🟡' : tIdx === 1 ? '🟢' : '🔵');

            msg += `${icon} *${team.name.toUpperCase()}* (Capt: *${capName}*) [${team.players.length} Players]:\n`;
            team.players.forEach((pid, pIdx) => {
                const p = Auth.getPlayerById(pid);
                const pName = p ? p.name : 'Player';
                const isCap = pid === team.captainId;
                msg += `  ${pIdx + 1}. ${pName}${isCap ? ' *(C)*' : ''}\n`;
            });
            msg += `\n`;
        });

        msg += `🪙 _Teams drafted via CCC Interactive War Room_`;

        return msg;
    }

    /**
     * 1-Tap Copy formatted squad message to clipboard for WhatsApp
     */
    async function copyWhatsAppSquadMessage(matchId) {
        const match = Matches.getById(matchId);
        if (!match || !match.draft) return;
        const msg = formatWhatsAppTeamsMessage(match, match.draft);

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
            if (typeof window !== 'undefined' && window.App && window.App.showToast) {
                App.showToast('📋 Squads copied! Paste directly into your WhatsApp group 🏏');
            }
        } catch (e) {
            console.warn('Clipboard copy error:', e);
            if (typeof window !== 'undefined' && window.App && window.App.showToast) {
                App.showToast('Could not auto-copy. Please use Send to WhatsApp button.');
            }
        }
    }

    /**
     * Auto-generate clean WhatsApp message, copy silently to clipboard as backup,
     * and auto-open WhatsApp so user only selects the group and clicks Send!
     */
    async function shareToWhatsAppGroup(matchId) {
        const match = Matches.getById(matchId);
        if (!match || !match.draft) return;
        const msg = formatWhatsAppTeamsMessage(match, match.draft);
        if (!msg) return;

        // 1. Silent clipboard backup copy
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

        // 2. Open WhatsApp with pre-filled message (Mobile native scheme or WhatsApp Web/Desktop)
        const encoded = encodeURIComponent(msg);
        const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');

        if (typeof window !== 'undefined' && window.App && window.App.showToast) {
            App.showToast('📲 WhatsApp opened! Select your group & tap Send 🏏');
        }

        if (isMobile) {
            window.location.href = `whatsapp://send?text=${encoded}`;
        } else {
            window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank', 'noopener,noreferrer');
        }
    }

    /* ----------------------------------------------------------
       UI CONTROLLER & RENDERERS
    ---------------------------------------------------------- */

    /** Open Draft Room Screen */
    function openDraftRoom(matchId) {
        currentMatchId = matchId;
        const match = Matches.getById(matchId);
        if (!match) return;

        if (typeof window !== 'undefined' && window.App && window.App.showScreen) {
            window.App.showScreen('draft', { matchId });
        }
    }

    function getCurrentMatchId() {
        return currentMatchId;
    }

    /** Warning banner if Supabase table is missing draft JSONB column */
    function renderDatabaseWarningBanner() {
        if (typeof window !== 'undefined' && window.DB && DB.isDraftColumnMissing && DB.isDraftColumnMissing()) {
            return `
                <div class="draft-cloud-warning-box" style="background:rgba(239,68,68,0.14); border:1px solid rgba(239,68,68,0.45); border-radius:12px; padding:14px 16px; margin-bottom:18px; color:#fca5a5;">
                    <div style="font-weight:700; color:#ef4444; margin-bottom:6px; display:flex; align-items:center; gap:8px;">
                        <span style="font-size:1.1rem;">⚠️</span>
                        <span>Supabase Action Required: "draft" Column Missing</span>
                    </div>
                    <div style="font-size:0.85rem; color:#fee2e2; margin-bottom:10px; line-height:1.4;">
                        Captains on mobile devices cannot see the War Room or live toss because your Supabase table is missing the <code>draft</code> column. Run this single SQL command in your Supabase SQL Editor:
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <code style="background:rgba(0,0,0,0.55); padding:6px 10px; border-radius:6px; font-size:0.75rem; color:#ffd700; font-family:monospace; user-select:all; border:1px solid rgba(255,255,255,0.1);">ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS draft JSONB DEFAULT NULL;</code>
                        <button type="button" class="btn btn-xs btn-gold" onclick="navigator.clipboard.writeText('ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS draft JSONB DEFAULT NULL;'); App.showToast('SQL Copied to Clipboard! Run in Supabase SQL Editor 📋');">
                            📋 Copy SQL
                        </button>
                    </div>
                    <div style="font-size:0.72rem; color:#9ca3af; margin-top:6px;">
                        Open <a href="https://supabase.com/dashboard" target="_blank" rel="noopener" style="color:#6ee7b7; text-decoration:underline;">Supabase Dashboard ➔ SQL Editor</a>, paste &amp; click Run. Real-time war room sync will activate immediately.
                    </div>
                </div>`;
        }
        return '';
    }

    /** Update sound toggle icon in header */
    function updateSoundHeaderButton() {
        const soundIcon = document.getElementById('draft-sound-icon');
        if (soundIcon) {
            soundIcon.textContent = SoundFX.isEnabled() ? '🔊' : '🔇';
        }
    }

    /** Toggle sound handler */
    function toggleSound() {
        const state = SoundFX.toggle();
        updateSoundHeaderButton();
        if (typeof window !== 'undefined' && window.App && window.App.showToast) {
            App.showToast(state ? 'Draft Sound ON 🔊' : 'Draft Sound Muted 🔇');
        }
        return state;
    }

    function isSoundEnabled() {
        return SoundFX.isEnabled();
    }

    /** Main router for draft container inside #draft-screen */
    function renderDraftScreen(matchId) {
        currentMatchId = matchId;
        const match = Matches.getById(matchId);
        if (!match) return;

        const container = document.getElementById('draft-container');
        if (!container) return;

        updateSoundHeaderButton();

        // Set header subtitle
        const subTitle = document.getElementById('draft-match-subtitle');
        if (subTitle) {
            const dateObj = new Date(match.date + 'T00:00:00');
            const dateStr = !isNaN(dateObj.getTime())
                ? dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : match.date;
            subTitle.textContent = `${dateStr} · ${match.turf}`;
        }

        const draft = match.draft;

        if (!draft || draft.status !== 'in_progress') {
            stopTurnTimer();
        }

        if (!draft) {
            // Need setup
            renderSetupView(match, container);
        } else if (draft.status === 'toss') {
            // In toss phase
            renderTossView(match, draft, container);
        } else if (draft.status === 'in_progress') {
            // In War Room drafting
            renderWarRoomView(match, draft, container);
        } else if (draft.status === 'completed') {
            // Completed & ready to share / edit / redraw
            renderCompletedView(match, draft, container);
        }
    }

    /** 1. SETUP VIEW: Select Number of Teams & Captains (PLAYING SQUAD ONLY) */
    function renderSetupView(match, container) {
        const isAdmin = Auth.isAdmin();
        // Strictly exclude waiting list players
        const playingSquad = (Array.isArray(match.playing) ? match.playing : [])
            .filter(pid => !(match.waiting || []).includes(pid));

        if (playingSquad.length < 4) {
            container.innerHTML = `
                <div class="draft-empty-card">
                    <div class="draft-empty-icon">⚠️</div>
                    <h3>Need at least 4 confirmed players</h3>
                    <p>Add more players to the confirmed playing squad before launching the Team Draft Room.</p>
                    <button class="btn btn-primary" onclick="App.showMatchDetail('${match.id}')">Return to Match</button>
                </div>`;
            return;
        }

        if (!isAdmin) {
            container.innerHTML = `
                <div class="draft-empty-card">
                    <div class="draft-empty-icon">🔒</div>
                    <h3>Team Draft Not Started</h3>
                    <p>The match Admin will configure the captains and launch the draft shortly.</p>
                    <button class="btn btn-ghost" onclick="App.showMatchDetail('${match.id}')">Return to Match</button>
                </div>`;
            return;
        }

        const maxTeamsPossible = Math.min(5, Math.floor(playingSquad.length / 2));
        const defaultNumTeams = 2;

        let numTeamsButtonsHtml = '';
        for (let i = 2; i <= maxTeamsPossible; i++) {
            numTeamsButtonsHtml += `
                <button type="button" class="team-count-btn ${i === defaultNumTeams ? 'selected' : ''}" 
                        data-count="${i}" onclick="Draft.handleTeamCountChange(${i})">
                    ${i} Teams
                </button>`;
        }

        container.innerHTML = `
            ${renderDatabaseWarningBanner()}
            <div class="draft-setup-card">
                <div class="draft-setup-header">
                    <span class="draft-badge-pill">ADMIN SETUP</span>
                    <h2>Configure Team Draft</h2>
                    <p>Choose the number of teams and assign captains from the <strong>${playingSquad.length} confirmed playing squad players</strong> (waitlist is excluded).</p>
                </div>

                <div class="setup-group">
                    <label class="setup-label">Number of Teams</label>
                    <div class="team-count-group" id="team-count-group">
                        ${numTeamsButtonsHtml}
                    </div>
                </div>

                <div class="setup-group">
                    <label class="setup-label">Captains &amp; Team Details</label>
                    <div id="captains-setup-list" class="captains-setup-list">
                        <!-- Rendered by updateCaptainsInputs -->
                    </div>
                </div>

                <div class="draft-setup-actions">
                    <button type="button" class="btn btn-ghost" onclick="App.showMatchDetail('${match.id}')">Cancel</button>
                    <button type="button" class="btn btn-primary btn-lg" id="start-toss-btn" onclick="Draft.submitDraftSetup('${match.id}')">
                        <span>Proceed to Toss</span>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    </button>
                </div>
            </div>`;

        updateCaptainsInputs(match, defaultNumTeams);
    }

    /** Update captain input rows based on selected team count (PLAYING SQUAD ONLY) */
    function updateCaptainsInputs(match, count) {
        const listEl = document.getElementById('captains-setup-list');
        if (!listEl) return;

        // Strictly exclude waiting list players
        const playingSquad = (match.playing || [])
            .filter(pid => !(match.waiting || []).includes(pid))
            .map(pid => {
                const p = Auth.getPlayerById(pid);
                return { id: pid, name: p ? p.name : 'Unknown Player' };
            });

        let html = '';
        for (let i = 0; i < count; i++) {
            const theme = DEFAULT_TEAM_THEMES[i] || DEFAULT_TEAM_THEMES[0];
            const defaultCaptain = playingSquad[i] ? playingSquad[i].id : '';

            let optionsHtml = '<option value="">-- Select Captain --</option>';
            playingSquad.forEach((p) => {
                const selected = p.id === defaultCaptain ? 'selected' : '';
                optionsHtml += `<option value="${safeHtml(p.id)}" ${selected}>${safeHtml(p.name)}</option>`;
            });

            html += `
                <div class="captain-row-card" style="border-left: 4px solid ${theme.color};">
                    <div class="captain-row-head">
                        <span class="captain-team-tag" style="background:${theme.bg}; color:${theme.color}; border:1px solid ${theme.border};">
                            ${theme.icon} Team ${i + 1}
                        </span>
                        <input type="text" class="input-team-name" id="team-name-${i}" value="${safeHtml(theme.name)}" placeholder="Team Name">
                    </div>
                    <div class="captain-select-wrap">
                        <label>Captain:</label>
                        <select class="select-captain" id="captain-select-${i}" required>
                            ${optionsHtml}
                        </select>
                    </div>
                </div>`;
        }
        listEl.innerHTML = html;
    }

    function handleTeamCountChange(count) {
        document.querySelectorAll('.team-count-btn').forEach(btn => {
            btn.classList.toggle('selected', parseInt(btn.dataset.count, 10) === count);
        });
        const match = Matches.getById(currentMatchId);
        if (match) updateCaptainsInputs(match, count);
    }

    /** Submit setup and transition to Toss phase */
    async function submitDraftSetup(matchId) {
        const match = Matches.getById(matchId);
        if (!match) return;

        const activeCountBtn = document.querySelector('.team-count-btn.selected');
        const numTeams = activeCountBtn ? parseInt(activeCountBtn.dataset.count, 10) : 2;

        const captainConfigs = [];
        const selectedCaptainIds = new Set();

        for (let i = 0; i < numTeams; i++) {
            const nameInput = document.getElementById(`team-name-${i}`);
            const select = document.getElementById(`captain-select-${i}`);
            const name = nameInput ? nameInput.value.trim() : `Team ${i + 1}`;
            const captainId = select ? select.value : '';

            if (!captainId) {
                App.showToast(`Please select a captain for Team ${i + 1}`);
                return;
            }

            if (selectedCaptainIds.has(captainId)) {
                App.showToast(`Cannot select the same player as captain for multiple teams`);
                return;
            }

            selectedCaptainIds.add(captainId);
            const theme = DEFAULT_TEAM_THEMES[i] || DEFAULT_TEAM_THEMES[0];
            captainConfigs.push({
                captainId,
                name: name || theme.name,
                color: theme.color
            });
        }

        const draftState = createInitialDraftState(matchId, numTeams, captainConfigs);
        await DB.saveMatchDraft(matchId, draftState);
        renderDraftScreen(matchId);
    }

    /** 2. TOSS VIEW: 2 Teams (3D Coin Flip) or 3+ Teams (Spin the Wheel) */
    function renderTossView(match, draft, container) {
        const currentUser = Auth.getCurrentUser();
        const currentUserId = currentUser ? currentUser.id : '';
        const isAdmin = Auth.isAdmin();
        const isCaptain = draft.teams.some(t => t.captainId === currentUserId);
        const canTriggerToss = isAdmin || isCaptain;
        const myTeam = draft.teams.find(t => t.captainId === currentUserId);
        const isTwoTeams = draft.numTeams === 2;

        const team1 = draft.teams[0];
        const team2 = draft.teams[1];
        const cap1 = Auth.getPlayerById(team1.captainId);
        const cap2 = Auth.getPlayerById(team2.captainId);

        const roleBanner = isCaptain
            ? `<div class="toss-role-banner" style="background:rgba(201,168,76,0.14); border:1px solid rgba(201,168,76,0.35); border-radius:10px; padding:10px 14px; margin-bottom:14px; text-align:center; font-size:0.84rem; color:var(--gold-light);">
                 👑 <strong>Captain View:</strong> You lead <strong>${safeHtml(myTeam ? myTeam.name : 'your team')}</strong>! You can trigger the toss directly — no admin needed.
               </div>`
            : (isAdmin
                ? `<div class="toss-role-banner" style="background:rgba(52,152,219,0.14); border:1px solid rgba(52,152,219,0.35); border-radius:10px; padding:10px 14px; margin-bottom:14px; text-align:center; font-size:0.84rem; color:#93c5fd;">
                     🛡️ <strong>Admin View:</strong> Either captain can flip the coin directly on their phones, or you can flip it as admin.
                   </div>`
                : `<div class="toss-role-banner" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:10px 14px; margin-bottom:14px; text-align:center; font-size:0.84rem; color:var(--text-muted);">
                     👀 <strong>Spectator View:</strong> Watching live toss between captains ${safeHtml(cap1 ? cap1.name : 'Team 1')} and ${safeHtml(cap2 ? cap2.name : 'Team 2')}.
                   </div>`);

        let tossHtml = '';

        if (isTwoTeams) {
            // 2-TEAM 3D COIN FLIP WITH CCC LOGO
            tossHtml = `
                ${renderDatabaseWarningBanner()}
                <div class="toss-arena-card">
                    <div class="toss-arena-header">
                        <span class="draft-badge-pill">🪙 DIGITAL COIN TOSS</span>
                        <h2>The Toss for 1st Pick</h2>
                        <p>Flipping the official Challengers Cricket Club golden coin to decide who picks first.</p>
                    </div>

                    ${roleBanner}

                    <div class="toss-coin-stage">
                        <div class="ccc-coin" id="ccc-coin">
                            <div class="coin-face coin-front">
                                <img src="logo.png" alt="CCC" class="coin-logo-img">
                                <span class="coin-cap-label">${cap1 ? safeHtml(cap1.name.split(' ')[0]) : 'Team 1'}</span>
                                <span class="coin-sub">HEADS</span>
                            </div>
                            <div class="coin-face coin-back">
                                <img src="logo.png" alt="CCC" class="coin-logo-img">
                                <span class="coin-cap-label">${cap2 ? safeHtml(cap2.name.split(' ')[0]) : 'Team 2'}</span>
                                <span class="coin-sub">TAILS</span>
                            </div>
                        </div>
                    </div>

                    <div class="toss-teams-versus">
                        <div class="toss-team-chip" style="border-color:${team1.color};">
                            <span class="chip-color-dot" style="background:${team1.color};"></span>
                            <div>
                                <strong>${safeHtml(team1.name)}</strong>
                                <span>Heads (${cap1 ? safeHtml(cap1.name) : ''})</span>
                            </div>
                        </div>
                        <span class="vs-text">VS</span>
                        <div class="toss-team-chip" style="border-color:${team2.color};">
                            <span class="chip-color-dot" style="background:${team2.color};"></span>
                            <div>
                                <strong>${safeHtml(team2.name)}</strong>
                                <span>Tails (${cap2 ? safeHtml(cap2.name) : ''})</span>
                            </div>
                        </div>
                    </div>

                    <div id="toss-result-box" class="toss-result-box" style="display:none;"></div>

                    <div class="toss-actions">
                        ${canTriggerToss ? `
                            <button type="button" id="flip-coin-btn" class="btn btn-gold btn-lg" onclick="Draft.handleCoinFlip('${match.id}')">
                                <span>🪙 Flip CCC Coin</span>
                            </button>
                        ` : `
                            <p class="toss-waiting-text">Waiting for Captains (${safeHtml(cap1 ? cap1.name.split(' ')[0] : 'Cap 1')} or ${safeHtml(cap2 ? cap2.name.split(' ')[0] : 'Cap 2')}) to flip the CCC coin...</p>
                        `}
                        <button type="button" id="enter-war-room-btn" class="btn btn-primary btn-lg" style="display:none;" onclick="Draft.enterWarRoom('${match.id}')">
                            <span>Enter War Room ➔</span>
                        </button>
                    </div>
                </div>`;
        } else {
            // 3+ TEAMS: INTERACTIVE CCC SPIN THE WHEEL WITH CCC LOGO IN CENTER
            tossHtml = `
                ${renderDatabaseWarningBanner()}
                <div class="toss-arena-card">
                    <div class="toss-arena-header">
                        <span class="draft-badge-pill">🎡 TRI/MULTI-SERIES TOSS</span>
                        <h2>CCC Spin the Wheel</h2>
                        <p>Spinning the official CCC Fortune Wheel to determine the 1st pick for the ${draft.numTeams} captains!</p>
                    </div>

                    ${roleBanner}

                    <div class="wheel-stage-wrap">
                        <div class="wheel-pointer" id="wheel-pointer">▼</div>
                        <div class="wheel-canvas-container">
                            <canvas id="toss-wheel-canvas" width="300" height="300"></canvas>
                            <div class="wheel-center-hub">
                                <img src="logo.png" alt="CCC" class="wheel-center-logo">
                            </div>
                        </div>
                    </div>

                    <div class="wheel-captains-legend">
                        ${draft.teams.map((t) => {
                            const cap = Auth.getPlayerById(t.captainId);
                            return `
                                <div class="wheel-legend-item" style="border-color:${t.color}; background:${t.bg};">
                                    <span class="chip-color-dot" style="background:${t.color};"></span>
                                    <span>${safeHtml(t.name)} (<strong>${cap ? safeHtml(cap.name.split(' ')[0]) : 'Cap'}</strong>)</span>
                                </div>`;
                        }).join('')}
                    </div>

                    <div id="toss-result-box" class="toss-result-box" style="display:none;"></div>

                    <div class="toss-actions">
                        ${canTriggerToss ? `
                            <button type="button" id="spin-wheel-btn" class="btn btn-gold btn-lg" onclick="Draft.handleWheelSpin('${match.id}')">
                                <span>🎡 Spin the Wheel</span>
                            </button>
                        ` : `
                            <p class="toss-waiting-text">Waiting for Captains or Admin to spin the wheel...</p>
                        `}
                        <button type="button" id="enter-war-room-btn" class="btn btn-primary btn-lg" style="display:none;" onclick="Draft.enterWarRoom('${match.id}')">
                            <span>Enter War Room ➔</span>
                        </button>
                    </div>
                </div>`;
        }

        container.innerHTML = tossHtml;

        if (!isTwoTeams) {
            setTimeout(() => drawWheelCanvas(draft, 0), 50);
        }
    }

    /** Handle 3D Coin Flip with Sound */
    async function handleCoinFlip(matchId) {
        const match = Matches.getById(matchId);
        if (!match || !match.draft) return;

        const coinEl = document.getElementById('ccc-coin');
        const flipBtn = document.getElementById('flip-coin-btn');
        const resultBox = document.getElementById('toss-result-box');
        const enterBtn = document.getElementById('enter-war-room-btn');

        if (!coinEl || !flipBtn) return;
        flipBtn.disabled = true;

        SoundFX.playCoinFlip();
        setTimeout(() => SoundFX.playCoinFlip(), 1100);

        const isTeam1 = Math.random() < 0.5;
        const winningTeam = isTeam1 ? match.draft.teams[0] : match.draft.teams[1];
        const winningCap = Auth.getPlayerById(winningTeam.captainId);

        const finalDeg = isTeam1 ? 1800 : 1980;
        coinEl.style.transition = 'transform 2.5s cubic-bezier(0.2, 0.8, 0.3, 1)';
        coinEl.style.transform = `rotateY(${finalDeg}deg)`;

        setTimeout(async () => {
            SoundFX.playCoinLand();

            recordToss(match.draft, winningTeam.id);
            await DB.saveMatchDraft(matchId, match.draft);

            if (resultBox) {
                resultBox.style.display = 'block';
                resultBox.innerHTML = `
                    <div class="result-badge-winner" style="border-color:${winningTeam.color}; background:${winningTeam.bg};">
                        <span class="winner-trophy">🎉</span>
                        <div class="winner-text-wrap">
                            <span class="winner-label">TOSS WINNER:</span>
                            <strong style="color:${winningTeam.color};">${safeHtml(winningTeam.name)}</strong>
                            <p>👉 <strong>${winningCap ? safeHtml(winningCap.name) : 'Captain'}</strong> won the toss and has the <strong>1st Pick</strong> in Round 1!</p>
                        </div>
                    </div>`;
            }

            if (flipBtn) flipBtn.style.display = 'none';
            if (enterBtn) {
                enterBtn.style.display = 'inline-flex';
                let secsLeft = 3;
                enterBtn.innerHTML = `<span>Entering War Room in ${secsLeft}s ➔</span>`;
                const autoCountdownId = setInterval(() => {
                    secsLeft--;
                    if (secsLeft > 0) {
                        if (enterBtn) enterBtn.innerHTML = `<span>Entering War Room in ${secsLeft}s ➔</span>`;
                    } else {
                        clearInterval(autoCountdownId);
                        Draft.enterWarRoom(matchId);
                    }
                }, 1000);
            }
        }, 2600);
    }

    /** Draw SVG/Canvas wheel */
    function drawWheelCanvas(draft, rotationAngle = 0) {
        const canvas = document.getElementById('toss-wheel-canvas');
        if (!canvas || typeof canvas.getContext !== 'function') return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const numSlices = draft.teams.length;
        const sliceAngle = (2 * Math.PI) / numSlices;
        const radius = canvas.width / 2;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(radius, radius);
        ctx.rotate(rotationAngle);

        draft.teams.forEach((team, i) => {
            const angle = i * sliceAngle;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, radius - 4, angle, angle + sliceAngle);
            ctx.closePath();

            ctx.fillStyle = team.color;
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#0b1f14';
            ctx.stroke();

            ctx.save();
            ctx.rotate(angle + sliceAngle / 2);
            ctx.textAlign = 'right';
            ctx.fillStyle = '#0b1f14';
            ctx.font = 'bold 13px Inter, sans-serif';
            const cap = Auth.getPlayerById(team.captainId);
            const label = cap ? cap.name.split(' ')[0] : team.name;
            ctx.fillText(label, radius - 26, 5);
            ctx.restore();
        });

        ctx.restore();
    }

    /** Handle Wheel Spin Animation with ticking sound */
    async function handleWheelSpin(matchId) {
        const match = Matches.getById(matchId);
        if (!match || !match.draft) return;

        const spinBtn = document.getElementById('spin-wheel-btn');
        const resultBox = document.getElementById('toss-result-box');
        const enterBtn = document.getElementById('enter-war-room-btn');
        const pointerEl = document.getElementById('wheel-pointer');

        if (spinBtn) spinBtn.disabled = true;

        const numSlices = match.draft.teams.length;
        const sliceAngle = (2 * Math.PI) / numSlices;

        const winningIndex = Math.floor(Math.random() * numSlices);
        const winningTeam = match.draft.teams[winningIndex];
        const winningCap = Auth.getPlayerById(winningTeam.captainId);

        const targetNormalized = (3 * Math.PI / 2) - (winningIndex * sliceAngle + sliceAngle / 2);
        const fullSpins = 5 + Math.floor(Math.random() * 3);
        const totalRotation = (fullSpins * 2 * Math.PI) + targetNormalized;

        const startTime = performance.now();
        const duration = 3500;
        let lastSliceTick = -1;

        function animateWheel(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            const currentAngle = easeProgress * totalRotation;

            drawWheelCanvas(match.draft, currentAngle);

            const currentSlice = Math.floor((currentAngle % (2 * Math.PI)) / sliceAngle);
            if (currentSlice !== lastSliceTick) {
                lastSliceTick = currentSlice;
                SoundFX.playWheelTick();
                if (pointerEl) {
                    pointerEl.classList.remove('wobble');
                    void pointerEl.offsetWidth;
                    pointerEl.classList.add('wobble');
                }
            }

            if (progress < 1) {
                wheelAnimationId = requestAnimationFrame(animateWheel);
            } else {
                SoundFX.playCoinLand();

                recordToss(match.draft, winningTeam.id);
                DB.saveMatchDraft(matchId, match.draft);

                if (resultBox) {
                    resultBox.style.display = 'block';
                    resultBox.innerHTML = `
                        <div class="result-badge-winner" style="border-color:${winningTeam.color}; background:${winningTeam.bg};">
                            <span class="winner-trophy">🎉</span>
                            <div class="winner-text-wrap">
                                <span class="winner-label">WHEEL STOPPED ON:</span>
                                <strong style="color:${winningTeam.color};">${safeHtml(winningTeam.name)}</strong>
                                <p>👉 <strong>${winningCap ? safeHtml(winningCap.name) : 'Captain'}</strong> gets the <strong>1st Pick</strong> in Round 1!</p>
                            </div>
                        </div>`;
                }

                if (spinBtn) spinBtn.style.display = 'none';
                if (enterBtn) {
                    enterBtn.style.display = 'inline-flex';
                    let secsLeft = 3;
                    enterBtn.innerHTML = `<span>Entering War Room in ${secsLeft}s ➔</span>`;
                    const autoCountdownId = setInterval(() => {
                        secsLeft--;
                        if (secsLeft > 0) {
                            if (enterBtn) enterBtn.innerHTML = `<span>Entering War Room in ${secsLeft}s ➔</span>`;
                        } else {
                            clearInterval(autoCountdownId);
                            Draft.enterWarRoom(matchId);
                        }
                    }, 1000);
                }
            }
        }

        wheelAnimationId = requestAnimationFrame(animateWheel);
    }

    /** Transition from Toss to War Room */
    function enterWarRoom(matchId) {
        renderDraftScreen(matchId);
    }

    /** 3. DRAFT WAR ROOM VIEW (With Live Filters, Audio, Ticker, Undo & Captain Roles) */
    function renderWarRoomView(match, draft, container) {
        const currentUser = Auth.getCurrentUser();
        const isAdmin = Auth.isAdmin();
        const currentUserId = currentUser ? currentUser.id : '';

        // STRICT ENFORCEMENT: Filter out any waiting list players from unpicked pool
        const confirmedPlaying = (Array.isArray(match.playing) ? match.playing : [])
            .filter(pid => !(match.waiting || []).includes(pid));
        draft.unpickedPool = draft.unpickedPool.filter(pid => confirmedPlaying.includes(pid));

        const activeTeam = getActiveTeam(draft);
        const activeCap = activeTeam ? Auth.getPlayerById(activeTeam.captainId) : null;
        
        // Captaincy & Turn Checking
        const isCaptainOfActiveTeam = activeTeam && activeTeam.captainId === currentUserId;
        const myCaptainedTeam = draft.teams.find(t => t.captainId === currentUserId);
        const isUserTurn = isCaptainOfActiveTeam;
        const canPickNow = isUserTurn || isAdmin;

        const roundNum = Math.floor(draft.currentPickIndex / draft.teams.length) + 1;
        const pickNum = draft.currentPickIndex + 1;
        const totalPicks = draft.pickOrder.length;

        // Header Carousel with Team Cards
        const teamsCarouselHtml = draft.teams.map((t) => {
            const isTurn = activeTeam && activeTeam.id === t.id;
            const cap = Auth.getPlayerById(t.captainId);
            const isMyTeam = t.captainId === currentUserId;
            return `
                <div class="war-team-card ${isTurn ? 'is-active-turn' : ''}" 
                     style="border-color:${isTurn ? t.color : t.border}; background:${t.bg};">
                    <div class="war-team-top">
                        <span class="war-team-icon">${t.icon || '🏏'}</span>
                        <strong class="war-team-name" style="color:${t.color};">${safeHtml(t.name)}</strong>
                        ${isTurn ? '<span class="turn-pulse-dot" style="background:' + t.color + ';"></span>' : ''}
                    </div>
                    <div class="war-team-meta">
                        <span class="war-cap-name">Capt: ${cap ? safeHtml(cap.name.split(' ')[0]) : 'Captain'}${isMyTeam ? ' (You)' : ''}</span>
                        <span class="war-count-pill">${t.players.length} selected</span>
                    </div>
                </div>`;
        }).join('');

        // Filter and Search available pool
        let visiblePool = [...draft.unpickedPool];
        if (poolSearchQuery) {
            const query = poolSearchQuery.toLowerCase();
            visiblePool = visiblePool.filter(pid => {
                const p = Auth.getPlayerById(pid);
                return p && p.name.toLowerCase().includes(query);
            });
        }

        // Available Pool Cards
        let poolHtml = '';
        if (visiblePool.length > 0) {
            poolHtml = visiblePool.map((pid, idx) => {
                const player = Auth.getPlayerById(pid);
                const pName = player ? player.name : 'Unknown Player';
                const initials = (typeof window !== 'undefined' && window.App && window.App.getInitials)
                    ? window.App.getInitials(pName)
                    : pName.substr(0, 2).toUpperCase();

                let pickBtnClass = 'btn-disabled';
                let pickBtnText = 'Wait Turn';

                if (isUserTurn) {
                    pickBtnClass = 'btn-active-pick';
                    pickBtnText = 'Select Player ➔';
                } else if (isAdmin) {
                    pickBtnClass = 'btn-proxy-pick';
                    pickBtnText = '🛡️ Select ➔';
                }

                return `
                    <div class="pool-player-card">
                        <div class="pool-player-left">
                            <span class="pool-player-idx">${idx + 1}</span>
                            <div class="player-avatar-badge">${initials}</div>
                            <div class="pool-player-info" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; min-width:0; flex:1;">
                                <span class="pool-player-name" onclick="Badges.openPassportModal('${safeHtml(pid)}', event)" style="cursor:pointer;" title="View Player Passport">${safeHtml(pName)}</span>
                                ${(typeof Badges !== 'undefined') ? Badges.renderBadgePillsHtml(pid, false) : ''}
                            </div>
                        </div>
                        <button type="button" class="btn btn-sm btn-draft-pick ${pickBtnClass}"
                                ${canPickNow ? '' : 'disabled'}
                                onclick="Draft.executePick('${match.id}', '${activeTeam ? activeTeam.id : ''}', '${safeHtml(pid)}')">
                            <span>${pickBtnText}</span>
                        </button>
                    </div>`;
            }).join('');
        } else if (draft.unpickedPool.length === 0) {
            poolHtml = '<p class="squad-empty">All players selected! Finalizing squads...</p>';
        } else {
            poolHtml = `<p class="squad-empty">No players matching "${safeHtml(poolSearchQuery)}".</p>`;
        }

        // Recent Pick Ticker & Undo Button
        let latestPickHtml = '';
        if (draft.history && draft.history.length > 0) {
            const last = draft.history[draft.history.length - 1];
            const lastTeam = draft.teams.find(t => t.id === last.teamId);
            const lastPlayer = Auth.getPlayerById(last.playerId);
            latestPickHtml = `
                <div class="war-latest-pick-bar">
                    <div class="latest-pick-left">
                        <span class="latest-pick-pill">LAST (#${last.pickNumber})</span>
                        <span class="latest-pick-text">
                            <strong>${lastTeam ? safeHtml(lastTeam.name) : 'Team'}</strong>: 
                            <span class="gold-text">${lastPlayer ? safeHtml(lastPlayer.name) : 'Player'}</span>
                        </span>
                    </div>
                    ${(isAdmin || isUserTurn) ? `
                        <button type="button" class="btn btn-xs btn-undo-pick" title="Undo last selection"
                                onclick="Draft.handleUndoPick('${match.id}')">
                            ↩️ Undo
                        </button>
                    ` : ''}
                </div>`;
        }

        // Spotlight messaging based on User role (Admin, Captain, Observer)
        let spotlightMessageHtml = '';
        if (isUserTurn) {
            spotlightMessageHtml = `
                <div class="spotlight-headline my-turn-text">🌟 YOUR TURN TO PICK!</div>
                <div class="spotlight-subtext">Choose any player below for <strong style="color:${activeTeam ? activeTeam.color : 'var(--gold-light)'};">${safeHtml(activeTeam.name)}</strong></div>`;
        } else if (isAdmin && myCaptainedTeam) {
            spotlightMessageHtml = `
                <div class="spotlight-headline">On the clock: <strong style="color:${activeTeam ? activeTeam.color : '#fff'};">${activeTeam ? safeHtml(activeTeam.name) : ''}</strong></div>
                <div class="spotlight-subtext">Waiting for <strong>${activeCap ? safeHtml(activeCap.name) : 'Captain'}</strong> to pick · You lead ${safeHtml(myCaptainedTeam.name)}</div>`;
        } else if (isAdmin) {
            spotlightMessageHtml = `
                <div class="spotlight-headline">On the clock: <strong style="color:${activeTeam ? activeTeam.color : '#fff'};">${activeTeam ? safeHtml(activeTeam.name) : ''}</strong></div>
                <div class="spotlight-subtext">Waiting for <strong>${activeCap ? safeHtml(activeCap.name) : 'Captain'}</strong> to pick (or use Admin Proxy)</div>`;
        } else {
            spotlightMessageHtml = `
                <div class="spotlight-headline">On the clock: <strong style="color:${activeTeam ? activeTeam.color : '#fff'};">${activeTeam ? safeHtml(activeTeam.name) : ''}</strong></div>
                <div class="spotlight-subtext">Waiting for ${activeCap ? safeHtml(activeCap.name) : 'Captain'} to pick...</div>`;
        }

        container.innerHTML = `
            ${renderDatabaseWarningBanner()}
            <div class="war-room-wrap">
                <!-- Top Teams Carousel -->
                <div class="war-teams-carousel">
                    ${teamsCarouselHtml}
                </div>

                <!-- Active Turn Spotlight Banner -->
                <div class="turn-spotlight-banner ${isUserTurn ? 'my-turn-glow' : ''}" 
                     style="border-color:${activeTeam ? activeTeam.color : 'var(--border-subtle)'};">
                    <div class="spotlight-top-row">
                        <div class="round-badge">R${roundNum} · Pick #${pickNum}</div>
                        ${isAdmin ? '<span class="admin-master-tag">🛡️ Master Override</span>' : '<span class="spotlight-order-tag">Round-Robin</span>'}
                    </div>
                    <div class="spotlight-body">
                        ${spotlightMessageHtml}
                    </div>
                </div>

                <!-- 60-Second Pick Countdown Timer -->
                <div class="draft-turn-timer-wrap">
                    <div class="draft-turn-timer-header">
                        <span>⏱️ Pick Clock: <strong>${activeCap ? safeHtml(activeCap.name.split(' ')[0]) : 'Captain'}</strong> (${safeHtml(activeTeam ? activeTeam.name : 'Team')})</span>
                        <span id="turn-timer-countdown">${turnSecondsRemaining}s remaining</span>
                    </div>
                    <div class="draft-timer-bar">
                        <div id="draft-timer-progress-fill" class="draft-timer-progress green" style="width: 100%;"></div>
                    </div>
                </div>

                <!-- Latest Pick Marquee / Undo Strip -->
                ${latestPickHtml}

                <!-- Unpicked Player Pool with Live Clean Search -->
                <div class="draft-pool-section">
                    <div class="pool-section-header">
                        <div class="pool-title-row">
                            <div class="pool-title-left">
                                <h3>Available Pool</h3>
                                <span class="pool-badge-count">${draft.unpickedPool.length} Remaining</span>
                            </div>
                            <span class="pool-round-indicator">Pick ${pickNum}/${totalPicks}</span>
                        </div>
                        <div class="pool-subtitle-row">
                            <span class="pool-squad-only-pill">🔒 Playing Squad Only</span>
                        </div>
                    </div>

                    <!-- Clean Search Box -->
                    <div class="pool-search-wrap">
                        <svg class="search-icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <input type="text" id="pool-search-input" class="pool-search-input" 
                               placeholder="Search available players by name..." 
                               value="${safeHtml(poolSearchQuery)}" 
                               oninput="Draft.handlePoolSearch(this.value)">
                        ${poolSearchQuery ? '<button type="button" class="clear-search-btn" onclick="Draft.handlePoolSearch(\'\')">✕</button>' : ''}
                    </div>

                    <div class="pool-cards-grid">
                        ${poolHtml}
                    </div>
                </div>

                <!-- Drafted Rosters Inspection Drawer -->
                <div class="draft-rosters-drawer">
                    <h3 class="rosters-heading">Current Squad Rosters</h3>
                    <div class="rosters-grid">
                        ${draft.teams.map(t => {
                            return `
                                <div class="roster-col-card" style="border-top: 3px solid ${t.color};">
                                    <div class="roster-col-header" style="background:${t.bg};">
                                        <div class="roster-col-title">
                                            <span class="roster-team-icon">${t.icon || '🏏'}</span>
                                            <strong style="color:${t.color};">${safeHtml(t.name)}</strong>
                                        </div>
                                        <span class="roster-col-count">(${t.players.length})</span>
                                    </div>
                                    <div class="roster-players-list">
                                        ${t.players.map((pid, pIdx) => {
                                            const p = Auth.getPlayerById(pid);
                                            const isC = pid === t.captainId;
                                            return `
                                                <div class="roster-item">
                                                    <span class="roster-num">${pIdx + 1}.</span>
                                                    <span class="roster-name">${p ? safeHtml(p.name) : 'Player'}</span>
                                                    ${isC ? '<span class="roster-c-badge">C</span>' : ''}
                                                </div>`;
                                        }).join('')}
                                    </div>
                                </div>`;
                        }).join('')}
                    </div>
                </div>

                ${isAdmin ? `
                    <div class="draft-admin-footer">
                        <button type="button" class="btn btn-ghost btn-sm" onclick="Draft.handleRedrawDraft('${match.id}')">
                            🔄 Redraw Squads / Start Over
                        </button>
                    </div>
                ` : ''}
            </div>`;

        startTurnTimer(match.id, activeTeam ? activeTeam.id : '', draft.currentPickIndex);
    }

    /** Live search input handler */
    function handlePoolSearch(query) {
        poolSearchQuery = query.trim();
        const match = Matches.getById(currentMatchId);
        if (match && match.draft && match.draft.status === 'in_progress') {
            const container = document.getElementById('draft-container');
            if (container) renderWarRoomView(match, match.draft, container);
        }
    }

    /** Execute Draft Pick */
    async function executePick(matchId, teamId, playerId) {
        stopTurnTimer();
        const match = Matches.getById(matchId);
        if (!match || !match.draft) return;

        const result = makePick(match.draft, teamId, playerId);
        if (!result.success) {
            App.showToast(result.message);
            return;
        }

        SoundFX.playPick();

        await DB.saveMatchDraft(matchId, match.draft);
        App.showToast('Player selected! 🏏');
        renderDraftScreen(matchId);
    }

    /** Handle Undo Last Pick */
    async function handleUndoPick(matchId) {
        stopTurnTimer();
        const match = Matches.getById(matchId);
        if (!match || !match.draft) return;

        const result = undoPick(match.draft);
        if (!result.success) {
            App.showToast(result.message);
            return;
        }

        await DB.saveMatchDraft(matchId, match.draft);
        App.showToast('Undid last pick ↩️');
        renderDraftScreen(matchId);
    }

    /** Reset / Redraw Draft (Admin only) */
    async function handleRedrawDraft(matchId) {
        App.showConfirm(
            'Redraw Match Day Squads',
            'Are you sure you want to redraw squads? This will reset all drafted teams and allow you to reconfigure captains, re-flip toss, and draft again.',
            '🔄',
            async () => {
                const match = Matches.getById(matchId);
                if (!match) return;
                match.draft = null;
                await DB.saveMatchDraft(matchId, null);
                App.showToast('Draft reset — ready to redraw squads! 🔄');
                renderDraftScreen(matchId);
                if (window.App && App.renderMatchCards) App.renderMatchCards();
            }
        );
    }

    /** Delete Draft entirely (Admin only) */
    async function handleDeleteDraft(matchId) {
        App.showConfirm(
            'Delete Match Day Squads',
            'This will permanently delete the drafted teams. The match will remain locked with all confirmed players in the playing squad.',
            '🗑️',
            async () => {
                const match = Matches.getById(matchId);
                if (!match) return;
                match.draft = null;
                await DB.saveMatchDraft(matchId, null);
                App.showToast('Match day squads deleted 🗑️');
                if (window.App) {
                    App.showMatchDetail(matchId);
                    if (App.renderMatchCards) App.renderMatchCards();
                }
            }
        );
    }

    /** 4. COMPLETED VIEW: Confetti, Final Rosters, Copy for WhatsApp & Admin Tools */
    function renderCompletedView(match, draft, container) {
        stopTurnTimer();
        const isAdmin = Auth.isAdmin();
        SoundFX.playFanfare();
        setTimeout(() => launchConfetti(), 150);

        const waMessage = formatWhatsAppTeamsMessage(match, draft);
        const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(waMessage)}`;

        container.innerHTML = `
            <div class="draft-completed-card">
                <div class="draft-completed-hero">
                    <span class="hero-confetti-badge">🎉 DRAFT COMPLETE</span>
                    <h2>Match Day Squads Declared!</h2>
                    <p>All ${match.playing.length} players have been drafted across ${draft.teams.length} teams.</p>
                </div>

                <div class="completed-rosters-grid">
                    ${draft.teams.map((t) => {
                        const cap = Auth.getPlayerById(t.captainId);
                        return `
                            <div class="final-team-card" style="border-top: 4px solid ${t.color}; background:${t.bg};">
                                <div class="final-team-head">
                                    <div class="final-team-title">
                                        <span class="final-team-icon">${t.icon || '🏏'}</span>
                                        <strong style="color:${t.color};">${safeHtml(t.name)}</strong>
                                    </div>
                                    <span class="final-count-badge">${t.players.length} Players</span>
                                </div>
                                <div class="final-cap-callout">
                                    Captain: <strong>${cap ? safeHtml(cap.name) : 'Captain'}</strong>
                                </div>
                                <div class="final-players-list">
                                    ${t.players.map((pid, pIdx) => {
                                        const p = Auth.getPlayerById(pid);
                                        const isC = pid === t.captainId;
                                        return `
                                            <div class="final-player-row">
                                                <span class="final-p-num">${pIdx + 1}</span>
                                                <span class="final-p-name">${p ? safeHtml(p.name) : 'Player'}</span>
                                                ${isC ? '<span class="final-c-tag">CAPTAIN</span>' : ''}
                                            </div>`;
                                    }).join('')}
                                </div>
                            </div>`;
                    }).join('')}
                </div>

                <!-- Sharing Options: 1-Tap Auto-Send to WhatsApp + 1-Tap Copy -->
                <div class="draft-completed-actions">
                    <button type="button" class="btn btn-wa-share btn-lg" onclick="Draft.shareToWhatsAppGroup('${match.id}')">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        <div class="btn-wa-content">
                            <span class="btn-wa-title">📲 Send Squads to WhatsApp Group</span>
                            <span class="btn-wa-subtitle">Auto-opens WhatsApp • Select group & tap Send</span>
                        </div>
                    </button>

                    <button type="button" class="btn btn-wa-copy" onclick="Draft.copyWhatsAppSquadMessage('${match.id}')">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                        <span>📋 Copy Squads to Clipboard</span>
                    </button>

                    <button type="button" class="btn btn-ghost btn-md" onclick="App.showMatchDetail('${match.id}')">
                        Return to Match
                    </button>
                </div>

                <!-- Admin Squad Control Toolbar (Edit, Redraw, Delete) -->
                ${isAdmin ? `
                    <div class="completed-admin-controls-card">
                        <span class="admin-panel-tag">🛡️ ADMIN SQUAD CONTROLS</span>
                        <div class="completed-admin-btns-row">
                            <button type="button" class="btn btn-outline-gold btn-sm" onclick="Draft.openEditTeamsModal('${match.id}')">
                                ✏️ Edit Squads / Swap Players
                            </button>
                            <button type="button" class="btn btn-outline-gold btn-sm" onclick="Draft.handleRedrawDraft('${match.id}')">
                                🔄 Redraw Match Day Squads
                            </button>
                            <button type="button" class="btn btn-ghost-danger btn-sm" onclick="Draft.handleDeleteDraft('${match.id}')">
                                🗑️ Delete Squads
                            </button>
                        </div>
                    </div>
                ` : ''}
            </div>`;
    }

    /** 5. RENDER TEAMS DIRECTLY INSIDE MATCH DETAILS SCREEN */
    function renderMatchTeamsInDetails(match) {
        if (!match || !match.draft || !match.draft.teams) return '';

        const draft = match.draft;
        const isCompleted = draft.status === 'completed';
        const isAdmin = Auth.isAdmin();

        return `
            <div class="detail-card match-drafted-teams-card">
                <div class="detail-squad-header">
                    <div class="squad-title-group">
                        <h3>⚔️ Drafted Squads (${draft.teams.length} Teams)</h3>
                        <span class="squad-status ${isCompleted ? 'locked' : 'open'}">
                            ${isCompleted ? 'SQUADS READY' : 'DRAFT IN PROGRESS'}
                        </span>
                    </div>
                    <button class="btn btn-xs btn-outline-gold" onclick="Draft.openDraftRoom('${match.id}')">
                        ${isCompleted ? 'View War Room' : '⚔️ Enter War Room'}
                    </button>
                </div>

                <div class="match-detail-teams-grid">
                    ${draft.teams.map(t => {
                        const cap = Auth.getPlayerById(t.captainId);
                        return `
                            <div class="detail-team-box" style="border-top:3px solid ${t.color}; background:${t.bg};">
                                <div class="detail-team-header">
                                    <strong style="color:${t.color};">${safeHtml(t.name)}</strong>
                                    <span class="detail-team-cap">C: ${cap ? safeHtml(cap.name.split(' ')[0]) : 'Cap'}</span>
                                </div>
                                <div class="detail-team-players">
                                    ${t.players.map((pid, i) => {
                                        const p = Auth.getPlayerById(pid);
                                        const isC = pid === t.captainId;
                                        return `
                                            <div class="detail-team-p-line">
                                                <span>${i + 1}. ${p ? safeHtml(p.name) : 'Player'}${isC ? ' (C)' : ''}</span>
                                            </div>`;
                                    }).join('')}
                                </div>
                            </div>`;
                    }).join('')}
                </div>

                <div class="detail-draft-admin-bar">
                    <button type="button" class="btn btn-xs btn-wa-share-xs" onclick="Draft.shareToWhatsAppGroup('${match.id}')" title="Auto-open WhatsApp to send squads">
                        📲 Send to WhatsApp Group
                    </button>
                    <button type="button" class="btn btn-xs btn-wa-copy-xs" onclick="Draft.copyWhatsAppSquadMessage('${match.id}')" title="Copy squads message to clipboard">
                        📋 Copy Squads
                    </button>
                    ${isAdmin ? `
                        <button type="button" class="btn btn-xs btn-outline-gold" onclick="Draft.openEditTeamsModal('${match.id}')">
                            ✏️ Edit Teams
                        </button>
                        <button type="button" class="btn btn-xs btn-outline-gold" onclick="Draft.handleRedrawDraft('${match.id}')">
                            🔄 Redraw Squads
                        </button>
                        <button type="button" class="btn btn-xs btn-ghost-danger" onclick="Draft.handleDeleteDraft('${match.id}')">
                            🗑️ Delete Draft
                        </button>
                    ` : ''}
                </div>
            </div>`;
    }

    /** 6. INTERACTIVE EDIT ROSTERS / SWAP PLAYERS MODAL */
    function openEditTeamsModal(matchId) {
        const match = Matches.getById(matchId);
        if (!match || !match.draft) return;
        const draft = match.draft;

        let modalEl = document.getElementById('draft-edit-teams-modal');
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'draft-edit-teams-modal';
            modalEl.className = 'modal-overlay';
            document.body.appendChild(modalEl);
        }

        let teamsHtml = '';
        draft.teams.forEach((t) => {
            const cap = Auth.getPlayerById(t.captainId);
            const otherTeams = draft.teams.filter(other => other.id !== t.id);

            let playersHtml = '';
            t.players.forEach((pid, pIdx) => {
                const p = Auth.getPlayerById(pid);
                const isCap = pid === t.captainId;

                let swapButtons = '';
                if (!isCap) {
                    swapButtons = otherTeams.map(other => `
                        <button type="button" class="btn btn-xs btn-swap-target" 
                                onclick="Draft.swapPlayerTeam('${match.id}', '${safeHtml(pid)}', '${t.id}', '${other.id}')">
                            ➔ ${safeHtml(other.name.split(' ')[1] || other.name)}
                        </button>
                    `).join('');
                }

                playersHtml += `
                    <div class="edit-team-player-row">
                        <div class="edit-p-info">
                            <span class="edit-p-num">${pIdx + 1}.</span>
                            <span class="edit-p-name">${p ? safeHtml(p.name) : 'Player'}</span>
                            ${isCap ? '<span class="final-c-tag">CAPTAIN</span>' : ''}
                        </div>
                        <div class="edit-p-actions">
                            ${swapButtons}
                        </div>
                    </div>`;
            });

            teamsHtml += `
                <div class="edit-team-block" style="border-top: 3px solid ${t.color};">
                    <div class="edit-team-header" style="background:${t.bg}; color:${t.color};">
                        <strong>${t.icon || '🏏'} ${safeHtml(t.name)}</strong>
                        <span>Cap: ${cap ? safeHtml(cap.name.split(' ')[0]) : 'Captain'} (${t.players.length})</span>
                    </div>
                    <div class="edit-team-players-list">
                        ${playersHtml}
                    </div>
                </div>`;
        });

        modalEl.innerHTML = `
            <div class="modal modal-lg edit-teams-modal-content">
                <div class="modal-icon">✏️</div>
                <h3 class="modal-title">Edit Match Day Squads</h3>
                <p class="modal-text">Swap players between teams to balance squads or adjust for availability.</p>
                <div class="edit-teams-container">
                    ${teamsHtml}
                </div>
                <div class="modal-actions" style="margin-top:16px;">
                    <button type="button" class="btn btn-primary" onclick="Draft.closeEditTeamsModal()">Done</button>
                </div>
            </div>`;

        modalEl.style.display = 'flex';
    }

    function closeEditTeamsModal() {
        const modalEl = document.getElementById('draft-edit-teams-modal');
        if (modalEl) modalEl.style.display = 'none';
        const match = Matches.getById(currentMatchId);
        if (match) {
            const draftScreen = document.getElementById('draft-screen');
            const isDraftActive = draftScreen && draftScreen.classList.contains('active');
            if (isDraftActive) {
                renderDraftScreen(currentMatchId);
            } else if (window.App && App.showMatchDetail) {
                App.showMatchDetail(currentMatchId);
            }
            if (window.App && App.renderMatchCards) App.renderMatchCards();
        }
    }

    async function swapPlayerTeam(matchId, playerId, fromTeamId, toTeamId) {
        const match = Matches.getById(matchId);
        if (!match || !match.draft) return;
        const draft = match.draft;

        const fromTeam = draft.teams.find(t => t.id === fromTeamId);
        const toTeam = draft.teams.find(t => t.id === toTeamId);
        if (!fromTeam || !toTeam) return;

        if (fromTeam.captainId === playerId) {
            App.showToast('Cannot move captain to another team');
            return;
        }

        fromTeam.players = fromTeam.players.filter(id => id !== playerId);
        toTeam.players.push(playerId);

        await DB.saveMatchDraft(matchId, draft);
        App.showToast('Player transferred! ⇄');
        if (typeof document !== 'undefined' && document.getElementById && document.getElementById('draft-edit-teams-modal')) {
            openEditTeamsModal(matchId);
        }
    }

    return {
        DEFAULT_TEAM_THEMES,
        computeSnakeOrder,
        createInitialDraftState,
        recordToss,
        makePick,
        undoPick,
        canUserPick,
        getActiveTeam,
        formatWhatsAppTeamsMessage,
        copyWhatsAppSquadMessage,
        shareToWhatsAppGroup,
        openDraftRoom,
        getCurrentMatchId,
        renderDraftScreen,
        handleTeamCountChange,
        submitDraftSetup,
        handleCoinFlip,
        handleWheelSpin,
        enterWarRoom,
        executePick,
        handleUndoPick,
        handleRedrawDraft,
        handleDeleteDraft,
        openEditTeamsModal,
        closeEditTeamsModal,
        swapPlayerTeam,
        renderMatchTeamsInDetails,
        handlePoolSearch,
        toggleSound,
        isSoundEnabled,
        launchConfetti,
        SoundFX,
        startTurnTimer,
        stopTurnTimer
    };
})();

// Export globally
if (typeof window !== 'undefined') {
    window.Draft = Draft;
}
