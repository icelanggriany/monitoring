
let currentPortionToFeed = 1;

function updateConfirmPortionUI() {
  const valEl = document.getElementById('modal-confirm-portion-val');
  if (valEl) valEl.innerText = `${currentPortionToFeed} Porsi`;
}

window.changeConfirmPortion = function (delta) {
  currentPortionToFeed = Math.max(1, Math.min(5, currentPortionToFeed + delta));
  updateConfirmPortionUI();
};

window.showFeedModal = function (portion = 1) {
  currentPortionToFeed = parseInt(portion) || 1;
  updateConfirmPortionUI();
  const confirmModal = document.getElementById('modal-feeder-confirm');
  if (confirmModal) confirmModal.classList.add('active');
};
window.triggerShowFeedModal = window.showFeedModal;

currentPortionToFeed = 1;

function updateConfirmPortionUI() {
  const valEl = document.getElementById('modal-confirm-portion-val');
  if (valEl) valEl.innerText = `${currentPortionToFeed} Porsi`;
}

window.changeConfirmPortion = function (delta) {
  currentPortionToFeed = Math.max(1, Math.min(5, currentPortionToFeed + delta));
  updateConfirmPortionUI();
};

// Ensure AquaponicsFirebase prototype safety
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    if (window.aquaponicsDB && !window.aquaponicsDB.addSchedule) {
      window.aquaponicsDB.addSchedule = function (time, portion) {
        console.log("[Firebase RTDB] Schedule saved:", time, portion);
        return Promise.resolve(true);
      };
    }
  });
}

/**
 * SMART AKUAPONIK IOT - DASHBOARD CONTROLLER & CHART.JS ENGINE
 */

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initThemeToggle();
  initNotificationDropdown();
  initCharts();
  initControlRelays();
  initFeedingScheduler();
  initConfigModals();
  initRealtimeDataBinding();
});

// State Store
const state = {
  activeTab: 'tab-beranda',
  activePeriod: 'harian',
  telemetry: {
    suhu_air: 26.3,
    tds: 350,
    suhu_udara: 27.1,
    kelembaban: 84,
    level_air: 68.5,
    voltase_aki: 12.4,
    status_daya: 'Aki 12V',
    status_gateway: 'Aktif'
  },
  relays: [0, 0, 0, 0, 0, 0],
  schedules: [
    { time: '08:00', portion: 1 },
    { time: '16:00', portion: 2 }
  ],
  notifications: [],
  charts: {}
};

/* ================= 1. NAVIGATION & UI TABS ================= */
function initNavigation() {
  const navBtns = document.querySelectorAll('.bottom-nav .nav-item, .sidebar-nav .nav-item');
  const panels = document.querySelectorAll('.tab-panel');
  const headerTitle = document.getElementById('header-title-text');
  const manageFeedLink = document.getElementById('manage-feed-link');

  const titleMap = {
    'tab-beranda': 'Monitoring IoT',
    'tab-monitoring': 'Monitoring',
    'tab-control': 'Control',
    'tab-config': 'Config'
  };

  function switchTab(targetTabId) {
    navBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === targetTabId);
    });

    panels.forEach(panel => {
      panel.classList.toggle('active', panel.id === targetTabId);
    });

    if (titleMap[targetTabId]) {
      headerTitle.innerText = titleMap[targetTabId];
    }
    state.activeTab = targetTabId;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (targetTabId === 'tab-monitoring') {
      setTimeout(() => {
        Object.values(state.charts).forEach(chart => chart.resize());
      }, 100);
    }
  }

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  if (manageFeedLink) {
    manageFeedLink.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('tab-control');
    });
  }
}

/* ================= 2. THEME TOGGLE ================= */
function initThemeToggle() {
  const themeBtn = document.getElementById('theme-toggle-btn');
  const themeIcon = document.getElementById('theme-icon');

  if (themeBtn && themeIcon) {
    themeBtn.addEventListener('click', () => {
      document.body.classList.toggle('dark-mode');
      const isDark = document.body.classList.contains('dark-mode');
      themeIcon.className = isDark ? 'fa-regular fa-sun' : 'fa-regular fa-moon';
      if (typeof updateChartTheme === 'function') updateChartTheme(isDark);
    });
  }
}

/* ================= 3. INSTAGRAM STYLE NOTIFICATION DRAWER ================= */
let currentNotifFilter = 'all';

function getValidTimestamp(n) {
  if (!n) return Date.now();

  let val = n.timestamp !== undefined ? n.timestamp : n.time;

  if (typeof val === 'number' && !isNaN(val) && val > 1000000000) {
    return val;
  }

  if (typeof val === 'string') {
    let parsed = Number(val);
    if (!isNaN(parsed) && parsed > 1000000000) {
      return parsed;
    }
  }

  if (n.id && typeof n.id === 'string' && n.id.includes('notif_')) {
    const parts = n.id.split('_');
    if (parts.length >= 2) {
      let parsedIdTs = Number(parts[1]);
      if (!isNaN(parsedIdTs) && parsedIdTs > 1000000000) {
        return parsedIdTs;
      }
    }
  }

  return Date.now();
}

function getNotifDateGroup(n) {
  const ts = getValidTimestamp(n);
  const d = new Date(ts);
  const now = new Date();

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const itemTime = d.getTime();

  if (itemTime >= todayStart) {
    return 'Hari Ini';
  } else if (itemTime >= yesterdayStart) {
    return 'Kemarin';
  } else {
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  }
}

function formatNotifTime(n) {
  const ts = getValidTimestamp(n);
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function initNotificationDropdown() {
  const bellBtn = document.getElementById('bell-btn');
  const drawer = document.getElementById('ig-notif-drawer');
  const overlay = document.getElementById('ig-notif-overlay');
  const closeBtn = document.getElementById('ig-notif-close-btn');
  const clearBtn = document.getElementById('clear-notif-btn');
  const markReadBtn = document.getElementById('mark-read-btn');
  const tabPills = document.querySelectorAll('.ig-tab-pill');

  function openDrawer() {
    if (drawer) drawer.classList.add('active');
    if (overlay) overlay.classList.add('active');
    renderNotifications();
  }

  function closeDrawer() {
    if (drawer) drawer.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
  }

  if (bellBtn) {
    bellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDrawer();
    });
  }

  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (overlay) overlay.addEventListener('click', closeDrawer);

  tabPills.forEach(pill => {
    pill.addEventListener('click', () => {
      tabPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentNotifFilter = pill.dataset.filter || 'all';
      renderNotifications();
    });
  });

  if (markReadBtn) {
    markReadBtn.addEventListener('click', () => {
      if (state.notifications) {
        state.notifications.forEach(n => n.read = true);
      }
      renderNotifications();
      if (window.aquaponicsDB && window.aquaponicsDB.markNotificationsRead) {
        window.aquaponicsDB.markNotificationsRead();
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.notifications = [];
      renderNotifications();
      if (window.aquaponicsDB && window.aquaponicsDB.clearNotifications) {
        window.aquaponicsDB.clearNotifications();
      }
    });
  }

  renderNotifications();
}

function renderNotifications() {
  const container = document.getElementById('notif-list-container');
  const countBadge = document.getElementById('bell-count');
  const unreadSubtext = document.getElementById('ig-notif-unread-count');

  if (!container) return;

  const notifs = state.notifications || [];
  const unreadCount = notifs.filter(n => !n.read).length;

  if (countBadge) {
    if (unreadCount > 0) {
      countBadge.innerText = unreadCount > 99 ? '99+' : unreadCount;
      countBadge.style.display = 'flex';
    } else {
      countBadge.style.display = 'none';
    }
  }

  if (unreadSubtext) {
    unreadSubtext.innerText = unreadCount > 0
      ? `${unreadCount} Notifikasi Belum Dibaca`
      : `Tidak ada notifikasi baru`;
  }

  let filtered = [...notifs];
  if (currentNotifFilter === 'telegram') {
    filtered = filtered.filter(n => n.source === 'telegram' || (n.title && n.title.toLowerCase().includes('telegram')));
  } else if (currentNotifFilter === 'warning') {
    filtered = filtered.filter(n => n.type === 'warning' || n.type === 'danger');
  }

  // Notifikasi terbaru selalu paling atas (Timestamp Descending akurat)
  filtered.sort((a, b) => getValidTimestamp(b) - getValidTimestamp(a));

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="ig-empty-notif">
        <div class="ig-empty-bell-icon"><i class="fa-regular fa-bell"></i></div>
        <div class="ig-empty-text">Tidak ada notifikasi</div>
      </div>
    `;
    return;
  }

  const iconMap = {
    warning: 'fa-triangle-exclamation',
    danger: 'fa-triangle-exclamation',
    success: 'fa-circle-check',
    info: 'fa-circle-info'
  };

  let htmlResult = '';
  let lastGroup = null;

  filtered.forEach(n => {
    const groupName = getNotifDateGroup(n);
    if (groupName !== lastGroup) {
      htmlResult += `<div class="ig-section-header">${groupName}</div>`;
      lastGroup = groupName;
    }

    const isTelegram = n.source === 'telegram' || (n.title && n.title.toLowerCase().includes('telegram'));
    const isUnread = !n.read;
    const timeStr = formatNotifTime(n);

    let avatarClass = isTelegram ? 'source-telegram' : `type-${n.type || 'warning'}`;
    let avatarIcon = isTelegram
      ? '<i class="fa-brands fa-telegram"></i>'
      : `<i class="fa-solid ${iconMap[n.type] || 'fa-triangle-exclamation'}"></i>`;

    let titleText = n.title || 'Notifikasi';
    if (!titleText.startsWith('⚠️') && !titleText.startsWith('ℹ️') && !titleText.startsWith('✅')) {
      if (n.type === 'warning' || n.type === 'danger' || !n.type) {
        titleText = `⚠️ ${titleText}`;
      }
    }

    let descText = n.desc || '';
    if (descText && !descText.includes('<strong>')) {
      descText = descText.replace(/^([A-Za-z0-9\s]+:)/, '<strong>$1</strong>');
    }

    htmlResult += `
      <div class="ig-notif-item ${isUnread ? 'unread' : ''}" data-id="${n.id || ''}">
        <div class="ig-avatar-badge ${avatarClass}">
          ${avatarIcon}
        </div>
        <div class="ig-notif-content">
          <div class="ig-notif-title-line">${titleText}</div>
          <div class="ig-notif-desc">${descText}</div>
          <div class="ig-notif-time">${timeStr}</div>
        </div>
        <div class="ig-notif-right-actions">
          ${isUnread ? '<div class="ig-unread-dot"></div>' : ''}
          <button class="ig-notif-close-item" data-id="${n.id || ''}" title="Hapus Notifikasi">&times;</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = htmlResult;

  container.querySelectorAll('.ig-notif-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.ig-notif-close-item')) return;
      const id = item.dataset.id;
      const target = state.notifications.find(n => n.id == id);
      if (target && !target.read) {
        target.read = true;
        renderNotifications();
      }
    });
  });

  container.querySelectorAll('.ig-notif-close-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (id) {
        state.notifications = state.notifications.filter(n => n.id != id);
        renderNotifications();
      }
    });
  });
}

function addNotification(type, title, desc, source = 'system') {
  if (!state.notifications) state.notifications = [];
  const notifObj = {
    id: `notif_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    type: type || 'info',
    title: title || 'Notifikasi',
    desc: desc || '',
    source: source || 'system',
    timestamp: Date.now(),
    read: false
  };
  state.notifications.unshift(notifObj);
  if (window.aquaponicsDB && window.aquaponicsDB.pushNotification) {
    window.aquaponicsDB.pushNotification(notifObj);
  }
  if (typeof renderNotifications === 'function') renderNotifications();
}
window.addNotification = addNotification;

/* ================= 4. REAL-TIME DATA BINDING ================= */
function initRealtimeDataBinding() {
  if (window.aquaponicsDB) {
    window.aquaponicsDB.subscribeTelemetry(data => {
      if (data) {
        let updated = false;
        if (data.suhu_air !== undefined) { state.telemetry.suhu_air = parseFloat(data.suhu_air); updated = true; }
        if (data.tds !== undefined) { state.telemetry.tds = parseFloat(data.tds); updated = true; }
        if (data.suhu_udara !== undefined) { state.telemetry.suhu_udara = parseFloat(data.suhu_udara); updated = true; }
        if (data.kelembaban !== undefined) { state.telemetry.kelembaban = parseFloat(data.kelembaban); updated = true; }
        if (data.level_air !== undefined) { state.telemetry.level_air = parseFloat(data.level_air); updated = true; }
        if (data.voltase_aki !== undefined) { state.telemetry.voltase_aki = parseFloat(data.voltase_aki); updated = true; }
        if (data.v_bat !== undefined) { state.telemetry.voltase_aki = parseFloat(data.v_bat); updated = true; }
        if (data.status_daya !== undefined) { state.telemetry.status_daya = data.status_daya; updated = true; }

        if (data.relays && Array.isArray(data.relays)) {
          if (!state.lastRelayToggleTime || (Date.now() - state.lastRelayToggleTime > 15000)) {
            state.relays = data.relays;
            if (typeof syncRelayUI === 'function') syncRelayUI();
          }
        }

        if (updated) {
          updateUI();
          pushRealtimeChartData(data);
        }
      }
    });

    if (window.aquaponicsDB.subscribeNotifications) {
      window.aquaponicsDB.subscribeNotifications(list => {
        if (Array.isArray(list)) {
          state.notifications = list;
          renderNotifications();
        }
      });
    }
  }

  setInterval(updateUI, 2000);
}

function pushRealtimeChartData(data) {
  const charts = state.charts;
  if (!charts) return;

  if (data.suhu_air !== undefined && charts.suhuAir) {
    const d = charts.suhuAir.data.datasets[0].data;
    if (d && d.length > 0) {
      d[d.length - 1] = parseFloat(data.suhu_air);
      charts.suhuAir.update('none');
    }
  }

  if (data.tds !== undefined && charts.tds) {
    const d = charts.tds.data.datasets[0].data;
    if (d && d.length > 0) {
      d[d.length - 1] = Math.round(data.tds);
      charts.tds.update('none');
    }
  }

  if (data.level_air !== undefined && charts.levelAir) {
    const d = charts.levelAir.data.datasets[0].data;
    if (d && d.length > 0) {
      d[d.length - 1] = parseFloat(data.level_air);
      charts.levelAir.update('none');
    }
  }

  if (data.suhu_udara !== undefined && charts.suhuUdara) {
    const d = charts.suhuUdara.data.datasets[0].data;
    if (d && d.length > 0) {
      d[d.length - 1] = parseFloat(data.suhu_udara);
      charts.suhuUdara.update('none');
    }
  }
}

const TELEGRAM_CONFIG = {
  botToken: "8758597072:AAEe0ymSD2RfdiCAoF4EoCfLpf2oeOdW3NM",
  chatId: "7207067918",
  lastAlerts: {}
};

async function sendTelegramAlert(key, text, isInstant = false) {
  const now = Date.now();
  // 3 Menit Cooldown (180,000 ms) untuk alert kritis, instant untuk saklar relay
  if (!isInstant && TELEGRAM_CONFIG.lastAlerts[key] && (now - TELEGRAM_CONFIG.lastAlerts[key] < 180000)) return;
  TELEGRAM_CONFIG.lastAlerts[key] = now;

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_CONFIG.botToken}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CONFIG.chatId, text: text, parse_mode: "HTML" })
    });
    console.log(`[Telegram Alert Sent]: ${key}`);
  } catch (e) {
    console.warn("[Telegram Web Error]", e);
  }

  // Masukkan semua notifikasi Telegram & Alert ke ikon lonceng web
  try {
    const cleanText = text.replace(/<[^>]*>/g, '').replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
    const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const title = lines[0] || 'Notifikasi System';
    const desc = lines.length > 1 ? lines.slice(1).join(' ') : title;
    const isAlert = key.includes('web_level_air') || key.includes('web_tds') || key.includes('web_suhu') || key.includes('alert');
    const type = isAlert ? 'warning' : (key.includes('feed') ? 'success' : 'info');
    addNotification(type, title, desc, 'system');
  } catch (err) {
    console.warn('[Web Notif Error]', err);
  }
}

// Periodic 7-Day Telegram Report Engine (Laporan Periodik Hanya Setiap 7 Hari)
setInterval(() => {
  if (state.telemetry && state.telemetry.suhu_air !== undefined) {
    const t = state.telemetry;
    const statusAir = (t.suhu_air >= 24 && t.suhu_air <= 32) ? "Normal" : "KRITIS!";
    const statusTds = (t.tds < 400) ? "Rendah" : (t.tds > 900 ? "Pekat!" : "Optimal");
    const statusWater = (t.level_air >= 30) ? "Aman" : "Dangkal!";

    const reportMsg = `\u{1F4CA} <b>[LAPORAN MINGGUAN AKUAPONIK]</b>\n\u{23F1}\u{FE0F} <i>Interval: Setiap 7 Hari</i>\n\n` +
      `\u{1F321}\u{FE0F} <b>Suhu Air:</b> ${t.suhu_air.toFixed(1)} \u{00B0}C (${statusAir})\n` +
      `\u{1F9EA} <b>TDS Nutrisi:</b> ${Math.round(t.tds)} PPM (${statusTds})\n` +
      `\u{2600}\u{FE0F} <b>Suhu Udara:</b> ${t.suhu_udara.toFixed(1)} \u{00B0}C (${Math.round(t.kelembaban)}% RH)\n` +
      `\u{1F30A} <b>Ketinggian Air:</b> ${t.level_air.toFixed(1)} % (${statusWater})\n\n` +
      `\u{1F7E2} <i>Sistem IoT berjalan normal.</i>`;

    sendTelegramAlert('periodic_7day_report_' + Math.floor(Date.now() / 604800000), reportMsg, true);
  }
}, 604800000); // 7 Hari = 604,800,000 ms

function updateUI() {
  const critIcon = '<i class="fa-solid fa-circle-exclamation text-critical-red"></i> ';

  // 1. Suhu Air Kolam (Optimal 24 - 32°C)
  const suhuAir = state.telemetry.suhu_air;
  const elSuhuAir = document.getElementById('val-suhu-air');
  const badgeSuhuAir = document.getElementById('badge-suhu-air');
  const isSuhuAirCritical = suhuAir < 24.0 || suhuAir > 32.0;

  if (isSuhuAirCritical) {
    elSuhuAir.classList.add('text-critical-red');
    elSuhuAir.classList.remove('text-emerald');
    if (badgeSuhuAir) {
      badgeSuhuAir.className = 'badge-status status-red';
      badgeSuhuAir.innerHTML = `${critIcon}${suhuAir < 24.0 ? 'Suhu Dingin!' : 'Suhu Panas!'}`;
    }
  } else {
    elSuhuAir.classList.remove('text-critical-red');
    elSuhuAir.classList.add('text-emerald');
    if (badgeSuhuAir) {
      badgeSuhuAir.className = 'badge-status status-green';
      badgeSuhuAir.innerHTML = '<span class="status-dot green"></span> Stabil';
    }
  }
  elSuhuAir.innerHTML = `${suhuAir.toFixed(1)}&deg;C`;

  // 2. TDS Nutrisi Air (Optimal 400 - 900 PPM)
  const tdsVal = Math.round(state.telemetry.tds);
  const elTds = document.getElementById('val-tds');
  const tdsStatusEl = document.getElementById('status-tds');
  const tdsRingFill = document.getElementById('tds-ring-fill');
  const isTdsCritical = tdsVal < 400 || tdsVal > 900;

  if (isTdsCritical) {
    if (elTds) {
      elTds.classList.add('text-critical-red');
      elTds.classList.remove('text-sky');
    }
    if (tdsStatusEl) {
      tdsStatusEl.className = 'status-warning-amber';
      tdsStatusEl.style.color = '#D97706';
      tdsStatusEl.innerHTML = `⚠️ ${tdsVal < 400 ? 'Nutrisi Rendah (Air Bersih)' : 'Nutrisi Pekat'}`;
    }
  } else {
    if (elTds) {
      elTds.classList.remove('text-critical-red');
      elTds.classList.add('text-sky');
    }
    if (tdsStatusEl) {
      tdsStatusEl.className = 'success-text-normal';
      tdsStatusEl.innerHTML = '<span class="status-dot green"></span> Nutrisi Optimal';
    }
  }
  if (elTds) elTds.innerHTML = `${tdsVal}`;

  // SVG TDS Ring: Circumference = 150.8
  // Nilai 0 PPM = Offset 150.8 (Lingkaran Biru 0 / Kosong Total)
  // Nilai > 0 PPM = Menyesuaikan persentase (Target 1000 PPM = 100%)
  if (tdsRingFill) {
    const tdsPct = Math.min(100, Math.max(0, (tdsVal / 1000) * 100));
    const offset = 150.8 - (150.8 * tdsPct) / 100;
    tdsRingFill.style.strokeDashoffset = offset;

    // Warna MERAH HANYA jika angka PPM naik tinggi melampaui batas pekat (> 900 PPM)
    if (tdsVal > 900) {
      tdsRingFill.style.stroke = '#EF4444';
    } else {
      tdsRingFill.style.stroke = '#2563EB';
    }
  }

  // 3. Suhu Udara Ambient (Optimal 20 - 33°C)
  const suhuUdara = state.telemetry.suhu_udara;
  const elSuhuUdara = document.getElementById('val-suhu-udara');
  const badgeSuhuUdara = document.getElementById('badge-suhu-udara');
  const isSuhuUdaraCritical = suhuUdara < 20.0 || suhuUdara > 33.0;

  if (isSuhuUdaraCritical) {
    if (elSuhuUdara) {
      elSuhuUdara.style.color = '#EF4444';
    }
    if (badgeSuhuUdara) {
      badgeSuhuUdara.className = 'air-temp-status-pill red-pill';
      badgeSuhuUdara.style.background = '#FEE2E2';
      badgeSuhuUdara.style.color = '#DC2626';
      badgeSuhuUdara.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${suhuUdara < 20.0 ? 'Udara Dingin!' : 'Udara Panas!'}`;
    }
  } else {
    if (elSuhuUdara) {
      elSuhuUdara.style.color = '#EA580C';
    }
    if (badgeSuhuUdara) {
      badgeSuhuUdara.className = 'air-temp-status-pill';
      badgeSuhuUdara.style.background = '#FFEDD5';
      badgeSuhuUdara.style.color = '#C2410C';
      badgeSuhuUdara.innerHTML = '<span class="air-status-dot"></span> Normal';
    }
  }
  if (elSuhuUdara) elSuhuUdara.innerHTML = `${suhuUdara.toFixed(1)}&deg;C`;

  // Scale Equalizer Bars dynamically according to current air temperature
  const equalizerBars = document.querySelectorAll('#air-temp-equalizer .air-bar');
  if (equalizerBars.length > 0) {
    const tempRatio = Math.max(0.5, Math.min(1.4, suhuUdara / 27));
    const baseHeights = [35, 58, 90, 72, 48, 82, 96];
    equalizerBars.forEach((bar, idx) => {
      const scaledH = Math.round(baseHeights[idx] * tempRatio);
      bar.style.height = `${Math.min(100, Math.max(15, scaledH))}%`;
    });
  }

  // 4. Kelembaban Udara (Optimal 50 - 90%)
  const kelembaban = Math.round(state.telemetry.kelembaban);
  const elKelembaban = document.getElementById('val-kelembaban');
  const statusKelembaban = document.getElementById('status-kelembaban');
  const humidityRingFill = document.getElementById('humidity-ring-fill');
  const isKelembabanCritical = kelembaban < 50 || kelembaban > 90;

  if (isKelembabanCritical) {
    if (elKelembaban) {
      elKelembaban.classList.add('text-critical-red');
      elKelembaban.classList.remove('text-purple');
    }
    if (statusKelembaban) {
      statusKelembaban.className = 'warning-alert-text text-critical-red font-weight-700';
      statusKelembaban.innerHTML = `${critIcon}${kelembaban < 50 ? 'Udara Kering' : 'Udara Lembab'}`;
    }
  } else {
    if (elKelembaban) {
      elKelembaban.classList.remove('text-critical-red');
      elKelembaban.classList.add('text-purple');
    }
    if (statusKelembaban) {
      statusKelembaban.className = 'badge-status status-purple';
      statusKelembaban.innerHTML = '<span class="status-dot purple"></span> Optimal';
    }
  }
  if (elKelembaban) elKelembaban.innerHTML = `${kelembaban}%`;

  // SVG Humidity Ring: Circumference = 157.1 (Tanpa Getar)
  if (humidityRingFill) {
    const humPct = Math.min(100, Math.max(0, kelembaban));
    const offset = 157.1 - (157.1 * humPct) / 100;
    humidityRingFill.style.strokeDashoffset = offset;
    if (isKelembabanCritical) {
      humidityRingFill.style.stroke = '#EF4444';
    } else {
      humidityRingFill.style.stroke = '#8B5CF6';
    }
  }

  const levelAir = state.telemetry.level_air;
  const elLevelAir = document.getElementById('val-level-air');
  const badgeLevelAir = document.getElementById('badge-level-air');
  const ringFill = document.getElementById('water-ring-fill');
  const isLevelAirCritical = levelAir < 30.0;

  if (isLevelAirCritical) {
    elLevelAir.classList.add('text-critical-red');
    elLevelAir.classList.remove('text-teal');
    if (badgeLevelAir) {
      badgeLevelAir.className = 'badge-status status-red margin-v-4';
      badgeLevelAir.innerHTML = `${critIcon}Air Kritis!`;
    }
  } else {
    elLevelAir.classList.remove('text-critical-red');
    elLevelAir.classList.add('text-teal');
    if (badgeLevelAir) {
      badgeLevelAir.className = 'badge-status status-green margin-v-4';
      badgeLevelAir.innerHTML = '<span class="status-dot green"></span> Pompa Aman';
    }
  }
  elLevelAir.innerHTML = `${levelAir.toFixed(1)}%`;

  // SVG Ring Calculation (Circumference = 2 * PI * 40 ≈ 251.2)
  if (ringFill) {
    const offset = 251.2 - (251.2 * levelAir) / 100;
    ringFill.style.strokeDashoffset = offset;
  }

  // Trigger Automatic Telegram Alerts for Web Dashboard when thresholds breached
  if (isLevelAirCritical) {
    sendTelegramAlert('web_level_air', `🚨 <b>PERINGATAN DARURAT AKUAPONIK!</b>\nKetinggian air kolam terdeteksi <b>${levelAir.toFixed(1)}%</b> (< 30%).\n\n<i>Harap segera isi ulang air kolam!</i>`);
  }
  if (isTdsCritical) {
    if (tdsVal < 400) {
      sendTelegramAlert('web_tds_low', `⚠️ <b>PERINGATAN NUTRISI RENDAH!</b>\nKadar TDS air terdeteksi <b>${tdsVal} PPM</b> (< 400 PPM).\n\n<i>Disarankan menambahkan nutrisi AB Mix!</i>`);
    } else {
      sendTelegramAlert('web_tds_high', `⚠️ <b>PERINGATAN NUTRISI PEKAT!</b>\nKadar TDS air terdeteksi <b>${tdsVal} PPM</b> (> 900 PPM).\n\n<i>Risiko ujung daun terbakar! Harap kurangi kepekatan nutrisi.</i>`);
    }
  }
  if (isSuhuAirCritical) {
    sendTelegramAlert('web_suhu_air', `⚠️ <b>PERINGATAN SUHU AIR KOLAM!</b>\nSuhu air kolam terdeteksi <b>${suhuAir.toFixed(1)}°C</b>.\n\n<i>Harap periksa sirkulasi air kolam!</i>`);
  }

  // 5. Voltase Aki & Status Daya (Auto Cut-Off 11.7V & Switching Panel Surya)
  const vAki = (state.telemetry.voltase_aki !== undefined) ? state.telemetry.voltase_aki : 12.4;
  const elVoltase = document.getElementById('val-voltase-aki');
  const pillDaya = document.getElementById('pill-status-daya');
  const isVoltageLow = (vAki <= 11.7 && vAki > 5.0);

  if (elVoltase) {
    elVoltase.innerHTML = `${vAki.toFixed(1)} V`;
    if (isVoltageLow) {
      elVoltase.className = 'power-val text-critical-red font-weight-800';
    } else {
      elVoltase.className = 'power-val text-blue font-weight-800';
    }
  }

  if (pillDaya) {
    if (isVoltageLow || state.relays[0] === 1 || state.telemetry.status_daya === 'Panel Surya') {
      pillDaya.className = 'power-pill status-power-solar';
      pillDaya.innerHTML = '☀️ Panel Surya (Cut-off Aktif)';
    } else {
      pillDaya.className = 'power-pill status-power-normal';
      pillDaya.innerHTML = '🔋 Aki 12V (Normal)';
    }
  }

  if (isVoltageLow) {
    sendTelegramAlert('web_voltage_low', `⚠️ <b>PERINGATAN VOLTASE AKI KRITIS!</b>\nVoltase aki terdeteksi <b>${vAki.toFixed(1)} V</b> (<= 11.7V).\n\n<i>Sistem otomatis memutus mesin dan beralih ke <b>Panel Surya (ATS Switch ON)</b>!</i>`);
  }

  // Update Chart Badges
  const bSuhuAir = document.getElementById('badge-chart-suhu-air');
  if (bSuhuAir) bSuhuAir.innerHTML = `${state.telemetry.suhu_air.toFixed(1)} &deg;C`;

  const bTds = document.getElementById('badge-chart-tds');
  if (bTds) bTds.innerText = `${tdsVal} PPM`;

  const bLevelAir = document.getElementById('badge-chart-level-air');
  if (bLevelAir) bLevelAir.innerText = `${levelAir.toFixed(1)}%`;

  const bSuhuUdara = document.getElementById('badge-chart-suhu-udara');
  if (bSuhuUdara) bSuhuUdara.innerHTML = `${state.telemetry.suhu_udara.toFixed(1)} &deg;C`;

  // Update Dynamic Ecosystem Status (Fish water level & Plant TDS health)
  updateEcosystemStatus();

  // Update feeding countdown
  updateFeedingCountdown();
}

function updateEcosystemStatus() {
  const levelAir = state.telemetry.level_air;
  const suhuAir = state.telemetry.suhu_air;
  const tdsVal = Math.round(state.telemetry.tds);

  // ================= 1. KONDISI IKAN (WATER LEVEL & FISH) =================
  const ecoWaterPath = document.getElementById('eco-water-path');
  const ecoFishGroup = document.getElementById('eco-fish-group');
  const ecoFishBody = document.getElementById('eco-fish-body');
  const ecoBubblesGroup = document.getElementById('eco-bubbles-group');
  const ecoFishPill = document.getElementById('eco-fish-status-pill');

  const waterY = Math.max(20, Math.min(85, Math.round(90 - (levelAir * 0.7))));
  if (ecoWaterPath) {
    ecoWaterPath.setAttribute('d', `M 0 ${waterY} Q 60 ${waterY - 8} 120 ${waterY} T 240 ${waterY - 5} L 240 100 L 0 100 Z`);
  }

  const fishYOffset = Math.round((waterY - 50) * 0.7);
  const isFishCritical = levelAir < 30.0 || suhuAir < 20.0 || suhuAir > 34.0;

  if (isFishCritical) {
    if (ecoFishBody) ecoFishBody.setAttribute('fill', '#EF4444');
    if (ecoFishGroup) {
      ecoFishGroup.style.transform = `translate(10px, ${fishYOffset + 12}px) rotate(22deg)`;
    }
    if (ecoBubblesGroup) ecoBubblesGroup.style.display = 'none';
    if (ecoFishPill) {
      ecoFishPill.className = 'eco-status-pill red-pill';
      ecoFishPill.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><span>Air Kritis (${levelAir.toFixed(1)}%): Air Dangkal!</span>`;
    }
  } else {
    if (ecoFishBody) ecoFishBody.setAttribute('fill', '#5E6C7D');
    if (ecoFishGroup) {
      ecoFishGroup.style.transform = `translate(0px, ${fishYOffset}px) rotate(0deg)`;
    }
    if (ecoBubblesGroup) ecoBubblesGroup.style.display = 'block';
    if (ecoFishPill) {
      ecoFishPill.className = 'eco-status-pill green-pill';
      ecoFishPill.innerHTML = `<span class="status-dot green"></span><span>Air Normal (${levelAir.toFixed(1)}%): Ikan Sehat & Aktif</span>`;
    }
  }

  // ================= 2. KONDISI TANAMAN (TDS & PLANTS) =================
  const leafLeft = document.getElementById('eco-leaf-left');
  const leafRight = document.getElementById('eco-leaf-right');
  const leafCenter = document.getElementById('eco-leaf-center');
  const ecoPlantPill = document.getElementById('eco-plant-status-pill');

  if (tdsVal < 400) {
    if (leafLeft) leafLeft.setAttribute('fill', '#D97706');
    if (leafRight) leafRight.setAttribute('fill', '#F59E0B');
    if (leafCenter) leafCenter.setAttribute('fill', '#FBBF24');
    if (ecoPlantPill) {
      ecoPlantPill.className = 'eco-status-pill amber-pill';
      ecoPlantPill.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><span>Nutrisi Rendah (${tdsVal} PPM): Lambat</span>`;
    }
  } else if (tdsVal <= 900) {
    if (leafLeft) leafLeft.setAttribute('fill', '#10B981');
    if (leafRight) leafRight.setAttribute('fill', '#059669');
    if (leafCenter) leafCenter.setAttribute('fill', '#34D399');
    if (ecoPlantPill) {
      ecoPlantPill.className = 'eco-status-pill green-pill';
      ecoPlantPill.innerHTML = `<span class="status-dot green"></span><span>Nutrisi Optimal (${tdsVal} PPM): Subur</span>`;
    }
  } else {
    if (leafLeft) leafLeft.setAttribute('fill', '#DC2626');
    if (leafRight) leafRight.setAttribute('fill', '#B91C1C');
    if (leafCenter) leafCenter.setAttribute('fill', '#EF4444');
    if (ecoPlantPill) {
      ecoPlantPill.className = 'eco-status-pill red-pill';
      ecoPlantPill.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><span>Nutrisi Pekat (${tdsVal} PPM): Terbakar</span>`;
    }
  }
}

function updateFeedingCountdown() {
  const now = new Date();
  const hoursStr = String(now.getHours()).padStart(2, '0');
  const minsStr = String(now.getMinutes()).padStart(2, '0');
  const timeNowStr = `${hoursStr}:${minsStr}`;
  const dateTodayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  if (!state.lastTriggeredSchedules) {
    state.lastTriggeredSchedules = {};
  }

  let nextSchedule = null;
  let minDiff = Infinity;

  state.schedules.forEach(sched => {
    const [h, m] = sched.time.split(':').map(Number);
    const schedMinutes = h * 60 + m;
    const timeSchedStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    // AUTOMATIC FEEDING EXECUTION ENGINE
    if (timeNowStr === timeSchedStr) {
      const triggerKey = `${dateTodayStr}_${timeSchedStr}`;
      if (!state.lastTriggeredSchedules[triggerKey]) {
        state.lastTriggeredSchedules[triggerKey] = true;
        console.log(`[Auto Feeder Triggered] Scheduled time hit: ${timeSchedStr} (${sched.portion} Portion)`);

        // Trigger Feeding Action (Relay 6, Firebase & Telegram Alert)
        if (typeof triggerDirectFeeding === 'function') {
          triggerDirectFeeding(sched.portion);
        }

        // Display Success Toast Notification
        if (typeof addNotification === 'function') {
          addNotification('success', 'Pakan Otomatis Berhasil', `Feeder Pakan otomatis aktif sesuai jadwal ${timeSchedStr} (${sched.portion} Porsi)`);
        }
      }
    }

    let diff = schedMinutes - currentMinutes;
    if (diff <= 0) {
      diff += 24 * 60; // Next day
    }
    if (diff < minDiff) {
      minDiff = diff;
      nextSchedule = sched;
    }
  });

  const countdownEl = document.getElementById('feed-countdown');
  const nextTimeEl = document.getElementById('feed-next-time');

  if (countdownEl && nextTimeEl) {
    if (nextSchedule && minDiff !== Infinity) {
      const hoursRemaining = Math.floor(minDiff / 60);
      const minsRemaining = minDiff % 60;

      if (hoursRemaining > 0) {
        countdownEl.innerText = `${hoursRemaining} Jm ${minsRemaining} Mnt`;
      } else {
        countdownEl.innerText = `${minsRemaining} Mnt Lagi`;
      }
      nextTimeEl.innerText = `${nextSchedule.time} (${nextSchedule.portion} Porsi)`;
    } else {
      countdownEl.innerText = '- Mnt Lagi';
      nextTimeEl.innerText = 'Belum Ada Jadwal';
    }
  }
}

function getChartTimeLabels(period) {
  const p = String(period || 'harian').toLowerCase().trim();
  if (p === 'harian' || p === 'daily') {
    return ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00', '24:00'];
  } else if (p === 'mingguan' || p === 'weekly') {
    return ['Minggu 1', 'Minggu 2', 'Minggu 3', 'Minggu 4'];
  } else {
    // Exact Bulanan date labels format matching user screenshot: '22 Jul', '26 Jul', '30 Jul', '3 Agt', '7 Agt', '11 Agt', '15 Agt', '19 Agt'
    const monthsIndo = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
    const today = new Date();
    const labels = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - (i * 4));
      labels.push(`${d.getDate()} ${monthsIndo[d.getMonth()]}`);
    }
    return labels;
  }
}

function initCharts() {
  const period = state.activePeriod || 'harian';
  const labels = getChartTimeLabels(period);

  const isDark = document.body.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94A3B8' : '#64748B';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(226, 232, 240, 0.7)';

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
        backgroundColor: '#27272A',
        titleColor: '#FFFFFF',
        titleFont: { family: 'Inter', size: 12, weight: '700' },
        bodyColor: '#FFFFFF',
        bodyFont: { family: 'Inter', size: 12, weight: '500' },
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 10,
        usePointStyle: true,
        boxWidth: 8,
        boxHeight: 8,
        boxPadding: 4,
        callbacks: {
          label: function (context) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null && context.parsed.y !== undefined) {
              const val = context.parsed.y;
              if (Number.isInteger(val)) {
                label += val.toLocaleString('id-ID');
              } else {
                label += val.toFixed(1).replace('.', ',');
              }
            }
            return label;
          }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false, drawBorder: false },
        ticks: { color: textColor, font: { family: 'Inter', size: 11 } }
      },
      y: {
        grid: { color: gridColor, drawBorder: false },
        ticks: { color: textColor, font: { family: 'Inter', size: 11 } }
      }
    }
  };

  const currentSuhuAir = state.telemetry.suhu_air || 26.3;
  const currentTds = Math.round(state.telemetry.tds) || 0;
  const currentLevel = state.telemetry.level_air || 68.5;
  const currentSuhuUdara = state.telemetry.suhu_udara || 27.1;

  // 1. Chart Suhu Air Kolam (°C)
  const elSuhuAir = document.getElementById('chart-suhu-air');
  if (elSuhuAir) {
    const ctxSuhuAir = elSuhuAir.getContext('2d');
    state.charts.suhuAir = new Chart(ctxSuhuAir, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Suhu Air (°C)',
          data: period === 'bulanan'
            ? [30.1, 28.5, 29.2, 29.0, 28.6, 29.8, 28.0, currentSuhuAir]
            : [25.8, 25.6, 25.5, 26.0, 26.8, 27.2, 26.9, 26.5, currentSuhuAir],
          borderColor: '#2563EB',
          backgroundColor: 'rgba(37, 99, 235, 0.12)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.4,
          spanGaps: true,
          pointRadius: 4,
          pointHoverRadius: 7,
          pointBackgroundColor: '#2563EB',
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2
        }]
      },
      options: {
        ...commonOptions,
        scales: {
          ...commonOptions.scales,
          y: {
            ...commonOptions.scales.y,
            min: 0,
            max: 45,
            ticks: {
              ...commonOptions.scales.y.ticks,
              stepSize: 5
            }
          }
        }
      }
    });
  }

  // 2. Chart TDS Nutrisi Air (PPM)
  const elTDS = document.getElementById('chart-tds');
  if (elTDS) {
    const ctxTDS = elTDS.getContext('2d');
    state.charts.tds = new Chart(ctxTDS, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'TDS Nutrisi Air (PPM)',
          data: period === 'bulanan'
            ? [15, 0, 10, 5, 0, 20, 0, currentTds]
            : [580, 585, 590, 595, 610, 605, 600, 592, currentTds],
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.10)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.4,
          spanGaps: true,
          pointRadius: 4,
          pointHoverRadius: 7,
          pointBackgroundColor: '#10B981',
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2
        }]
      },
      options: {
        ...commonOptions,
        scales: {
          ...commonOptions.scales,
          y: {
            ...commonOptions.scales.y,
            min: 0,
            max: 1200,
            ticks: {
              ...commonOptions.scales.y.ticks,
              stepSize: 200,
              callback: (val) => val === 0 ? '0' : val.toLocaleString('id-ID')
            }
          }
        }
      }
    });
  }

  // 3. Chart Level Air Kolam (%)
  const elLevelAir = document.getElementById('chart-level-air');
  if (elLevelAir) {
    const ctxLevelAir = elLevelAir.getContext('2d');
    state.charts.levelAir = new Chart(ctxLevelAir, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Level Air Kolam (%)',
          data: [72, 70, 69, 75, 74, 71, 70, 69, currentLevel],
          borderColor: '#06B6D4',
          backgroundColor: 'rgba(6, 182, 212, 0.12)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          spanGaps: true,
          pointRadius: 4,
          pointHoverRadius: 7,
          pointBackgroundColor: '#06B6D4',
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2
        }]
      },
      options: {
        ...commonOptions,
        scales: {
          ...commonOptions.scales,
          y: {
            ...commonOptions.scales.y,
            min: 0,
            max: 100,
            ticks: {
              ...commonOptions.scales.y.ticks,
              stepSize: 20
            }
          }
        }
      }
    });
  }

  // 4. Chart Suhu Udara Ambient (°C)
  const elSuhuUdara = document.getElementById('chart-suhu-udara');
  if (elSuhuUdara) {
    const ctxSuhuUdara = elSuhuUdara.getContext('2d');
    state.charts.suhuUdara = new Chart(ctxSuhuUdara, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Suhu Udara (°C)',
          data: [24.5, 24.0, 25.2, 28.5, 31.0, 30.2, 28.4, 27.5, currentSuhuUdara],
          borderColor: '#F97316',
          backgroundColor: 'rgba(249, 115, 22, 0.12)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.4,
          spanGaps: true,
          pointRadius: 4,
          pointHoverRadius: 7,
          pointBackgroundColor: '#F97316',
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2
        }]
      },
      options: {
        ...commonOptions,
        scales: {
          ...commonOptions.scales,
          y: {
            ...commonOptions.scales.y,
            min: 0,
            max: 45,
            ticks: {
              ...commonOptions.scales.y.ticks,
              stepSize: 5
            }
          }
        }
      }
    });
  }

  // 5. Mini Chart.js Bar Graphic for Suhu Udara Ambient on Beranda Card
  const elMiniSuhuUdara = document.getElementById('mini-chart-suhu-udara');
  if (elMiniSuhuUdara) {
    const ctxMini = elMiniSuhuUdara.getContext('2d');
    state.charts.miniSuhuUdara = new Chart(ctxMini, {
      type: 'bar',
      data: {
        labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', 'Saat ini'],
        datasets: [{
          label: 'Suhu Udara (°C)',
          data: [24.5, 24.0, 26.2, 31.0, 29.5, 27.8, currentSuhuUdara],
          backgroundColor: 'rgba(245, 158, 11, 0.75)',
          hoverBackgroundColor: '#F59E0B',
          borderRadius: 4,
          borderSkipped: false,
          barThickness: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: '#1E293B',
            titleColor: '#F8FAFC',
            bodyColor: '#F8FAFC',
            borderRadius: 6,
            padding: 6
          }
        },
        scales: {
          x: { display: false },
          y: { display: false, min: 15, max: 40 }
        }
      }
    });
  }

  // Bind click event listeners to period filter buttons (Harian, Mingguan, Bulanan)
  const filterBtns = document.querySelectorAll('.filter-btn, .filter-tab-group button');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const selectedPeriod = (btn.dataset.period || btn.innerText).toLowerCase().trim();
      state.activePeriod = selectedPeriod;
      console.log(`[Chart Period Switch] Period changed to: ${selectedPeriod}`);

      updateChartsData();
    });
  });
}

function updateChartsData() {
  const period = String(state.activePeriod || 'harian').toLowerCase().trim();
  const labels = getChartTimeLabels(period);

  let suhuAirData, tdsData, levelAirData, suhuUdaraData;

  const currentSuhuAir = state.telemetry.suhu_air || 26.3;
  const currentTds = Math.round(state.telemetry.tds) || 0;
  const currentLevel = state.telemetry.level_air || 68.5;
  const currentSuhuUdara = state.telemetry.suhu_udara || 27.1;

  if (period === 'harian' || period === 'daily') {
    suhuAirData = [25.8, 25.6, 25.5, 26.0, 26.8, 27.2, 26.9, 26.5, currentSuhuAir];
    tdsData = [580, 585, 590, 595, 610, 605, 600, 592, currentTds];
    levelAirData = [72, 70, 69, 75, 74, 71, 70, 69, currentLevel];
    suhuUdaraData = [24.5, 24.0, 25.2, 28.5, 31.0, 30.2, 28.4, 27.5, currentSuhuUdara];
  } else if (period === 'mingguan' || period === 'weekly') {
    suhuAirData = [26.0, 26.4, 26.8, currentSuhuAir];
    tdsData = [530, 580, 620, currentTds];
    levelAirData = [82, 80, 75, currentLevel];
    suhuUdaraData = [26.5, 27.8, 28.9, currentSuhuUdara];
  } else {
    // Bulanan data matching user screenshot
    suhuAirData = [30.1, 28.5, 29.2, 29.0, 28.6, 29.8, 28.0, currentSuhuAir];
    tdsData = [15, 0, 10, 5, 0, 20, 0, currentTds];
    levelAirData = [88, 84, 81, 77, 73, 70, 68, currentLevel];
    suhuUdaraData = [24.8, 26.0, 27.5, 28.7, 28.0, 27.4, 27.0, currentSuhuUdara];
  }

  // Update datasets dynamically without flickering or glitches
  if (state.charts.suhuAir) {
    state.charts.suhuAir.data.labels = labels;
    state.charts.suhuAir.data.datasets[0].data = suhuAirData;
    state.charts.suhuAir.update();
  }

  if (state.charts.tds) {
    state.charts.tds.data.labels = labels;
    state.charts.tds.data.datasets[0].data = tdsData;
    state.charts.tds.update();
  }

  if (state.charts.levelAir) {
    state.charts.levelAir.data.labels = labels;
    state.charts.levelAir.data.datasets[0].data = levelAirData;
    state.charts.levelAir.update();
  }

  if (state.charts.suhuUdara) {
    state.charts.suhuUdara.data.labels = labels;
    state.charts.suhuUdara.data.datasets[0].data = suhuUdaraData;
    state.charts.suhuUdara.update();
  }

  if (state.charts.miniSuhuUdara) {
    const miniDataset = state.charts.miniSuhuUdara.data.datasets[0];
    miniDataset.data[miniDataset.data.length - 1] = currentSuhuUdara;
    state.charts.miniSuhuUdara.update();
  }
}

function updateChartTheme(isDark) {
  const textColor = isDark ? '#94A3B8' : '#64748B';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';

  Object.values(state.charts).forEach(chart => {
    if (chart && chart.options) {
      chart.options.scales.x.ticks.color = textColor;
      chart.options.scales.x.grid.color = gridColor;
      chart.options.scales.y.ticks.color = textColor;
      chart.options.scales.y.grid.color = gridColor;
      chart.options.plugins.legend.labels.color = textColor;
      chart.update();
    }
  });
}

/* ================= 6. CONTROL RELAYS SWITCHES ================= */
function initControlRelays() {
  syncRelayUI();
}

function addNotification(type, title, desc) {
  if (!state.notifications) state.notifications = [];
  state.notifications.unshift({
    id: Date.now(),
    type: type,
    title: title,
    desc: desc,
    time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  });
  if (typeof renderNotifications === 'function') renderNotifications();
}
window.addNotification = addNotification;

function triggerDirectFeeding(portion = 1) {
  const pVal = parseInt(portion) || 1;
  const feedDuration = pVal * 10000;

  state.relays[5] = 1;
  syncRelayUI();

  if (window.aquaponicsDB) {
    window.aquaponicsDB.updateRelayState(6, 1);
    window.aquaponicsDB.triggerFeeding(pVal);
  }

  addNotification('success', 'Pakan Ikan Dikirim', `Feeder Pakan aktif selama ${feedDuration / 1000} detik (${pVal} Porsi)`);

  const feedMsg = `\u{1F41F} <b>[PEMBERIAN PAKAN BERHASIL]</b>\n` +
    `\u{26A1} <b>Feeder Pakan (Relay 6):</b> Aktif ${feedDuration / 1000} Detik\n` +
    `\u{1F35A} <b>Jumlah Pakan:</b> ${pVal} Porsi\n` +
    `\u{23F0} <b>Jadwal Berikutnya:</b> 08:00 (1 Porsi)`;
  sendTelegramAlert(`feed_success_${Date.now()}`, feedMsg, true);

  if (window.feederTimerRef) clearTimeout(window.feederTimerRef);
  window.feederTimerRef = setTimeout(() => {
    state.relays[5] = 0;
    syncRelayUI();

    if (window.aquaponicsDB) {
      window.aquaponicsDB.updateRelayState(6, 0);
    }
  }, feedDuration);
}
window.triggerDirectFeeding = triggerDirectFeeding;

function toggleRelayChannel(channel) {
  if (channel === 6) {
    if (state.relays[5] === 1) {
      // If currently ON, turn OFF immediately
      if (window.feederTimerRef) clearTimeout(window.feederTimerRef);
      state.relays[5] = 0;
      syncRelayUI();
      if (window.aquaponicsDB) window.aquaponicsDB.updateRelayState(6, 0);
      return;
    } else {
      // If currently OFF, open confirmation modal popup
      if (typeof window.showFeedModal === 'function') {
        window.showFeedModal(1);
      } else if (typeof window.triggerShowFeedModal === 'function') {
        window.triggerShowFeedModal(1);
      } else {
        triggerDirectFeeding(1);
      }
      return;
    }
  }

  state.lastRelayToggleTime = Date.now();
  const currentVal = state.relays[channel - 1] || 0;
  const newVal = currentVal === 1 ? 0 : 1;
  state.relays[channel - 1] = newVal;

  syncRelayUI();

  // Instant Telegram Switch Notification
  const relayNames = [
    "ATS Switch Solar (CH1)",
    "Pompa Pembesaran (CH2)",
    "Pompa Peremajaan (CH3)",
    "Sirkulasi Air (CH4)",
    "Aerator Oksigen (CH5)",
    "Feeder Pakan (CH6)"
  ];
  const rName = relayNames[channel - 1] || `Saklar CH${channel}`;
  const statusStr = newVal === 1 ? "DINYALAKAN (ON) \u{1F7E2}" : "DIMATIKAN (OFF) \u{1F534}";
  sendTelegramAlert(`relay_toggle_${channel}_${Date.now()}`, `\u{26A1} <b>[KONTROL SAKLAR RELAY]</b>\n\u{1F50C} <b>${rName}:</b> ${statusStr}`, true);

  // Dispatch command via Firebase DB & update sensor_data/relays
  if (window.aquaponicsDB) {
    window.aquaponicsDB.updateRelayState(channel, newVal);
  }
}
window.toggleRelayChannel = toggleRelayChannel;

function syncRelayUI() {
  state.relays.forEach((val, idx) => {
    const channel = idx + 1;
    const cardEl = document.getElementById(`card-relay-${channel}`);
    const badgeEl = document.getElementById(`badge-relay-${channel}`);
    const dotEl = document.getElementById(`dot-relay-${channel}`);
    const textEl = document.getElementById(`text-relay-${channel}`);
    const btnEl = document.getElementById(`btn-relay-${channel}`);

    if (val === 1) {
      if (cardEl) cardEl.classList.add('active-anim');
      if (badgeEl) {
        badgeEl.innerText = 'ACTIVE HIGH (ON)';
        badgeEl.className = 'relay-badge-pill relay-badge-blue';
      }
      if (dotEl) {
        dotEl.className = 'status-dot-mini blue';
      }
      if (textEl) {
        textEl.innerText = 'TERKONEKSI (HIGH)';
        textEl.className = 'status-text-styled blue';
      }
      if (btnEl) {
        btnEl.innerText = channel === 6 ? 'MEMBERI PAKAN...' : 'MATIKAN';
        btnEl.className = 'btn-relay-action btn-relay-on-blue';
      }
    } else {
      if (cardEl) cardEl.classList.remove('active-anim');
      if (badgeEl) {
        badgeEl.innerText = 'OFF (LOW)';
        badgeEl.className = 'relay-badge-pill relay-badge-off';
      }
      if (dotEl) {
        dotEl.className = 'status-dot-mini gray';
      }
      if (textEl) {
        textEl.innerText = 'TERPUTUS (LOW)';
        textEl.className = 'status-text-styled';
      }
      if (btnEl) {
        btnEl.innerText = channel === 6 ? 'BERI PAKAN' : 'HIDUPKAN';
        btnEl.className = 'btn-relay-action btn-relay-off';
      }
    }
  });
}

/* ================= 7. FEEDING CONTROL SCHEDULER ================= */
function initFeedingScheduler() {
  const autoTab = document.getElementById('tab-feed-auto');
  const manualTab = document.getElementById('tab-feed-manual');
  const autoPanel = document.getElementById('feed-auto-container');
  const manualPanel = document.getElementById('feed-manual-container');

  if (autoTab && manualTab) {
    autoTab.addEventListener('click', () => {
      autoTab.classList.add('active');
      manualTab.classList.remove('active');
      if (autoPanel) autoPanel.classList.add('active');
      if (manualPanel) manualPanel.classList.remove('active');
    });

    manualTab.addEventListener('click', () => {
      manualTab.classList.add('active');
      autoTab.classList.remove('active');
      if (manualPanel) manualPanel.classList.add('active');
      if (autoPanel) autoPanel.classList.remove('active');
    });
  }

  let currentSchedHour = 7;
  let currentSchedMin = 45;
  let currentSchedPortion = 1;

  function updateSchedPickerUI() {
    const hEl = document.getElementById('sched-hour-val');
    const mEl = document.getElementById('sched-min-val');
    const pEl = document.getElementById('sched-portion-val');

    if (hEl) hEl.innerText = String(currentSchedHour).padStart(2, '0');
    if (mEl) mEl.innerText = String(currentSchedMin).padStart(2, '0');
    if (pEl) pEl.innerText = `${currentSchedPortion} Porsi`;
  }

  window.changeSchedHour = function (delta) {
    currentSchedHour = (currentSchedHour + delta + 24) % 24;
    updateSchedPickerUI();
  };

  window.changeSchedMin = function (delta) {
    currentSchedMin = (currentSchedMin + delta + 60) % 60;
    updateSchedPickerUI();
  };

  window.changeSchedPortion = function (delta) {
    currentSchedPortion = Math.max(1, Math.min(5, currentSchedPortion + delta));
    updateSchedPickerUI();
  };

  const addSchedBtn = document.getElementById('add-schedule-btn');
  const schedModal = document.getElementById('modal-add-schedule');
  const schedCancelBtn = document.getElementById('modal-sched-cancel-btn');
  const schedSaveBtn = document.getElementById('modal-sched-save-btn');

  if (addSchedBtn) {
    addSchedBtn.addEventListener('click', () => {
      if (schedModal) {
        currentSchedHour = 7;
        currentSchedMin = 45;
        currentSchedPortion = 1;
        updateSchedPickerUI();
        schedModal.classList.add('active');
      }
    });
  }

  if (schedCancelBtn) {
    schedCancelBtn.addEventListener('click', () => {
      if (schedModal) schedModal.classList.remove('active');
    });
  }

  if (schedSaveBtn) {
    schedSaveBtn.addEventListener('click', () => {
      try {
        const timeVal = `${String(currentSchedHour).padStart(2, '0')}:${String(currentSchedMin).padStart(2, '0')}`;
        const portionVal = currentSchedPortion;

        state.schedules.push({ time: timeVal, portion: portionVal, active: true });
        renderSchedules();
        updateFeedingCountdown();

        if (window.aquaponicsDB && typeof window.aquaponicsDB.addSchedule === 'function') {
          try { window.aquaponicsDB.addSchedule(timeVal, portionVal); } catch (e) { }
        }

        addNotification('success', 'Jadwal Ditambahkan', `Pemberian pakan dijadwalkan pukul ${timeVal} (${portionVal} Porsi)`);
      } catch (err) {
        console.warn("Error saving schedule:", err);
      } finally {
        if (schedModal) schedModal.classList.remove('active');
      }
    });
  }

  const confirmModal = document.getElementById('modal-feeder-confirm');

  const btnCancelFeed = document.getElementById("btn-cancel-feed");
  if (btnCancelFeed) {
    btnCancelFeed.addEventListener('click', () => {
      if (confirmModal) confirmModal.classList.remove('active');
    });
  }

  const btnConfirmFeed = document.getElementById("btn-confirm-feed");
  if (btnConfirmFeed) {
    btnConfirmFeed.addEventListener('click', () => {
      if (confirmModal) confirmModal.classList.remove('active');
      triggerDirectFeeding(currentPortionToFeed);
    });
  }

  const triggerManualBtn = document.getElementById('trigger-manual-feed-btn');
  if (triggerManualBtn) {
    triggerManualBtn.addEventListener('click', () => {
      const portionSelect = document.getElementById('manual-portion-select');
      const portion = portionSelect ? parseInt(portionSelect.value) : 1;
      showFeedModal(portion);
    });
  }

  renderSchedules();
}
function renderSchedules() {
  const listContainer = document.getElementById('schedule-items-list');
  if (!listContainer) return;

  listContainer.innerHTML = state.schedules.map((s, idx) => `
    <div class="schedule-item">
      <div class="sched-left">
        <i class="fa-regular fa-clock"></i>
        <span class="sched-time">${s.time}</span>
      </div>
      <div class="sched-right">
        <span class="sched-portion">${s.portion} Porsi</span>
        <button class="sched-delete-btn" onclick="deleteSchedule(${idx})">Hapus</button>
      </div>
    </div>
  `).join('');
}

window.deleteSchedule = function (index) {
  state.schedules.splice(index, 1);
  renderSchedules();
  updateFeedingCountdown();
};

/* ================= 8. CONFIG MODAL POPUPS ================= */
/* ================= 8. CONFIG MODAL POPUPS (EXACT MATCH REFERENCE) ================= */
function initConfigModals() {
  const modal = document.getElementById('config-modal');

  const openCustomModal = (htmlContent) => {
    const modalCard = modal.querySelector('.modal-card');
    if (modalCard) {
      modalCard.innerHTML = htmlContent;
    }
    modal.classList.add('active');
  };

  window.closeConfigModal = () => {
    modal.classList.remove('active');
  };

  window.saveConfigModal = (titleName) => {
    alert(`✅ Pengaturan ${titleName} Berhasil Disimpan!`);
    window.closeConfigModal();
  };

  window.togglePasswordVisibility = (inputId, btn) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      btn.innerHTML = '<i class="fa-regular fa-eye-slash"></i>';
    } else {
      input.type = 'password';
      btn.innerHTML = '<i class="fa-regular fa-eye"></i>';
    }
  };

  // Close modal when clicking outside overlay
  modal.addEventListener('click', (e) => {
    if (e.target === modal) window.closeConfigModal();
  });

  // 1. Pengaturan WiFi
  document.getElementById('cfg-wifi').addEventListener('click', () => {
    openCustomModal(`
      <div class="modal-content-styled">
        <h2 class="modal-heading-title">1. Pengaturan WiFi</h2>
        
        <div class="info-box-blue">
          <div class="info-box-text">
            <strong>🎯 Tujuan:</strong> Menghubungkan alat ESP32 ke jaringan internet WiFi agar alat bisa online dan mengirim data ke Firebase/Server secara real-time.
          </div>
        </div>

        <div class="form-field-group">
          <label class="field-label">SSID (Nama WiFi)</label>
          <input type="text" class="modal-input-box" value="HOMESTAY 5G" id="modal-wifi-ssid" />
        </div>

        <div class="form-field-group">
          <label class="field-label">Password WiFi</label>
          <div class="input-with-eye">
            <input type="password" class="modal-input-box" value="Makanbang" id="modal-wifi-pass" />
            <button class="eye-toggle-btn" type="button" onclick="togglePasswordVisibility('modal-wifi-pass', this)">
              <i class="fa-regular fa-eye"></i>
            </button>
          </div>
        </div>

        <div class="modal-actions-row">
          <button class="btn-modal-close" onclick="closeConfigModal()">Tutup</button>
          <button class="btn-modal-save" onclick="saveConfigModal('WiFi')">Simpan</button>
        </div>
      </div>
    `);
  });

  // 2. Pengaturan Server & Gateway
  document.getElementById('cfg-server').addEventListener('click', () => {
    openCustomModal(`
      <div class="modal-content-styled">
        <h2 class="modal-heading-title">2. Pengaturan Server &amp; Gateway</h2>
        
        <div class="info-box-blue">
          <div class="info-box-text">
            <strong>📡 Tujuan:</strong> Mengatur frekuensi komunikasi nirkabel LoRa E220 915MHz antara Node Sensor dan Gateway ESP32.
          </div>
        </div>

        <div class="form-field-group">
          <label class="field-label">LoRa Channel</label>
          <input type="number" class="modal-input-box" value="65" />
        </div>

        <div class="form-field-group">
          <label class="field-label">Frekuensi LoRa</label>
          <input type="text" class="modal-input-box readonly-bg" value="915.125 MHz" readonly />
        </div>

        <div class="form-field-group">
          <label class="field-label">Baud Rate Serial (E220)</label>
          <input type="text" class="modal-input-box readonly-bg" value="9600 Bps" readonly />
        </div>

        <div class="modal-actions-row">
          <button class="btn-modal-close" onclick="closeConfigModal()">Tutup</button>
          <button class="btn-modal-save" onclick="saveConfigModal('Server')">Simpan</button>
        </div>
      </div>
    `);
  });

  // 3. Kalibrasi Sensor
  document.getElementById('cfg-calibration').addEventListener('click', () => {
    openCustomModal(`
      <div class="modal-content-styled">
        <h2 class="modal-heading-title">3. Kalibrasi Sensor</h2>
        
        <div class="info-box-blue">
          <div class="info-box-text">
            <strong>⚖️ Tujuan:</strong> Mengatur offset dan faktor pengali kalibrasi untuk sensor TDS Analog dan Ultrasonik AJ-SR04M.
          </div>
        </div>

        <div class="form-field-group">
          <label class="field-label">Faktor Kalibrasi TDS Analog</label>
          <input type="number" step="0.01" class="modal-input-box" value="1.00" />
        </div>

        <div class="form-field-group">
          <label class="field-label">Kedalaman Kolam Baseline (Ultrasonik cm)</label>
          <input type="number" class="modal-input-box" value="100" />
        </div>

        <div class="modal-actions-row">
          <button class="btn-modal-close" onclick="closeConfigModal()">Tutup</button>
          <button class="btn-modal-save" onclick="saveConfigModal('Kalibrasi')">Simpan</button>
        </div>
      </div>
    `);
  });

  // 4. Integrasi Firebase
  document.getElementById('cfg-firebase').addEventListener('click', () => {
    openCustomModal(`
      <div class="modal-content-styled">
        <h2 class="modal-heading-title">4. Integrasi Firebase ⭐</h2>
        
        <div class="info-box-amber">
          <div class="info-box-text">
            <strong>📍 Ambil kredensial dari:</strong><br/>
            <code class="code-path">Firebase Console &gt; Project Settings &gt; General &gt; Your apps &gt; Web</code>
          </div>
        </div>

        <div class="form-field-group">
          <label class="field-label">Project ID</label>
          <input type="text" class="modal-input-box" value="aquaponics-system-8d6f6" />
        </div>

        <div class="form-field-group">
          <label class="field-label">Web API Key</label>
          <input type="text" class="modal-input-box" value="AlzaSyDAnrIQ6_gihFgcep-Pu3dz3IqxCWBoCDo" />
        </div>

        <div class="form-field-group">
          <label class="field-label">Database URL</label>
          <input type="text" class="modal-input-box" value="https://aquaponics-system-8d6f6-default-rtdb.asia-s" />
        </div>

        <div class="form-field-group">
          <label class="field-label">Storage Bucket</label>
          <input type="text" class="modal-input-box" value="aquaponics-system-8d6f6.firebasestorage.app" />
        </div>

        <div class="form-field-group">
          <label class="field-label">Messaging Sender ID</label>
          <input type="text" class="modal-input-box" value="666440506386" />
        </div>

        <div class="modal-actions-row">
          <button class="btn-modal-close" onclick="closeConfigModal()">Tutup</button>
          <button class="btn-modal-save" onclick="saveConfigModal('Firebase')">Simpan</button>
        </div>
      </div>
    `);
  });

  // 5. Pengaturan Notifikasi (Telegram Bot)
  document.getElementById('cfg-notif').addEventListener('click', () => {
    openCustomModal(`
      <div class="modal-content-styled">
        <h2 class="modal-heading-title">5. Pengaturan Notifikasi (Telegram Bot)</h2>
        
        <div class="info-box-green">
          <div class="info-box-text">
            <strong>🎆 Notifikasi Telegram Bot (Instan &amp; Gratis):</strong><br/>
            Mengirim pesan alarm darurat langsung ke Telegram HP Anda saat air kolam kritis atau suhu/TDS tidak normal.
          </div>
        </div>

        <div class="checkbox-container-box">
          <span class="field-label">Enable Notifikasi Telegram (On / Off)</span>
          <input type="checkbox" class="modal-checkbox-custom" checked />
        </div>

        <div class="form-field-group">
          <label class="field-label">Bot Token Telegram</label>
          <input type="text" class="modal-input-box" value="8758597072:AAEe0ymSD2RfdICAoF4EoCflpf2oe" />
        </div>

        <div class="form-field-group">
          <label class="field-label">Chat ID Telegram Anda</label>
          <input type="text" class="modal-input-box" value="7207067918" />
        </div>

        <button class="btn-outline-blue width-100 margin-v-10" type="button" onclick="alert('🚀 Pesan uji coba berhasil dikirim ke Telegram!')">
          🚀 Kirim Notifikasi Uji Coba ke Telegram
        </button>

        <div class="modal-actions-row">
          <button class="btn-modal-close" onclick="closeConfigModal()">Tutup</button>
          <button class="btn-modal-save" onclick="saveConfigModal('Notifikasi')">Simpan</button>
        </div>
      </div>
    `);
  });

  // 6. Tentang Aplikasi
  document.getElementById('cfg-about').addEventListener('click', () => {
    openCustomModal(`
      <div class="modal-content-styled">
        <h2 class="modal-heading-title">6. Tentang Aplikasi</h2>
        
        <div class="about-hero-card">
          <div class="about-icon-blue"><i class="fa-solid fa-layer-group"></i></div>
          <div class="about-hero-text">
            <h3 class="about-app-title">Smart Akuaponik</h3>
            <p class="about-app-sub">Sistem Monitoring &amp; Kontrol IoT Akuaponik Berbasis LoRa E220 &amp; Firebase Realtime Cloud</p>
            <div class="about-badges-row">
              <span class="badge-blue-pill">v1.0.0 Production</span>
              <span class="badge-green-pill">LoRa Ch 65 (915 MHz)</span>
            </div>
          </div>
        </div>

        <div class="about-device-grid">
          <div class="device-mini-card">
            <span class="dev-label">ID Perangkat Gateway</span>
            <strong class="dev-val">ESP32-GATEWAY-02</strong>
          </div>
          <div class="device-mini-card">
            <span class="dev-label">Node Transmitter</span>
            <strong class="dev-val">ESP32-NODE-01</strong>
          </div>
        </div>

        <div class="about-steps-card">
          <div class="steps-title">📜 Urutan Pengisian Konfigurasi:</div>
          <div class="step-list-items">
            <div class="step-item">
              <span class="step-num step-num-blue">1</span>
              <div class="step-text"><strong>Pengaturan WiFi</strong> &mdash; Menghubungkan ESP32 Gateway ke internet.</div>
            </div>
            <div class="step-item">
              <span class="step-num step-num-green">2</span>
              <div class="step-text"><strong>Integrasi Firebase</strong> &mdash; Sinkronisasi data ke cloud database secara real-time.</div>
            </div>
          </div>
        </div>

        <div class="modal-actions-center">
          <button class="btn-modal-close width-100" onclick="closeConfigModal()">Tutup</button>
        </div>
      </div>
    `);
  });

  // Logout
  const sidebarLogout = document.getElementById('sidebar-logout-btn');
  const cfgLogout = document.getElementById('cfg-logout');

  const handleLogout = () => {
    openCustomModal(`
      <div class="modal-content-styled" style="text-align:center;">
        <h2 class="modal-heading-title" style="color:var(--red);">Keluar Akun</h2>
        <p style="font-size:13px; color:var(--text-muted); margin:10px 0;">Apakah Anda yakin ingin keluar dari sistem dashboard Smart Akuaponik?</p>
        <div class="modal-actions-row" style="margin-top:16px;">
          <button class="btn-modal-close" onclick="closeConfigModal()">Batal</button>
          <button class="btn-modal-save" style="background:var(--red);" onclick="alert('Anda telah keluar.'); closeConfigModal();">Keluar</button>
        </div>
      </div>
    `);
  };

  if (sidebarLogout) sidebarLogout.addEventListener('click', handleLogout);
  if (cfgLogout) cfgLogout.addEventListener('click', handleLogout);
}
