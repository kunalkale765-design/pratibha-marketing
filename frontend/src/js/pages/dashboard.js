import { formatCurrency } from '/js/utils.js';
import { initPage } from '/js/init.js';
import { showToast, createElement } from '/js/ui.js';
import { waitForAuth } from '/js/helpers/auth-wait.js';

// Import helpers
import { printList, exportCSV } from '/js/helpers/dashboard-export.js';
import { openLedgerModal, closeLedgerModal, downloadLedger } from '/js/helpers/dashboard-ledger.js';
import { loadAnalytics } from '/js/helpers/dashboard-analytics.js';
import { initSound, playNotificationSound, cleanupSound } from '/js/helpers/notification-sound.js';

let Auth;
try {
    Auth = await waitForAuth();
} catch (e) {
    console.error('Auth initialization failed:', e);
    window.location.href = '/pages/auth/login.html';
}

initPage();

// State
let rates = [];
let procurementData = { toProcure: [], procured: [], categories: [] };
let searchQuery = '';
let selectedCategory = '';
const changedRates = {};
let lastQuantities = {};
let pollingInterval = null;
let badgeHideTimeout = null;

let isPolling = false;

window.addEventListener('beforeunload', () => {
    if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
    cleanupSound();
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
    } else {
        if (!pollingInterval) startPolling();
    }
});

// Elements
const printBtn = document.getElementById('printBtn');
const exportBtn = document.getElementById('exportBtn');
const saveRatesBtn = document.getElementById('saveRatesBtn');
const purchaseSearch = document.getElementById('purchaseSearch');
const newOrderBadge = document.getElementById('newOrderBadge');
const procuredHeader = document.getElementById('procuredHeader');

// Event listeners (delegate to helpers with current state)
if (printBtn) printBtn.addEventListener('click', () => printList(procurementData, searchQuery, selectedCategory));
if (exportBtn) exportBtn.addEventListener('click', () => exportCSV(procurementData));
if (saveRatesBtn) saveRatesBtn.addEventListener('click', saveAllRates);

if (purchaseSearch) {
    purchaseSearch.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim().toLowerCase();
        displayProcurementList();
    });
}

const categoryPillsContainer = document.getElementById('categoryPills');
if (categoryPillsContainer) {
    categoryPillsContainer.addEventListener('click', (e) => {
        const pill = e.target.closest('.category-pill');
        if (!pill) return;
        document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        selectedCategory = pill.dataset.category;
        displayProcurementList();
    });
}

function populateCategoryPills(categories) {
    const container = document.getElementById('categoryPills');
    if (!container) return;
    container.innerHTML = '<button class="category-pill active" data-category="">All</button>';

    const displayNames = {
        'Indian Vegetables': 'Vegetables', 'Exotic Vegetables': 'Exotic',
        'Fruits': 'Fruits', 'Frozen': 'Frozen', 'Dairy': 'Dairy'
    };

    categories.forEach(cat => {
        const pill = createElement('button', {
            className: 'category-pill' + (selectedCategory === cat ? ' active' : ''),
            dataset: { category: cat }
        }, displayNames[cat] || cat);
        container.appendChild(pill);
    });

    if (selectedCategory) {
        const currentPill = container.querySelector(`[data-category="${selectedCategory}"]`);
        if (currentPill) {
            container.querySelector('.active')?.classList.remove('active');
            currentPill.classList.add('active');
        } else {
            selectedCategory = '';
        }
    }
}

if (procuredHeader) {
    procuredHeader.addEventListener('click', () => procuredHeader.classList.toggle('collapsed'));
}

document.addEventListener('click', initSound, { once: true });
document.addEventListener('touchstart', initSound, { once: true });

function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timeout));
}

async function loadDashboardStats() {
    try {
        const [ordersRes, productsRes, ratesRes, procurementRes] = await Promise.all([
            fetchWithTimeout('/api/orders', { credentials: 'include' }),
            fetchWithTimeout('/api/products', { credentials: 'include' }),
            fetchWithTimeout('/api/market-rates', { credentials: 'include' }),
            fetchWithTimeout('/api/supplier/procurement-summary', { credentials: 'include' })
        ]);

        const allResponses = [ordersRes, productsRes, ratesRes, procurementRes];
        if (allResponses.some(r => r.status === 401)) {
            window.location.href = '/pages/auth/login.html';
            return;
        }

        if (!ordersRes.ok || !productsRes.ok || !ratesRes.ok || !procurementRes.ok) {
            const statuses = { orders: ordersRes.status, products: productsRes.status, rates: ratesRes.status, procurement: procurementRes.status };
            console.error('Dashboard API failures:', statuses);
            const failedEndpoint = !ordersRes.ok ? 'orders' : !productsRes.ok ? 'products' : !ratesRes.ok ? 'rates' : 'procurement';
            throw new Error(`Failed to load ${failedEndpoint} data (status: ${statuses[failedEndpoint]})`);
        }

        const orders = await ordersRes.json();
        const ratesData = await ratesRes.json();
        const procurementResponse = await procurementRes.json();

        rates = ratesData.data || [];
        procurementData = {
            toProcure: procurementResponse.toProcure || [],
            procured: procurementResponse.procured || [],
            categories: procurementResponse.categories || []
        };

        populateCategoryPills(procurementData.categories);
        detectNewOrders(procurementData);
        storeQuantities(procurementData);

        const ordersList = orders.data || [];
        const totalSale = ordersList
            .filter(o => o.status === 'delivered' || o.paymentStatus === 'paid')
            .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        const profitMargin = 0.15;
        const totalProfit = totalSale * profitMargin;

        const saleEl = document.getElementById('totalSale');
        const profitEl = document.getElementById('totalProfit');
        if (saleEl) saleEl.textContent = formatCurrency(totalSale);
        if (profitEl) profitEl.textContent = formatCurrency(totalProfit);

        displayProcurementList();
        loadAnalytics(ordersList);
        startPolling();
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
        const saleEl = document.getElementById('totalSale');
        const profitEl = document.getElementById('totalProfit');
        const toProcureEl = document.getElementById('toProcureList');
        if (saleEl) saleEl.textContent = '—';
        if (profitEl) profitEl.textContent = '—';
        if (toProcureEl) {
            toProcureEl.innerHTML = '';
            toProcureEl.appendChild(createElement('div', { className: 'empty-state' }, [
                createElement('p', {}, 'Data not available'),
                createElement('button', {
                    id: 'retryBtn', className: 'btn-retry',
                    style: { marginTop: '1rem', padding: '0.5rem 1rem', background: 'var(--dusty-olive)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' },
                    onclick: loadDashboardStats
                }, 'Try Again')
            ]));
        }
    }
}

function storeQuantities(data) {
    lastQuantities = {};
    const toProcure = (data && data.toProcure) || [];
    const procured = (data && data.procured) || [];
    [...toProcure, ...procured].forEach(item => {
        if (item && item.productId != null) lastQuantities[item.productId] = item.totalQty;
    });
}

function detectNewOrders(newData) {
    if (Object.keys(lastQuantities).length === 0) return;

    let newOrderCount = 0;
    const allItems = [...((newData && newData.toProcure) || []), ...((newData && newData.procured) || [])];

    allItems.forEach(item => {
        const prevQty = lastQuantities[item.productId] || 0;
        if (item.totalQty > prevQty) newOrderCount++;
    });

    if (newOrderCount > 0) {
        playNotificationSound();

        if (newOrderBadge) {
            newOrderBadge.textContent = `${newOrderCount} new`;
            newOrderBadge.classList.remove('hidden');
            if (badgeHideTimeout) clearTimeout(badgeHideTimeout);
            badgeHideTimeout = setTimeout(() => {
                if (newOrderBadge) newOrderBadge.classList.add('hidden');
                badgeHideTimeout = null;
            }, 30000);
        }

        showToast(`${newOrderCount} product(s) have new orders!`, 'info');
    }
}

function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);

    pollingInterval = setInterval(async () => {
        if (isPolling) return;
        isPolling = true;

        try {
            if (!document.getElementById('toProcureList')) {
                clearInterval(pollingInterval);
                pollingInterval = null;
                return;
            }

            const res = await fetch('/api/supplier/procurement-summary', { credentials: 'include' });
            if (res.status === 401) {
                clearInterval(pollingInterval);
                pollingInterval = null;
                window.location.href = '/pages/auth/login.html';
                return;
            }
            if (!res.ok) { console.warn('Polling failed:', res.status); return; }
            const data = await res.json();

            if (res.ok) {
                const newProcurementData = {
                    toProcure: data.toProcure || [],
                    procured: data.procured || [],
                    categories: data.categories || []
                };
                detectNewOrders(newProcurementData);
                procurementData = newProcurementData;
                storeQuantities(procurementData);
                displayProcurementList(true);
            }
        } catch (error) {
            console.error('Polling error:', error);
        } finally {
            isPolling = false;
        }
    }, 30000);
}

function displayProcurementList(preserveInputs = false) {
    const toProcureContainer = document.getElementById('toProcureList');
    const procuredContainer = document.getElementById('procuredList');
    const emptyState = document.getElementById('procurementEmpty');
    const procuredCountEl = document.getElementById('procuredCount');

    if (!toProcureContainer || !procuredContainer) {
        console.error('Purchase List: Required DOM elements missing (toProcureList or procuredList). Check index.html structure.');
        const fallback = document.querySelector('.procurement-container');
        if (fallback) {
            const existing = fallback.querySelector('.procurement-error');
            if (!existing) {
                const errDiv = document.createElement('div');
                errDiv.className = 'procurement-error';
                errDiv.style.cssText = 'padding:1.5rem;text-align:center;color:var(--error);font-size:0.875rem;';
                errDiv.textContent = 'Purchase list failed to load. Please refresh the page.';
                fallback.appendChild(errDiv);
            }
        }
        return;
    }

    const inputValues = {};
    if (preserveInputs) {
        document.querySelectorAll('.item-rate-input').forEach(input => {
            if (input.value) inputValues[input.dataset.productId] = input.value;
        });
    }

    toProcureContainer.innerHTML = '';
    procuredContainer.innerHTML = '';

    const filterItems = (items) => {
        return items.filter(item => {
            const matchesSearch = !searchQuery || item.productName.toLowerCase().includes(searchQuery);
            const matchesCategory = !selectedCategory || item.category === selectedCategory;
            return matchesSearch && matchesCategory;
        });
    };

    const filteredToProcure = filterItems(procurementData.toProcure);
    const filteredProcured = filterItems(procurementData.procured);

    if (procuredCountEl) procuredCountEl.textContent = filteredProcured.length;

    if (filteredToProcure.length === 0 && procurementData.toProcure.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        toProcureContainer.innerHTML = '<div class="empty-list-msg">No items to procure</div>';
    } else {
        if (emptyState) emptyState.classList.add('hidden');
    }

    const rateMap = {};
    rates.forEach(rate => { rateMap[rate.product] = rate; });

    if (filteredToProcure.length > 0) {
        const fragment = document.createDocumentFragment();

        fragment.appendChild(createElement('div', { className: 'procurement-column-header' }, [
            createElement('span', { className: 'col-expand' }),
            createElement('span', { className: 'col-name' }, 'Product'),
            createElement('span', { className: 'col-qty' }, 'Qty'),
            createElement('span', { className: 'col-input' }, 'Rate')
        ]));

        let currentCategory = '';
        filteredToProcure.forEach(item => {
            if (item.category !== currentCategory) {
                currentCategory = item.category;
                fragment.appendChild(createElement('div', { className: 'category-divider' }, currentCategory));
            }

            const rate = rateMap[item.productId];
            const currentRate = item.currentRate || rate?.rate || 0;
            const savedValue = inputValues[item.productId] || '';
            const unsavedClass = currentRate === 0 ? ' unsaved' : '';

            let qtyDisplay;
            if (item.wasProcured) {
                qtyDisplay = createElement('span', { className: 'qty-breakdown' }, [
                    createElement('span', { className: 'procured-qty' }, String(item.procuredQty || 0)),
                    createElement('span', { className: 'separator' }, '+'),
                    createElement('span', { className: 'new-qty highlight-new' }, String(item.newQty || 0))
                ]);
            } else {
                qtyDisplay = createElement('span', { className: 'qty-simple' }, String(item.totalQty || 0));
            }

            const detailRows = [
                createElement('div', { className: 'detail-row' }, [
                    createElement('span', { className: 'detail-label' }, 'Total Orders'),
                    createElement('span', { className: 'detail-value' }, item.totalOrders || 0)
                ])
            ];

            if (item.wasProcured && item.lastRate) {
                detailRows.unshift(createElement('div', { className: 'detail-row highlight-info' }, [
                    createElement('span', { className: 'detail-label' }, 'Last Rate'),
                    createElement('span', { className: 'detail-value' }, `₹${item.lastRate}/${item.unit}`)
                ]));
            }

            detailRows.push(
                createElement('div', { className: 'detail-row' }, [
                    createElement('span', { className: 'detail-label' }, 'Est. Cost'),
                    createElement('span', { className: 'detail-value highlight' },
                        item.totalQty > 0 && currentRate > 0 ? formatCurrency(item.totalQty * currentRate) : '—')
                ]),
                createElement('div', { className: 'detail-row' }, [
                    createElement('span', { className: 'detail-label' }, 'Trend'),
                    createElement('span', { className: 'detail-value' },
                        item.trend === 'up' ? '↑ Up' : item.trend === 'down' ? '↓ Down' : '— Stable')
                ])
            );

            const procurementItem = createElement('div', {
                className: `procurement-item${unsavedClass}${item.wasProcured ? ' was-procured' : ''}`,
                dataset: { productId: item.productId }
            }, [
                createElement('div', {
                    className: 'item-main',
                    onclick: (e) => window.toggleExpand(e.currentTarget)
                }, [
                    createElement('span', { className: 'item-expand' }, '▶'),
                    createElement('span', { className: 'item-name' }, item.productName),
                    qtyDisplay,
                    createElement('span', { className: 'item-unit' }, item.unit),
                    createElement('input', {
                        type: 'number',
                        className: 'item-rate-input' + (savedValue ? ' changed' : ''),
                        dataset: {
                            productId: item.productId, productName: item.productName,
                            currentRate: currentRate, quantity: item.totalQty || 0,
                            notProcuredToday: item.rate === undefined ? 'true' : ''
                        },
                        placeholder: '₹0', value: savedValue, step: '0.01', min: '0',
                        onclick: (e) => e.stopPropagation(),
                        onchange: (e) => window.handleRateChange(e.target),
                        oninput: (e) => window.handleRateInput(e.target)
                    })
                ]),
                createElement('div', { className: 'item-details' }, detailRows)
            ]);
            fragment.appendChild(procurementItem);
        });

        toProcureContainer.appendChild(fragment);
    } else if (searchQuery || selectedCategory) {
        toProcureContainer.innerHTML = '<div class="empty-list-msg">No matching items</div>';
    }

    if (filteredProcured.length > 0) {
        const fragment = document.createDocumentFragment();
        let currentCategory = '';
        filteredProcured.forEach(item => {
            if (item.category !== currentCategory) {
                currentCategory = item.category;
                fragment.appendChild(createElement('div', { className: 'category-divider' }, currentCategory));
            }

            const procurementItem = createElement('div', {
                className: 'procurement-item procured-item',
                dataset: { productId: item.productId }
            }, [
                createElement('div', {
                    className: 'item-main',
                    onclick: (e) => window.toggleExpand(e.currentTarget)
                }, [
                    createElement('span', { className: 'item-expand' }, '▶'),
                    createElement('span', { className: 'item-name' }, '✓ ' + item.productName),
                    createElement('span', { className: 'qty-simple' }, String(item.procuredQty || 0)),
                    createElement('span', { className: 'item-unit' }, item.unit),
                    createElement('span', { className: 'procured-rate' }, `₹${item.rate}`)
                ]),
                createElement('div', { className: 'item-details' }, [
                    createElement('div', { className: 'detail-row' }, [
                        createElement('span', { className: 'detail-label' }, 'Procured At'),
                        createElement('span', { className: 'detail-value' },
                            new Date(item.procuredAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }))
                    ]),
                    createElement('div', { className: 'detail-row' }, [
                        createElement('span', { className: 'detail-label' }, 'Total Orders'),
                        createElement('span', { className: 'detail-value' }, item.totalOrders || 0)
                    ]),
                    createElement('div', { className: 'detail-row' }, [
                        createElement('span', { className: 'detail-label' }, 'Total Value'),
                        createElement('span', { className: 'detail-value highlight' }, formatCurrency(item.procuredQty * item.rate))
                    ]),
                    createElement('div', { className: 'detail-actions' }, [
                        createElement('button', {
                            className: 'btn-undo',
                            onclick: (e) => { e.stopPropagation(); window.undoProcurement(item.productId, item.productName); }
                        }, 'Undo')
                    ])
                ])
            ]);
            fragment.appendChild(procurementItem);
        });
        procuredContainer.appendChild(fragment);
    }
}

window.toggleExpand = function (element) {
    element.closest('.procurement-item').classList.toggle('expanded');
};

window.handleRateInput = function (input) {
    const currentRate = parseFloat(input.dataset.currentRate);
    const newRate = parseFloat(input.value);
    const notProcuredToday = input.dataset.notProcuredToday === 'true';
    input.classList.toggle('changed', input.value && (newRate !== currentRate || notProcuredToday));
};

window.handleRateChange = function (input) {
    const productId = input.dataset.productId;
    const productName = input.dataset.productName;
    const currentRate = parseFloat(input.dataset.currentRate);
    const quantity = parseFloat(input.dataset.quantity) || 0;
    const newRate = parseFloat(input.value);

    const notProcuredToday = input.dataset.notProcuredToday === 'true';
    if (input.value && (newRate !== currentRate || notProcuredToday) && newRate > 0) {
        changedRates[productId] = { product: productId, productName, rate: newRate, previousRate: currentRate, quantity };
        input.classList.add('changed');
    } else {
        delete changedRates[productId];
        input.classList.remove('changed');
    }

    if (saveRatesBtn) saveRatesBtn.classList.toggle('show', Object.keys(changedRates).length > 0);
};

window.undoProcurement = async function (productId, productName) {
    if (!confirm(`Remove ${productName} from procured list?`)) return;

    const undoBtn = document.querySelector(`[onclick*="undoProcurement('${productId}'"]`) ||
                    document.querySelector(`[data-product-id="${productId}"] .undo-btn`);
    if (undoBtn) { undoBtn.disabled = true; undoBtn.classList.add('btn-loading'); }

    try {
        const csrfToken = await Auth.ensureCsrfToken();
        const headers = { 'Content-Type': 'application/json' };
        if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

        const res = await fetch(`/api/supplier/procure/${productId}`, {
            method: 'DELETE', credentials: 'include', headers
        });

        if (!res.ok) {
            const data = await res.json();
            showToast(data.message || 'Could not undo', 'error');
            return;
        }

        showToast(`${productName} moved back to TO PROCURE`, 'success');
        loadDashboardStats();
    } catch (error) {
        console.error('Error undoing procurement:', error);
        showToast('Could not undo', 'error');
        if (undoBtn) { undoBtn.disabled = false; undoBtn.classList.remove('btn-loading'); }
    }
};

async function saveAllRates() {
    if (!saveRatesBtn) return;
    saveRatesBtn.textContent = 'Saving...';
    saveRatesBtn.disabled = true;

    const failures = [];
    const successfulProducts = [];

    const headers = { 'Content-Type': 'application/json' };
    let csrfToken = await Auth.ensureCsrfToken();
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

    const entries = Object.entries(changedRates);
    const BATCH_SIZE = 5;

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);

        const results = await Promise.all(batch.map(async ([productId, rateData]) => {
            try {
                let response = await fetch('/api/supplier/procure', {
                    method: 'POST', headers, credentials: 'include',
                    body: JSON.stringify({ productId: rateData.product, rate: rateData.rate, quantity: rateData.quantity || 0 })
                });

                if (response.status === 403) {
                    const errorData = await response.json().catch(() => ({}));
                    if (errorData.message?.toLowerCase().includes('csrf')) {
                        csrfToken = await Auth.refreshCsrfToken();
                        if (csrfToken) {
                            headers['X-CSRF-Token'] = csrfToken;
                            response = await fetch('/api/supplier/procure', {
                                method: 'POST', headers, credentials: 'include',
                                body: JSON.stringify({ productId: rateData.product, rate: rateData.rate, quantity: rateData.quantity || 0 })
                            });
                        }
                    } else {
                        return { productId, success: false, productName: rateData.productName || productId, error: errorData.message || `HTTP ${response.status}` };
                    }
                }

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    return { productId, success: false, productName: rateData.productName || productId, error: errorData.message || `HTTP ${response.status}` };
                } else {
                    return { productId, success: true };
                }
            } catch (error) {
                console.error('Error saving rate:', error);
                return { productId, success: false, productName: rateData.productName || productId, error: error.message || 'Network error' };
            }
        }));

        results.forEach(result => {
            if (result.success) successfulProducts.push(result.productId);
            else failures.push({ productName: result.productName, error: result.error });
        });
    }

    for (const productId of successfulProducts) delete changedRates[productId];

    saveRatesBtn.textContent = 'Save';
    saveRatesBtn.disabled = false;

    if (failures.length > 0) {
        showToast(`${failures.length} rate(s) not saved. Try again.`, 'info');
        if (Object.keys(changedRates).length > 0) saveRatesBtn.classList.add('show');
        else saveRatesBtn.classList.remove('show');
    } else {
        saveRatesBtn.classList.remove('show');
        document.querySelectorAll('.item-rate-input').forEach(input => {
            input.value = '';
            input.classList.remove('changed');
        });
        showToast('Items marked as procured!', 'success');
    }

    loadDashboardStats();
}

async function checkAPIHealth() {
    const apiDot = document.getElementById('apiDot');
    const apiStatus = document.getElementById('apiStatus');
    if (!apiDot || !apiStatus) return;

    try {
        const response = await fetch('/api/health');
        const data = await response.json();
        if (data.status === 'ok') {
            apiDot.classList.remove('offline');
            apiStatus.textContent = 'API Online';
        } else {
            apiDot.classList.add('offline');
            apiStatus.textContent = 'API Offline';
        }
    } catch (_error) {
        apiDot.classList.add('offline');
        apiStatus.textContent = 'API Offline';
    }
}

// Expose ledger helpers to window
window.openLedgerModal = openLedgerModal;
window.closeLedgerModal = closeLedgerModal;
window.downloadLedger = downloadLedger;

async function init() {
    const user = await Auth.requireAuth(['admin', 'staff']);
    if (!user) return;

    if (user.role === 'staff') {
        window.location.href = '/pages/staff-dashboard/';
        return;
    }

    const userBadge = document.getElementById('userBadge');
    if (userBadge) {
        userBadge.textContent = user.name || user.email || 'User';
        if (user.role === 'admin') {
            userBadge.style.cursor = 'pointer';
            userBadge.title = 'Manage Users';
            userBadge.onclick = () => { window.location.href = '/pages/users/'; };
        }
    }
    loadDashboardStats();
    checkAPIHealth();
}

init();
