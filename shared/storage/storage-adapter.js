// Unified Storage Adapter
// Replaces direct localStorage/sessionStorage usage with server-sync capability

(function(window) {
  'use strict';

  class StorageAdapter {
    constructor(namespace = 'dnm', options = {}) {
      this.ns = namespace;
      this.memoryCache = new Map();
      this.pendingWrites = new Map();
      this.syncInterval = null;
      this.listeners = new Map();
      this.version = 1;
      this.syncEnabled = options.syncEnabled !== false;
      this.maxRetries = options.maxRetries || 3;
      this.retryDelay = options.retryDelay || 1000;
    }

    // Generate full key with namespace
    _fullKey(key) {
      return `${this.ns}_${key}_v${this.version}`;
    }

    // In-memory read (Zero localStorage dependency)
    get(key, defaultValue = null) {
      const fullKey = this._fullKey(key);

      if (this.memoryCache.has(fullKey)) {
        return this.memoryCache.get(fullKey);
      }

      return defaultValue;
    }

    // Async read alias
    async getItem(key, defaultValue = null) {
      return this.get(key, defaultValue);
    }

    // In-memory write with background server sync (Zero localStorage dependency)
    async set(key, value) {
      const fullKey = this._fullKey(key);

      // Update memory cache immediately
      this.memoryCache.set(fullKey, value);

      // Queue for server sync if enabled
      if (this.syncEnabled) {
        this.pendingWrites.set(fullKey, {
          key,
          value,
          timestamp: Date.now(),
          retries: 0
        });
        this.scheduleSync();
      }

      // Notify listeners
      this._notifyListeners(key, value);

      return value;
    }

    // Async set alias
    async setItem(key, value) {
      return this.set(key, value);
    }

    // Delete key from memory and queue server deletion
    async delete(key) {
      const fullKey = this._fullKey(key);

      this.memoryCache.delete(fullKey);

      // Queue deletion for server sync
      if (this.syncEnabled) {
        this.pendingWrites.set(fullKey, {
          key,
          value: null,
          timestamp: Date.now(),
          retries: 0,
          deleted: true
        });
        this.scheduleSync();
      }

      this._notifyListeners(key, null);
    }

    // Async remove alias
    async removeItem(key) {
      return this.delete(key);
    }

    // Get multiple keys at once
    getAll(keys) {
      const result = {};
      keys.forEach(key => {
        result[key] = this.get(key);
      });
      return result;
    }

    // Set multiple keys at once
    async setAll(items) {
      const promises = Object.entries(items).map(([key, value]) => this.set(key, value));
      return Promise.all(promises);
    }

    // Schedule background sync
    scheduleSync() {
      if (this.syncInterval) return;
      this.syncInterval = setTimeout(() => {
        this.syncInterval = null;
        this.flushToServer();
      }, 500); // Debounce
    }

    // Flush pending writes to server
    async flushToServer() {
      if (!this.pendingWrites.size) return;

      const updates = {};
      const toRemove = [];

      this.pendingWrites.forEach((write, fullKey) => {
        if (write.deleted) {
          updates[write.key] = null;
        } else {
          updates[write.key] = write.value;
        }
        toRemove.push(fullKey);
      });

      try {
        const apiUrl = window.DNM_CONFIG_HELPERS?.getApiUrl?.('/save') || '/api/save';
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Storage-Namespace': this.ns
          },
          body: JSON.stringify({
            action: 'syncStorage',
            namespace: this.ns,
            updates
          })
        });

        if (response.ok) {
          toRemove.forEach(key => this.pendingWrites.delete(key));
          console.log(`[StorageAdapter:${this.ns}] Synced ${toRemove.length} items to server`);
        } else {
          throw new Error(`Server responded with ${response.status}`);
        }
      } catch (e) {
        console.warn(`[StorageAdapter:${this.ns}] Server sync failed:`, e.message);
        await this._retryFailedWrites();
      }
    }

    // Retry failed writes with exponential backoff
    async _retryFailedWrites() {
      const retries = [];
      this.pendingWrites.forEach((write, key) => {
        if (write.retries < this.maxRetries) {
          write.retries++;
          write.timestamp = Date.now();
          retries.push(key);
        } else {
          console.error(`[StorageAdapter:${this.ns}] Max retries exceeded for ${write.key}`);
        }
      });

      if (retries.length > 0) {
        // Schedule retry with exponential backoff
        const delay = this.retryDelay * Math.pow(2, retries[0].retries - 1);
        setTimeout(() => this.flushToServer(), delay);
      }
    }

    // Subscribe to changes (cross-tab + local)
    onChange(key, callback) {
      const fullKey = this._fullKey(key);

      if (!this.listeners.has(fullKey)) {
        this.listeners.set(fullKey, new Set());
      }
      this.listeners.get(fullKey).add(callback);

      // Also listen for cross-tab storage events
      const handler = (e) => {
        if (e.key === fullKey && e.newValue !== null) {
          try {
            const val = JSON.parse(e.newValue);
            this.memoryCache.set(fullKey, val);
            this._notifyListeners(key, val);
          } catch (_) {}
        } else if (e.key === fullKey && e.newValue === null) {
          this.memoryCache.delete(fullKey);
          this._notifyListeners(key, null);
        }
      };

      window.addEventListener('storage', handler);

      // Return unsubscribe function
      return () => {
        window.removeEventListener('storage', handler);
        const callbacks = this.listeners.get(fullKey);
        if (callbacks) {
          callbacks.delete(callback);
          if (callbacks.size === 0) {
            this.listeners.delete(fullKey);
          }
        }
      };
    }

    _notifyListeners(key, value) {
      const fullKey = this._fullKey(key);
      const callbacks = this.listeners.get(fullKey);
      if (callbacks) {
        callbacks.forEach(cb => {
          try {
            cb(value, key);
          } catch (e) {
            console.warn(`[StorageAdapter:${this.ns}] Listener error:`, e);
          }
        });
      }
    }

    // Clear all data for this namespace
    async clear() {
      const keysToRemove = [];
      this.memoryCache.forEach((_, key) => {
        if (key.startsWith(`${this.ns}_`)) {
          keysToRemove.push(key);
        }
      });

      keysToRemove.forEach(key => {
        this.memoryCache.delete(key);
        try {
          localStorage.removeItem(key);
        } catch (_) {}
      });

      if (this.syncEnabled) {
        keysToRemove.forEach(fullKey => {
          const key = fullKey.replace(`${this.ns}_`, '').replace(`_v${this.version}`, '');
          this.pendingWrites.set(fullKey, {
            key,
            value: null,
            timestamp: Date.now(),
            retries: 0,
            deleted: true
          });
        });
        await this.flushToServer();
      }
    }

    // Enable/disable server sync
    setSyncEnabled(enabled) {
      this.syncEnabled = enabled;
      if (enabled) {
        this.scheduleSync();
      }
    }

    // Get pending writes count
    getPendingCount() {
      return this.pendingWrites.size;
    }

    // Force sync now
    async syncNow() {
      await this.flushToServer();
    }
  }

  // Create singleton instances for each namespace
  const instances = {
    auth: new StorageAdapter('dn_auth', { syncEnabled: true }),
    config: new StorageAdapter('dn_config', { syncEnabled: false }),
    cache: new StorageAdapter('dn_cache', { syncEnabled: true }),
    social: new StorageAdapter('dnm', { syncEnabled: true }),
    admin: new StorageAdapter('dn_admin', { syncEnabled: true })
  };

  // Migration helper - moves old localStorage keys to new adapter
  async function migrateLegacyStorage() {
    const migrations = {
      // Auth migrations
      'dn_st': { adapter: instances.auth, key: 'stream_token' },
      'dn_admin_auth': { adapter: instances.admin, key: 'admin_auth' },
      'dn_admin_passkey': { adapter: instances.admin, key: 'passkey' },
      'dn_gas_url': { adapter: instances.config, key: 'gas_url' },
      'dn_cloud_cache': { adapter: instances.cache, key: 'cloud_cache' },

      // Social migrations
      'dnm_liked_posts': { adapter: instances.social, key: 'liked_posts' },
      'dnm_saved_posts': { adapter: instances.social, key: 'saved_posts' },
      'dnm_following_set': { adapter: instances.social, key: 'following' },
      'dnm_uploaded_posts': { adapter: instances.cache, key: 'uploaded_posts' },
      'dnm_community_posts': { adapter: instances.cache, key: 'community_posts' },

      // Config migrations
      'dnm_theme': { adapter: instances.config, key: 'theme' },
      'dnm_autoplay': { adapter: instances.config, key: 'autoplay' },
      'dnm_default_muted': { adapter: instances.config, key: 'default_muted' },
      'dnm_stream_quality': { adapter: instances.config, key: 'stream_quality' },

      // User session
      'dnm_user_session': { adapter: instances.auth, key: 'user_session' }
    };

    let migrated = 0;
    for (const [oldKey, { adapter, key }] of Object.entries(migrations)) {
      try {
        const val = localStorage.getItem(oldKey);
        if (val !== null) {
          let parsed;
          try {
            parsed = JSON.parse(val);
          } catch (_) {
            parsed = val;
          }
          await adapter.set(key, parsed);
          // Keep old key for backward compatibility during transition
          migrated++;
        }
      } catch (e) {
        console.warn(`Migration failed for ${oldKey}:`, e);
      }
    }

    if (migrated > 0) {
      console.log(`[StorageAdapter] Migrated ${migrated} legacy storage keys`);
    }

    return migrated;
  }

  // Global class export for modules that call `new StorageAdapter(...)`
  window.StorageAdapter = StorageAdapter;
  if (typeof globalThis !== 'undefined') globalThis.StorageAdapter = StorageAdapter;

  // Export namespace
  window.DNM_STORAGE = {
    StorageAdapter,
    instances,
    migrateLegacyStorage,

    // Convenience accessors
    auth: instances.auth,
    config: instances.config,
    cache: instances.cache,
    social: instances.social,
    admin: instances.admin
  };

  // Auto-migrate on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.DNM_STORAGE.migrateLegacyStorage();
    });
  } else {
    window.DNM_STORAGE.migrateLegacyStorage();
  }

})(window);