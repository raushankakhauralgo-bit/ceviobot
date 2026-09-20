'use strict';

const Api = {
  KEY_STORAGE: 'crevio_api_key',

  getKey() {
    return localStorage.getItem(this.KEY_STORAGE);
  },
  setKey(key) {
    localStorage.setItem(this.KEY_STORAGE, key);
  },
  clearKey() {
    localStorage.removeItem(this.KEY_STORAGE);
  },

  async _fetchOnce(url, opts) {
    return fetch(url, opts);
  },

  async request(path, { params, method = 'GET', body } = {}) {
    const key = this.getKey();
    if (!key) throw new Error('NO_API_KEY');

    let url = `${window.CREVIO_API_BASE}${path}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      if (qs) url += `?${qs}`;
    }

    const opts = { method, headers: { 'X-API-Key': key } };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }

    let res;
    try {
      res = await this._fetchOnce(url, opts);
    } catch (err) {
      // Free-tier hosts occasionally drop the very first request after idling (cold start).
      // One silent retry after a short pause clears most of these without bothering the user.
      await new Promise(r => setTimeout(r, 1200));
      try {
        res = await this._fetchOnce(url, opts);
      } catch (err2) {
        throw new Error('NETWORK_ERROR');
      }
    }

    if (res.status === 401) {
      this.clearKey();
      throw new Error('INVALID_KEY');
    }
    if (res.status === 403) {
      const body2 = await res.json().catch(() => ({}));
      throw new Error(body2.error || 'FORBIDDEN');
    }
    if (!res.ok) {
      const body2 = await res.json().catch(() => ({}));
      throw new Error(body2.error || `HTTP_${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  },

  me() { return this.request('/me'); },
  discoverChannels(page = 1, sort = 'popular') { return this.request('/discover/channels', { params: { page, sort } }); },
  discoverChannel(id) { return this.request(`/discover/channels/${id}`); },
  memberships(page = 1) { return this.request('/memberships', { params: { page } }); },
  transactions(page = 1) { return this.request('/transactions', { params: { page } }); },

  creatorDashboard() { return this.request('/creator/dashboard'); },
  creatorChannels(page = 1) { return this.request('/creator/channels', { params: { page } }); },
  creatorChannel(id) { return this.request(`/creator/channels/${id}`); },
  creatorUpdateChannel(id, data) { return this.request(`/creator/channels/${id}`, { method: 'PUT', body: data }); },

  creatorPlans(page = 1) { return this.request('/creator/plans', { params: { page } }); },
  creatorCreatePlan(data) { return this.request('/creator/plans', { method: 'POST', body: data }); },
  creatorUpdatePlan(id, data) { return this.request(`/creator/plans/${id}`, { method: 'PUT', body: data }); },
  creatorDeletePlan(id) { return this.request(`/creator/plans/${id}`, { method: 'DELETE' }); },

  creatorMembers(page = 1) { return this.request('/creator/members', { params: { page } }); },
  creatorPayments(page = 1) { return this.request('/creator/payments', { params: { page } }); },
  creatorSettings() { return this.request('/creator/settings'); },
  creatorUpdateSettings(data) { return this.request('/creator/settings', { method: 'PUT', body: data }); },

  adminOverview() { return this.request('/admin/overview'); },
  adminUsers(page = 1) { return this.request('/admin/users', { params: { page } }); },
  adminBanUser(userId, reason) { return this.request(`/admin/users/${userId}/ban`, { method: 'PUT', body: { reason } }); },
  adminUnbanUser(userId) { return this.request(`/admin/users/${userId}/unban`, { method: 'PUT' }); },

  adminCreators(page = 1) { return this.request('/admin/creators', { params: { page } }); },
  adminVerifyCreator(userId) { return this.request(`/admin/creators/${userId}/verify`, { method: 'PUT' }); },
  adminSuspendCreator(userId, reason) { return this.request(`/admin/creators/${userId}/suspend`, { method: 'PUT', body: { reason } }); },
  adminUnsuspendCreator(userId) { return this.request(`/admin/creators/${userId}/unsuspend`, { method: 'PUT' }); },

  adminChannels(page = 1) { return this.request('/admin/channels', { params: { page } }); },
  adminTransactions(page = 1) { return this.request('/admin/transactions', { params: { page } }); },
};
