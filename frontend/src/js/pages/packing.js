// HTML escape function to prevent XSS
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// Wait for Auth to be available
const waitForAuth = (maxWait = 10000) => new Promise((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
        if (window.Auth) return resolve(window.Auth);
        if (Date.now() - startTime > maxWait) return reject(new Error('Auth not available'));
        setTimeout(check, 50);
    };
    check();
});
const Auth = await waitForAuth();

// State
let queueOrders = [];
let _currentView = 'queue';
let currentUser = null;

// Initialize
async function init() {
    currentUser = await Auth.requireAuth(['admin', 'staff']);
    if (!currentUser) return;

    setupViewToggle();
    await loadQueue();
    await loadStats();
}

// Setup view toggle buttons
function setupViewToggle() {
    const queueBtn = document.getElementById('queueViewBtn');
    const batchBtn = document.getElementById('batchViewBtn');

    queueBtn?.addEventListener('click', () => switchView('queue'));
    batchBtn?.addEventListener('click', () => switchView('batch'));
}

// Switch between queue and batch views
async function switchView(view) {
    _currentView = view;

    // Update button states
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    // Update view containers
    document.querySelectorAll('.view-container').forEach(container => {
        container.classList.toggle('active', container.id === `${view}View`);
    });

    if (view === 'batch') {
        await loadBatchView();
    }
}

// Load packing queue
async function loadQueue() {
    try {
        const response = await fetch('/api/packing/queue', {
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to load queue');

        const data = await response.json();
        queueOrders = data.data || [];
        renderQueue();
    } catch (error) {
        console.error('Error loading queue:', error);
        queueOrders = [];
        const queueList = document.getElementById('queueList');
        if (queueList) {
            queueList.innerHTML = `
                <div class="error-state" style="text-align:center;padding:2rem;color:var(--error);">
                    <p>Failed to load packing queue</p>
                    <button onclick="window.location.reload()" style="margin-top:1rem;padding:0.5rem 1rem;background:var(--dusty-olive);color:white;border:none;border-radius:8px;cursor:pointer;">Retry</button>
                </div>
            `;
        }
    }
}

// Load stats
async function loadStats() {
    try {
        const response = await fetch('/api/packing/stats', {
            credentials: 'include'
        });

        if (!response.ok) return;

        const data = await response.json();
        const stats = data.data;

        document.getElementById('statTotal').textContent = stats.total || 0;
        document.getElementById('statPending').textContent = stats.notStarted || 0;
        document.getElementById('statInProgress').textContent = stats.inProgress || 0;
        document.getElementById('statCompleted').textContent = stats.completed || 0;
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Render queue
function renderQueue() {
    const container = document.getElementById('queueList');
    if (!container) return;

    if (queueOrders.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">&#10003;</div>
                <h3>All caught up!</h3>
                <p>No orders waiting to be packed</p>
            </div>
        `;
        return;
    }

    // Group by batch
    const grouped = {};
    queueOrders.forEach(order => {
        const batchKey = order.batch?.batchNumber || 'No Batch';
        if (!grouped[batchKey]) {
            grouped[batchKey] = {
                batch: order.batch,
                orders: []
            };
        }
        grouped[batchKey].orders.push(order);
    });

    container.innerHTML = Object.entries(grouped).map(([batchKey, group]) => `
        <div class="batch-group">
            <div class="batch-header">
                <span class="batch-name">${escapeHtml(batchKey)}</span>
                <span class="batch-count">${group.orders.length} orders</span>
            </div>
            <div class="batch-orders">
                ${group.orders.map(order => renderOrderCard(order)).join('')}
            </div>
        </div>
    `).join('');

    // Add click handlers - navigate to Orders page with deep link
    container.querySelectorAll('.order-card').forEach(card => {
        card.addEventListener('click', () => {
            const orderId = card.dataset.orderId;
            // Navigate to Orders page with packing action
            window.location.href = `/pages/orders/?order=${orderId}&action=pack`;
        });
    });
}

// Render single order card
function renderOrderCard(order) {
    const statusClass = getPackingStatusClass(order.packingStatus);
    const statusText = getPackingStatusText(order.packingStatus);
    const progress = order.packingStatus === 'in_progress'
        ? `${order.packedItems}/${order.itemCount}`
        : '';

    return `
        <div class="order-card card-animated ${statusClass}" data-order-id="${escapeHtml(order._id)}">
            <div class="order-main">
                <div class="order-info">
                    <span class="order-number">${escapeHtml(order.orderNumber)}</span>
                    <span class="customer-name">${escapeHtml(order.customer?.name || 'Unknown')}</span>
                </div>
                <div class="order-meta">
                    <span class="item-count">${order.itemCount} items</span>
                    <span class="order-amount">&#8377;${order.totalAmount?.toLocaleString() || 0}</span>
                </div>
            </div>
            <div class="order-status">
                <span class="status-badge ${statusClass}">${statusText}</span>
                ${progress ? `<span class="progress-mini">${progress}</span>` : ''}
            </div>
            <div class="order-action">
                <span class="action-arrow">&rarr;</span>
            </div>
        </div>
    `;
}

// Get packing status class
function getPackingStatusClass(status) {
    switch (status) {
        case 'in_progress': return 'status-progress';
        case 'completed': return 'status-done';
        case 'on_hold': return 'status-hold';
        default: return 'status-pending';
    }
}

// Get packing status text
function getPackingStatusText(status) {
    switch (status) {
        case 'in_progress': return 'In Progress';
        case 'completed': return 'Packed';
        case 'on_hold': return 'On Hold';
        default: return 'Ready';
    }
}

// Load batch view
async function loadBatchView() {
    const container = document.getElementById('batchList');
    if (!container) return;

    container.innerHTML = '<div class="loading">Loading batches...</div>';

    try {
        // Get today's batches
        const response = await fetch('/api/batches/today', {
            credentials: 'include'
        });

        // Guard: user switched views while fetching
        if (_currentView !== 'batch') return;

        if (!response.ok) throw new Error('Failed to load batches');

        const data = await response.json();
        const batches = data.data || [];

        if (batches.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No batches today</h3>
                    <p>Batches will appear here when orders come in</p>
                </div>
            `;
            return;
        }

        // Load summary for each batch
        const batchSummaries = await Promise.all(
            batches.map(async (batch) => {
                try {
                    const summaryRes = await fetch(`/api/batches/${batch._id}/quantity-summary`, {
                        credentials: 'include'
                    });
                    if (summaryRes.ok) {
                        const summaryData = await summaryRes.json();
                        return summaryData.data || summaryData;
                    }
                } catch (e) {
                    console.error('Error loading batch summary:', e);
                }
                return { batch, orderStats: {}, products: [] };
            })
        );

        // Guard: user switched views during batch summary fetches
        if (_currentView !== 'batch') return;

        container.innerHTML = batchSummaries.map(summary => renderBatchSummary(summary)).join('');
    } catch (error) {
        console.error('Error loading batch view:', error);
        if (_currentView === 'batch') {
            container.innerHTML = '<div class="error-state">Failed to load batches</div>';
        }
    }
}

// Render batch summary card
function renderBatchSummary(summary) {
    const { batch, orderStats, products } = summary;
    const progress = orderStats.total > 0
        ? Math.round((orderStats.completed / orderStats.total) * 100)
        : 0;

    return `
        <div class="batch-summary-card">
            <div class="batch-summary-header">
                <div>
                    <h3>${escapeHtml(batch.batchNumber)}</h3>
                    <span class="batch-type">${escapeHtml(batch.batchType)} Batch</span>
                </div>
                <div class="batch-progress-ring" style="--progress: ${progress}">
                    <span>${progress}%</span>
                </div>
            </div>

            <div class="batch-order-stats">
                <div class="stat-mini">
                    <span class="stat-value">${orderStats.total || 0}</span>
                    <span class="stat-label">Total</span>
                </div>
                <div class="stat-mini pending">
                    <span class="stat-value">${orderStats.notStarted || 0}</span>
                    <span class="stat-label">Pending</span>
                </div>
                <div class="stat-mini progress">
                    <span class="stat-value">${orderStats.inProgress || 0}</span>
                    <span class="stat-label">Packing</span>
                </div>
                <div class="stat-mini done">
                    <span class="stat-value">${orderStats.completed || 0}</span>
                    <span class="stat-label">Done</span>
                </div>
            </div>

            ${products.length > 0 ? `
                <div class="batch-products">
                    <h4>Products to Pack</h4>
                    <div class="product-list">
                        ${products.slice(0, 5).map(p => `
                            <div class="product-row ${p.remaining <= 0 ? 'done' : ''}">
                                <span class="product-name">${escapeHtml(p.productName)}</span>
                                <span class="product-qty">
                                    ${p.totalPacked}/${p.totalOrdered} ${escapeHtml(p.unit)}
                                </span>
                                <div class="product-progress-bar">
                                    <div class="product-progress-fill" style="width: ${p.percentPacked}%"></div>
                                </div>
                            </div>
                        `).join('')}
                        ${products.length > 5 ? `
                            <div class="more-products">+${products.length - 5} more products</div>
                        ` : ''}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

// Safe localStorage wrapper (private browsing may throw)
function safeStorage(key, value) {
    try {
        if (value === undefined) return localStorage.getItem(key);
        localStorage.setItem(key, value);
    } catch { return null; }
}

// Dismiss help banner
function dismissPackingHelp() {
    const banner = document.getElementById('packingHelpBanner');
    if (banner) {
        banner.style.display = 'none';
        safeStorage('packingHelpDismissed', 'true');
    }
}

// Check if help banner should be shown
function checkPackingHelpBanner() {
    const dismissed = safeStorage('packingHelpDismissed');
    const banner = document.getElementById('packingHelpBanner');
    if (banner && dismissed === 'true') {
        banner.style.display = 'none';
    }
}

// Initialize help banner visibility on load
checkPackingHelpBanner();

// Polling for queue refresh
let _packingPollInterval = null;

function startPolling() {
    stopPolling();
    _packingPollInterval = setInterval(() => {
        loadQueue();
    }, 30000);
}

function stopPolling() {
    if (_packingPollInterval) {
        clearInterval(_packingPollInterval);
        _packingPollInterval = null;
    }
}

// Refresh stats and restart polling when page becomes visible
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        loadStats();
        loadQueue();
        startPolling();
    } else {
        stopPolling();
    }
});

// Make functions globally available
window.dismissPackingHelp = dismissPackingHelp;

// Clean up polling on page unload
window.addEventListener('beforeunload', stopPolling);

// Initialize
init().then(() => {
    startPolling();
});
