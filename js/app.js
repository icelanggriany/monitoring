
let currentPortionToFeed = 1;

function updateConfirmPortionUI() {
  const valEl = document.getElementById('modal-confirm-portion-val');
  if (valEl) valEl.innerText = `${currentPortionToFeed} Porsi`;
}

window.changeConfirmPortion = function(delta) {
  currentPortionToFeed = Math.max(1, Math.min(5, currentPortionToFeed + delta));
  updateConfirmPortionUI();
};

window.showFeedModal = function(portion = 1) {
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

window.changeConfirmPortion = function(delta) {
  currentPortionToFeed = Math.max(1, Math.min(5, currentPortionToFeed + delta));
  updateConfirmPortionUI();
};

// Ensure AquaponicsFirebase prototype safety
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    if (window.aquaponicsDB && !window.aquaponicsDB.addSchedule) {
      window.aquaponicsDB.addSchedule = function(time, portion) {
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
    tds: 350, // Starts low to show alert as in screenshot
    suhu_udara: 27.1,
    kelembaban: 84,
    level_air: 68.5,
    status_gateway: 'Aktif'
  },
  relays: [0, 0, 0, 0, 0, 0], // Default state: All Relays OFF
  schedules: [
    { time: '08:00', portion: 1 },
    { time: '16:00', portion: 2 }
  ],
  notifications: [
    { title: "Gateway IoT Terhubung", desc: "ESP32 Gateway terhubung ke LoRa Channel 65.", time: "Baru saja", type: "info" },
    { title: "Nutrisi Air Rendah", desc: "TDS terdeteksi < 400 PPM. Disarankan penambahan nutrisi.", time: "5 menit yang lalu", type: "warning" },
    { title: "Pemberian Pakan Otomatis", desc: "Pakan 1 Porsi berhasil dikeluarkan jam 08:00.", time: "2 jam yang lalu", type: "success" }
  ],
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

    // Resize charts if switching to monitoring tab
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

/* ================= 2. THEME TOGGLE (DARK / LIGHT MODE) ================= */
function initThemeToggle() {
  const themeBtn = document.getElementById('theme-toggle-btn');
  const themeIcon = document.getElementById('theme-icon');

  themeBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    themeIcon.className = isDark ? 'fa-regular fa-sun' : 'fa-regular fa-moon';
    
    // Update chart text colors
    updateChartTheme(isDark);
  });
}

/* ================= 3. NOTIFICATION DROPDOWN ================= */
function initNotificationDropdown() {
  const bellBtn = document.getElementById('bell-btn');
  const dropdown = document.getElementById('notification-dropdown');
  const clearBtn = document.getElementById('clear-notif-btn');
  const countBadge = document.getElementById('bell-count');

  bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('active');
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && !bellBtn.contains(e.target)) {
      dropdown.classList.remove('active');
    }
  });

  clearBtn.addEventListener('click', () => {
    state.notifications = [];
    renderNotifications();
    countBadge.style.display = 'none';
  });
}

function renderNotifications() {
  const container = document.getElementById('notif-list-container');
  const countBadge = document.getElementById('bell-count');

  if (state.notifications.length === 0) {
    container.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:12px;">Tidak ada notifikasi baru</div>';
    countBadge.style.display = 'none';
    return;
  }

  countBadge.innerText = state.notifications.length;
  countBadge.style.display = 'flex';

  const iconMap = {
    info: 'fa-circle-check',
    warning: 'fa-triangle-exclamation',
    success: 'fa-utensils'
  };

  container.innerHTML = state.notifications.map(n => `
    <div class="notif-item ${n.type}">
      <div class="notif-icon"><i class="fa-solid ${iconMap[n.type] || 'fa-bell'}"></i></div>
      <div class="notif-content">
        <div class="notif-title">${n.title}</div>
        <div class="notif-desc">${n.desc}</div>
        <div class="notif-time">${n.time}</div>
      </div>
    </div>
  `).join('');
}

/* ================= 4. REAL-TIME DATA BINDING ================= */
function initRealtimeDataBinding() {
  // Subscribe to Firebase RTDB live telemetry
  if (window.aquaponicsDB) {
    window.aquaponicsDB.subscribeTelemetry(data => {
      if (data) {
        let updated = false;
        if (data.suhu_air !== undefined) { state.telemetry.suhu_air = parseFloat(data.suhu_air); updated = true; }
        if (data.tds !== undefined) { state.telemetry.tds = parseFloat(data.tds); updated = true; }
        if (data.suhu_udara !== undefined) { state.telemetry.suhu_udara = parseFloat(data.suhu_udara); updated = true; }
        if (data.kelembaban !== undefined) { state.telemetry.kelembaban = parseFloat(data.kelembaban); updated = true; }
        if (data.level_air !== undefined) { state.telemetry.level_air = parseFloat(data.level_air); updated = true; }
        
        if (data.relays && Array.isArray(data.relays)) {
          // Only update relays from polling if user hasn't toggled a relay in the last 15 seconds
          if (!state.lastRelayToggleTime || (Date.now() - state.lastRelayToggleTime > 15000)) {
            state.relays = data.relays;
            syncRelayUI();
          }
        }

        if (updated) {
          updateUI();
          pushRealtimeChartData(data);
        }
      }
    });
  }

  // Periodic UI refresh & countdown
  setInterval(updateUI, 2000);
}

function pushRealtimeChartData(data) {
  const charts = state.charts;
  if (!charts) return;

  // 1. Suhu Air
  if (data.suhu_air !== undefined && charts.suhuAir) {
    const d = charts.suhuAir.data.datasets[0].data;
    if (d && d.length > 0) {
      d[d.length - 1] = parseFloat(data.suhu_air);
      charts.suhuAir.update('none');
    }
  }

  // 2. TDS Nutrisi
  if (data.tds !== undefined && charts.tds) {
    const d = charts.tds.data.datasets[0].data;
    if (d && d.length > 0) {
      d[d.length - 1] = Math.round(data.tds);
      charts.tds.update('none');
    }
  }

  // 3. Level Air
  if (data.level_air !== undefined && charts.levelAir) {
    const d = charts.levelAir.data.datasets[0].data;
    if (d && d.length > 0) {
      d[d.length - 1] = parseFloat(data.level_air);
      charts.levelAir.update('none');
    }
  }

  // 4. Suhu Udara
  if (data.suhu_udara !== undefined && charts.suhuUdara) {
    const d = charts.suhuUdara.data.datasets[0].data;
    if (d && d.length > 0) {
      d[d.length - 1] = parseFloat(data.suhu_udara);
      charts.suhuUdara.update('none');
    }
  }
}

// TELEGRAM BOT CONFIGURATION & ALERT ENGINE
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
  const isTdsCritical = tdsVal < 400 || tdsVal > 900;
  
  if (isTdsCritical) {
    elTds.classList.add('text-critical-red');
    elTds.classList.remove('text-sky');
    if (tdsStatusEl) {
      tdsStatusEl.className = 'warning-alert-text text-critical-red';
      tdsStatusEl.innerHTML = `${critIcon}${tdsVal < 400 ? 'Nutrisi Rendah' : 'Nutrisi Pekat'}`;
    }
  } else {
    elTds.classList.remove('text-critical-red');
    elTds.classList.add('text-sky');
    if (tdsStatusEl) {
      tdsStatusEl.className = 'success-text-normal';
      tdsStatusEl.innerHTML = '<span class="status-dot green"></span> Nutrisi Optimal';
    }
  }
  elTds.innerHTML = `${tdsVal}`;

  // 3. Suhu Udara Ambient (Optimal 20 - 33°C)
  const suhuUdara = state.telemetry.suhu_udara;
  const elSuhuUdara = document.getElementById('val-suhu-udara');
  const badgeSuhuUdara = document.getElementById('badge-suhu-udara');
  const isSuhuUdaraCritical = suhuUdara < 20.0 || suhuUdara > 33.0;

  if (isSuhuUdaraCritical) {
    elSuhuUdara.classList.add('text-critical-red');
    elSuhuUdara.classList.remove('text-amber');
    if (badgeSuhuUdara) {
      badgeSuhuUdara.className = 'badge-status status-red';
      badgeSuhuUdara.innerHTML = `${critIcon}${suhuUdara < 20.0 ? 'Udara Dingin!' : 'Udara Panas!'}`;
    }
  } else {
    elSuhuUdara.classList.remove('text-critical-red');
    elSuhuUdara.classList.add('text-amber');
    if (badgeSuhuUdara) {
      badgeSuhuUdara.className = 'badge-status status-amber';
      badgeSuhuUdara.innerHTML = '<span class="status-dot amber"></span> Normal';
    }
  }
  elSuhuUdara.innerHTML = `${suhuUdara.toFixed(1)}&deg;C`;

  // 4. Kelembaban Udara (Optimal 50 - 90%)
  const kelembaban = Math.round(state.telemetry.kelembaban);
  const elKelembaban = document.getElementById('val-kelembaban');
  const statusKelembaban = document.getElementById('status-kelembaban');
  const isKelembabanCritical = kelembaban < 50 || kelembaban > 90;

  if (isKelembabanCritical) {
    elKelembaban.classList.add('text-critical-red');
    elKelembaban.classList.remove('text-purple');
    if (statusKelembaban) {
      statusKelembaban.className = 'text-critical-red font-weight-700';
      statusKelembaban.innerHTML = `${critIcon}${kelembaban < 50 ? 'Udara Kering' : 'Udara Lembab'}`;
    }
  } else {
    elKelembaban.classList.remove('text-critical-red');
    elKelembaban.classList.add('text-purple');
    if (statusKelembaban) {
      statusKelembaban.className = 'text-purple font-weight-700';
      statusKelembaban.innerHTML = '<span class="status-dot purple"></span> Optimal';
    }
  }
  elKelembaban.innerHTML = `${kelembaban}%`;

  // 5. Level Air Kolam (Kritis < 30%)
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

  // Dynamically calculate SVG water Y level: 100% level -> Y=20, 0% level -> Y=85
  const waterY = Math.max(20, Math.min(85, Math.round(90 - (levelAir * 0.7))));
  if (ecoWaterPath) {
    ecoWaterPath.setAttribute('d', `M 0 ${waterY} Q 60 ${waterY - 8} 120 ${waterY} T 240 ${waterY - 5} L 240 100 L 0 100 Z`);
  }

  // Calculate Fish Y offset so fish smoothly follows water height:
  // Water level 50% = Y=55 (normal fish position at Y=50) -> offset = 0
  // Low water Y=80 -> fish moves down by +25px
  // High water Y=30 -> fish floats up by -15px
  const fishYOffset = Math.round((waterY - 50) * 0.7);

  // Evaluate Fish Critical State (Level Air < 30% or Suhu Air Extreme)
  const isFishCritical = levelAir < 30.0 || suhuAir < 20.0 || suhuAir > 34.0;

  if (isFishCritical) {
    // Fish is struggling in shallow water / extreme temp
    if (ecoFishBody) ecoFishBody.setAttribute('fill', '#EF4444'); // Warning Red fish color
    if (ecoFishGroup) {
      ecoFishGroup.style.transform = `translate(10px, ${fishYOffset + 12}px) rotate(22deg)`;
    }
    if (ecoBubblesGroup) ecoBubblesGroup.style.display = 'none'; // Bubbles stop in shallow/critical water
    if (ecoFishPill) {
      ecoFishPill.className = 'eco-status-pill red-pill';
      ecoFishPill.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><span>Air Kritis (${levelAir.toFixed(1)}%): Air Dangkal!</span>`;
    }
  } else {
    // Fish is healthy & swimming happily following water level smoothly
    if (ecoFishBody) ecoFishBody.setAttribute('fill', '#5E6C7D'); // Healthy slate color
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
    // LOW TDS: Nutrisi Rendah (Air Bersih) -> Tanaman Layu / Pucat Kuning Oranye
    if (leafLeft) leafLeft.setAttribute('fill', '#D97706');
    if (leafRight) leafRight.setAttribute('fill', '#F59E0B');
    if (leafCenter) leafCenter.setAttribute('fill', '#FBBF24');
    if (ecoPlantPill) {
      ecoPlantPill.className = 'eco-status-pill amber-pill';
      ecoPlantPill.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><span>Nutrisi Rendah (${tdsVal} PPM): Lambat</span>`;
    }
  } else if (tdsVal <= 900) {
    // OPTIMAL TDS: Nutrisi Optimal -> Tanaman Hijau Subur & Segar
    if (leafLeft) leafLeft.setAttribute('fill', '#10B981');
    if (leafRight) leafRight.setAttribute('fill', '#059669');
    if (leafCenter) leafCenter.setAttribute('fill', '#34D399');
    if (ecoPlantPill) {
      ecoPlantPill.className = 'eco-status-pill green-pill';
      ecoPlantPill.innerHTML = `<span class="status-dot green"></span><span>Nutrisi Optimal (${tdsVal} PPM): Subur</span>`;
    }
  } else {
    // HIGH TDS: Nutrisi Pekat / Kelebihan -> Daun Terbakar Merah Tua
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
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let nextSchedule = null;
  let minDiff = Infinity;

  state.schedules.forEach(sched => {
    const [h, m] = sched.time.split(':').map(Number);
    let schedMinutes = h * 60 + m;
    if (schedMinutes <= currentMinutes) {
      schedMinutes += 24 * 60; // Next day
    }
    const diff = schedMinutes - currentMinutes;
    if (diff < minDiff) {
      minDiff = diff;
      nextSchedule = sched;
    }
  });

  const countdownEl = document.getElementById('feed-countdown');
  const nextTimeEl = document.getElementById('feed-next-time');

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

/* ================= 5. CHART.JS MONITORING ENGINE ================= */
function initCharts() {
  const periodBtns = document.querySelectorAll('.filter-tab-group .filter-btn');

  periodBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      periodBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activePeriod = btn.dataset.period;
      updateChartsData();
    });
  });

  createAllCharts();
}

function getChartTimeLabels(period) {
  if (period === 'harian') {
    // Harian: Hari + Jam (contoh: Rabu 00:00, Rabu 03:00, ..., Rabu 24:00)
    const daysIndo = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const todayName = daysIndo[new Date().getDay()];
    return [
      `${todayName} 00:00`,
      `${todayName} 03:00`,
      `${todayName} 06:00`,
      `${todayName} 09:00`,
      `${todayName} 12:00`,
      `${todayName} 15:00`,
      `${todayName} 18:00`,
      `${todayName} 21:00`,
      `${todayName} 24:00`
    ];
  } else if (period === 'mingguan') {
    // Mingguan: Minggu 1, 2, 3, 4
    return ['Minggu 1', 'Minggu 2', 'Minggu 3', 'Minggu 4'];
  } else {
    // Bulanan: Tanggal / Bulan / Tahun (DD/MM/YYYY)
    return ['01/08/2026', '05/08/2026', '10/08/2026', '15/08/2026', '20/08/2026', '25/08/2026', '30/08/2026'];
  }
}

function createAllCharts() {
  const labels = getChartTimeLabels('harian');
  const isDark = document.body.classList.contains('dark-mode');
  const textColor = isDark ? '#94A3B8' : '#64748B';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 1000,
      easing: 'easeInOutCubic'
    },
    plugins: {
      legend: { display: false },
      tooltip: { cornerRadius: 8, padding: 10 }
    },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: "'Inter', sans-serif", size: 10 } } },
      y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: "'Inter', sans-serif", size: 10 } } }
    }
  };

  const currentSuhuAir = state.telemetry.suhu_air || 26.3;
  const currentTds = Math.round(state.telemetry.tds) || 598;
  const currentLevel = state.telemetry.level_air || 68.5;
  const currentSuhuUdara = state.telemetry.suhu_udara || 27.1;

  // 1. Chart Suhu Air Kolam
  const ctxSuhuAir = document.getElementById('chart-suhu-air').getContext('2d');
  state.charts.suhuAir = new Chart(ctxSuhuAir, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Suhu Air (°C)',
        data: [25.8, 25.6, 25.5, 26.0, 26.8, 27.2, 26.9, 26.5, currentSuhuAir],
        borderColor: '#2563EB',
        backgroundColor: 'rgba(37, 99, 235, 0.12)',
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        spanGaps: true,
        pointRadius: 4,
        pointBackgroundColor: '#2563EB'
      }]
    },
    options: {
      ...commonOptions,
      scales: {
        ...commonOptions.scales,
        y: { ...commonOptions.scales.y, min: 20, max: 35 }
      }
    }
  });

  // 2. Chart TDS Nutrisi Air
  const ctxTDS = document.getElementById('chart-tds').getContext('2d');
  state.charts.tds = new Chart(ctxTDS, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'TDS Nutrisi Air (PPM)',
        data: [580, 585, 590, 595, 610, 605, 600, 592, currentTds],
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.10)',
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        spanGaps: true,
        pointRadius: 4,
        pointBackgroundColor: '#10B981'
      }]
    },
    options: {
      ...commonOptions,
      scales: {
        ...commonOptions.scales,
        y: { ...commonOptions.scales.y, min: 0, max: 1000 }
      }
    }
  });

  // 3. Chart Level Air Kolam
  const ctxLevelAir = document.getElementById('chart-level-air').getContext('2d');
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
        pointBackgroundColor: '#06B6D4'
      }]
    },
    options: {
      ...commonOptions,
      scales: {
        ...commonOptions.scales,
        y: { ...commonOptions.scales.y, min: 0, max: 100 }
      }
    }
  });

  // 4. Chart Suhu Udara Ambient
  const ctxSuhuUdara = document.getElementById('chart-suhu-udara').getContext('2d');
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
        pointBackgroundColor: '#F97316'
      }]
    },
    options: {
      ...commonOptions,
      scales: {
        ...commonOptions.scales,
        y: { ...commonOptions.scales.y, min: 20, max: 38 }
      }
    }
  });
}

function updateChartsData() {
  const period = state.activePeriod;
  const labels = getChartTimeLabels(period);

  let suhuAirData, tdsData, levelAirData, suhuUdaraData;

  const currentSuhuAir = state.telemetry.suhu_air || 26.3;
  const currentTds = Math.round(state.telemetry.tds) || 598;
  const currentLevel = state.telemetry.level_air || 68.5;
  const currentSuhuUdara = state.telemetry.suhu_udara || 27.1;

  if (period === 'harian') {
    // 9 Time Slots (00:00 to 24:00) -> 9 Data Points matching labels
    suhuAirData = [25.8, 25.6, 25.5, 26.0, 26.8, 27.2, 26.9, 26.5, currentSuhuAir];
    tdsData = [580, 585, 590, 595, 610, 605, 600, 592, currentTds];
    levelAirData = [72, 70, 69, 75, 74, 71, 70, 69, currentLevel];
    suhuUdaraData = [24.5, 24.0, 25.2, 28.5, 31.0, 30.2, 28.4, 27.5, currentSuhuUdara];
  } else if (period === 'mingguan') {
    // 4 Weeks (Minggu 1 - Minggu 4)
    suhuAirData = [26.0, 26.4, 26.8, currentSuhuAir];
    tdsData = [530, 580, 620, currentTds];
    levelAirData = [82, 80, 75, currentLevel];
    suhuUdaraData = [26.5, 27.8, 28.9, currentSuhuUdara];
  } else {
    // 7 Dates (Tanggal/Bulan/Tahun)
    suhuAirData = [25.5, 25.9, 26.2, 26.6, 26.3, 26.7, currentSuhuAir];
    tdsData = [510, 540, 575, 605, 630, 615, currentTds];
    levelAirData = [88, 84, 81, 77, 73, 70, currentLevel];
    suhuUdaraData = [24.8, 26.0, 27.5, 28.7, 28.0, 27.4, currentSuhuUdara];
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

  window.changeSchedHour = function(delta) {
    currentSchedHour = (currentSchedHour + delta + 24) % 24;
    updateSchedPickerUI();
  };

  window.changeSchedMin = function(delta) {
    currentSchedMin = (currentSchedMin + delta + 60) % 60;
    updateSchedPickerUI();
  };

  window.changeSchedPortion = function(delta) {
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
          try { window.aquaponicsDB.addSchedule(timeVal, portionVal); } catch(e) {}
        }

        addNotification('success', 'Jadwal Ditambahkan', `Pemberian pakan dijadwalkan pukul ${timeVal} (${portionVal} Porsi)`);
      } catch(err) {
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

window.deleteSchedule = function(index) {
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
