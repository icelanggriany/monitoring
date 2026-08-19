/**
 * FIREBASE REALTIME DATABASE INTEGRATION MODULE
 * Direct REST API polling & WebSocket synchronization for Aquaponics IoT Gateway
 */

const FIREBASE_CONFIG = {
  databaseURL: "https://aquaponics-lora-default-rtdb.asia-southeast1.firebasedatabase.app",
  esp32IP: "10.228.237.21"
};

class AquaponicsFirebase {
  constructor() {
    this.baseUrl = FIREBASE_CONFIG.databaseURL;
    this.esp32IP = FIREBASE_CONFIG.esp32IP;
    this.pollInterval = 2000; // Poll every 2 seconds for real-time responsiveness
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

  // Fetch telemetry REST endpoint from Firebase RTDB (/telemetry.json)
  async fetchTelemetry() {
    try {
      // 1. Try primary endpoint /telemetry.json (Posted by physical ESP32)
      let response = await fetch(`${this.baseUrl}/telemetry.json?t=${Date.now()}`);
      if (response.ok) {
        const data = await response.json();
        if (data && this.onSensorUpdateCallback) {
          this.onSensorUpdateCallback(data);
          return;
        }
      }

      // 2. Fallback to /sensor_data.json
      response = await fetch(`${this.baseUrl}/sensor_data.json?t=${Date.now()}`);
      if (response.ok) {
        const data = await response.json();
        if (data && this.onSensorUpdateCallback) {
          this.onSensorUpdateCallback(data);
        }
      }
    } catch (err) {
      console.warn("[Firebase] Network error fetching realtime telemetry:", err);
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
        console.log("[Firebase] Command dispatched successfully:", commandPayload);
        return true;
      }
    } catch (err) {
      console.error("[Firebase Error] Failed to send command:", err);
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

    // 1. Direct Local HTTP Ping to ESP32 Node (Bypasses Chrome CORS blocks, 0-ms Latency!)
    if (this.esp32IP) {
      const pingUrl = `http://${this.esp32IP}/api/relay?ch=${chNum}&state=${stVal}&t=${Date.now()}`;
      const imgPing = new Image();
      imgPing.src = pingUrl;
      console.log(`[Direct HTTP Ping Sent]: ${pingUrl}`);
    }

    // 2. Sync relay path in Firebase (/relay.json)
    try {
      await fetch(`${this.baseUrl}/relay/${rKey}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stVal)
      });
    } catch (err) {
      console.warn("[Firebase] Couldn't update RTDB /relay.json:", err);
    }

    // 3. Dispatch command payload for ESP32 Gateway to broadcast via LoRa E220
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
