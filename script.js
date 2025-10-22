// DOM Elements
const expenseDescription = document.getElementById('expense-description');
const expenseAmount = document.getElementById('expense-amount');
const expenseDate = document.getElementById('expense-date');
const expenseCategory = document.getElementById('expense-category');
const expensePayer = document.getElementById('expense-payer');
const addExpenseBtn = document.getElementById('add-expense');
const expenseList = document.getElementById('expense-list');
const filterButtons = document.querySelectorAll('.filter-btn');
const expensesCounter = document.getElementById('expenses-counter');
const clearAllBtn = document.getElementById('clear-all');
const prevMonthBtn = document.getElementById('prev-month');
const nextMonthBtn = document.getElementById('next-month');
const currentMonthDisplay = document.getElementById('current-month');
const totalAmount = document.getElementById('total-amount');
const yourAmount = document.getElementById('your-amount');
const spouseAmount = document.getElementById('spouse-amount');
const startingBalanceInput = document.getElementById('starting-balance');
const saveBalanceBtn = document.getElementById('save-balance');
const displayStartingBalance = document.getElementById('display-starting-balance');
const currentBalance = document.getElementById('current-balance');
const categoryTotals = document.getElementById('category-totals');
const exportDataBtn = document.getElementById('export-data');
// New inputs for receipts and itemized details
const expenseReceipt = document.getElementById('expense-receipt');
const toggleItemizedBtn = document.getElementById('toggle-itemized');
const itemizedContainer = document.getElementById('itemized-container');
const addItemRowBtn = document.getElementById('add-item-row');
const importDataBtn = document.getElementById('import-data');
const importFileInput = document.getElementById('import-file');
const lastSyncSpan = document.getElementById('last-sync');
// Auth UI elements
const authOverlay = document.getElementById('auth-overlay');
const authUsername = document.getElementById('auth-username');
const authPassword = document.getElementById('auth-password');
const authLoginBtn = document.getElementById('auth-login');
const authRegisterBtn = document.getElementById('auth-register');
const authError = document.getElementById('auth-error');
const authRemember = document.getElementById('auth-remember');
const logoutBtn = document.getElementById('logout-btn');
// Admin panel elements
const adminPanel = document.getElementById('admin-panel');
const adminNewUsername = document.getElementById('admin-new-username');
const adminNewPassword = document.getElementById('admin-new-password');
const adminNewRole = document.getElementById('admin-new-role');
const adminAddUserBtn = document.getElementById('admin-add-user');
const adminMessage = document.getElementById('admin-message');
// Dashboard
const dashThisMonth = document.getElementById('dash-this-month');
// Navigation
const topNav = document.getElementById('top-nav');
const navButtons = document.querySelectorAll('.nav-btn');
const navAdminBtn = document.getElementById('nav-admin');
const navSavingsBtn = document.querySelector('.nav-btn[data-target="savings-section"]');
const dashPrevMonth = document.getElementById('dash-prev-month');
const dashChange = document.getElementById('dash-change');
const dashCategoryComparison = document.getElementById('dash-category-comparison');
// Savings
const savingsNameInput = document.getElementById('savings-name');
const savingsTargetInput = document.getElementById('savings-target');
const addSavingsBtn = document.getElementById('add-savings');
const savingsList = document.getElementById('savings-list');
const API_ORIGIN = window.API_BASE_URL || (window.location.protocol + '//' + window.location.hostname + ':5000');
const API_BASE = API_ORIGIN.replace(/\/+$/, '') + '/api';

// App State
let expenses = {};
let balances = {};
let currentFilter = 'all';
let currentMonth = new Date();

// Set default date to today
if (expenseDate) {
    expenseDate.valueAsDate = new Date();
}

// Auth helpers and app wiring
function showAuth() {
    if (authOverlay) authOverlay.style.display = 'flex';
    if (authError) authError.textContent = '';
}
function hideAuth() {
    if (authOverlay) authOverlay.style.display = 'none';
    if (authError) authError.textContent = '';
}
async function apiFetch(url, options = {}) {
    const opts = { credentials: 'include', ...options };
    const res = await fetch(url, opts);
    if (res.status === 401) {
        showAuth();
        throw new Error('Unauthorized');
    }
    return res;
}
// Page navigation
function showPage(targetId) {
    const sections = ['expenses-container', 'savings-section', 'dashboard-section'];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (id === targetId) ? 'block' : 'none';
    });
    // Admin panel toggled separately by role
    if (adminPanel) {
        const shouldShowAdmin = (window.currentUser?.role === 'admin') && (targetId === 'admin-panel');
        adminPanel.style.display = shouldShowAdmin ? 'block' : 'none';
    }
    // Active button styling
    navButtons.forEach(btn => {
        if (btn.dataset.target === targetId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}
async function checkAuth() {
    try {
        const res = await apiFetch(`${API_BASE}/auth/me`);
        if (!res.ok) throw new Error('Not authenticated');
        const data = await res.json();
        if (data.authenticated) {
            if (logoutBtn) logoutBtn.style.display = 'inline-block';
            hideAuth();
            // Store current user and toggle admin panel
            window.currentUser = data.user;
            // Role-based nav and control visibility
            const role = window.currentUser?.role;
            const isAdmin = role === 'admin';
            const isViewer = role === 'viewer';
            // Admin tab visibility
            if (isAdmin) {
                if (navAdminBtn) navAdminBtn.style.display = 'inline-block';
            } else {
                if (navAdminBtn) navAdminBtn.style.display = 'none';
                if (adminPanel) adminPanel.style.display = 'none';
            }
            // Savings tab visible only to admin
            if (navSavingsBtn) navSavingsBtn.style.display = isAdmin ? 'inline-block' : 'none';
            // Controls: add expense for editor/admin; disable for viewer
            if (addExpenseBtn) addExpenseBtn.disabled = isViewer;
            if (toggleItemizedBtn) toggleItemizedBtn.disabled = isViewer;
            if (expenseDescription) expenseDescription.disabled = isViewer;
            if (expenseAmount) expenseAmount.disabled = isViewer;
            if (expenseDate) expenseDate.disabled = isViewer;
            if (expenseCategory) expenseCategory.disabled = isViewer;
            if (expensePayer) expensePayer.disabled = isViewer;
            if (expenseReceipt) expenseReceipt.disabled = isViewer;
            // Starting balance only admin
            if (saveBalanceBtn) saveBalanceBtn.disabled = !isAdmin;
            if (startingBalanceInput) startingBalanceInput.disabled = !isAdmin;
            // Default to Expenses page
            showPage('expenses-container');
            return true;
        }
    } catch (e) {
        // Not authenticated or error
    }
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (adminPanel) adminPanel.style.display = 'none';
    if (navSavingsBtn) navSavingsBtn.style.display = 'none';
    showAuth();
    return false;
}
async function login() {
    const username = (authUsername?.value || '').trim();
    const password = (authPassword?.value || '').trim();
    const remember = !!(authRemember && authRemember.checked);
    if (!username || !password) {
        if (authError) authError.textContent = 'Enter username and password';
        return;
    }
    try {
        const res = await apiFetch(`${API_BASE}/auth/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, remember })
        });
        if (!res.ok) {
            const t = await res.json().catch(() => ({}));
            throw new Error(t.error || 'Login failed');
        }
        hideAuth();
        if (logoutBtn) logoutBtn.style.display = 'inline-block';
        // Refresh auth info to capture role and show admin panel
        const authed = await checkAuth();
        if (authed) initApp();
    } catch (e) {
        if (authError) authError.textContent = e.message || 'Login error';
    }
}
async function register() {
    const username = (authUsername?.value || '').trim();
    const password = (authPassword?.value || '').trim();
    if (!username || !password) {
        if (authError) authError.textContent = 'Enter username and password';
        return;
    }
    try {
        const res = await apiFetch(`${API_BASE}/auth/register`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password })
        });
        if (!res.ok) {
            const t = await res.json().catch(() => ({}));
            throw new Error(t.error || 'Registration failed');
        }
        if (authError) authError.textContent = 'Registered. Please log in.';
    } catch (e) {
        if (authError) authError.textContent = e.message || 'Registration error';
    }
}
async function logout() {
    try {
        await apiFetch(`${API_BASE}/auth/logout`, { method: 'POST' });
    } catch (e) {
        // ignore
    }
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (adminPanel) adminPanel.style.display = 'none';
    if (navAdminBtn) navAdminBtn.style.display = 'none';
    showAuth();
}
function wireCommonEvents() {
    // Set up all event listeners
    addExpenseBtn.addEventListener('click', addExpense);
    expenseDescription.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addExpense();
        }
    });
    clearAllBtn.addEventListener('click', clearAllExpenses);
    prevMonthBtn.addEventListener('click', goToPreviousMonth);
    nextMonthBtn.addEventListener('click', goToNextMonth);
    saveBalanceBtn.addEventListener('click', saveStartingBalance);
    addSavingsBtn.addEventListener('click', addSavingsGoal);
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            setFilter(button.dataset.filter);
        });
    });
    exportDataBtn.addEventListener('click', exportData);
    importDataBtn.addEventListener('click', function() {
        importFileInput.click();
    });
    importFileInput.addEventListener('change', importData);
    // Itemized UI events
    if (toggleItemizedBtn) {
        toggleItemizedBtn.addEventListener('click', () => {
            const showing = itemizedContainer.style.display !== 'none';
            itemizedContainer.style.display = showing ? 'none' : 'block';
        });
    }
    if (addItemRowBtn) {
        addItemRowBtn.addEventListener('click', () => {
            const row = document.createElement('div');
            row.className = 'item-row';
            row.innerHTML = `
                <input type="text" class="item-name" placeholder="Item name">
                <input type="number" class="item-amount" placeholder="Amount" min="0" step="0.01">
                <button class="remove-item" type="button">Remove</button>
            `;
            row.querySelector('.remove-item').addEventListener('click', () => {
                row.remove();
            });
            itemizedContainer.insertBefore(row, addItemRowBtn);
        });
        // Bind existing remove button in initial row
        const firstRemove = itemizedContainer.querySelector('.remove-item');
        if (firstRemove) firstRemove.addEventListener('click', (e) => {
            const parent = e.target.closest('.item-row');
            if (parent) parent.remove();
        });
    }
    if (authLoginBtn) authLoginBtn.addEventListener('click', login);
    // Public registration disabled; no listener for register
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    if (adminAddUserBtn) adminAddUserBtn.addEventListener('click', adminAddUser);
    // Navigation events
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target;
            // Prevent showing admin if not admin
            if (target === 'admin-panel' && window.currentUser?.role !== 'admin') return;
            // Prevent showing savings if not admin
            if (target === 'savings-section' && window.currentUser?.role !== 'admin') return;
            showPage(target);
        });
    });
}
function initApp() {
    loadExpenses();
    loadBalances();
    // Savings only for admin
    if (window.currentUser?.role === 'admin') {
        loadSavings();
    }
    updateMonthDisplay();
    renderExpenses();
    updateBalanceDisplay();
    updateCategoryTotals();
    updateDashboard();
}
// Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
    wireCommonEvents();
    const authed = await checkAuth();
    if (authed) {
        initApp();
    }
});

// Admin: add user
async function adminAddUser() {
    const username = (adminNewUsername?.value || '').trim();
    const password = (adminNewPassword?.value || '').trim();
    const role = (adminNewRole?.value || 'user').trim().toLowerCase();
    if (!username || !password) {
        if (adminMessage) adminMessage.textContent = 'Enter username and password';
        return;
    }
    try {
        const res = await apiFetch(`${API_BASE}/admin/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role })
        });
        const t = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(t.error || 'Failed to add user');
        if (adminMessage) adminMessage.textContent = 'User added successfully.';
        if (adminNewUsername) adminNewUsername.value = '';
        if (adminNewPassword) adminNewPassword.value = '';
        if (adminNewRole) adminNewRole.value = 'user';
    } catch (e) {
        if (adminMessage) adminMessage.textContent = e.message || 'Error adding user';
    }
}

// Functions
async function addExpense() {
    // Viewer cannot add
    if (window.currentUser?.role === 'viewer') {
        alert('You do not have permission to add expenses');
        return;
    }
    const description = expenseDescription.value.trim();
    const amount = parseFloat(expenseAmount.value);
    const category = expenseCategory.value;
    const payer = expensePayer.value;
    const dateStr = expenseDate.value ? expenseDate.value : new Date().toISOString().slice(0,10);
    
    if (description === '' || isNaN(amount) || amount <= 0) {
        alert('Please enter a valid description and amount');
        return;
    }
    
    // Prepare receipt file if provided
    let receiptPayload = {};
    if (expenseReceipt && expenseReceipt.files && expenseReceipt.files[0]) {
        const file = expenseReceipt.files[0];
        const base64 = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => {
                const res = r.result.split(',')[1] || '';
                resolve(res);
            };
            r.onerror = reject;
            r.readAsDataURL(file);
        });
        receiptPayload = { receipt_name: file.name, receipt_base64: base64 };
    }
    // Collect itemized rows
    const items = [];
    if (itemizedContainer && itemizedContainer.style.display !== 'none') {
        const rows = itemizedContainer.querySelectorAll('.item-row');
        rows.forEach(row => {
            const name = row.querySelector('.item-name')?.value?.trim();
            const amtStr = row.querySelector('.item-amount')?.value;
            const iam = parseFloat(amtStr);
            if (name && !isNaN(iam) && iam > 0) {
                items.push({ name, amount: iam });
            }
        });
    }
    try {
        const res = await apiFetch(`${API_BASE}/expenses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description, amount, category, payer, date: dateStr, items, ...receiptPayload })
        });
        if (!res.ok) throw new Error('Failed to add expense');
        await loadExpenses();
        renderExpenses();
        updateBalanceDisplay();
        updateCategoryTotals();
        updateDashboard();
    } catch (err) {
        console.error(err);
        alert('Error adding expense.');
    }
    
    // Clear input fields
    expenseDescription.value = '';
    expenseAmount.value = '';
    if (expenseReceipt) expenseReceipt.value = '';
    if (itemizedContainer) {
        itemizedContainer.style.display = 'none';
        // Remove all rows
        itemizedContainer.querySelectorAll('.item-row').forEach(r => r.remove());
        // Recreate one empty row
        const row = document.createElement('div');
        row.className = 'item-row';
        row.innerHTML = `
            <input type="text" class="item-name" placeholder="Item name">
            <input type="number" class="item-amount" placeholder="Amount" min="0" step="0.01">
            <button class="remove-item" type="button">Remove</button>
        `;
        row.querySelector('.remove-item').addEventListener('click', () => row.remove());
        itemizedContainer.insertBefore(row, addItemRowBtn);
    }
    expenseDescription.focus();
}

async function saveStartingBalance() {
    // Only admin can update starting balance
    if (window.currentUser?.role !== 'admin') {
        alert('Only admin can update starting balance');
        return;
    }
    const balance = parseFloat(startingBalanceInput.value);
    
    if (isNaN(balance) || balance < 0) {
        alert('Please enter a valid starting balance');
        return;
    }
    
    const monthKey = getMonthKey(currentMonth);
    try {
        const res = await apiFetch(`${API_BASE}/balances`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ month_key: monthKey, starting_balance: balance })
        });
        if (!res.ok) throw new Error('Failed to save balance');
        const data = await res.json();
        balances[monthKey] = data.starting_balance;
        updateBalanceDisplay();
        updateDashboard();
    } catch (err) {
        console.error(err);
        alert('Error saving starting balance.');
    }
    
    startingBalanceInput.value = '';
}

async function deleteExpense(expenseId) {
    // Viewer cannot delete
    if (window.currentUser?.role === 'viewer') {
        alert('You do not have permission to delete expenses');
        return;
    }
    try {
        const res = await apiFetch(`${API_BASE}/expenses/${expenseId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete');
        await loadExpenses();
        renderExpenses();
        updateBalanceDisplay();
        updateCategoryTotals();
    } catch (err) {
        console.error(err);
        alert('Error deleting expense.');
    }
}

function clearAllExpenses() {
    const monthKey = getMonthKey(currentMonth);
    if (confirm('Are you sure you want to clear all expenses for this month?')) {
        expenses[monthKey] = [];
        saveExpenses();
        renderExpenses();
        updateBalanceDisplay();
        updateCategoryTotals();
    }
}

function setFilter(filter) {
    currentFilter = filter;
    
    filterButtons.forEach(button => {
        if (button.dataset.filter === filter) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
    
    renderExpenses();
}

function getFilteredExpenses() {
    const monthKey = getMonthKey(currentMonth);
    const monthExpenses = expenses[monthKey] || [];
    
    switch (currentFilter) {
        case 'you':
            return monthExpenses.filter(expense => expense.payer === 'you');
        case 'spouse':
            return monthExpenses.filter(expense => expense.payer === 'spouse');
        case 'food':
            return monthExpenses.filter(expense => expense.category === 'food');
        case 'utilities':
            return monthExpenses.filter(expense => expense.category === 'utilities');
        case 'rent':
            return monthExpenses.filter(expense => expense.category === 'rent');
        case 'groceries':
            return monthExpenses.filter(expense => expense.category === 'groceries');
        case 'entertainment':
            return monthExpenses.filter(expense => expense.category === 'entertainment');
        case 'transportation':
            return monthExpenses.filter(expense => expense.category === 'transportation');
        case 'credit-card':
            return monthExpenses.filter(expense => expense.category === 'credit-card');
        case 'installments':
            return monthExpenses.filter(expense => expense.category === 'installments');
        case 'apartment-installment':
            return monthExpenses.filter(expense => expense.category === 'apartment-installment');
        case 'other':
            return monthExpenses.filter(expense => expense.category === 'other');
        default:
            return monthExpenses;
    }
}

function renderExpenses() {
    const filteredExpenses = getFilteredExpenses();
    
    expenseList.innerHTML = '';
    
    if (filteredExpenses.length === 0) {
        const emptyMessage = document.createElement('li');
        emptyMessage.textContent = 'No expenses for this period';
        emptyMessage.style.textAlign = 'center';
        emptyMessage.style.padding = '20px';
        emptyMessage.style.color = '#666';
        expenseList.appendChild(emptyMessage);
    } else {
        // Sort expenses by date (newest first)
        filteredExpenses.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        filteredExpenses.forEach(expense => {
            const expenseItem = document.createElement('li');
            expenseItem.className = 'expense-item';
            
            const expenseDetails = document.createElement('div');
            expenseDetails.className = 'expense-details';
            
            const expenseDescriptionEl = document.createElement('span');
            expenseDescriptionEl.className = 'expense-description';
            expenseDescriptionEl.textContent = expense.description;
            
            const expenseMeta = document.createElement('div');
            expenseMeta.className = 'expense-meta';
            
            const expenseCategoryEl = document.createElement('span');
            expenseCategoryEl.className = 'expense-category';
            expenseCategoryEl.textContent = expense.category;
            
            const expenseDateEl = document.createElement('span');
            expenseDateEl.className = 'expense-date';
            const dateObj = new Date(expense.date);
            expenseDateEl.textContent = dateObj.toLocaleDateString();
            
            const expensePayerEl = document.createElement('span');
            expensePayerEl.className = 'expense-payer';
            expensePayerEl.textContent = `Paid by: ${expense.payer}`;
            
            expenseMeta.appendChild(expenseCategoryEl);
            expenseMeta.appendChild(expenseDateEl);
            expenseMeta.appendChild(expensePayerEl);
            
            expenseDetails.appendChild(expenseDescriptionEl);
            expenseDetails.appendChild(expenseMeta);
            
            const expenseAmountEl = document.createElement('span');
            expenseAmountEl.className = `expense-amount ${expense.payer}`;
            expenseAmountEl.textContent = `£${expense.amount.toFixed(2)}`;
            
            // Receipt link
            if (expense.receipt_path) {
                const receiptLink = document.createElement('a');
                receiptLink.className = 'expense-receipt-link';
                receiptLink.href = `${API_BASE}/receipts/${encodeURIComponent(expense.receipt_path)}`;
                receiptLink.target = '_blank';
                receiptLink.textContent = 'View receipt';
                expenseDetails.appendChild(receiptLink);
            }

            // Items list (if any)
            if (expense.items && expense.items.length) {
                const itemsToggle = document.createElement('button');
                itemsToggle.type = 'button';
                itemsToggle.textContent = `View items (${expense.items.length})`;
                itemsToggle.style.marginTop = '6px';
                itemsToggle.style.fontSize = '12px';
                itemsToggle.style.background = '#f1f5ff';
                itemsToggle.style.border = '1px solid #d5e3ff';
                itemsToggle.style.color = '#2c3e50';
                const itemsList = document.createElement('ul');
                itemsList.className = 'expense-items';
                itemsList.style.display = 'none';
                expense.items.forEach(it => {
                    const li = document.createElement('li');
                    li.textContent = `${it.name}: £${parseFloat(it.amount).toFixed(2)}`;
                    itemsList.appendChild(li);
                });
                itemsToggle.addEventListener('click', () => {
                    itemsList.style.display = itemsList.style.display === 'none' ? 'block' : 'none';
                });
                expenseDetails.appendChild(itemsToggle);
                expenseDetails.appendChild(itemsList);
            }

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            // Hide delete for viewers
            if (window.currentUser?.role === 'viewer') {
                deleteBtn.style.display = 'none';
            } else {
                deleteBtn.addEventListener('click', () => deleteExpense(expense.id));
            }
            
            expenseItem.appendChild(expenseDetails);
            expenseItem.appendChild(expenseAmountEl);
            expenseItem.appendChild(deleteBtn);
            
            expenseList.appendChild(expenseItem);
        });
    }
    
    updateExpensesCounter();
    updateSummary();
    updateCategoryTotals();
}

function updateExpensesCounter() {
    const monthKey = getMonthKey(currentMonth);
    const monthExpenses = expenses[monthKey] || [];
    expensesCounter.textContent = `${monthExpenses.length} expense${monthExpenses.length !== 1 ? 's' : ''} this month`;
}

function updateSummary() {
    const monthKey = getMonthKey(currentMonth);
    const monthExpenses = expenses[monthKey] || [];
    
    let total = 0;
    let yourTotal = 0;
    let spouseTotal = 0;
    
    monthExpenses.forEach(expense => {
        const amount = parseFloat(expense.amount);
        total += amount;
        
        if (expense.payer === 'you') {
            yourTotal += amount;
        } else if (expense.payer === 'spouse') {
            spouseTotal += amount;
        }
    });
    
    totalAmount.textContent = `£${total.toFixed(2)}`;
    yourAmount.textContent = `£${yourTotal.toFixed(2)}`;
    spouseAmount.textContent = `£${spouseTotal.toFixed(2)}`;
}

function updateCategoryTotals() {
    const monthKey = getMonthKey(currentMonth);
    const monthExpenses = expenses[monthKey] || [];
    
    // Clear previous category totals
    categoryTotals.innerHTML = '';
    
    // Calculate totals by category
    const categories = {};
    
    monthExpenses.forEach(expense => {
        const category = expense.category;
        const amount = parseFloat(expense.amount);
        
        if (!categories[category]) {
            categories[category] = 0;
        }
        
        categories[category] += amount;
    });
    
    // Create category total items
    for (const category in categories) {
        const categoryItem = document.createElement('div');
        categoryItem.className = 'category-item';
        
        const categoryName = document.createElement('h4');
        categoryName.textContent = category.charAt(0).toUpperCase() + category.slice(1);
        
        const categoryAmount = document.createElement('p');
        categoryAmount.textContent = `£${categories[category].toFixed(2)}`;
        
        categoryItem.appendChild(categoryName);
        categoryItem.appendChild(categoryAmount);
        
        categoryTotals.appendChild(categoryItem);
    }
    
    // If no categories, show message
    if (Object.keys(categories).length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.textContent = 'No expenses yet';
        emptyMessage.style.gridColumn = '1 / -1';
        emptyMessage.style.textAlign = 'center';
        emptyMessage.style.padding = '20px';
        emptyMessage.style.color = '#666';
        categoryTotals.appendChild(emptyMessage);
    }
}

function computeTotalsByCategory(monthExpenses) {
    const totals = {};
    let total = 0;
    monthExpenses.forEach(expense => {
        const amount = parseFloat(expense.amount);
        total += amount;
        const cat = expense.category;
        totals[cat] = (totals[cat] || 0) + amount;
    });
    return { total, byCategory: totals };
}

async function updateDashboard() {
    try {
        const thisKey = getMonthKey(currentMonth);
        const prevDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
        const prevKey = getMonthKey(prevDate);

        const [thisRes, prevRes] = await Promise.all([
            apiFetch(`${API_BASE}/expenses?month=${encodeURIComponent(thisKey)}`),
            apiFetch(`${API_BASE}/expenses?month=${encodeURIComponent(prevKey)}`)
        ]);
        const thisJson = await thisRes.json();
        const prevJson = await prevRes.json();
        const thisTotals = computeTotalsByCategory(thisJson.expenses || []);
        const prevTotals = computeTotalsByCategory(prevJson.expenses || []);

        dashThisMonth.textContent = `£${thisTotals.total.toFixed(2)}`;
        dashPrevMonth.textContent = `£${prevTotals.total.toFixed(2)}`;
        const diff = thisTotals.total - prevTotals.total;
        const pct = prevTotals.total > 0 ? (diff / prevTotals.total) * 100 : 0;
        const sign = diff >= 0 ? '+' : '';
        dashChange.textContent = `${sign}£${diff.toFixed(2)} (${pct.toFixed(1)}%)`;

        // Build category comparison
        const cats = new Set([
            ...Object.keys(thisTotals.byCategory),
            ...Object.keys(prevTotals.byCategory)
        ]);
        dashCategoryComparison.innerHTML = '';
        const maxVal = Math.max(
            1,
            ...Array.from(cats).map(c => Math.max(thisTotals.byCategory[c] || 0, prevTotals.byCategory[c] || 0))
        );
        cats.forEach(cat => {
            const item = document.createElement('div');
            item.className = 'comparison-item';
            const title = document.createElement('div');
            title.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
            const bars = document.createElement('div');
            bars.className = 'comparison-bars';
            const barThis = document.createElement('div');
            barThis.className = 'bar bar-this';
            barThis.style.width = `${((thisTotals.byCategory[cat] || 0) / maxVal) * 100}%`;
            const barPrev = document.createElement('div');
            barPrev.className = 'bar bar-prev';
            barPrev.style.width = `${((prevTotals.byCategory[cat] || 0) / maxVal) * 100}%`;
            bars.appendChild(barThis);
            bars.appendChild(barPrev);
            item.appendChild(title);
            item.appendChild(bars);
            dashCategoryComparison.appendChild(item);
        });
    } catch (e) {
        console.error('Dashboard update failed', e);
    }
}

function updateBalanceDisplay() {
    const monthKey = getMonthKey(currentMonth);
    const startBalance = balances[monthKey] || 0;
    const monthExpenses = expenses[monthKey] || [];
    
    let totalExpenses = 0;
    monthExpenses.forEach(expense => {
        totalExpenses += parseFloat(expense.amount);
    });
    
    const remainingBalance = startBalance - totalExpenses;
    
    displayStartingBalance.textContent = `£${startBalance.toFixed(2)}`;
    currentBalance.textContent = `£${remainingBalance.toFixed(2)}`;
    
    // Change color based on balance
    if (remainingBalance < 0) {
        currentBalance.style.color = '#e74c3c';
    } else {
        currentBalance.style.color = '#2c3e50';
    }
}

function goToPreviousMonth() {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    updateMonthDisplay();
    renderExpenses();
    updateBalanceDisplay();
    updateCategoryTotals();
    updateDashboard();
}

function goToNextMonth() {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    updateMonthDisplay();
    renderExpenses();
    updateBalanceDisplay();
    updateCategoryTotals();
    updateDashboard();
}

function updateMonthDisplay() {
    const options = { month: 'long', year: 'numeric' };
    currentMonthDisplay.textContent = currentMonth.toLocaleDateString('en-US', options);
}

function getMonthKey(date) {
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${date.getFullYear()}-${m}`;
}

async function loadExpenses() {
    const monthKey = getMonthKey(currentMonth);
    try {
        const res = await apiFetch(`${API_BASE}/expenses?month=${encodeURIComponent(monthKey)}`);
        if (!res.ok) throw new Error('Failed to load expenses');
        const data = await res.json();
        expenses[monthKey] = data.expenses || [];
        updateSummary();
        updateCategoryTotals();
        updateDashboard();
    } catch (err) {
        console.error(err);
        // Fallback: keep current in-memory state
        expenses[monthKey] = expenses[monthKey] || [];
    }
}

async function loadBalances() {
    const monthKey = getMonthKey(currentMonth);
    try {
        const res = await apiFetch(`${API_BASE}/balances?month=${encodeURIComponent(monthKey)}`);
        if (!res.ok) throw new Error('Failed to load balances');
        const data = await res.json();
        balances[monthKey] = data.starting_balance || 0;
        updateBalanceDisplay();
    } catch (err) {
        console.error(err);
        balances[monthKey] = balances[monthKey] || 0;
        updateBalanceDisplay();
    }
}

// Savings
async function loadSavings() {
    try {
        const res = await apiFetch(`${API_BASE}/savings`);
        const data = await res.json();
        window.savings = data.savings || [];
        renderSavings();
    } catch (e) {
        console.error('Failed to load savings', e);
    }
}

async function addSavingsGoal() {
    // Admin only
    if (window.currentUser?.role !== 'admin') {
        alert('Only admin can add savings goals');
        return;
    }
    const name = savingsNameInput.value.trim();
    const target = parseFloat(savingsTargetInput.value);
    if (!name || isNaN(target) || target <= 0) {
        alert('Enter a valid goal name and target amount');
        return;
    }
    try {
        const res = await apiFetch(`${API_BASE}/savings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, target })
        });
        const data = await res.json();
        savingsNameInput.value = '';
        savingsTargetInput.value = '';
        await loadSavings();
    } catch (e) {
        console.error('Failed to add savings goal', e);
    }
}

async function contributeToSavings(id, amount) {
    // Admin only
    if (window.currentUser?.role !== 'admin') {
        alert('Only admin can contribute to savings');
        return;
    }
    try {
        const res = await apiFetch(`${API_BASE}/savings/${id}/contribute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount })
        });
        await res.json();
        await loadSavings();
    } catch (e) {
        console.error('Failed to contribute', e);
    }
}

async function deleteSavings(id) {
    // Admin only
    if (window.currentUser?.role !== 'admin') {
        alert('Only admin can delete savings');
        return;
    }
    try {
        await apiFetch(`${API_BASE}/savings/${id}`, { method: 'DELETE' });
        await loadSavings();
    } catch (e) {
        console.error('Failed to delete savings', e);
    }
}

function renderSavings() {
    const list = savingsList;
    if (!list) return;
    list.innerHTML = '';
    (window.savings || []).forEach(s => {
        const li = document.createElement('li');
        li.className = 'savings-item';
        const name = document.createElement('div');
        name.className = 'savings-name';
        name.textContent = `${s.name}`;

        const amounts = document.createElement('div');
        amounts.className = 'savings-amounts';
        const currentSpan = document.createElement('span');
        currentSpan.className = 'current';
        currentSpan.textContent = `£${(s.current || 0).toFixed(2)}`;
        const sep = document.createElement('span');
        sep.textContent = ' / ';
        const targetSpan = document.createElement('span');
        targetSpan.className = 'target';
        targetSpan.textContent = `£${(s.target || 0).toFixed(2)}`;
        amounts.appendChild(currentSpan);
        amounts.appendChild(sep);
        amounts.appendChild(targetSpan);
        const progress = document.createElement('div');
        progress.className = 'savings-progress';
        const pct = s.target > 0 ? Math.min(100, (s.current / s.target) * 100) : 0;
        const bar = document.createElement('div');
        bar.style.width = `${pct}%`;
        bar.className = pct < 33 ? 'bar-low' : pct < 66 ? 'bar-mid' : 'bar-high';
        const percentLabel = document.createElement('span');
        percentLabel.className = 'percent-label';
        percentLabel.textContent = `${pct.toFixed(0)}%`;
        progress.appendChild(bar);
        progress.appendChild(percentLabel);
        const contributeBox = document.createElement('div');
        contributeBox.className = 'savings-contribute';
        const inp = document.createElement('input');
        inp.type = 'number'; inp.min = '0'; inp.step = '0.01';
        inp.placeholder = 'Add amount';
        const btn = document.createElement('button');
        btn.textContent = 'Contribute';
        btn.addEventListener('click', () => {
            const val = parseFloat(inp.value);
            if (!isNaN(val) && val > 0) {
                contributeToSavings(s.id, val);
                inp.value = '';
            }
        });
        contributeBox.appendChild(inp);
        contributeBox.appendChild(btn);
        const actions = document.createElement('div');
        actions.className = 'savings-actions';
        const del = document.createElement('button');
        del.textContent = 'Delete';
        del.addEventListener('click', () => deleteSavings(s.id));
        actions.appendChild(del);
        li.appendChild(name);
        li.appendChild(amounts);
        li.appendChild(progress);
        li.appendChild(contributeBox);
        li.appendChild(actions);
        list.appendChild(li);
    });
}

// Export data to JSON file
function exportData() {
    // Create export object with all data
    const exportData = {
        expenses: expenses,
        balances: balances,
        exportDate: new Date().toISOString()
    };
    
    // Convert to JSON
    const dataStr = JSON.stringify(exportData, null, 2);
    
    // Create download link
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = 'expenses_' + new Date().toISOString().slice(0,10) + '.json';
    
    // Create link and trigger download
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    // Update last sync info
    updateLastSyncInfo('Exported: ' + new Date().toLocaleString());
}

// Import data from JSON file
function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const text = e.target.result;
            if (file.name.toLowerCase().endsWith('.csv') || (file.type && file.type.includes('csv'))) {
                const rows = text.split(/\r?\n/).filter(l => l.trim().length);
                if (rows.length < 2) throw new Error('CSV must have headers and data');
                const headers = rows[0].split(',').map(h => h.trim().toLowerCase());
                const idx = {
                    description: headers.indexOf('description'),
                    amount: headers.indexOf('amount'),
                    date: headers.indexOf('date'),
                    category: headers.indexOf('category'),
                    payer: headers.indexOf('payer')
                };
                if (Object.values(idx).some(v => v === -1)) {
                    alert('CSV headers must include description, amount, date, category, payer');
                    return;
                }
                let success = 0, failed = 0;
                for (let i = 1; i < rows.length; i++) {
                    const cols = rows[i].split(',').map(c => c.trim());
                    if (cols.length < headers.length) continue;
                    const payload = {
                        description: cols[idx.description],
                        amount: parseFloat(cols[idx.amount]),
                        date: cols[idx.date],
                        category: cols[idx.category],
                        payer: cols[idx.payer]
                    };
                    if (!payload.description || isNaN(payload.amount) || !payload.date || !payload.category || !payload.payer) {
                        failed++;
                        continue;
                    }
                    try {
                        const res = await apiFetch(`${API_BASE}/expenses`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                        });
                        if (res.ok) success++; else failed++;
                    } catch { failed++; }
                }
                await loadExpenses();
                renderExpenses();
                updateBalanceDisplay();
                updateCategoryTotals();
                updateDashboard();
                updateLastSyncInfo('Imported CSV: ' + new Date().toLocaleString());
                alert(`CSV import completed. Success: ${success}, Failed: ${failed}`);
            } else {
                const data = JSON.parse(text);
                if (!data.expenses || !data.balances) {
                    alert('Invalid data format. Import failed.');
                    return;
                }
                expenses = data.expenses;
                balances = data.balances;
                saveExpenses();
                saveBalances();
                renderExpenses();
                updateBalanceDisplay();
                updateCategoryTotals();
                updateDashboard();
                updateLastSyncInfo('Imported: ' + new Date().toLocaleString());
                alert('Data imported successfully!');
            }
        } catch (error) {
            console.error('Import error:', error);
            alert('Error importing data. Please check the file format.');
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

// Update last sync information
function updateLastSyncInfo(message) {
    if (lastSyncSpan) {
        lastSyncSpan.textContent = message;
        localStorage.setItem('lastSync', message);
    }
}