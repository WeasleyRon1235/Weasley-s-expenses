// Multi-page bootstrap to safely initialize per-page without null refs
(function(){
  const currentPage = document.body.dataset.page || 'home';

  // Safe guards for functions that touch DOM elements that may not exist on every page
  const safeUpdateBalanceDisplay = function() {
    try {
      const displayStartingBalance = document.getElementById('display-starting-balance');
      const currentBalance = document.getElementById('current-balance');
      if (!displayStartingBalance || !currentBalance || typeof window.startingBalance === 'undefined' || typeof window.totalAmount === 'undefined') return;
      displayStartingBalance.textContent = `£${window.startingBalance.toFixed(2)}`;
      currentBalance.textContent = `£${(window.startingBalance - window.totalAmount).toFixed(2)}`;
    } catch {}
  };

  const safeRenderExpenses = function() {
    try {
      const expenseList = document.getElementById('expense-list');
      if (!expenseList || !Array.isArray(window.expenses)) return;
      // Defer to original if exists
      if (typeof window.renderExpenses_original === 'function') {
        return window.renderExpenses_original();
      }
    } catch {}
  };

  // Capture originals if present
  if (typeof window.renderExpenses === 'function') {
    window.renderExpenses_original = window.renderExpenses;
    window.renderExpenses = safeRenderExpenses;
  }
  if (typeof window.updateBalanceDisplay === 'function') {
    window.updateBalanceDisplay = safeUpdateBalanceDisplay;
  }

  // Safe wireCommonEvents: only bind if element exists
  window.wireCommonEvents = function() {
    const byId = id => document.getElementById(id);
    const add = (el, evt, fn) => { if (el) el.addEventListener(evt, fn); };
    const addClick = (id, fn) => add(byId(id), 'click', fn);

    // Legacy SPA nav buttons
    const navButtons = document.querySelectorAll('.nav-btn');
    if (navButtons && navButtons.length) {
      navButtons.forEach(btn => {
        const target = btn?.dataset?.target;
        if (target && typeof window.showPage === 'function') {
          btn.addEventListener('click', () => window.showPage(target));
        }
      });
    }

    // Expense-related bindings
    addClick('add-expense', window.addExpense || (()=>{}));
    addClick('toggle-itemized', () => {
      const container = byId('itemized-container');
      if (!container) return;
      container.style.display = container.style.display === 'none' ? 'block' : 'none';
    });
    addClick('add-item-row', window.addItemRow || (()=>{}));
    addClick('export-data', window.exportData || (()=>{}));
    const importInput = byId('import-file');
    const importBtn = byId('import-data');
    if (importBtn && importInput) importBtn.addEventListener('click', () => importInput.click());
    if (importInput) importInput.addEventListener('change', window.importData || (()=>{}));
    addClick('save-balance', window.saveStartingBalance || (()=>{}));
    addClick('clear-all', window.clearAll || (()=>{}));
    addClick('prev-month', () => window.changeMonth && window.changeMonth(-1));
    addClick('next-month', () => window.changeMonth && window.changeMonth(1));
    addClick('add-savings', window.addSavingsGoal || (()=>{}));
  };

  // Override initApp to be page-aware
  window.initApp = function() {
    try {
      if (currentPage === 'expenses') {
        window.loadExpenses && window.loadExpenses();
        window.loadBalances && window.loadBalances();
        window.updateDashboard && window.updateDashboard();
      } else if (currentPage === 'dashboard') {
        window.loadExpenses && window.loadExpenses();
        window.updateDashboard && window.updateDashboard();
      } else if (currentPage === 'savings') {
        window.loadSavings && window.loadSavings();
      } else if (currentPage === 'users') {
        if (window.currentUser) {
          const uEl = document.getElementById('user-info-username');
          const rEl = document.getElementById('user-info-role');
          if (uEl && rEl) {
            uEl.textContent = window.currentUser.username || '—';
            rEl.textContent = window.currentUser.role || '—';
          }
        }
      } else if (currentPage === 'admin') {
        // Admin page handled via auth gating in script.js
      }
    } catch {}
  };

  // Role-based nav anchors visibility
  async function toggleRoleNav() {
    try {
      const resp = await fetch('/api/me');
      if (!resp.ok) return;
      const data = await resp.json();
      const user = data.user;
      const navSavingsLink = document.getElementById('nav-savings-link');
      const navAdminLink = document.getElementById('nav-admin-link');
      if (navSavingsLink) navSavingsLink.style.display = user?.role === 'admin' ? 'inline-block' : 'none';
      if (navAdminLink) navAdminLink.style.display = user?.role === 'admin' ? 'inline-block' : 'none';
    } catch {}
  }

  document.addEventListener('DOMContentLoaded', () => {
    toggleRoleNav();
  });
})();