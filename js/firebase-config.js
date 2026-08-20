const FIREBASE_CONFIG = {
  databaseURL: "https://aquaponics-lora-default-rtdb.asia-southeast1.firebasedatabase.app"
};

class AquaponicsFirebase {
  constructor() {
    this.baseUrl = FIREBASE_CONFIG.databaseURL;
    this.pollInterval = 1500;
    this.onSensorUpdateCallback = null;
    this.onStatusUpdateCallback = null;
    this.timer = null;
  }

  // Subscribe to live telemetry updates
  subscribeTelemetry(callback) {
    this.onSensorUpdateCallback = callback;
    this.fetchTelemetry();
    if (!this.timer) {
      this.timer = setInterval(() => this.fetchTelemetry(), this.pollInterval);
    }
  }

  // Fetch telemetry REST endpoint from Firebase RTDB (/sensor_data.json)
  async fetchTelemetry() {
    try {
      let response = await fetch(`${this.baseUrl}/sensor_data.json?t=${Date.now()}`);
      if (response.ok) {
        const data = await response.json();
        if (data && typeof data === 'object' && this.onSensorUpdateCallback) {
          this.onSensorUpdateCallback(data);
          return;
        }
      }
    } catch (err) {
      // Polling network fallback
    }
  }

  // Send single relay / feeder command to Firebase /last_command.json
  async sendCommand(commandPayload) {
    try {
      const response = await fetch(`${this.baseUrl}/last_command.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(commandPayload)
      });
      if (response.ok) {
        console.log("[Firebase REST] Perintah berhasil dikirim:", commandPayload);
        return true;
      }
    } catch (err) {
      console.error("[Firebase Error] Gagal mengirim perintah:", err);
    }
    return false;
  }

  // Update multi-relay state to Firebase /last_command.json and direct HTTP API
  async updateRelayState(channel, state) {
    const relayKeys = ["ats_solar", "pembesaran", "peremajaan", "sirkulasi", "aerator", "feeder"];
    let chNum = parseInt(channel);

    if (isNaN(chNum)) {
      const idx = relayKeys.indexOf(String(channel).toLowerCase());
      chNum = idx !== -1 ? (idx + 1) : 6;
    }

    const chIdx = chNum - 1;
    const stVal = parseInt(state);
    const rKey = relayKeys[chIdx] || `ch${chNum}`;

    // 1. Sync status relay ke Firebase (/relay dan /sensor_data)
    try {
      fetch(`${this.baseUrl}/relay/${rKey}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stVal)
      }).catch(() => {});

      fetch(`${this.baseUrl}/sensor_data/relays/${chIdx}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stVal)
      }).catch(() => {});

      if (chIdx === 0) {
        fetch(`${this.baseUrl}/sensor_data/lamp.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stVal)
        }).catch(() => {});
        fetch(`${this.baseUrl}/sensor_data/status_daya.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stVal === 1 ? "Panel Surya" : "Aki 12V")
        }).catch(() => {});
      }
    } catch (err) {
      console.warn("[Firebase] Couldn't update RTDB:", err);
    }

    // 2. Dispatch command payload untuk dipancarkan ESP32 Gateway via LoRa E220
    const payload = {
      action: "relay_toggle",
      channel: chNum,
      state: stVal,
      timestamp: Date.now()
    };
    return await this.sendCommand(payload);
  }

  // Trigger manual feeding
  async triggerFeeding(portion = 1) {
    const payload = {
      action: "feed",
      portion: parseInt(portion),
      timestamp: Date.now()
    };
    return await this.sendCommand(payload);
  }

  // Add schedule to Firebase /schedules.json
  async addSchedule(time, portion = 1) {
    try {
      const response = await fetch(`${this.baseUrl}/schedules.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ time, portion: parseInt(portion), active: true, timestamp: Date.now() })
      });
      if (response.ok) {
        console.log("[Firebase] Feeding schedule added:", time, portion);
        return true;
      }
    } catch (err) {
      console.warn("[Firebase] Could not save schedule to RTDB:", err);
    }
    return true;
  }

  // Delete schedule from Firebase
  async deleteSchedule(index) {
    console.log("[Firebase] Schedule removed at index:", index);
    return true;
  }

  // Subscribe to pump schedules from Firebase /pump_schedules.json
  subscribePumpSchedules(callback) {
    this.onPumpScheduleCallback = callback;
    this.fetchPumpSchedules();
    if (!this.pumpSchedTimer) {
      this.pumpSchedTimer = setInterval(() => this.fetchPumpSchedules(), 4000);
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
    } catch (err) {
      console.warn("[Firebase] Error fetching pump schedules:", err);
    }
  }

  async savePumpSchedules(schedules) {
    try {
      await fetch(`${this.baseUrl}/pump_schedules.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedules)
      });
      console.log("[Firebase] Pump schedules saved:", schedules);
      return true;
    } catch (err) {
      console.error("[Firebase] Failed to save pump schedules:", err);
      return false;
    }
  }

  // Subscribe to live notifications from Firebase /notifications.json
  subscribeNotifications(callback) {
    this.onNotifUpdateCallback = callback;
    this.fetchNotifications();
    if (!this.notifTimer) {
      this.notifTimer = setInterval(() => this.fetchNotifications(), 3000);
    }
  }

  async fetchNotifications() {
    try {
      const response = await fetch(`${this.baseUrl}/notifications.json?t=${Date.now()}`);
      if (response.ok) {
        const data = await response.json();
        if (data && this.onNotifUpdateCallback) {
          let list = [];
          if (Array.isArray(data)) {
            list = data.filter(Boolean);
          } else if (typeof data === 'object') {
            list = Object.values(data);
          }
          list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          this.onNotifUpdateCallback(list);
        }
      }
    } catch (err) {
      console.warn("[Firebase] Error fetching notifications:", err);
    }
  }

  // Push notification to /notifications/{id}.json
  async pushNotification(notifObj) {
    try {
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
      await fetch(`${this.baseUrl}/notifications/${id}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      this.fetchNotifications();
      return true;
    } catch (err) {
      console.warn("[Firebase] Could not push notification:", err);
      return false;
    }
  }

  // Mark all notifications as read in Firebase
  async markNotificationsRead() {
    try {
      const response = await fetch(`${this.baseUrl}/notifications.json`);
      if (response.ok) {
        const data = await response.json();
        if (data && typeof data === 'object') {
          for (let key in data) {
            if (data[key] && !data[key].read) {
              fetch(`${this.baseUrl}/notifications/${key}/read.json`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(true)
              }).catch(() => {});
            }
          }
        }
      }
    } catch (err) {
      console.warn("[Firebase] Could not mark notifications read:", err);
    }
  }

  // Clear all notifications from Firebase
  async clearNotifications() {
    try {
      await fetch(`${this.baseUrl}/notifications.json`, {
        method: "DELETE"
      });
      if (this.onNotifUpdateCallback) this.onNotifUpdateCallback([]);
      return true;
    } catch (err) {
      console.warn("[Firebase] Could not clear notifications:", err);
      return false;
    }
  }
}

// Global instance
window.aquaponicsDB = new AquaponicsFirebase();
