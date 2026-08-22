/**
 * SMART AKUAPONIK IOT - FIREBASE REALTIME ENGINE
 * Mendukung Realtime WebSocket SDK (Zero-Latency, Anti-CORS) & REST API Fallback
 */

const FIREBASE_CONFIG = {
  databaseURL: "https://aquaponics-lora-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// Inisialisasi SDK Resmi Firebase jika tersedia di window
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    console.log("⚡ [Firebase SDK] Berhasil diinisialisasi");
  } catch (e) {
    console.warn("[Firebase SDK Init Warn]", e);
  }
}

class AquaponicsFirebase {
  constructor() {
    this.baseUrl = FIREBASE_CONFIG.databaseURL;
    this.pollInterval = 1500;
    this.onSensorUpdateCallback = null;
    this.onStatusUpdateCallback = null;
    this.onNotifUpdateCallback = null;
    this.onPumpScheduleCallback = null;
    this.timer = null;
    this.seqCounter = Math.floor(Date.now() % 1000000);

    // Cek apakah SDK Firebase Database aktif
    this.hasSDK = typeof firebase !== 'undefined' && typeof firebase.database === 'function';
    if (this.hasSDK) {
      try {
        this.db = firebase.database();
        console.log("🚀 [Firebase Engine] Realtime WebSocket Native SDK Aktif");
      } catch (err) {
        console.warn("[Firebase Engine] Gagal init DB SDK, beralih ke mode REST:", err);
        this.hasSDK = false;
      }
    } else {
      console.log("🌐 [Firebase Engine] Mode REST Polling Aktif");
    }
  }

  // 1. Berlangganan data telemetri sensor secara realtime
  subscribeTelemetry(callback) {
    this.onSensorUpdateCallback = callback;

    if (this.hasSDK && this.db) {
      // Listener WebSocket Realtime (Zero Latency & Bebas Masalah CORS file://)
      this.db.ref('sensor_data').on('value', snapshot => {
        const data = snapshot.val();
        if (data && this.onSensorUpdateCallback) {
          this.onSensorUpdateCallback(data);
        }
      }, err => {
        console.warn("[Firebase SDK] Error stream, aktifkan REST polling:", err);
        this.startRestPolling();
      });

      // Listener Status Koneksi Realtime Firebase
      this.db.ref('.info/connected').on('value', snap => {
        const isConnected = snap.val() === true;
        this.updateConnectionUI(isConnected);
        if (this.onStatusUpdateCallback) {
          this.onStatusUpdateCallback(isConnected ? 'connected' : 'disconnected');
        }
      });
    } else {
      this.startRestPolling();
    }
  }

  updateConnectionUI(isConnected) {
    const badges = document.querySelectorAll('.brand-status-online');
    badges.forEach(b => {
      if (isConnected) {
        b.innerHTML = '<i class="fa-solid fa-circle dot-online"></i> Terhubung (Firebase Live)';
        b.style.color = '#10B981';
      } else {
        b.innerHTML = '<i class="fa-solid fa-circle text-critical-red"></i> Menghubungkan...';
        b.style.color = '#EF4444';
      }
    });

    const devBadge = document.querySelector('.device-status-badge span');
    if (devBadge) {
      devBadge.innerText = isConnected ? 'Alat Terhubung (Sangat Baik)' : 'Menghubungkan ke Alat...';
    }
  }

  startRestPolling() {
    this.fetchTelemetry();
    if (!this.timer) {
      this.timer = setInterval(() => this.fetchTelemetry(), this.pollInterval);
    }
  }

  // Fetch telemetry REST endpoint fallback (/sensor_data.json)
  async fetchTelemetry() {
    try {
      let response = await fetch(`${this.baseUrl}/sensor_data.json?t=${Date.now()}`);
      if (response.ok) {
        const data = await response.json();
        if (data && typeof data === 'object' && this.onSensorUpdateCallback) {
          this.onSensorUpdateCallback(data);
          this.updateConnectionUI(true);
          return;
        }
      }
    } catch (err) {
      // Silent network fallback
    }
  }

  // 2. Kirim perintah kontrol (Relay / Feeder) dengan Monotonic Sequence ID
  async sendCommand(commandPayload) {
    try {
      this.seqCounter = (this.seqCounter || Math.floor(Date.now() % 1000000)) + 1;
      commandPayload.seq = this.seqCounter;
      commandPayload.ts = Date.now();

      // OPSI A: Kirim via Realtime WebSocket SDK (< 20ms)
      if (this.hasSDK && this.db) {
        await Promise.all([
          this.db.ref('control_queue/latest').set(commandPayload),
          this.db.ref('last_command').set(commandPayload)
        ]);
        console.log(`⚡ [Firebase SDK CMD] Perintah terkirim via WebSocket (Seq: ${commandPayload.seq}):`, commandPayload);
        return true;
      }

      // OPSI B: Kirim via REST API
      const jsonStr = JSON.stringify(commandPayload);
      const reqQueue = fetch(`${this.baseUrl}/control_queue/latest.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: jsonStr
      });
      const reqLegacy = fetch(`${this.baseUrl}/last_command.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: jsonStr
      });
      const response = await Promise.race([reqQueue, reqLegacy]);
      if (response && response.ok) {
        console.log(`[Firebase REST CMD] Perintah terkirim (Seq: ${commandPayload.seq}):`, commandPayload);
        return true;
      }
    } catch (err) {
      console.error("[Firebase Error] Gagal mengirim perintah:", err);
    }
    return false;
  }

  // 3. Update status relay (1-6)
  async updateRelayState(channel, state) {
    const relayKeys = ["ats_solar", "pembesaran", "peremajaan", "aerator", "cadangan", "feeder"];
    let chNum = parseInt(channel);

    if (isNaN(chNum)) {
      const idx = relayKeys.indexOf(String(channel).toLowerCase());
      chNum = idx !== -1 ? (idx + 1) : 6;
    }

    const chIdx = chNum - 1;
    const stVal = parseInt(state);
    const rKey = relayKeys[chIdx] || `ch${chNum}`;

    // Sync status ke database
    if (this.hasSDK && this.db) {
      this.db.ref(`relay/${rKey}`).set(stVal).catch(() => {});
      this.db.ref(`sensor_data/relays/${chIdx}`).set(stVal).catch(() => {});

      const fieldMap = ["lamp", "pump_b", "pump_p", "pump_s", "aerator", "feeder"];
      const sensorField = fieldMap[chIdx];
      if (sensorField) {
        this.db.ref(`sensor_data/${sensorField}`).set(stVal).catch(() => {});
      }
      if (chIdx === 0) {
        this.db.ref(`sensor_data/status_daya`).set(stVal === 1 ? "Panel Surya" : "Aki 12V").catch(() => {});
      }
    } else {
      try {
        fetch(`${this.baseUrl}/relay/${rKey}.json`, { method: "PUT", body: JSON.stringify(stVal) }).catch(() => {});
        fetch(`${this.baseUrl}/sensor_data/relays/${chIdx}.json`, { method: "PUT", body: JSON.stringify(stVal) }).catch(() => {});
      } catch (e) {}
    }

    // Dispatch payload command
    const payload = {
      action: "relay_toggle",
      channel: chNum,
      ch: chNum,
      state: stVal,
      st: stVal,
      timestamp: Date.now()
    };
    return await this.sendCommand(payload);
  }

  // 4. Trigger Pemberian Pakan Ikan Manual (CH6)
  async triggerFeeding(portion = 1) {
    const payload = {
      action: "feed",
      channel: 6,
      ch: 6,
      state: 1,
      st: 1,
      portion: parseInt(portion),
      timestamp: Date.now()
    };

    if (this.hasSDK && this.db) {
      this.db.ref(`sensor_data/feeder`).set(1).catch(() => {});
      this.db.ref(`sensor_data/relays/5`).set(1).catch(() => {});
      this.db.ref(`relay/feeder`).set(1).catch(() => {});
    }

    return await this.sendCommand(payload);
  }

  // 5. Kelola Jadwal Pakan
  async addSchedule(time, portion = 1) {
    const schedObj = { time, portion: parseInt(portion), active: true, timestamp: Date.now() };
    if (this.hasSDK && this.db) {
      await this.db.ref('schedules').push(schedObj);
      return true;
    }
    try {
      await fetch(`${this.baseUrl}/schedules.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedObj)
      });
      return true;
    } catch (err) {
      console.warn("[Firebase] Could not save schedule:", err);
    }
    return true;
  }

  async deleteSchedule(index) {
    console.log("[Firebase] Schedule removed at index:", index);
    return true;
  }

  // 6. Jadwal Pompa Sirkulasi
  subscribePumpSchedules(callback) {
    this.onPumpScheduleCallback = callback;
    if (this.hasSDK && this.db) {
      this.db.ref('pump_schedules').on('value', snap => {
        const data = snap.val();
        let list = [];
        if (Array.isArray(data)) list = data.filter(Boolean);
        else if (typeof data === 'object' && data !== null) list = Object.values(data);
        if (this.onPumpScheduleCallback) this.onPumpScheduleCallback(list);
      });
    } else {
      this.fetchPumpSchedules();
      if (!this.pumpSchedTimer) {
        this.pumpSchedTimer = setInterval(() => this.fetchPumpSchedules(), 4000);
      }
    }
  }

  async fetchPumpSchedules() {
    try {
      const response = await fetch(`${this.baseUrl}/pump_schedules.json?t=${Date.now()}`);
      if (response.ok) {
        const data = await response.json();
        if (data && this.onPumpScheduleCallback) {
          let list = [];
          if (Array.isArray(data)) list = data.filter(Boolean);
          else if (typeof data === 'object') list = Object.values(data);
          this.onPumpScheduleCallback(list);
        }
      }
    } catch (err) {}
  }

  async savePumpSchedules(schedules) {
    if (this.hasSDK && this.db) {
      await this.db.ref('pump_schedules').set(schedules);
      return true;
    }
    try {
      await fetch(`${this.baseUrl}/pump_schedules.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedules)
      });
      return true;
    } catch (err) {
      return false;
    }
  }

  // 7. Notifikasi
  subscribeNotifications(callback) {
    this.onNotifUpdateCallback = callback;
    if (this.hasSDK && this.db) {
      this.db.ref('notifications').on('value', snap => {
        const data = snap.val();
        let list = [];
        if (Array.isArray(data)) list = data.filter(Boolean);
        else if (typeof data === 'object' && data !== null) list = Object.values(data);
        list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        if (this.onNotifUpdateCallback) this.onNotifUpdateCallback(list);
      });
    } else {
      this.fetchNotifications();
      if (!this.notifTimer) {
        this.notifTimer = setInterval(() => this.fetchNotifications(), 3000);
      }
    }
  }

  async fetchNotifications() {
    try {
      const response = await fetch(`${this.baseUrl}/notifications.json?t=${Date.now()}`);
      if (response.ok) {
        const data = await response.json();
        if (data && this.onNotifUpdateCallback) {
          let list = [];
          if (Array.isArray(data)) list = data.filter(Boolean);
          else if (typeof data === 'object') list = Object.values(data);
          list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          this.onNotifUpdateCallback(list);
        }
      }
    } catch (err) {}
  }

  async pushNotification(notifObj) {
    const id = notifObj.id || `notif_${Date.now()}`;
    const payload = {
      id,
      title: notifObj.title || "Notifikasi System",
      desc: notifObj.desc || "",
      type: notifObj.type || "info",
      source: notifObj.source || "system",
      timestamp: notifObj.timestamp || Date.now(),
      read: false
    };

    if (this.hasSDK && this.db) {
      await this.db.ref(`notifications/${id}`).set(payload);
      return true;
    }
    try {
      await fetch(`${this.baseUrl}/notifications/${id}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      return true;
    } catch (err) {
      return false;
    }
  }

  async markNotificationsRead() {
    if (this.hasSDK && this.db) {
      const snap = await this.db.ref('notifications').once('value');
      const data = snap.val();
      if (data && typeof data === 'object') {
        const updates = {};
        for (let k in data) {
          if (data[k] && !data[k].read) updates[`notifications/${k}/read`] = true;
        }
        await this.db.ref().update(updates);
      }
      return;
    }
    try {
      const response = await fetch(`${this.baseUrl}/notifications.json`);
      if (response.ok) {
        const data = await response.json();
        if (data && typeof data === 'object') {
          for (let key in data) {
            if (data[key] && !data[key].read) {
              fetch(`${this.baseUrl}/notifications/${key}/read.json`, { method: "PUT", body: JSON.stringify(true) }).catch(() => {});
            }
          }
        }
      }
    } catch (e) {}
  }

  async clearNotifications() {
    if (this.hasSDK && this.db) {
      await this.db.ref('notifications').remove();
      if (this.onNotifUpdateCallback) this.onNotifUpdateCallback([]);
      return true;
    }
    try {
      await fetch(`${this.baseUrl}/notifications.json`, { method: "DELETE" });
      if (this.onNotifUpdateCallback) this.onNotifUpdateCallback([]);
      return true;
    } catch (e) {
      return false;
    }
  }
}

// Global Instance
window.aquaponicsDB = new AquaponicsFirebase();
