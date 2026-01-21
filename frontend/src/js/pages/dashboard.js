import { formatCurrency } from '/js/utils.js';
import { initPage, logout } from '/js/init.js';
import { showToast, createElement } from '/js/ui.js';

// Wait for Auth to be available
const waitForAuth = () => new Promise((resolve) => {
    if (window.Auth) resolve(window.Auth);
    else setTimeout(() => resolve(waitForAuth()), 10);
});
const Auth = await waitForAuth();

// Initialize page
initPage();

// State
let products = [];
let rates = [];
let procurement = [];
let batchSummary = [];
let selectedBatch = 'all';
const changedRates = {};

// Elements
const logoutBtn = document.getElementById('logoutBtn');
const printBtn = document.getElementById('printBtn');
const exportBtn = document.getElementById('exportBtn');
const saveRatesBtn = document.getElementById('saveRatesBtn');

// Event listeners
if (logoutBtn) logoutBtn.addEventListener('click', logout);
if (printBtn) printBtn.addEventListener('click', printList);
if (exportBtn) exportBtn.addEventListener('click', exportCSV);
if (saveRatesBtn) saveRatesBtn.addEventListener('click', saveAllRates);

// Batch filter event listeners
document.querySelectorAll('.batch-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.batch-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedBatch = btn.dataset.batch;
        displayProcurementList();
    });
});

async function loadDashboardStats() {
    try {
        const [ordersRes, customersRes, productsRes, ratesRes, procurementRes, batchSummaryRes] = await Promise.all([
            fetch('/api/orders', { credentials: 'include' }),
            fetch('/api/customers', { credentials: 'include' }),
            fetch('/api/products', { credentials: 'include' }),
            fetch('/api/market-rates', { credentials: 'include' }),
            fetch('/api/supplier/quantity-summary', { credentials: 'include' }),
            fetch('/api/supplier/batch-summary', { credentials: 'include' })
        ]);

        const orders = await ordersRes.json();
        const _customers = await customersRes.json();
        const productsData = await productsRes.json();
        const ratesData = await ratesRes.json();
        const procurementData = await procurementRes.json();
        const batchSummaryData = await batchSummaryRes.json();

        products = productsData.data || [];
        rates = ratesData.data || [];
        procurement = procurementData.data || [];
        batchSummary = batchSummaryData.data || [];

        // Calculate Total Sale (from delivered/completed orders)
        const ordersList = orders.data || [];
        const totalSale = ordersList
            .filter(o => o.status === 'delivered' || o.paymentStatus === 'paid')
            .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

        // Calculate Profit (estimate based on 15% margin)
        const profitMargin = 0.15;
        const totalProfit = totalSale * profitMargin;

        document.getElementById('totalSale').textContent = formatCurrency(totalSale);
        document.getElementById('totalProfit').textContent = formatCurrency(totalProfit);

        displayProcurementList();
        loadAnalytics(ordersList);
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
        document.getElementById('totalSale').textContent = '—';
        document.getElementById('totalProfit').textContent = '—';
        document.getElementById('procurementList').innerHTML = ''; // Clear
        document.getElementById('procurementList').appendChild(createElement('div', { className: 'empty-state' }, [
            createElement('p', {}, 'Data not available'),
            createElement('button', {
                id: 'retryBtn',
                className: 'btn-retry',
                style: { marginTop: '1rem', padding: '0.5rem 1rem', background: 'var(--dusty-olive)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' },
                onclick: loadDashboardStats
            }, 'Try Again')
        ]));
    }
}

function displayProcurementList() {
    const container = document.getElementById('procurementList');
    container.innerHTML = ''; // Clear container

    if (!products || products.length === 0) {
        container.appendChild(createElement('div', { className: 'empty-state' }, 'No products available'));
        return;
    }

    const rateMap = {};
    rates.forEach(rate => { rateMap[rate.product] = rate; });

    // Get procurement data based on selected batch
    let activeProcurement = procurement;
    if (selectedBatch !== 'all') {
        const batchData = batchSummary.find(b => b.batchType === selectedBatch);
        if (batchData && batchData.products) {
            // Convert batch products to same format as procurement
            activeProcurement = batchData.products.map(p => ({
                productName: p.productName,
                totalQuantity: p.totalQuantity,
                unit: p.unit,
                orderCount: p.orderCount
            }));
        } else {
            activeProcurement = [];
        }
    }

    const procurementMap = {};
    activeProcurement.forEach(item => { procurementMap[item.productName] = item; });

    // Filter to only Indian Vegetables and Fruits
    const filteredProducts = products.filter(p =>
        p.category === 'Indian Vegetables' || p.category === 'Fruits'
    );

    // Sort: Indian Vegetables first, then Fruits; within each, unsaved rates at top
    const sortedProducts = [...filteredProducts].sort((a, b) => {
        // Indian Vegetables before Fruits
        if (a.category === 'Indian Vegetables' && b.category === 'Fruits') return -1;
        if (a.category === 'Fruits' && b.category === 'Indian Vegetables') return 1;

        // Within same category: unsaved (rate=0) products first
        const rateA = rateMap[a._id]?.rate || 0;
        const rateB = rateMap[b._id]?.rate || 0;
        if (rateA === 0 && rateB !== 0) return -1;
        if (rateA !== 0 && rateB === 0) return 1;

        // Then sort by quantity needed (descending)
        const qtyA = procurementMap[a.name]?.totalQuantity || 0;
        const qtyB = procurementMap[b.name]?.totalQuantity || 0;
        return qtyB - qtyA;
    });

    const fragment = document.createDocumentFragment();

    // Build column header
    const columnHeader = createElement('div', { className: 'procurement-column-header' }, [
        createElement('span', { className: 'col-expand' }),
        createElement('span', { className: 'col-name' }, 'Product'),
        createElement('span', { className: 'col-qty' }, 'Purchase Qty'),
        createElement('span', { className: 'col-input' }, 'Purchase Price')
    ]);
    fragment.appendChild(columnHeader);

    // Build items with category dividers
    let currentCategory = '';
    sortedProducts.forEach(product => {
        const rate = rateMap[product._id];
        const currentRate = rate ? rate.rate : 0;
        const trend = rate ? rate.trend : 'stable';

        const procItem = procurementMap[product.name];
        const qtyNeeded = procItem ? procItem.totalQuantity : 0;
        const orderCount = procItem ? procItem.orderCount : 0;
        const estCost = qtyNeeded > 0 ? (qtyNeeded * currentRate) : 0;

        const qtyClass = qtyNeeded > 0 ? 'item-qty' : 'item-qty zero';
        const trendText = trend === 'up' ? '↑ Up' : trend === 'down' ? '↓ Down' : '— Stable';
        const unsavedClass = currentRate === 0 ? ' unsaved' : '';

        // Add category divider when category changes
        if (product.category !== currentCategory) {
            currentCategory = product.category;
            fragment.appendChild(createElement('div', { className: 'category-divider' }, currentCategory));
        }

        const procurementItem = createElement('div', {
            className: `procurement-item${unsavedClass}`,
            dataset: { productId: product._id }
        }, [
            createElement('div', {
                className: 'item-main',
                onclick: (e) => window.toggleExpand(e.currentTarget)
            }, [
                createElement('span', { className: 'item-expand' }, '▶'),
                createElement('span', { className: 'item-name' }, product.name),
                createElement('span', { className: qtyClass }, qtyNeeded),
                createElement('span', { className: 'item-unit' }, product.unit),
                createElement('input', {
                    type: 'number',
                    className: 'item-rate-input',
                    dataset: {
                        productId: product._id,
                        productName: product.name,
                        currentRate: currentRate
                    },
                    placeholder: `₹${currentRate.toFixed(0)}`,
                    step: '0.01',
                    min: '0',
                    onclick: (e) => e.stopPropagation(),
                    onchange: (e) => window.handleRateChange(e.target),
                    oninput: (e) => window.handleRateInput(e.target)
                })
            ]),
            createElement('div', { className: 'item-details' }, [
                createElement('div', { className: 'detail-row' }, [
                    createElement('span', { className: 'detail-label' }, 'Current Rate'),
                    createElement('span', { className: 'detail-value' }, `₹${currentRate.toFixed(2)}/${product.unit}`)
                ]),
                createElement('div', { className: 'detail-row' }, [
                    createElement('span', { className: 'detail-label' }, 'Orders'),
                    createElement('span', { className: 'detail-value' }, orderCount)
                ]),
                createElement('div', { className: 'detail-row' }, [
                    createElement('span', { className: 'detail-label' }, 'Est. Cost'),
                    createElement('span', { className: 'detail-value highlight' }, estCost > 0 ? formatCurrency(estCost) : '-')
                ]),
                createElement('div', { className: 'detail-row' }, [
                    createElement('span', { className: 'detail-label' }, 'Trend'),
                    createElement('span', { className: 'detail-value' }, trendText)
                ])
            ])
        ]);
        fragment.appendChild(procurementItem);
    });

    container.appendChild(fragment);
}

// Global functions for inline event handlers
window.toggleExpand = function (element) {
    element.closest('.procurement-item').classList.toggle('expanded');
};

window.handleRateInput = function (input) {
    const currentRate = parseFloat(input.dataset.currentRate);
    const newRate = parseFloat(input.value);
    input.classList.toggle('changed', input.value && newRate !== currentRate);
};

window.handleRateChange = function (input) {
    const productId = input.dataset.productId;
    const productName = input.dataset.productName;
    const currentRate = parseFloat(input.dataset.currentRate);
    const newRate = parseFloat(input.value);

    if (input.value && newRate !== currentRate && newRate > 0) {
        changedRates[productId] = { product: productId, productName, rate: newRate, previousRate: currentRate };
        input.classList.add('changed');
    } else {
        delete changedRates[productId];
        input.classList.remove('changed');
    }

    if (saveRatesBtn) saveRatesBtn.classList.toggle('show', Object.keys(changedRates).length > 0);
};

function printList() {
    const printContent = document.getElementById('procurementList').innerHTML;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>Purchase List - Pratibha Marketing</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h1 { font-size: 18px; margin-bottom: 10px; }
                .date { color: #666; margin-bottom: 20px; }
                .item { padding: 10px; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; }
                .item-name { font-weight: bold; }
                .item-qty { font-family: monospace; }
                .item-details, .item-expand, .item-rate-input, button { display: none !important; }
            </style>
        </head>
        <body>
            <h1>Purchase List - Pratibha Marketing</h1>
            <div class="date">${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
            ${printContent}
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
}

function exportCSV() {
    const rateMap = {};
    rates.forEach(rate => {
        const pid = typeof rate.product === 'object' ? rate.product._id : rate.product;
        rateMap[pid] = rate;
    });

    const procurementMap = {};
    procurement.forEach(item => { procurementMap[item.productName] = item; });

    // Filter and sort same as display
    const filteredProducts = products
        .filter(p => p.category === 'Indian Vegetables' || p.category === 'Fruits')
        .sort((a, b) => {
            // Indian Vegetables before Fruits
            if (a.category === 'Indian Vegetables' && b.category === 'Fruits') return -1;
            if (a.category === 'Fruits' && b.category === 'Indian Vegetables') return 1;
            // Within same category: unsaved (rate=0) first
            const rateA = rateMap[a._id]?.rate || 0;
            const rateB = rateMap[b._id]?.rate || 0;
            if (rateA === 0 && rateB !== 0) return -1;
            if (rateA !== 0 && rateB === 0) return 1;
            // Then by quantity needed
            const qtyA = procurementMap[a.name]?.totalQuantity || 0;
            const qtyB = procurementMap[b.name]?.totalQuantity || 0;
            return qtyB - qtyA;
        });

    const headers = ['Category', 'Product', 'Unit', 'Qty Needed', 'Current Rate', 'Est. Cost'];
    const rows = filteredProducts.map(product => {
        const procItem = procurementMap[product.name];
        const qtyNeeded = procItem?.totalQuantity || 0;
        const rate = rateMap[product._id];
        const currentRate = rate ? rate.rate : 0;
        const estCost = qtyNeeded * currentRate;

        return [
            `"${product.category}"`,
            `"${product.name}"`,
            product.unit,
            qtyNeeded,
            currentRate,
            estCost.toFixed(2)
        ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchase-list-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

async function saveAllRates() {
    if (!saveRatesBtn) return;
    saveRatesBtn.textContent = 'Saving...';
    saveRatesBtn.disabled = true;

    const failures = [];
    const successfulProducts = [];

    const headers = { 'Content-Type': 'application/json' };
    let csrfToken = await Auth.ensureCsrfToken();
    if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
    }

    for (const [productId, rateData] of Object.entries(changedRates)) {
        try {
            let response = await fetch('/api/market-rates', {
                method: 'POST',
                headers,
                credentials: 'include',
                body: JSON.stringify({ product: rateData.product, rate: rateData.rate, effectiveDate: new Date().toISOString() })
            });

            // Handle CSRF error with retry
            if (response.status === 403) {
                const errorData = await response.json().catch(() => ({}));
                if (errorData.message?.toLowerCase().includes('csrf')) {
                    csrfToken = await Auth.refreshCsrfToken();
                    if (csrfToken) {
                        headers['X-CSRF-Token'] = csrfToken;
                        response = await fetch('/api/market-rates', {
                            method: 'POST',
                            headers,
                            credentials: 'include',
                            body: JSON.stringify({ product: rateData.product, rate: rateData.rate, effectiveDate: new Date().toISOString() })
                        });
                    }
                } else {
                    failures.push({ productName: rateData.productName || productId, error: errorData.message || `HTTP ${response.status}` });
                    continue;
                }
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                failures.push({ productName: rateData.productName || productId, error: errorData.message || `HTTP ${response.status}` });
            } else {
                successfulProducts.push(productId);
            }
        } catch (error) {
            console.error('Error saving rate:', error);
            failures.push({ productName: rateData.productName || productId, error: error.message || 'Network error' });
        }
    }

    // Only clear successful rates from changedRates
    for (const productId of successfulProducts) {
        delete changedRates[productId];
    }

    saveRatesBtn.textContent = 'Save';
    saveRatesBtn.disabled = false;

    if (failures.length > 0) {
        const _failedNames = failures.map(f => f.productName).join(', ');
        showToast(`${failures.length} rate(s) not saved. Try again.`, 'info');
        if (Object.keys(changedRates).length > 0) {
            saveRatesBtn.classList.add('show');
        } else {
            saveRatesBtn.classList.remove('show');
        }
    } else {
        saveRatesBtn.classList.remove('show');
        document.querySelectorAll('.item-rate-input').forEach(input => {
            input.value = '';
            input.classList.remove('changed');
        });
    }

    loadDashboardStats();
}

async function checkAPIHealth() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();

        if (data.status === 'ok') {
            document.getElementById('apiDot').classList.remove('offline');
            document.getElementById('apiStatus').textContent = 'API Online';
        } else {
            document.getElementById('apiDot').classList.add('offline');
            document.getElementById('apiStatus').textContent = 'API Offline';
        }
    } catch (_error) {
        document.getElementById('apiDot').classList.add('offline');
        document.getElementById('apiStatus').textContent = 'API Offline';
    }
}

// Analytics Charts
let orderStatusChart = null;
let revenueChart = null;
let topProductsChart = null;

const chartColors = {
    olive: 'rgb(126, 145, 129)',
    oliveLight: 'rgba(126, 145, 129, 0.2)',
    gunmetal: 'rgb(46, 53, 50)',
    terracotta: 'rgb(196, 167, 125)',
    success: 'rgb(93, 122, 95)',
    warning: 'rgb(184, 154, 90)',
    error: 'rgb(154, 101, 101)',
    slate: 'rgb(199, 206, 219)'
};

async function loadAnalytics(ordersList) {
    try {
        // Order Status Distribution (simplified: pending, confirmed, delivered, cancelled)
        const statusCounts = {
            pending: 0, confirmed: 0, delivered: 0, cancelled: 0
        };

        ordersList.forEach(order => {
            if (Object.hasOwn(statusCounts, order.status)) {
                statusCounts[order.status]++;
            }
        });

        // Update summary counts
        document.getElementById('pendingCount').textContent = statusCounts.pending;
        document.getElementById('processingCount').textContent = statusCounts.confirmed;
        document.getElementById('deliveredCount').textContent = statusCounts.delivered;

        // Order Status Doughnut Chart
        const statusCtx = document.getElementById('orderStatusChart');
        if (orderStatusChart) orderStatusChart.destroy();

        orderStatusChart = new Chart(statusCtx, {
            type: 'doughnut',
            data: {
                labels: ['Pending', 'Confirmed', 'Delivered', 'Cancelled'],
                datasets: [{
                    data: [
                        statusCounts.pending, statusCounts.confirmed,
                        statusCounts.delivered, statusCounts.cancelled
                    ],
                    backgroundColor: [
                        chartColors.warning, chartColors.olive,
                        chartColors.success, chartColors.error
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: { legend: { display: false } }
            }
        });

        // Revenue Trend (Last 7 Days)
        const last7Days = [];
        const revenueByDay = {};

        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            last7Days.push(dateStr);
            revenueByDay[dateStr] = 0;
        }

        ordersList.forEach(order => {
            if (order.status !== 'cancelled') {
                const orderDate = new Date(order.createdAt).toISOString().split('T')[0];
                if (Object.hasOwn(revenueByDay, orderDate)) {
                    revenueByDay[orderDate] += order.totalAmount || 0;
                }
            }
        });

        const revenueData = last7Days.map(date => revenueByDay[date]);
        const weekTotal = revenueData.reduce((sum, val) => sum + val, 0);
        const avgDaily = weekTotal / 7;

        document.getElementById('weekTotal').textContent = formatCurrency(weekTotal);
        document.getElementById('avgDaily').textContent = formatCurrency(Math.round(avgDaily));

        const revenueCtx = document.getElementById('revenueChart');
        if (revenueChart) revenueChart.destroy();

        revenueChart = new Chart(revenueCtx, {
            type: 'line',
            data: {
                labels: last7Days.map(d => {
                    const date = new Date(d);
                    return date.toLocaleDateString('en-IN', { weekday: 'short' });
                }),
                datasets: [{
                    label: 'Revenue',
                    data: revenueData,
                    borderColor: chartColors.olive,
                    backgroundColor: chartColors.oliveLight,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: chartColors.olive
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: value => '₹' + value.toLocaleString('en-IN') }
                    }
                }
            }
        });

        // Top Products by Quantity
        const productQuantities = {};
        ordersList.forEach(order => {
            if (order.status !== 'cancelled' && order.products) {
                order.products.forEach(item => {
                    const name = item.productName || 'Unknown';
                    productQuantities[name] = (productQuantities[name] || 0) + (item.quantity || 0);
                });
            }
        });

        const sortedProducts = Object.entries(productQuantities)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const topProductsCtx = document.getElementById('topProductsChart');
        if (topProductsChart) topProductsChart.destroy();

        topProductsChart = new Chart(topProductsCtx, {
            type: 'bar',
            data: {
                labels: sortedProducts.map(([name]) => name.length > 12 ? name.slice(0, 12) + '...' : name),
                datasets: [{
                    label: 'Quantity',
                    data: sortedProducts.map(([, qty]) => qty),
                    backgroundColor: [
                        chartColors.olive, chartColors.terracotta, chartColors.gunmetal,
                        chartColors.success, chartColors.warning
                    ],
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true } }
            }
        });

    } catch (error) {
        console.error('Error loading analytics:', error);
    }
}

// ====================
// LEDGER REPORT
// ====================
let ledgerCustomers = [];

async function loadLedgerCustomers() {
    try {
        const res = await fetch('/api/customers', { credentials: 'include' });
        const data = await res.json();
        if (res.ok) {
            ledgerCustomers = data.data || [];
            const select = document.getElementById('ledgerCustomer');
            select.innerHTML = '';
            select.appendChild(createElement('option', { value: '' }, 'All Customers'));
            ledgerCustomers.forEach(c => {
                select.appendChild(createElement('option', { value: c._id }, c.name));
            });
        }
    } catch (e) {
        console.error('Error loading customers:', e);
    }
}

window.openLedgerModal = function () {
    // Load customers if not loaded
    if (ledgerCustomers.length === 0) {
        loadLedgerCustomers();
    }
    // Set default dates (current month)
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    document.getElementById('ledgerFromDate').value = firstDay.toISOString().split('T')[0];
    document.getElementById('ledgerToDate').value = now.toISOString().split('T')[0];

    document.getElementById('ledgerModal').classList.add('show');
    document.body.style.overflow = 'hidden';
};

window.closeLedgerModal = function () {
    document.getElementById('ledgerModal').classList.remove('show');
    document.body.style.overflow = '';
};

window.downloadLedger = async function () {
    const customerId = document.getElementById('ledgerCustomer').value;
    const fromDate = document.getElementById('ledgerFromDate').value;
    const toDate = document.getElementById('ledgerToDate').value;

    // Build query params
    const params = new URLSearchParams();
    if (customerId) params.append('customerId', customerId);
    if (fromDate) params.append('fromDate', fromDate);
    if (toDate) params.append('toDate', toDate);

    try {
        showToast('Downloading ledger...', 'info');

        const res = await fetch(`/api/reports/ledger?${params}`, {
            credentials: 'include'
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.message || 'Ledger temporarily unavailable');
        }

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);

        // Get filename from header or generate
        const disposition = res.headers.get('Content-Disposition');
        let filename = 'ledger.xlsx';
        if (disposition && disposition.includes('filename=')) {
            filename = disposition.split('filename=')[1].replace(/"/g, '');
        }

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        showToast('Ledger downloaded!', 'success');
        window.closeLedgerModal();
    } catch (e) {
        console.error('Download ledger error:', e);
        showToast(e.message || 'Could not download', 'info');
    }
};

// ========================
// BATCH MANAGEMENT
// ========================
async function loadBatches() {
    try {
        const res = await fetch('/api/batches/today', { credentials: 'include' });
        const data = await res.json();

        if (!res.ok) {
            const batchCards = document.getElementById('batchCards');
            batchCards.innerHTML = '';
            batchCards.appendChild(createElement('div', { className: 'empty-state' }, 'Could not load batches'));
            return;
        }

        // Update current batch info
        const batchInfo = document.getElementById('batchInfo');
        batchInfo.innerHTML = '';
        batchInfo.appendChild(createElement('span', { className: 'badge badge-info' }, `Currently accepting: ${data.currentBatch}`));

        // Update time display - use Asia/Kolkata timezone for proper IST
        const currentTime = new Date(data.currentTime);
        document.getElementById('batchCurrentTime').textContent =
            currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST';

        const batches = data.data || [];

        if (batches.length === 0) {
            const batchCards = document.getElementById('batchCards');
            batchCards.innerHTML = '';
            batchCards.appendChild(createElement('div', { className: 'empty-state' }, 'No batches for today yet'));
            return;
        }

        document.getElementById('batchCards').innerHTML = '';
        const fragment = document.createDocumentFragment();

        batches.forEach(batch => {
            const isOpen = batch.status === 'open';
            const isConfirmed = batch.status === 'confirmed';
            const statusClass = isConfirmed ? 'confirmed' : (isOpen ? 'open' : 'expired');
            const statusText = isConfirmed ? '🔒 Confirmed' : (isOpen ? '📝 Open' : '⏰ Expired');
            const showConfirmBtn = batch.batchType === '2nd' && isOpen;

            const cardBodyDetails = [
                createElement('div', { className: 'batch-stat' }, [
                    createElement('span', { className: 'batch-stat-value' }, batch.totalOrders || 0),
                    createElement('span', { className: 'batch-stat-label' }, 'Orders')
                ])
            ];

            if (isConfirmed && batch.confirmedAt) {
                const confirmedText = [
                    `Confirmed at ${new Date(batch.confirmedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}`
                ];
                if (batch.confirmedBy?.name) {
                    confirmedText.push(` by ${batch.confirmedBy.name}`);
                }
                cardBodyDetails.push(createElement('div', { className: 'batch-confirmed-info' }, confirmedText));
            }

            const cardChildren = [
                createElement('div', { className: 'batch-card-header' }, [
                    createElement('span', { className: 'batch-type' }, `${batch.batchType} Batch`),
                    createElement('span', { className: 'batch-status' }, statusText)
                ]),
                createElement('div', { className: 'batch-card-body' }, cardBodyDetails)
            ];

            if (showConfirmBtn) {
                cardChildren.push(createElement('div', { className: 'batch-card-actions' }, [
                    createElement('button', {
                        className: 'btn-confirm-batch',
                        onclick: () => confirmBatch(batch._id)
                    }, 'Confirm Batch')
                ]));
            }

            fragment.appendChild(createElement('div', { className: `batch-card ${statusClass}` }, cardChildren));
        });

        document.getElementById('batchCards').appendChild(fragment);
    } catch (error) {
        console.error('Error loading batches:', error);
        const batchCards = document.getElementById('batchCards');
        batchCards.innerHTML = '';
        batchCards.appendChild(createElement('div', { className: 'empty-state' }, 'Could not load batches'));
    }
}

async function confirmBatch(batchId) {
    if (!confirm('Are you sure you want to confirm this batch? Orders will be locked and customers will not be able to edit them.')) {
        return;
    }

    try {
        const csrfToken = await Auth.ensureCsrfToken();
        const headers = { 'Content-Type': 'application/json' };
        if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

        const res = await fetch(`/api/batches/${batchId}/confirm`, {
            method: 'POST',
            credentials: 'include',
            headers
        });

        const data = await res.json();

        if (!res.ok) {
            showToast(data.message || 'Could not confirm batch', 'error');
            return;
        }

        showToast(data.message || 'Batch confirmed successfully', 'success');
        loadBatches(); // Refresh the batch display
    } catch (error) {
        console.error('Error confirming batch:', error);
        showToast('Could not confirm batch', 'error');
    }
}

// Make confirmBatch available globally
window.confirmBatch = confirmBatch;

async function init() {
    const user = await Auth.requireAuth(['admin', 'staff']);
    if (!user) return;

    document.getElementById('userBadge').textContent = user.name || user.email || 'User';
    loadDashboardStats();
    loadBatches();
    checkAPIHealth();
}

init();
