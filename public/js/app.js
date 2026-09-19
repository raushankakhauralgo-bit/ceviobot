'use strict';

// ---------- helpers ----------
function money(paise) {
  return '₹' + ((paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(Number(ts)).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}
function badge(status) {
  const s = (status || '').toLowerCase();
  return `<span class="badge ${s}">${status || '—'}</span>`;
}
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}
function yesNo(v) { return v ? 'Yes' : 'No'; }

const content = document.getElementById('content');
const viewTitle = document.getElementById('view-title');
const whoLabel = document.getElementById('who-label');

let currentUser = null;
let pages = {}; // per-view current page number

function setLoading() { content.innerHTML = '<div class="loading"><div class="spinner"></div><span>Loading…</span></div>'; }
function setError(msg) { content.innerHTML = `<div class="empty-state">⚠️ ${msg}</div>`; }
function retriggerAnim() {
  content.classList.remove('view-anim');
  void content.offsetWidth;
  content.classList.add('view-anim');
}

function paginationHTML(view, page, total, limit) {
  limit = limit || 10;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return `
    <div class="pagination">
      <button data-page-view="${view}" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Prev</button>
      <span style="align-self:center;color:var(--text-dim);font-size:13px;">Page ${page} of ${totalPages}</span>
      <button data-page-view="${view}" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Next</button>
    </div>`;
}
function bindPagination() {
  content.querySelectorAll('[data-page-view]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      pages[btn.getAttribute('data-page-view')] = parseInt(btn.getAttribute('data-page'), 10);
      loadView(btn.getAttribute('data-page-view'));
    });
  });
}

// ---------- modal ----------
const modalRoot = document.getElementById('modal-root');
function closeModal() { modalRoot.innerHTML = ''; }

function openModal(title, bodyHTML, opts) {
  opts = opts || {};
  const onSubmit = opts.onSubmit;
  const submitLabel = opts.submitLabel || 'Save';
  modalRoot.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal-box">
        <h3>${title}</h3>
        <div class="modal-error" id="modal-error"></div>
        <form id="modal-form">${bodyHTML}
          <div class="modal-actions">
            <button type="button" class="btn" id="modal-cancel">Cancel</button>
            <button type="submit" class="btn btn-accent" id="modal-submit">${submitLabel}</button>
          </div>
        </form>
      </div>
    </div>`;
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', function (e) { if (e.target.id === 'modal-overlay') closeModal(); });
  const form = document.getElementById('modal-form');
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const submitBtn = document.getElementById('modal-submit');
    const errBox = document.getElementById('modal-error');
    errBox.textContent = '';
    submitBtn.disabled = true;
    const original = submitBtn.textContent;
    submitBtn.textContent = 'Saving…';
    try {
      await onSubmit(new FormData(form));
      closeModal();
    } catch (err) {
      errBox.textContent = err.message || 'Something went wrong.';
      submitBtn.disabled = false;
      submitBtn.textContent = original;
    }
  });
}

function confirmAction(message, action) {
  openModal('Please confirm', `<p style="color:var(--text-dim);margin:0 0 4px;">${esc(message)}</p>`, {
    submitLabel: 'Confirm',
    onSubmit: async function () { await action(); loadView(currentView); },
  });
}

// Read-only detail view with optional action buttons (Edit, Activate/Deactivate, etc.)
function drow(label, valueHtml) {
  return `<dt>${esc(label)}</dt><dd>${valueHtml}</dd>`;
}
function openDetail(title, rowsHtml, actions) {
  const actionButtons = (actions || []).map(function (a, i) {
    return `<button type="button" class="btn ${a.className || ''}" data-detail-action="${i}">${esc(a.label)}</button>`;
  }).join('');
  modalRoot.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal-box">
        <h3>${title}</h3>
        <dl class="detail-grid">${rowsHtml}</dl>
        <div class="modal-actions">
          ${actionButtons}
          <button type="button" class="btn" id="modal-cancel">Close</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', function (e) { if (e.target.id === 'modal-overlay') closeModal(); });
  (actions || []).forEach(function (a, i) {
    modalRoot.querySelector('[data-detail-action="' + i + '"]').addEventListener('click', a.onClick);
  });
}

// ---------- mobile nav ----------
const sidebarEl = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
document.getElementById('menu-toggle').addEventListener('click', function () {
  sidebarEl.classList.add('open');
  sidebarOverlay.classList.add('open');
});
sidebarOverlay.addEventListener('click', function () {
  sidebarEl.classList.remove('open');
  sidebarOverlay.classList.remove('open');
});
function closeMobileNav() {
  sidebarEl.classList.remove('open');
  sidebarOverlay.classList.remove('open');
}

// ---------- views ----------
let currentView = 'profile';
let creatorChannelsCache = null;

const VIEWS = {
  profile: async function () {
    viewTitle.textContent = 'Profile';
    const me = currentUser || await Api.me();
    const recent = await Api.transactions(1).catch(function () { return { transactions: [] }; });
    content.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="label">Name</div><div class="value">${esc(me.full_name) || '—'}</div></div>
        <div class="stat-card"><div class="label">Username</div><div class="value">@${esc(me.username) || '—'}</div></div>
        <div class="stat-card"><div class="label">Active Plans</div><div class="value accent">${me.active_plans}</div></div>
        <div class="stat-card"><div class="label">Free Days Earned</div><div class="value">${me.free_days_earned}</div></div>
        <div class="stat-card"><div class="label">Joined</div><div class="value">${fmtDate(me.joined_at)}</div></div>
      </div>
      <h3 class="section-heading">Recent Transactions</h3>
      <div class="table-wrap"><div class="table-scroll">
        <table><thead><tr><th>Channel</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>${(recent.transactions || []).slice(0, 5).map(function (t) {
          return `<tr><td>${esc(t.channel_name)}</td><td>${money(t.amount)}</td><td>${badge(t.status)}</td><td>${fmtDate(t.created_at)}</td></tr>`;
        }).join('') || '<tr><td colspan="4">No transactions yet.</td></tr>'}
        </tbody></table>
      </div></div>`;
  },

  memberships: async function () {
    viewTitle.textContent = 'My Memberships';
    const page = pages.memberships || 1;
    const data = await Api.memberships(page);
    if (!data.memberships.length) { content.innerHTML = '<div class="empty-state">No memberships yet.</div>'; return; }
    content.innerHTML = `
      <div class="table-wrap"><div class="table-scroll">
        <table><thead><tr><th>Channel</th><th>Plan</th><th>Price</th><th>Status</th><th>Expires</th></tr></thead>
        <tbody>${data.memberships.map(function (m, i) {
          return `<tr class="clickable-row" data-mem-idx="${i}"><td>${esc(m.channel_name)}</td><td>${esc(m.plan_type)}</td><td>${money(m.price)}</td><td>${badge(m.status)}</td><td>${fmtDate(m.expires_at)}</td></tr>`;
        }).join('')}
        </tbody></table></div>
        ${paginationHTML('memberships', page, data.total)}
      </div>`;
    bindPagination();
    content.querySelectorAll('[data-mem-idx]').forEach(function (row) {
      row.addEventListener('click', function () { openMembershipDetail(data.memberships[parseInt(row.getAttribute('data-mem-idx'))]); });
    });
  },

  transactions: async function () {
    viewTitle.textContent = 'Transactions';
    const page = pages.transactions || 1;
    const data = await Api.transactions(page);
    if (!data.transactions.length) { content.innerHTML = '<div class="empty-state">No transactions yet.</div>'; return; }
    content.innerHTML = `
      <div class="table-wrap"><div class="table-scroll">
        <table><thead><tr><th>Channel</th><th>Amount</th><th>Method</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>${data.transactions.map(function (t, i) {
          return `<tr class="clickable-row" data-txn-idx="${i}"><td>${esc(t.channel_name)}</td><td>${money(t.amount)}</td><td>${esc(t.method)}</td><td>${badge(t.status)}</td><td>${fmtDate(t.created_at)}</td></tr>`;
        }).join('')}
        </tbody></table></div>
        ${paginationHTML('transactions', page, data.total)}
      </div>`;
    bindPagination();
    content.querySelectorAll('[data-txn-idx]').forEach(function (row) {
      row.addEventListener('click', function () { openTransactionDetail(data.transactions[parseInt(row.getAttribute('data-txn-idx'))]); });
    });
  },

  'creator-dashboard': async function () {
    viewTitle.textContent = 'Creator Dashboard';
    const results = await Promise.all([
      Api.creatorDashboard(),
      Api.creatorMembers(1).catch(function () { return { members: [] }; }),
      Api.creatorPayments(1).catch(function () { return { payments: [] }; }),
    ]);
    const d = results[0], membersData = results[1], paymentsData = results[2];
    const expiringSoon = (membersData.members || [])
      .filter(function (m) { return m.status === 'active'; })
      .sort(function (a, b) { return a.expires_at - b.expires_at; })
      .slice(0, 5);
    content.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="label">Channels</div><div class="value">${d.total_channels}</div></div>
        <div class="stat-card"><div class="label">Members</div><div class="value">${d.total_members}</div></div>
        <div class="stat-card"><div class="label">Total Revenue</div><div class="value accent">${money(d.total_revenue)}</div></div>
        <div class="stat-card"><div class="label">This Month</div><div class="value">${money(d.month_revenue)}</div></div>
        <div class="stat-card"><div class="label">Active Plans</div><div class="value">${d.active_plans}</div></div>
        <div class="stat-card"><div class="label">Expiring Soon</div><div class="value">${d.expiring_soon}</div></div>
      </div>

      <div class="dash-grid">
        <div>
          <h3 class="section-heading">Recent Members</h3>
          <div class="table-wrap"><div class="table-scroll">
            <table><thead><tr><th>Member</th><th>Channel</th><th>Expires</th></tr></thead>
            <tbody>${(membersData.members || []).slice(0, 5).map(function (m) {
              return `<tr><td>${esc(m.full_name || m.user_username || m.user_id)}</td><td>${esc(m.channel_name)}</td><td>${fmtDate(m.expires_at)}</td></tr>`;
            }).join('') || '<tr><td colspan="3">No members yet.</td></tr>'}
            </tbody></table>
          </div></div>
        </div>
        <div>
          <h3 class="section-heading">Recent Payments</h3>
          <div class="table-wrap"><div class="table-scroll">
            <table><thead><tr><th>From</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>${(paymentsData.payments || []).slice(0, 5).map(function (t) {
              return `<tr><td>${esc(t.full_name || t.user_id)}</td><td>${money(t.amount)}</td><td>${badge(t.status)}</td></tr>`;
            }).join('') || '<tr><td colspan="3">No payments yet.</td></tr>'}
            </tbody></table>
          </div></div>
        </div>
      </div>

      <h3 class="section-heading">Expiring Soon</h3>
      <div class="table-wrap"><div class="table-scroll">
        <table><thead><tr><th>Member</th><th>Channel</th><th>Expires</th></tr></thead>
        <tbody>${expiringSoon.map(function (m) {
          return `<tr><td>${esc(m.full_name || m.user_username || m.user_id)}</td><td>${esc(m.channel_name)}</td><td>${fmtDate(m.expires_at)}</td></tr>`;
        }).join('') || '<tr><td colspan="3">Nothing expiring soon.</td></tr>'}
        </tbody></table>
      </div></div>`;
  },

  'creator-channels': async function () {
    viewTitle.textContent = 'Channels';
    const page = pages['creator-channels'] || 1;
    const data = await Api.creatorChannels(page);
    creatorChannelsCache = data.channels;
    if (!data.channels.length) {
      content.innerHTML = '<div class="empty-state">No channels yet. Add a channel from the bot first.</div>';
      return;
    }
    content.innerHTML = `
      <div class="table-wrap"><div class="table-scroll">
        <table><thead><tr><th>Channel</th><th>Category</th><th>Members</th><th>Status</th><th>Created</th></tr></thead>
        <tbody>${data.channels.map(function (c) {
          return `<tr class="clickable-row" data-channel-id="${c.channel_id}"><td>${esc(c.channel_name)}</td><td>${esc(c.category) || '—'}</td><td>${c.total_members}</td>
          <td>${c.is_active ? badge('active') : badge('cancelled')}</td><td>${fmtDate(c.created_at)}</td></tr>`;
        }).join('')}
        </tbody></table></div>
        ${paginationHTML('creator-channels', page, data.total)}
      </div>`;
    bindPagination();
    content.querySelectorAll('[data-channel-id]').forEach(function (row) {
      row.addEventListener('click', function () { openChannelDetail(parseInt(row.getAttribute('data-channel-id'))); });
    });
  },

  'creator-plans': async function () {
    viewTitle.textContent = 'Plans';
    const page = pages['creator-plans'] || 1;
    const data = await Api.creatorPlans(page);
    content.innerHTML = `
      <div class="page-header-row">
        <div></div>
        <button class="btn btn-accent" id="new-plan-btn">+ New Plan</button>
      </div>` + (!data.plans.length ? '<div class="empty-state">No plans yet. Create one to start selling access.</div>' : `
      <div class="table-wrap"><div class="table-scroll">
        <table><thead><tr><th>Channel</th><th>Plan</th><th>Type</th><th>Price</th><th>Subscribers</th><th>Revenue</th><th></th></tr></thead>
        <tbody>${data.plans.map(function (p) {
          return `<tr class="clickable-row" data-plan-id="${p.id}"><td>${esc(p.channel_name)}</td><td>${esc(p.plan_name)}</td><td>${esc(p.plan_type)}</td>
          <td>${money(p.price)}</td><td>${p.total_subscribers}</td><td>${money(p.total_revenue)}</td>
          <td><button class="btn btn-sm" data-edit-plan-id="${p.id}">Edit</button></td></tr>`;
        }).join('')}
        </tbody></table></div>
        ${paginationHTML('creator-plans', page, data.total)}
      </div>`);
    bindPagination();
    document.getElementById('new-plan-btn').addEventListener('click', openNewPlan);
    content.querySelectorAll('[data-edit-plan-id]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const plan = data.plans.find(function (p) { return String(p.id) === btn.getAttribute('data-edit-plan-id'); });
        openEditPlan(plan);
      });
    });
    content.querySelectorAll('[data-plan-id]').forEach(function (row) {
      row.addEventListener('click', function () {
        const plan = data.plans.find(function (p) { return String(p.id) === row.getAttribute('data-plan-id'); });
        openPlanDetail(plan);
      });
    });
  },

  'creator-members': async function () {
    viewTitle.textContent = 'Members';
    const page = pages['creator-members'] || 1;
    const data = await Api.creatorMembers(page);
    if (!data.members.length) { content.innerHTML = '<div class="empty-state">No members yet.</div>'; return; }
    content.innerHTML = `
      <div class="table-wrap"><div class="table-scroll">
        <table><thead><tr><th>Member</th><th>Channel</th><th>Plan</th><th>Status</th><th>Expires</th></tr></thead>
        <tbody>${data.members.map(function (m, i) {
          return `<tr class="clickable-row" data-member-idx="${i}"><td>${esc(m.full_name || m.user_username || m.user_id)}</td><td>${esc(m.channel_name)}</td><td>${esc(m.plan_type)}</td><td>${badge(m.status)}</td><td>${fmtDate(m.expires_at)}</td></tr>`;
        }).join('')}
        </tbody></table></div>
        ${paginationHTML('creator-members', page, data.total)}
      </div>`;
    bindPagination();
    content.querySelectorAll('[data-member-idx]').forEach(function (row) {
      row.addEventListener('click', function () { openMemberDetail(data.members[parseInt(row.getAttribute('data-member-idx'))]); });
    });
  },

  'creator-payments': async function () {
    viewTitle.textContent = 'Payments';
    const page = pages['creator-payments'] || 1;
    const data = await Api.creatorPayments(page);
    if (!data.payments.length) { content.innerHTML = '<div class="empty-state">No payments yet.</div>'; return; }
    content.innerHTML = `
      <div class="table-wrap"><div class="table-scroll">
        <table><thead><tr><th>From</th><th>Channel</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>${data.payments.map(function (t) {
          return `<tr><td>${esc(t.full_name || t.user_id)}</td><td>${esc(t.channel_name)}</td><td>${money(t.amount)}</td><td>${badge(t.status)}</td><td>${fmtDate(t.created_at)}</td></tr>`;
        }).join('')}
        </tbody></table></div>
        ${paginationHTML('creator-payments', page, data.total)}
      </div>`;
    bindPagination();
  },

  'creator-settings': async function () {
    viewTitle.textContent = 'Creator Settings';
    const s = await Api.creatorSettings();
    content.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="label">Verified</div><div class="value">${s.is_verified ? '✅ Yes' : '❌ No'}</div></div>
        <div class="stat-card"><div class="label">Own Razorpay Connected</div><div class="value">${s.has_own_razorpay ? '✅ Yes' : 'No'}</div></div>
      </div>
      <div class="table-wrap" style="padding:24px;max-width:460px;">
        <form id="settings-form">
          <div class="field-group">
            <label>Razorpay Key ID</label>
            <input type="text" name="razorpayKey" placeholder="${s.has_own_razorpay ? 'Already set — leave blank to keep' : 'rzp_live_...'}">
          </div>
          <div class="field-group">
            <label>Razorpay Key Secret</label>
            <input type="password" name="razorpaySecret" placeholder="${s.has_own_razorpay ? 'Already set — leave blank to keep' : 'Enter secret'}">
          </div>
          <div class="field-group">
            <label>TRX (USDT) Wallet Address</label>
            <input type="text" name="trxWallet" value="${esc(s.trx_wallet) || ''}" placeholder="T...">
          </div>
          <div class="checkbox-row">
            <input type="checkbox" id="useDefaultRazorpay" name="useDefaultRazorpay" ${s.use_default_razorpay ? 'checked' : ''}>
            <label for="useDefaultRazorpay">Use Crevio's shared Razorpay account instead of my own</label>
          </div>
          <div class="modal-error" id="settings-error"></div>
          <button type="submit" class="btn btn-accent" id="settings-save">Save Changes</button>
        </form>
      </div>`;
    document.getElementById('settings-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      const fd = new FormData(e.target);
      const btn = document.getElementById('settings-save');
      const errBox = document.getElementById('settings-error');
      btn.disabled = true; btn.textContent = 'Saving…'; errBox.textContent = '';
      try {
        const payload = {
          trxWallet: fd.get('trxWallet') || null,
          useDefaultRazorpay: fd.get('useDefaultRazorpay') === 'on',
        };
        const rzpKey = fd.get('razorpayKey');
        const rzpSecret = fd.get('razorpaySecret');
        if (rzpKey) { payload.razorpayKey = rzpKey; payload.razorpaySecret = rzpSecret; }
        await Api.creatorUpdateSettings(payload);
        btn.textContent = 'Saved ✓';
        setTimeout(function () { loadView('creator-settings'); }, 700);
      } catch (err) {
        errBox.textContent = err.message;
        btn.disabled = false; btn.textContent = 'Save Changes';
      }
    });
  },

  'admin-overview': async function () {
    viewTitle.textContent = 'Admin Overview';
    const d = await Api.adminOverview();
    content.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="label">Revenue Today</div><div class="value accent">${money(d.revenue_today)}</div></div>
        <div class="stat-card"><div class="label">This Week</div><div class="value">${money(d.revenue_week)}</div></div>
        <div class="stat-card"><div class="label">This Month</div><div class="value">${money(d.revenue_month)}</div></div>
        <div class="stat-card"><div class="label">All-Time</div><div class="value">${money(d.revenue_total)}</div></div>
        <div class="stat-card"><div class="label">Platform Fees</div><div class="value">${money(d.fee_revenue)}</div></div>
        <div class="stat-card"><div class="label">Commission</div><div class="value">${money(d.commission_revenue)}</div></div>
      </div>
      <div class="table-wrap"><div class="table-scroll">
        <table><thead><tr><th>#</th><th>Creator</th><th>Revenue</th></tr></thead>
        <tbody>${d.top_creators.map(function (c, i) {
          return `<tr><td>${i + 1}</td><td>${esc(c.full_name || c.user_id)}</td><td>${money(c.revenue)}</td></tr>`;
        }).join('') || '<tr><td colspan="3">No data yet.</td></tr>'}
        </tbody></table></div>
      </div>`;
  },

  'admin-users': async function () {
    viewTitle.textContent = 'Users';
    const page = pages['admin-users'] || 1;
    const data = await Api.adminUsers(page);
    content.innerHTML = `
      <div class="table-wrap"><div class="table-scroll">
        <table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Joined</th><th></th></tr></thead>
        <tbody>${data.users.map(function (u) {
          return `<tr><td>${esc(u.full_name) || '—'}</td><td>@${esc(u.username) || '—'}</td><td>${esc(u.role)}</td>
          <td>${u.is_banned ? badge('cancelled') : badge('active')}</td><td>${fmtDate(u.created_at)}</td>
          <td>${u.is_banned
            ? '<button class="btn btn-sm" data-unban="' + u.user_id + '">Unban</button>'
            : '<button class="btn btn-sm btn-danger" data-ban="' + u.user_id + '">Ban</button>'}</td></tr>`;
        }).join('')}
        </tbody></table></div>
        ${paginationHTML('admin-users', page, data.total)}
      </div>`;
    bindPagination();
    content.querySelectorAll('[data-ban]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openModal('Ban user', '<div class="field-group"><label>Reason (optional)</label><textarea name="reason" placeholder="Why is this user being banned?"></textarea></div>', {
          submitLabel: 'Ban User',
          onSubmit: async function (fd) { await Api.adminBanUser(btn.getAttribute('data-ban'), fd.get('reason') || null); loadView('admin-users'); },
        });
      });
    });
    content.querySelectorAll('[data-unban]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        confirmAction('Unban this user?', function () { return Api.adminUnbanUser(btn.getAttribute('data-unban')); });
      });
    });
  },

  'admin-creators': async function () {
    viewTitle.textContent = 'Creators';
    const page = pages['admin-creators'] || 1;
    const data = await Api.adminCreators(page);
    content.innerHTML = `
      <div class="table-wrap"><div class="table-scroll">
        <table><thead><tr><th>Name</th><th>Tier</th><th>Revenue</th><th>Members</th><th>Status</th><th></th></tr></thead>
        <tbody>${data.creators.map(function (c) {
          return `<tr><td>${esc(c.full_name) || '—'}</td><td>${esc(c.tier)}</td><td>${money(c.total_revenue)}</td>
          <td>${c.total_members}</td>
          <td>${c.is_suspended ? badge('cancelled') : (c.is_verified ? badge('active') : badge('pending'))}</td>
          <td><div class="row-actions">
            ${!c.is_verified ? '<button class="btn btn-sm" data-verify="' + c.user_id + '">Verify</button>' : ''}
            ${c.is_suspended
              ? '<button class="btn btn-sm" data-unsuspend="' + c.user_id + '">Unsuspend</button>'
              : '<button class="btn btn-sm btn-danger" data-suspend="' + c.user_id + '">Suspend</button>'}
          </div></td></tr>`;
        }).join('')}
        </tbody></table></div>
        ${paginationHTML('admin-creators', page, data.total)}
      </div>`;
    bindPagination();
    content.querySelectorAll('[data-verify]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        confirmAction('Verify this creator?', function () { return Api.adminVerifyCreator(btn.getAttribute('data-verify')); });
      });
    });
    content.querySelectorAll('[data-unsuspend]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        confirmAction('Unsuspend this creator?', function () { return Api.adminUnsuspendCreator(btn.getAttribute('data-unsuspend')); });
      });
    });
    content.querySelectorAll('[data-suspend]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openModal('Suspend creator', '<div class="field-group"><label>Reason (optional)</label><textarea name="reason" placeholder="Why is this creator being suspended?"></textarea></div>', {
          submitLabel: 'Suspend',
          onSubmit: async function (fd) { await Api.adminSuspendCreator(btn.getAttribute('data-suspend'), fd.get('reason') || null); loadView('admin-creators'); },
        });
      });
    });
  },

  'admin-channels': async function () {
    viewTitle.textContent = 'Channels';
    const page = pages['admin-channels'] || 1;
    const data = await Api.adminChannels(page);
    content.innerHTML = `
      <div class="table-wrap"><div class="table-scroll">
        <table><thead><tr><th>Channel</th><th>Creator</th><th>Members</th><th>Status</th></tr></thead>
        <tbody>${data.channels.map(function (c) {
          return `<tr><td>${esc(c.channel_name)}</td><td>${esc(c.creator_name) || '—'}</td><td>${c.total_members}</td><td>${c.is_active ? badge('active') : badge('cancelled')}</td></tr>`;
        }).join('')}
        </tbody></table></div>
        ${paginationHTML('admin-channels', page, data.total)}
      </div>`;
    bindPagination();
  },

  'admin-transactions': async function () {
    viewTitle.textContent = 'All Transactions';
    const page = pages['admin-transactions'] || 1;
    const data = await Api.adminTransactions(page);
    content.innerHTML = `
      <div class="table-wrap"><div class="table-scroll">
        <table><thead><tr><th>User</th><th>Amount</th><th>Method</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>${data.transactions.map(function (t) {
          return `<tr><td>${esc(t.full_name || t.user_id)}</td><td>${money(t.amount)}</td><td>${esc(t.method)}</td><td>${badge(t.status)}</td><td>${fmtDate(t.created_at)}</td></tr>`;
        }).join('')}
        </tbody></table></div>
        ${paginationHTML('admin-transactions', page, data.total)}
      </div>`;
    bindPagination();
  },
};

// ---------- detail modals ----------
function openMembershipDetail(m) {
  const rows = [
    drow('Channel', esc(m.channel_name)),
    drow('Plan', esc(m.plan_type)),
    drow('Price', money(m.price)),
    drow('Status', badge(m.status)),
    drow('Trial', yesNo(m.is_trial)),
    drow('Gifted', yesNo(m.is_gifted)),
    drow('Activated', fmtDate(m.activated_at)),
    drow('Expires', fmtDate(m.expires_at)),
    drow('Grace Until', m.grace_until ? fmtDate(m.grace_until) : '—'),
  ];
  if (m.cancelled_at) {
    rows.push(drow('Cancelled At', fmtDate(m.cancelled_at)));
    rows.push(drow('Cancel Reason', esc(m.cancel_reason) || '—'));
  }
  openDetail('Membership Details', rows.join(''));
}

function openTransactionDetail(t) {
  const rows = [
    drow('Channel', esc(t.channel_name)),
    drow('Amount', money(t.amount)),
    drow('Method', esc(t.method)),
    drow('Status', badge(t.status)),
    drow('Transaction ID', esc(t.txn_id)),
  ];
  if (t.razorpay_payment_id) rows.push(drow('Razorpay Payment ID', esc(t.razorpay_payment_id)));
  if (t.razorpay_order_id) rows.push(drow('Razorpay Order ID', esc(t.razorpay_order_id)));
  if (t.trx_hash) rows.push(drow('TRX Hash', esc(t.trx_hash)));
  if (t.platform_fee) rows.push(drow('Platform Fee', money(t.platform_fee)));
  if (t.commission) rows.push(drow('Commission', money(t.commission)));
  if (t.refund_amount) {
    rows.push(drow('Refund Amount', money(t.refund_amount)));
    rows.push(drow('Refunded At', fmtDate(t.refunded_at)));
    rows.push(drow('Refund Reason', esc(t.refund_reason) || '—'));
  }
  rows.push(drow('Date', fmtDate(t.created_at)));
  openDetail('Transaction Details', rows.join(''));
}

function openMemberDetail(m) {
  const rows = [
    drow('Member', esc(m.full_name || m.user_username || m.user_id)),
    drow('Channel', esc(m.channel_name)),
    drow('Plan', esc(m.plan_type)),
    drow('Price', money(m.price)),
    drow('Status', badge(m.status)),
    drow('Activated', fmtDate(m.activated_at)),
    drow('Expires', fmtDate(m.expires_at)),
  ];
  if (m.cancelled_at) {
    rows.push(drow('Cancelled At', fmtDate(m.cancelled_at)));
    rows.push(drow('Cancel Reason', esc(m.cancel_reason) || '—'));
  }
  openDetail('Member Details', rows.join(''));
}

function openChannelDetail(channelId) {
  const c = (creatorChannelsCache || []).find(function (x) { return x.channel_id === channelId; });
  if (!c) return;
  const rows = [
    drow('Channel', esc(c.channel_name)),
    drow('Category', esc(c.category) || '—'),
    drow('Description', esc(c.description) || '—'),
    drow('Welcome Message', esc(c.welcome_message) || '—'),
    drow('Members', String(c.total_members)),
    drow('Max Members', c.max_members ? String(c.max_members) : 'Unlimited'),
    drow('Paused', yesNo(c.is_paused)),
    drow('Status', c.is_active ? badge('active') : badge('cancelled')),
    drow('Created', fmtDate(c.created_at)),
  ];
  openDetail('Channel Details', rows.join(''), [
    { label: 'Edit', onClick: function () { closeModal(); openEditChannel(channelId); } },
  ]);
}

function openPlanDetail(p) {
  const rows = [
    drow('Channel', esc(p.channel_name)),
    drow('Plan Name', esc(p.plan_name)),
    drow('Type', esc(p.plan_type)),
    drow('Price', money(p.price)),
    drow('Trial Days', String(p.trial_days || 0)),
    drow('Subscribers', String(p.total_subscribers)),
    drow('Revenue', money(p.total_revenue)),
    drow('Status', p.is_active ? badge('active') : badge('cancelled')),
    drow('Created', fmtDate(p.created_at)),
  ];
  openDetail('Plan Details', rows.join(''), [
    { label: 'Edit', onClick: function () { closeModal(); openEditPlan(p); } },
    {
      label: p.is_active ? 'Deactivate' : 'Activate',
      className: p.is_active ? 'btn-danger' : 'btn-accent',
      onClick: async function () {
        await Api.creatorUpdatePlan(p.id, { isActive: !p.is_active });
        closeModal();
        loadView('creator-plans');
      },
    },
  ]);
}

// ---------- creator write forms ----------
async function ensureChannelsForDropdown() {
  if (creatorChannelsCache) return creatorChannelsCache;
  const data = await Api.creatorChannels(1);
  creatorChannelsCache = data.channels;
  return creatorChannelsCache;
}

async function openNewPlan() {
  const channels = await ensureChannelsForDropdown();
  if (!channels.length) {
    openModal('No channels yet', '<p style="color:var(--text-dim);">Add a channel from the bot first, then come back here to create a plan for it.</p>', {
      submitLabel: 'OK', onSubmit: async function () {},
    });
    return;
  }
  openModal('New Plan', `
    <div class="field-group">
      <label>Channel</label>
      <select name="channelId">${channels.map(function (c) { return '<option value="' + c.channel_id + '">' + esc(c.channel_name) + '</option>'; }).join('')}</select>
    </div>
    <div class="field-group"><label>Plan Name</label><input type="text" name="planName" placeholder="e.g. Monthly Access" required></div>
    <div class="field-row">
      <div class="field-group">
        <label>Type</label>
        <select name="planType"><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="lifetime">Lifetime</option></select>
      </div>
      <div class="field-group"><label>Price (₹)</label><input type="number" name="price" min="1" step="0.01" required></div>
    </div>
    <div class="field-group"><label>Trial Days (optional)</label><input type="number" name="trialDays" min="0" value="0"></div>
  `, {
    submitLabel: 'Create Plan',
    onSubmit: async function (fd) {
      await Api.creatorCreatePlan({
        channelId: fd.get('channelId'),
        planName: fd.get('planName'),
        planType: fd.get('planType'),
        price: Math.round(parseFloat(fd.get('price')) * 100),
        trialDays: fd.get('trialDays'),
      });
      loadView('creator-plans');
    },
  });
}

function openEditPlan(plan) {
  openModal('Edit Plan', `
    <div class="field-group"><label>Plan Name</label><input type="text" name="planName" value="${esc(plan.plan_name)}" required></div>
    <div class="field-group"><label>Price (₹)</label><input type="number" name="price" min="1" step="0.01" value="${(plan.price / 100).toFixed(2)}" required></div>
    <div class="field-group"><label>Trial Days</label><input type="number" name="trialDays" min="0" value="${plan.trial_days || 0}"></div>
    <div class="checkbox-row"><input type="checkbox" id="isActive" name="isActive" ${plan.is_active ? 'checked' : ''}><label for="isActive">Active (visible to new subscribers)</label></div>
  `, {
    submitLabel: 'Save Changes',
    onSubmit: async function (fd) {
      await Api.creatorUpdatePlan(plan.id, {
        planName: fd.get('planName'),
        price: Math.round(parseFloat(fd.get('price')) * 100),
        trialDays: fd.get('trialDays'),
        isActive: fd.get('isActive') === 'on',
      });
      loadView('creator-plans');
    },
  });
}

function openEditChannel(channelId) {
  const c = (creatorChannelsCache || []).find(function (x) { return x.channel_id === channelId; });
  if (!c) return;
  openModal('Edit Channel', `
    <div class="field-group"><label>Category</label><input type="text" name="category" value="${esc(c.category) || ''}" placeholder="e.g. Trading, Education"></div>
    <div class="field-group"><label>Description</label><textarea name="description">${esc(c.description) || ''}</textarea></div>
    <div class="field-group"><label>Welcome Message</label><textarea name="welcomeMessage">${esc(c.welcome_message) || ''}</textarea></div>
    <div class="field-group"><label>Max Members (blank = unlimited)</label><input type="number" name="maxMembers" min="1" value="${c.max_members || ''}"></div>
    <div class="checkbox-row"><input type="checkbox" id="isPaused" name="isPaused" ${c.is_paused ? 'checked' : ''}><label for="isPaused">Pause new signups</label></div>
  `, {
    submitLabel: 'Save Changes',
    onSubmit: async function (fd) {
      await Api.creatorUpdateChannel(channelId, {
        category: fd.get('category') || null,
        description: fd.get('description') || null,
        welcomeMessage: fd.get('welcomeMessage') || null,
        maxMembers: fd.get('maxMembers') || null,
        isPaused: fd.get('isPaused') === 'on',
      });
      creatorChannelsCache = null;
      loadView('creator-channels');
    },
  });
}

// ---------- routing ----------
async function loadView(name) {
  currentView = name;
  document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.toggle('active', n.dataset.view === name); });
  closeMobileNav();
  setLoading();
  try {
    await VIEWS[name]();
    retriggerAnim();
  } catch (err) {
    setError(err.message === 'NETWORK_ERROR'
      ? 'Could not reach the API. Check window.CREVIO_API_BASE in js/config.js.'
      : esc(err.message));
    retriggerAnim();
  }
}

document.querySelectorAll('.nav-item').forEach(function (item) {
  item.addEventListener('click', function () { loadView(item.dataset.view); });
});

document.getElementById('logout-btn').addEventListener('click', function () {
  Api.clearKey();
  location.reload();
});

// ---------- login ----------
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginBtn = document.getElementById('login-btn');
const loginInput = document.getElementById('api-key-input');
const loginError = document.getElementById('login-error');

async function attemptLogin(key) {
  loginError.textContent = '';
  loginBtn.disabled = true;
  loginBtn.textContent = 'Signing in…';
  Api.setKey(key);
  try {
    const me = await Api.me();
    currentUser = me;
    enterApp(me);
  } catch (err) {
    Api.clearKey();
    loginError.textContent = err.message === 'NETWORK_ERROR'
      ? 'Could not reach the server. Check your connection.'
      : 'Invalid API key. Please check and try again.';
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login';
  }
}

loginBtn.addEventListener('click', function () {
  const key = loginInput.value.trim();
  if (!key) { loginError.textContent = 'Please enter your API key.'; return; }
  attemptLogin(key);
});
loginInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') loginBtn.click(); });

function enterApp(me) {
  loginScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  whoLabel.textContent = (me.full_name || 'User') + ' · ' + (me.is_admin ? 'Admin' : me.is_creator ? 'Creator' : 'Member');
  document.getElementById('nav-creator').classList.toggle('hidden', !me.is_creator);
  document.getElementById('nav-admin').classList.toggle('hidden', !me.is_admin);
  loadView('profile');
}

// ---------- boot ----------
(async function boot() {
  const existingKey = Api.getKey();
  if (!existingKey) return;
  try {
    const me = await Api.me();
    currentUser = me;
    enterApp(me);
  } catch (err) {
    Api.clearKey();
  }
})();
