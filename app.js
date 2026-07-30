        let createClient;
        try {
            ({ createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'));
        } catch (e) {
            document.body.innerHTML = '<div style="color:#fff;background:#0A0F1D;padding:24px;font-family:sans-serif;font-size:14px;line-height:1.6;">'
                + '<b style="color:#f87171;">Supabase library load nahi ho payi.</b><br><br>'
                + 'Iska matlab hai is browser/preview me internet ya external script blocked hai.<br><br>'
                + 'Fix: is file ko real browser me kholo (Chrome/Firefox), ya Netlify/Vercel pe deploy karo — Spck jaise sandboxed preview me external CDN scripts kabhi kabhi block ho jaate hain.<br><br>'
                + '<span style="color:#fbbf24;">Technical error: ' + escapeHtmlSafe(e.message) + '</span></div>';
            throw e;
        }
        function escapeHtmlSafe(s) { return String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

        // ---------- Global State ----------
        let supabase = null;
        let currentUser = null;
        let userData = null;
        let transactions = [];
        let connectionsData = [];
        let userChannel = null, txChannel = null, connChannel = null, adminChannel = null;
        let isSignupMode = false;
        let pendingPinAction = null;
        let modalType = null;
        let modalConnectionUid = null;
        let adminRequests = [];

        // ---------- Payment config ----------
        const UPI_ID = 'arjutrehman@naviaxis';
        const UPI_PAYEE_NAME = 'GS Arif Gaming';
        const PAYMENT_AMOUNT = 50;
        const ADMIN_EMAIL = 'pinverse85@gmail.com';
        // ---------- Helpers ----------
        function $(id) { return document.getElementById(id); }
        function showToast(msg, kind = 'info') {
            const colors = { info: 'border-cyan-400/50 text-cyan-200', error: 'border-red-400/50 text-red-300', success: 'border-emerald-400/50 text-emerald-300' };
            const el = document.createElement('div');
            el.className = `toast glass-card rounded-xl px-4 py-3 text-xs font-medium border ${colors[kind] || colors.info}`;
            el.textContent = msg;
            $('toastContainer').appendChild(el);
            setTimeout(() => { el.remove(); }, 3200);
        }
        window.addEventListener('error', (e) => {
            try { showToast('Error: ' + (e.message || 'Unknown error'), 'error'); } catch (_) {}
        });
        window.addEventListener('unhandledrejection', (e) => {
            try { showToast('Error: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)), 'error'); } catch (_) {}
        });
        async function sha256Hex(text) {
            const enc = new TextEncoder().encode(text);
            const buf = await crypto.subtle.digest('SHA-256', enc);
            return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        }
        function fmt(n) { return (Math.round((n || 0) * 100) / 100).toFixed(1); }
        function timeAgo(date) {
            if (!date) return 'just now';
            const s = Math.floor((Date.now() - date.getTime()) / 1000);
            if (s < 60) return 'just now';
            if (s < 3600) return Math.floor(s / 60) + 'm ago';
            if (s < 86400) return Math.floor(s / 3600) + 'h ago';
            return Math.floor(s / 86400) + 'd ago';
        }
        function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
        function genNodeId() {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            let out = '';
            for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
            return out;
        }

        // ---------- Live clock ----------
        function tickClock() {
            const d = new Date();
            $('liveClock').textContent = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
        }
        setInterval(tickClock, 1000); tickClock();
        renderDeviceInfo();

        // ---------- Device Detection (real — uses actual browser APIs) ----------
        function detectDevice() {
            const ua = navigator.userAgent || '';
            let deviceType = 'Desktop';
            if (/Mobi|Android/i.test(ua) && !/Tablet|iPad/i.test(ua)) deviceType = 'Mobile';
            else if (/Tablet|iPad/i.test(ua)) deviceType = 'Tablet';

            let os = 'Unknown OS';
            if (/Windows/i.test(ua)) os = 'Windows';
            else if (/Android/i.test(ua)) { const m = ua.match(/Android\s([\d.]+)/); os = 'Android' + (m ? ' ' + m[1] : ''); }
            else if (/iPhone|iPad|iPod/i.test(ua)) { const m = ua.match(/OS\s([\d_]+)/); os = 'iOS' + (m ? ' ' + m[1].replace(/_/g, '.') : ''); }
            else if (/Mac OS X/i.test(ua)) os = 'macOS';
            else if (/Linux/i.test(ua)) os = 'Linux';

            let browser = 'Unknown Browser';
            if (/Edg\//i.test(ua)) browser = 'Edge';
            else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome';
            else if (/Firefox\//i.test(ua)) browser = 'Firefox';
            else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';

            const brand = (navigator.userAgentData && navigator.userAgentData.brands && navigator.userAgentData.brands.length)
                ? navigator.userAgentData.brands.map(b => b.brand).filter(b => !/Not|Brand/i.test(b)).join(', ')
                : null;

            return {
                deviceType,
                os,
                browser,
                brand,
                mobileFlag: navigator.userAgentData ? navigator.userAgentData.mobile : /Mobi/i.test(ua),
                screen: `${window.screen.width}x${window.screen.height}`,
                language: navigator.language || 'N/A'
            };
        }

        function renderDeviceInfo() {
            const box = $('deviceInfoBox');
            if (!box) return;
            const info = detectDevice();
            box.innerHTML = `
                <div class="flex justify-between"><span class="text-cyan-400/50">Device Type</span><span>${escapeHtml(info.deviceType)}</span></div>
                <div class="flex justify-between"><span class="text-cyan-400/50">OS</span><span>${escapeHtml(info.os)}</span></div>
                <div class="flex justify-between"><span class="text-cyan-400/50">Browser</span><span>${escapeHtml(info.browser)}</span></div>
                ${info.brand ? `<div class="flex justify-between"><span class="text-cyan-400/50">Engine</span><span>${escapeHtml(info.brand)}</span></div>` : ''}
                <div class="flex justify-between"><span class="text-cyan-400/50">Screen</span><span>${escapeHtml(info.screen)}</span></div>
                <div class="flex justify-between"><span class="text-cyan-400/50">Language</span><span>${escapeHtml(info.language)}</span></div>`;
        }

        function bootSupabase(url, key) {
            try {
                supabase = createClient(url, key);
                supabase.auth.onAuthStateChange((event, session) => {
                    handleAuthChange(session ? session.user : null);
                });
                supabase.auth.getSession().then(({ data, error }) => {
                    if (error) {
                        showToast('Connection error: ' + error.message, 'error');
                        return;
                    }
                    handleAuthChange(data.session ? data.session.user : null);
                }).catch((e) => {
                    showToast('Supabase se connect nahi ho paya: ' + e.message, 'error');
                });
            } catch (e) {
                showToast('Connection failed: ' + e.message, 'error');
            }
        }

        // ---------- Real Device Detection ----------
        let deviceInfoCache = null;
        let deviceDbCache = null;

        async function fetchDeviceDb() {
            if (deviceDbCache) return deviceDbCache;
            try {
                const res = await fetch('https://cdn.jsdelivr.net/gh/bsthen/device-models/devices.json');
                if (!res.ok) throw new Error('bad response');
                deviceDbCache = await res.json();
            } catch (e) {
                deviceDbCache = {};
            }
            return deviceDbCache;
        }

        function parseAndroidModelCode(ua) {
            const m = ua.match(/Android\s[\d.]+;\s*([^)]+)\)/i);
            if (!m) return null;
            let code = m[1].split(';').pop().trim();
            code = code.replace(/^Build\/.*/i, '').replace(/\s*Build\/.*/i, '').trim();
            if (!code || /^K$|^wv$/i.test(code)) return null;
            return code;
        }

        async function detectDeviceFull() {
            if (deviceInfoCache) return deviceInfoCache;
            const base = detectDevice();
            const ua = navigator.userAgent || '';
            let modelCode = null, marketingName = null, brand = null;

            if (/Android/i.test(ua)) {
                modelCode = parseAndroidModelCode(ua);
                if (modelCode) {
                    const db = await fetchDeviceDb();
                    const entry = db[modelCode] || db[modelCode.toUpperCase()];
                    if (entry) { marketingName = entry.name; brand = entry.brand; }
                }
            }

            deviceInfoCache = { ...base, modelCode, marketingName, brand };
            return deviceInfoCache;
        }

        function renderDetectedDeviceCard(info) {
            const rows = [];
            if (info.marketingName) {
                rows.push(`<div class="flex justify-between"><span class="text-cyan-400/50">Device</span><span class="font-semibold text-neonCyan">${escapeHtml(info.marketingName)}</span></div>`);
            }
            if (info.modelCode) {
                rows.push(`<div class="flex justify-between"><span class="text-cyan-400/50">Model Code</span><span class="font-mono">${escapeHtml(info.modelCode)}</span></div>`);
            }
            if (!info.marketingName && !info.modelCode) {
                rows.push(`<div class="text-cyan-400/60 text-center py-1">${info.deviceType === 'Mobile' ? 'Exact model iOS/is browser se detect nahi hota (Apple ise hide karta hai)' : 'Desktop device — model number applicable nahi'}</div>`);
            }
            rows.push(`<div class="flex justify-between"><span class="text-cyan-400/50">Type</span><span>${escapeHtml(info.deviceType)}</span></div>`);
            rows.push(`<div class="flex justify-between"><span class="text-cyan-400/50">OS</span><span>${escapeHtml(info.os)}</span></div>`);
            rows.push(`<div class="flex justify-between"><span class="text-cyan-400/50">Browser</span><span>${escapeHtml(info.browser)}</span></div>`);
            $('detectedDeviceCard').innerHTML = rows.join('');
        }

        function runDetectionSequence() {
            $('detectingStage').classList.remove('hidden');
            $('deviceFoundStage').classList.add('hidden');
            $('connectingStage').classList.add('hidden');
            const bar = $('detectProgressBar');
            bar.style.width = '0%';
            requestAnimationFrame(() => { bar.style.width = '100%'; });

            detectDeviceFull().then((info) => {
                setTimeout(() => {
                    $('detectingStage').classList.add('hidden');
                    $('deviceFoundStage').classList.remove('hidden');
                    renderDetectedDeviceCard(info);
                }, 5000);
            });
        }

        window.handleConnectDevice = async function () {
            $('connectError').classList.add('hidden');
            $('deviceFoundStage').classList.add('hidden');
            $('connectingStage').classList.remove('hidden');
            const bar = $('connectProgressBar');
            bar.style.width = '0%';
            requestAnimationFrame(() => { bar.style.width = '100%'; });

            try {
                const { error } = await supabase.auth.signInAnonymously();
                if (error) throw error;
                // wait out the visual 5s connect animation regardless of how fast the network call was
                setTimeout(() => {
                    if (Notification && Notification.permission === 'default') {
                        Notification.requestPermission().catch(() => {});
                    }
                }, 5000);
            } catch (e) {
                setTimeout(() => {
                    $('connectingStage').classList.add('hidden');
                    $('deviceFoundStage').classList.remove('hidden');
                    $('connectError').textContent = e.message;
                    $('connectError').classList.remove('hidden');
                }, 300);
            }
        };

        // ---------- Admin-only email/password login ----------
        window.toggleAdminLogin = function () {
            $('adminLoginBox').classList.toggle('hidden');
        };
        window.handleAdminLoginSubmit = async function () {
            const email = $('authEmail').value.trim();
            const pass = $('authPassword').value;
            $('authError').classList.add('hidden');
            if (!email || !pass) { $('authError').textContent = 'Email aur password bharo.'; $('authError').classList.remove('hidden'); return; }
            try {
                const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
                if (error) throw error;
            } catch (e) {
                $('authError').textContent = e.message;
                $('authError').classList.remove('hidden');
            }
        };

        window.handleSignOut = async function () {
            if (!confirm('Device disconnect ho jayega. Agar ye anonymous device-account hai (admin login nahi), toh dobara connect karne par NAYA account banega aur purana data is device se access nahi hoga. Continue?')) return;
            cleanupSubscriptions();
            await supabase.auth.signOut();
        };

        async function handleAuthChange(user) {
            cleanupSubscriptions();
            currentUser = user;
            if (!user) {
                $('authScreen').classList.remove('hidden');
                $('mainApp').classList.add('hidden');
                $('mainApp').classList.remove('flex');
                runDetectionSequence();
                return;
            }
            $('authScreen').classList.add('hidden');
            $('mainApp').classList.remove('hidden');
            $('mainApp').classList.add('flex');

            await loadUserOnce(user.id);
            subscribeRealtime(user.id);

            if (user.email === ADMIN_EMAIL) {
                $('navAdminBtn').classList.remove('hidden');
                $('navAdminBtn').classList.add('flex');
                await loadAdminRequests();
                adminChannel = supabase.channel('admin-payments')
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_requests' }, () => loadAdminRequests())
                    .subscribe();
            } else {
                $('navAdminBtn').classList.add('hidden');
                $('navAdminBtn').classList.remove('flex');
            }
        }

        async function loadUserOnce(uid) {
            let { data, error } = await supabase.from('users').select('*').eq('id', uid).maybeSingle();
            if (error) {
                showToast('Profile load nahi hua: ' + error.message, 'error');
                return;
            }
            if (!data) {
                // Profile row missing (new device connect, or created before setup.sql ran). Create it now.
                const nodeId = genNodeId();
                const dInfo = deviceInfoCache;
                const deviceLabel = (dInfo && (dInfo.marketingName || dInfo.modelCode)) ? (dInfo.marketingName || dInfo.modelCode) : 'Device';
                const insertPayload = {
                    id: uid,
                    email: currentUser.email || null,
                    display_name: (currentUser.user_metadata && currentUser.user_metadata.display_name)
                        || (currentUser.email ? currentUser.email.split('@')[0] : deviceLabel + '-' + uid.slice(0, 4).toUpperCase()),
                    node_id: nodeId
                };
                const { data: created, error: insertErr } = await supabase.from('users').insert(insertPayload).select().maybeSingle();
                if (insertErr) {
                    showToast('Account profile ban nahi payi: ' + insertErr.message, 'error');
                    return;
                }
                data = created;
                showToast('Device connect ho gaya', 'success');
            }
            userData = data;
            renderUserData();
            checkStakeUnlock();
        }
        async function loadTransactions(uid) {
            const { data, error } = await supabase.from('transactions').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(100);
            if (error) { showToast('Transactions load nahi hue: ' + error.message, 'error'); return; }
            transactions = data || [];
            renderTransactions();
            renderAnalytics();
        }
        async function loadConnections(uid) {
            const { data, error } = await supabase.from('connections').select('*').eq('user_id', uid);
            if (error) { showToast('Connections load nahi hue: ' + error.message, 'error'); return; }
            connectionsData = data || [];
            renderConnections();
        }
        async function loadAdminRequests() {
            const { data, error } = await supabase.from('payment_requests').select('*').order('submitted_at', { ascending: false }).limit(100);
            if (error) { showToast('Admin requests load nahi hue: ' + error.message, 'error'); return; }
            adminRequests = data || [];
            renderAdminList();
        }

        function subscribeRealtime(uid) {
            userChannel = supabase.channel('user-' + uid)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'users', filter: `id=eq.${uid}` }, (payload) => {
                    userData = payload.new;
                    renderUserData();
                    checkStakeUnlock();
                }).subscribe();

            txChannel = supabase.channel('tx-' + uid)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${uid}` }, () => loadTransactions(uid))
                .subscribe();
            loadTransactions(uid);

            connChannel = supabase.channel('conn-' + uid)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'connections', filter: `user_id=eq.${uid}` }, () => loadConnections(uid))
                .subscribe();
            loadConnections(uid);
        }

        function cleanupSubscriptions() {
            if (userChannel) supabase.removeChannel(userChannel);
            if (txChannel) supabase.removeChannel(txChannel);
            if (connChannel) supabase.removeChannel(connChannel);
            if (adminChannel) supabase.removeChannel(adminChannel);
            userChannel = txChannel = connChannel = adminChannel = null;
            userData = null; transactions = []; connectionsData = []; adminRequests = [];
        }

        // ---------- Render ----------
        function renderUserData() {
            if (!userData) return;
            $('welcomeName').textContent = userData.display_name || 'Device User';
            $('settingsEmailLabel').textContent = currentUser.email || ('Anonymous device · Node ' + (userData.node_id || ''));
            $('myDisplayNameLabel').textContent = userData.display_name;
            $('myAvatarInitials').textContent = (userData.display_name || '??').slice(0, 2).toUpperCase();
            $('myNodeIdLabel').textContent = userData.node_id || '------';

            $('carrierDataVal').innerHTML = fmt(userData.carrier_pool) + ' <span class="text-sm font-normal text-cyan-300">GB</span>';
            $('vaultDataVal').innerHTML = fmt(userData.vault_balance) + ' <span class="text-sm font-normal text-cyan-300">GB</span>';
            const maxRef = Math.max(userData.carrier_pool + userData.vault_balance, 1);
            $('carrierBar').style.width = Math.min(100, (userData.carrier_pool / maxRef) * 100) + '%';
            $('vaultBar').style.width = Math.min(100, (userData.vault_balance / maxRef) * 100) + '%';

            const vaultCap = 50;
            $('vaultStatsText').textContent = fmt(userData.vault_balance) + ' GB / ' + vaultCap + ' GB';
            $('vaultProgressBar').style.width = Math.min(100, (userData.vault_balance / vaultCap) * 100) + '%';

            const pinOn = !!userData.pin_lock_enabled;
            $('settingPinLock').checked = pinOn;
            $('settingAutopilot').checked = !!userData.autopilot;
            $('lockStatusBadge').textContent = pinOn ? 'PIN Protected' : 'Unlocked';
            $('lockStatusBadge').className = pinOn ? 'text-emerald-400' : 'text-cyan-300';

            renderPaymentBadge();
            renderStakeUI();
            if (!$('paymentModal').classList.contains('hidden')) renderPaymentModal();
        }

        function renderPaymentBadge() {
            const badge = $('paymentBadge');
            const status = userData.payment_status || 'unpaid';
            const map = {
                approved: ['Activated', 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'],
                pending: ['Pending Review', 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30'],
                rejected: ['Rejected · Retry', 'bg-red-500/10 text-red-300 border-red-500/30'],
                unpaid: ['Locked · Pay ₹50', 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30']
            };
            const [label, cls] = map[status] || map.unpaid;
            badge.textContent = label;
            badge.className = 'text-xs px-2.5 py-1 rounded-full border ' + cls;
        }

        function renderStakeUI() {
            if (!userData) return;
            const staked = userData.staked_amount || 0;
            const unlockAt = userData.stake_unlock_at ? new Date(userData.stake_unlock_at) : null;
            const btn = $('stakeBtn');
            const txt = $('stakeStatusText');
            if (staked > 0 && unlockAt) {
                const remainMs = unlockAt.getTime() - Date.now();
                if (remainMs > 0) {
                    const days = Math.floor(remainMs / 86400000);
                    const hrs = Math.floor((remainMs % 86400000) / 3600000);
                    txt.textContent = `${fmt(staked)} GB locked. Unlocks in ${days}d ${hrs}h (+5% bonus on unlock).`;
                    btn.textContent = 'Staking In Progress';
                    btn.disabled = true;
                    btn.classList.add('opacity-50');
                } else {
                    txt.textContent = `${fmt(staked)} GB ready to unlock with +5% bonus!`;
                    btn.textContent = 'Claim Bonus Now';
                    btn.disabled = false;
                    btn.classList.remove('opacity-50');
                }
            } else {
                txt.textContent = 'Lock stored data to earn +5% bonus, credited after 30 real days.';
                btn.textContent = 'Lock Data (Start Staking)';
                btn.disabled = false;
                btn.classList.remove('opacity-50');
            }
        }
        setInterval(renderStakeUI, 30000);

        function iconForType(t) {
            const map = {
                save: 'fa-cloud-arrow-up text-cyan-300',
                withdraw: 'fa-cloud-arrow-down text-blue-400',
                send: 'fa-paper-plane text-purple-400',
                receive: 'fa-download text-emerald-400',
                stake: 'fa-lock text-purple-400',
                unstake_bonus: 'fa-award text-yellow-400'
            };
            return map[t] || 'fa-circle text-cyan-300';
        }
        function labelForType(t) {
            const map = { save: 'Saved to Vault', withdraw: 'Withdrawn', send: 'Sent', receive: 'Received', stake: 'Locked (Staked)', unstake_bonus: 'Staking Bonus' };
            return map[t] || t;
        }
        function signForType(t) {
            return ['withdraw', 'send', 'stake'].includes(t) ? '' : '+';
        }

        function renderTransactions() {
            const container = $('transactionLogContainer');
            if (!transactions.length) {
                container.innerHTML = '<p class="text-xs text-cyan-400/40 text-center py-4">No transactions yet</p>';
                return;
            }
            container.innerHTML = transactions.slice(0, 15).map(tx => {
                const date = tx.created_at ? new Date(tx.created_at) : new Date();
                return `<div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-xs">
                            <i class="fa-solid ${iconForType(tx.type)}"></i>
                        </div>
                        <div>
                            <p class="text-xs font-medium">${labelForType(tx.type)}${tx.note ? ' · ' + escapeHtml(tx.note) : ''}</p>
                            <p class="text-[10px] text-cyan-400/50">${timeAgo(date)}</p>
                        </div>
                    </div>
                    <span class="text-xs font-semibold">${signForType(tx.type)}${fmt(tx.amount)} GB</span>
                </div>`;
            }).join('');
        }

        function renderConnections() {
            const container = $('connectionsList');
            if (!connectionsData.length) {
                container.innerHTML = '<p class="text-xs text-cyan-400/40 text-center py-3">No connected nodes yet</p>';
                return;
            }
            container.innerHTML = connectionsData.map(c => `
                <div class="glass-card rounded-xl p-3 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-300 text-xs">${(c.display_name || '??').slice(0,2).toUpperCase()}</div>
                        <div>
                            <h4 class="text-xs font-semibold">${escapeHtml(c.display_name || 'Node')}</h4>
                            <p class="text-[10px] text-cyan-400/60">Node ${c.node_id}</p>
                        </div>
                    </div>
                    <button onclick="openModal('send','${c.connected_uid}')" class="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 text-xs hover:bg-cyan-500/30 transition">Send Data</button>
                </div>`).join('');
        }

        function renderAnalytics() {
            const saves = transactions.filter(t => t.type === 'save');
            const totalSaved = saves.reduce((a, t) => a + (parseFloat(t.amount) || 0), 0);
            $('analyticsTotalSaved').textContent = fmt(totalSaved) + ' GB';

            const withdrawn = transactions.filter(t => t.type === 'withdraw').reduce((a, t) => a + (parseFloat(t.amount) || 0), 0);
            const sent = transactions.filter(t => t.type === 'send').reduce((a, t) => a + (parseFloat(t.amount) || 0), 0);
            $('analyticsWithdrawn').textContent = fmt(withdrawn) + ' GB';
            $('analyticsSent').textContent = fmt(sent) + ' GB';

            const days = [];
            const labels = [];
            const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                d.setHours(0,0,0,0);
                days.push(d);
                labels.push(dayNames[d.getDay()]);
            }
            const totals = days.map(d => {
                const next = new Date(d.getTime() + 86400000);
                return saves.filter(t => {
                    const dt = new Date(t.created_at);
                    return dt >= d && dt < next;
                }).reduce((a, t) => a + (parseFloat(t.amount) || 0), 0);
            });
            const max = Math.max(...totals, 0.1);
            $('analyticsBarChart').innerHTML = totals.map(v => {
                const pct = Math.max(4, Math.round((v / max) * 100));
                const highlight = v === max && v > 0 ? ' bg-cyan-400 neon-glow' : ' bg-cyan-500/30';
                return `<div class="w-full rounded-t${highlight}" style="height:${pct}%"></div>`;
            }).join('');
            $('analyticsDayLabels').innerHTML = labels.map(l => `<span>${l}</span>`).join('');
        }

        // ---------- Notifications ----------
        window.toggleNotifications = function () {
            const panel = $('notifPanel');
            panel.classList.toggle('hidden');
            if (!panel.classList.contains('hidden')) {
                const recent = transactions.slice(0, 6);
                panel.innerHTML = recent.length ? recent.map(tx => {
                    const date = tx.created_at ? new Date(tx.created_at) : new Date();
                    return `<div class="text-[11px] border-b border-white/5 pb-2"><span class="font-semibold">${labelForType(tx.type)}</span> · ${fmt(tx.amount)} GB<br><span class="text-cyan-400/50">${timeAgo(date)}</span></div>`;
                }).join('') : '<p class="text-[11px] text-cyan-400/50">No notifications</p>';
                $('notifDot').classList.add('hidden');
            }
        };

        // ---------- Tabs ----------
        window.switchTab = function (tab) {
            document.querySelectorAll('main > section').forEach(s => s.classList.add('hidden'));
            $('tab-' + tab).classList.remove('hidden');
            document.querySelectorAll('.tab-btn').forEach(b => {
                const active = b.dataset.tab === tab;
                b.classList.toggle('active', active);
                b.classList.toggle('text-cyan-400/50', !active);
            });
            $('notifPanel').classList.add('hidden');
            if (tab === 'settings') renderDeviceInfo();
        };

        // ---------- Modal ----------
        window.openModal = function (type, connUid = null) {
            if ((type === 'save' || type === 'withdraw') && userData.payment_status !== 'approved') {
                openPaymentGate();
                return;
            }
            modalType = type;
            modalConnectionUid = connUid;
            $('modalError').classList.add('hidden');
            const body = $('modalBody');
            const title = $('modalTitle');
            if (type === 'save') {
                title.textContent = 'Save Mobile Data';
                const maxAmt = Math.max(userData.carrier_pool, 0.5);
                body.innerHTML = sliderHtml(Math.min(1, maxAmt), 0.5, maxAmt.toFixed(1), `Available in Carrier Pool: ${fmt(userData.carrier_pool)} GB`);
            } else if (type === 'withdraw') {
                title.textContent = 'Withdraw to Device';
                const maxAmt = Math.max(userData.vault_balance, 0.5);
                body.innerHTML = sliderHtml(Math.min(1, maxAmt), 0.5, maxAmt.toFixed(1), `Available in Vault: ${fmt(userData.vault_balance)} GB`);
            } else if (type === 'send') {
                const conn = connectionsData.find(c => c.connected_uid === connUid);
                title.textContent = 'Send Data to ' + (conn ? conn.display_name : 'Node');
                const maxAmt = Math.max(userData.vault_balance, 0.5);
                body.innerHTML = sliderHtml(Math.min(1, maxAmt), 0.5, maxAmt.toFixed(1), `Available in Vault: ${fmt(userData.vault_balance)} GB`);
            } else if (type === 'stake') {
                title.textContent = 'Lock Data for Staking';
                const maxAmt = Math.max(userData.vault_balance, 0.5);
                body.innerHTML = sliderHtml(Math.min(1, maxAmt), 0.5, maxAmt.toFixed(1), `Available in Vault: ${fmt(userData.vault_balance)} GB`);
            } else if (type === 'setPin') {
                title.textContent = 'Set Your PIN';
                body.innerHTML = `<div><label class="text-xs text-cyan-400/70 block mb-2">Create a 4-digit PIN</label>
                    <input id="pinSetInput" type="password" inputmode="numeric" maxlength="4" class="w-full rounded-lg p-3 text-center text-xl tracking-[10px]" placeholder="----"></div>`;
            } else if (type === 'pinConfirm') {
                title.textContent = 'Enter PIN to Confirm';
                body.innerHTML = `<div><input id="pinConfirmInput" type="password" inputmode="numeric" maxlength="4" class="w-full rounded-lg p-3 text-center text-xl tracking-[10px]" placeholder="----"></div>`;
            }
            $('actionModal').classList.remove('hidden');
        };

        function sliderHtml(val, step, max, subtitle) {
            return `<div>
                <label class="text-xs text-cyan-400/70 block mb-2">Select Amount (GB)</label>
                <input id="dataAmountInput" type="range" min="${step}" max="${max}" step="${step}" value="${val}" oninput="document.getElementById('sliderVal').innerText = this.value + ' GB'" class="w-full accent-cyan-400 cursor-pointer">
                <div class="text-center mt-2">
                    <span id="sliderVal" class="text-2xl font-bold text-neonCyan neon-text">${val} GB</span>
                </div>
                <p class="text-[11px] text-cyan-400/50 text-center mt-1">${subtitle}</p>
            </div>`;
        }

        window.closeModal = function () {
            $('actionModal').classList.add('hidden');
            modalType = null; modalConnectionUid = null;
        };

        window.handleModalConfirm = async function () {
            $('modalError').classList.add('hidden');
            try {
                if (modalType === 'save') {
                    const amt = parseFloat($('dataAmountInput').value);
                    await doSave(amt);
                    closeModal();
                } else if (modalType === 'withdraw') {
                    const amt = parseFloat($('dataAmountInput').value);
                    if (userData.pin_lock_enabled) {
                        pendingPinAction = () => doWithdraw(amt);
                        openModal('pinConfirm');
                    } else {
                        await doWithdraw(amt);
                        closeModal();
                    }
                } else if (modalType === 'send') {
                    const amt = parseFloat($('dataAmountInput').value);
                    await doSend(modalConnectionUid, amt);
                    closeModal();
                } else if (modalType === 'stake') {
                    const amt = parseFloat($('dataAmountInput').value);
                    await doStake(amt);
                    closeModal();
                } else if (modalType === 'setPin') {
                    const pin = $('pinSetInput').value;
                    if (!/^\d{4}$/.test(pin)) throw new Error('PIN 4 digits ka hona chahiye.');
                    const hash = await sha256Hex(pin);
                    const { error } = await supabase.from('users').update({ pin_hash: hash, pin_lock_enabled: true }).eq('id', currentUser.id);
                    if (error) throw error;
                    showToast('PIN set ho gaya', 'success');
                    closeModal();
                } else if (modalType === 'pinConfirm') {
                    const pin = $('pinConfirmInput').value;
                    const hash = await sha256Hex(pin);
                    if (hash !== userData.pin_hash) throw new Error('Galat PIN.');
                    closeModal();
                    if (pendingPinAction) { await pendingPinAction(); pendingPinAction = null; }
                }
            } catch (e) {
                $('modalError').textContent = e.message;
                $('modalError').classList.remove('hidden');
            }
        };

        // ---------- Core operations (Postgres RPC — atomic, server-side) ----------
        function notifyReal(title, body) {
            try {
                if (window.Notification && Notification.permission === 'granted') {
                    new Notification(title, { body, icon: 'https://api.qrserver.com/v1/create-qr-code/?size=1x1&data=x' });
                }
            } catch (_) {}
        }

        async function doSave(amt) {
            if (!(amt > 0)) throw new Error('Amount 0 se zyada honi chahiye.');
            const { error } = await supabase.rpc('save_data', { amount: amt });
            if (error) throw new Error(error.message);
            showToast(`${fmt(amt)} GB Vault me save ho gaya`, 'success');
            notifyReal('Data Saved', `${fmt(amt)} GB Vault me save ho gaya`);
        }
        async function doWithdraw(amt) {
            if (!(amt > 0)) throw new Error('Amount 0 se zyada honi chahiye.');
            const { error } = await supabase.rpc('withdraw_data', { amount: amt });
            if (error) throw new Error(error.message);
            showToast(`${fmt(amt)} GB device me withdraw ho gaya`, 'success');
            notifyReal('Data Withdrawn', `${fmt(amt)} GB device me withdraw ho gaya`);
        }
        async function doSend(toUid, amt) {
            if (!(amt > 0)) throw new Error('Amount 0 se zyada honi chahiye.');
            const { error } = await supabase.rpc('send_data', { to_uid: toUid, amount: amt });
            if (error) throw new Error(error.message);
            showToast(`${fmt(amt)} GB bhej diya`, 'success');
        }
        async function doStake(amt) {
            if (!(amt > 0)) throw new Error('Amount 0 se zyada honi chahiye.');
            const { error } = await supabase.rpc('stake_data', { amount: amt });
            if (error) throw new Error(error.message);
            showToast(`${fmt(amt)} GB lock kar diya, 30 din me +5% bonus milega`, 'success');
        }

        window.handleStakeButton = function () {
            if (userData.staked_amount > 0) {
                const unlockAt = userData.stake_unlock_at ? new Date(userData.stake_unlock_at) : null;
                if (unlockAt && unlockAt.getTime() <= Date.now()) claimStakeBonus();
                return;
            }
            openModal('stake');
        };

        async function claimStakeBonus() {
            const { error } = await supabase.rpc('claim_stake_bonus');
            if (!error) {
                showToast('Staking complete! Bonus credit ho gaya', 'success');
                $('notifDot').classList.remove('hidden');
            }
        }

        function checkStakeUnlock() {
            if (userData && userData.staked_amount > 0 && userData.stake_unlock_at) {
                const unlockAt = new Date(userData.stake_unlock_at);
                if (unlockAt.getTime() <= Date.now()) claimStakeBonus();
            }
        }

        // ---------- Connections ----------
        window.copyNodeId = function () {
            if (!userData) return;
            navigator.clipboard.writeText(userData.node_id).then(() => showToast('Node ID copy ho gayi', 'success'));
        };

        window.handleAddConnection = async function () {
            const code = $('addNodeIdInput').value.trim().toUpperCase();
            $('addNodeError').classList.add('hidden');
            if (!/^[A-Z0-9]{6}$/.test(code)) { $('addNodeError').textContent = 'Sahi 6-character Node ID daalo.'; $('addNodeError').classList.remove('hidden'); return; }
            try {
                const { error } = await supabase.rpc('add_connection', { target_node_id: code });
                if (error) throw new Error(error.message);
                $('addNodeIdInput').value = '';
                showToast('Node connect ho gaya', 'success');
                loadConnections(currentUser.id);
            } catch (e) {
                $('addNodeError').textContent = e.message;
                $('addNodeError').classList.remove('hidden');
            }
        };

        // ---------- Settings ----------
        window.handleSetCarrierBalance = async function () {
            const val = parseFloat($('carrierBalanceInput').value);
            if (!(val >= 0)) { showToast('Sahi number daalo', 'error'); return; }
            const { error } = await supabase.from('users').update({ carrier_pool: val }).eq('id', currentUser.id);
            if (error) { showToast(error.message, 'error'); return; }
            $('carrierBalanceInput').value = '';
            showToast('Carrier balance update ho gaya', 'success');
        };

        window.handlePinLockToggle = async function () {
            const checked = $('settingPinLock').checked;
            if (checked) {
                openModal('setPin');
                $('settingPinLock').checked = false;
            } else {
                await supabase.from('users').update({ pin_lock_enabled: false }).eq('id', currentUser.id);
                showToast('PIN lock band kar diya', 'info');
            }
        };

        window.saveSettings = async function () {
            await supabase.from('users').update({ autopilot: $('settingAutopilot').checked }).eq('id', currentUser.id);
            showToast('Settings save ho gayi', 'success');
        };

        window.resetAppData = async function () {
            if (!confirm('Sab balances aur transaction history clear ho jayegi. Confirm?')) return;
            const { error } = await supabase.rpc('reset_app_data');
            if (error) { showToast(error.message, 'error'); return; }
            showToast('App data reset ho gaya', 'success');
        };

        window.clearHistory = async function () {
            if (!confirm('Transaction history clear karein?')) return;
            const { error } = await supabase.rpc('clear_history');
            if (error) { showToast(error.message, 'error'); return; }
            showToast('History clear ho gayi', 'success');
        };

        // ---------- App Lock (PIN gate for whole app) ----------
        window.lockAppNow = function () {
            if (!userData || !userData.pin_lock_enabled) {
                showToast('Pehle Settings me PIN set karo', 'info');
                switchTab('settings');
                return;
            }
            $('lockOverlay').classList.remove('hidden');
            $('lockOverlay').classList.add('flex');
            $('lockPinInput').value = '';
            $('lockError').classList.add('hidden');
        };
        window.submitLockPin = async function () {
            const pin = $('lockPinInput').value;
            const hash = await sha256Hex(pin);
            if (hash === userData.pin_hash) {
                $('lockOverlay').classList.add('hidden');
                $('lockOverlay').classList.remove('flex');
            } else {
                $('lockError').classList.remove('hidden');
            }
        };

        // ---------- Payment Gate (₹50 activation, manual UTR verification) ----------
        function buildUpiLink(scheme) {
            const params = `pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(UPI_PAYEE_NAME)}&am=${PAYMENT_AMOUNT}&cu=INR&tn=${encodeURIComponent('DataBank Activation')}`;
            if (scheme === 'gpay') return `tez://upi/pay?${params}`;
            if (scheme === 'phonepe') return `phonepe://pay?${params}`;
            if (scheme === 'paytm') return `paytmmp://pay?${params}`;
            if (scheme === 'navi') return `navi://upi/pay?${params}`;
            return `upi://pay?${params}`;
        }
        // Navi ka official custom scheme publicly documented nahi milta — agar app na khule,
        // "Other UPI" use karo, wo universal upi:// standard hai jo Navi bhi support karta hai (NPCI-mandatory).
        window.payWithApp = function (scheme) {
            window.location.href = buildUpiLink(scheme);
            if (scheme === 'navi') {
                setTimeout(() => {
                    showToast('Navi nahi khula? "Other UPI Apps" try karo.', 'info');
                }, 1500);
            }
        };

        window.handlePaymentBadgeClick = function () {
            if (userData.payment_status !== 'approved') openPaymentGate();
        };
        window.openPaymentGate = function () {
            renderPaymentModal();
            $('paymentModal').classList.remove('hidden');
        };
        window.closePaymentModal = function () {
            $('paymentModal').classList.add('hidden');
        };
        window.copyUpiId = function () {
            navigator.clipboard.writeText(UPI_ID).then(() => showToast('UPI ID copy ho gayi', 'success'));
        };

        function renderPaymentModal() {
            const body = $('paymentModalBody');
            const status = userData.payment_status || 'unpaid';

            if (status === 'pending') {
                body.innerHTML = `
                    <div class="glass-card rounded-2xl p-4 text-center space-y-2">
                        <i class="fa-solid fa-hourglass-half text-yellow-400 text-2xl"></i>
                        <p class="text-sm font-semibold text-yellow-300">Payment Under Review</p>
                        <p class="text-xs text-cyan-400/60 font-mono">UTR: ${escapeHtml(userData.payment_utr || '')}</p>
                        <p class="text-[11px] text-cyan-400/50">Admin approve karte hi Save/Withdraw turant unlock ho jayega — real-time, koi refresh nahi chahiye.</p>
                    </div>`;
                return;
            }

            const rejectedNote = status === 'rejected'
                ? `<div class="glass-card rounded-xl p-3 text-xs text-red-300 border border-red-500/30">Pichla payment reject hua: ${escapeHtml(userData.payment_reject_reason || 'Not verified')}. Dobara try karo.</div>`
                : '';

            body.innerHTML = `
                ${rejectedNote}
                <p class="text-xs text-cyan-300/70">Data Save aur Withdraw use karne ke liye ek baar ₹${PAYMENT_AMOUNT} activation fee UPI se pay karo.</p>
                <div class="glass-card rounded-2xl p-4 text-center">
                    <p class="text-3xl font-bold text-neonCyan neon-text">₹${PAYMENT_AMOUNT}</p>
                    <p class="text-xs text-cyan-400/60 mt-1">One-time activation</p>
                </div>
                <div class="glass-card rounded-xl p-3 flex items-center justify-between">
                    <div>
                        <p class="text-[10px] text-cyan-400/60">Pay to UPI ID</p>
                        <p class="font-mono text-sm text-cyan-200">${UPI_ID}</p>
                    </div>
                    <button onclick="copyUpiId()" class="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 text-xs hover:bg-cyan-500/30 transition">Copy</button>
                </div>
                <div class="grid grid-cols-3 gap-2">
                    <button onclick="payWithApp('gpay')" class="glass-card rounded-xl py-3 text-xs font-semibold flex flex-col items-center gap-1 hover:border-cyan-400 transition"><i class="fa-brands fa-google-pay text-lg text-cyan-300"></i>GPay</button>
                    <button onclick="payWithApp('phonepe')" class="glass-card rounded-xl py-3 text-xs font-semibold flex flex-col items-center gap-1 hover:border-cyan-400 transition"><i class="fa-solid fa-mobile-screen text-lg text-purple-300"></i>PhonePe</button>
                    <button onclick="payWithApp('paytm')" class="glass-card rounded-xl py-3 text-xs font-semibold flex flex-col items-center gap-1 hover:border-cyan-400 transition"><i class="fa-solid fa-wallet text-lg text-blue-300"></i>Paytm</button>
                    <button onclick="payWithApp('navi')" class="glass-card rounded-xl py-3 text-xs font-semibold flex flex-col items-center gap-1 hover:border-cyan-400 transition"><i class="fa-solid fa-compass text-lg text-orange-300"></i>Navi</button>
                    <button onclick="payWithApp('other')" class="glass-card rounded-xl py-3 text-xs font-semibold flex flex-col items-center gap-1 hover:border-cyan-400 transition col-span-2"><i class="fa-solid fa-qrcode text-lg text-emerald-300"></i>Other UPI Apps</button>
                </div>
                <p class="text-[10px] text-cyan-400/40 text-center">"Other UPI" dabane par tumhare phone me jitne bhi UPI apps installed hain, unka Android chooser khud khulega — ye Android karta hai, list yahan se generate nahi hoti.</p>
                <div class="text-center">
                    <img id="paymentQrImg" class="mx-auto rounded-lg border border-cyan-500/20" width="150" height="150" alt="UPI QR">
                    <p class="text-[10px] text-cyan-400/50 mt-1">Ya UPI app se QR scan karo</p>
                </div>
                <div class="border-t border-white/10 pt-3 space-y-2">
                    <label class="text-xs text-cyan-400/70 block">Payment karne ke baad UTR / Reference Number daalo</label>
                    <input id="utrInput" type="text" inputmode="numeric" maxlength="20" class="w-full rounded-lg p-2.5 text-sm font-mono" placeholder="e.g. 302345678912">
                    <p id="paymentError" class="text-red-400 text-xs hidden"></p>
                    <button onclick="submitPaymentRequest()" class="w-full py-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-sm font-semibold hover:bg-emerald-500/30 transition">I've Paid — Submit for Verification</button>
                </div>`;

            const qr = $('paymentQrImg');
            if (qr) qr.src = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + encodeURIComponent(buildUpiLink('other'));
        }

        window.submitPaymentRequest = async function () {
            const utrInput = $('utrInput');
            const errEl = $('paymentError');
            errEl.classList.add('hidden');
            const utr = utrInput.value.trim();
            if (!/^\d{6,20}$/.test(utr)) {
                errEl.textContent = 'Sahi UTR / reference number daalo (jo payment app me dikha).';
                errEl.classList.remove('hidden');
                return;
            }
            try {
                const { error: insertErr } = await supabase.from('payment_requests').insert({
                    user_id: currentUser.id,
                    display_name: userData.display_name,
                    email: currentUser.email || 'anonymous-device',
                    amount: PAYMENT_AMOUNT,
                    utr,
                    status: 'pending'
                });
                if (insertErr) throw insertErr;
                const { error: updateErr } = await supabase.from('users').update({
                    payment_status: 'pending',
                    payment_utr: utr,
                    payment_reject_reason: null
                }).eq('id', currentUser.id);
                if (updateErr) throw updateErr;
                showToast('Payment verification ke liye submit ho gaya', 'success');
            } catch (e) {
                errEl.textContent = e.message;
                errEl.classList.remove('hidden');
            }
        };

        // ---------- Admin: Payment Approvals ----------
        function renderAdminList() {
            const pendingEl = $('adminPendingList');
            const historyEl = $('adminHistoryList');
            if (!pendingEl) return;
            const pending = adminRequests.filter(r => r.status === 'pending');
            const others = adminRequests.filter(r => r.status !== 'pending');

            pendingEl.innerHTML = pending.length ? pending.map(r => `
                <div class="glass-card rounded-xl p-3 space-y-2">
                    <div class="flex justify-between text-xs">
                        <span class="font-semibold">${escapeHtml(r.display_name || '')}</span>
                        <span class="text-cyan-400/50">${timeAgo(r.submitted_at ? new Date(r.submitted_at) : new Date())}</span>
                    </div>
                    <p class="text-[11px] text-cyan-400/60">${escapeHtml(r.email || '')}</p>
                    <p class="text-xs font-mono">UTR: ${escapeHtml(r.utr || '')} · ₹${r.amount}</p>
                    <div class="flex gap-2">
                        <button onclick="approvePayment('${r.id}','${r.user_id}')" class="flex-1 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/30 transition">Approve</button>
                        <button onclick="rejectPayment('${r.id}','${r.user_id}')" class="flex-1 py-1.5 rounded-lg bg-red-500/20 text-red-300 text-xs font-semibold hover:bg-red-500/30 transition">Reject</button>
                    </div>
                </div>`).join('') : '<p class="text-xs text-cyan-400/40 text-center py-4">No pending requests</p>';

            historyEl.innerHTML = others.slice(0, 25).map(r => `
                <div class="flex justify-between text-[11px] border-b border-white/5 pb-2">
                    <span>${escapeHtml(r.display_name || '')} · ₹${r.amount} · ${escapeHtml(r.utr || '')}</span>
                    <span class="${r.status === 'approved' ? 'text-emerald-400' : 'text-red-400'}">${r.status}</span>
                </div>`).join('');
        }

        window.approvePayment = async function (reqId, uid) {
            const { error } = await supabase.rpc('approve_payment', { req_id: reqId, target_uid: uid });
            if (error) { showToast(error.message, 'error'); return; }
            showToast('Payment approve ho gayi', 'success');
        };

        window.rejectPayment = async function (reqId, uid) {
            const reason = prompt('Reject reason (optional):') || 'Not verified';
            const { error } = await supabase.rpc('reject_payment', { req_id: reqId, target_uid: uid, reason_text: reason });
            if (error) { showToast(error.message, 'error'); return; }
            showToast('Payment reject kar di', 'info');
        };

        // ---------- Boot ----------
        const DEFAULT_SUPABASE_URL = 'https://fmmglnhxfcookziwrjrs.supabase.co';
        const DEFAULT_SUPABASE_KEY = 'sb_publishable_bU7AhKAmfi2RJMMt7ke7LQ_0gXKNE8i';

        (function boot() {
            try {
                const url = localStorage.getItem('db_supabaseUrl') || DEFAULT_SUPABASE_URL;
                const key = localStorage.getItem('db_supabaseKey') || DEFAULT_SUPABASE_KEY;
                bootSupabase(url, key);
            } catch (e) {
                bootSupabase(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_KEY);
            }
        })();

        document.addEventListener('click', (e) => {
            const panel = $('notifPanel');
            if (!panel.classList.contains('hidden') && !panel.contains(e.target) && !e.target.closest('button[onclick="toggleNotifications()"]')) {
                panel.classList.add('hidden');
            }
        });
