import { showToast, createElement } from '/js/ui.js';

// Wait for Auth to be available
const waitForAuth = () => new Promise((resolve) => {
    if (window.Auth) resolve(window.Auth);
    else setTimeout(() => resolve(waitForAuth()), 10);
});
const Auth = await waitForAuth();

// State
let queueOrders = [];
let currentOrder = null;
let currentPackingItems = [];
let currentView = 'queue';
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
    currentView = view;

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
        showToast('Failed to load packing queue', 'error');
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
                <span class="batch-name">${batchKey}</span>
                <span class="batch-count">${group.orders.length} orders</span>
            </div>
            <div class="batch-orders">
                ${group.orders.map(order => renderOrderCard(order)).join('')}
            </div>
        </div>
    `).join('');

    // Add click handlers
    container.querySelectorAll('.order-card').forEach(card => {
        card.addEventListener('click', () => {
            const orderId = card.dataset.orderId;
            openPackingModal(orderId);
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
        <div class="order-card card-animated ${statusClass}" data-order-id="${order._id}">
            <div class="order-main">
                <div class="order-info">
                    <span class="order-number">${order.orderNumber}</span>
                    <span class="customer-name">${order.customer?.name || 'Unknown'}</span>
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
                    const summaryRes = await fetch(`/api/packing/batch/${batch._id}/summary`, {
                        credentials: 'include'
                    });
                    if (summaryRes.ok) {
                        const summaryData = await summaryRes.json();
                        return summaryData.data;
                    }
                } catch (e) {
                    console.error('Error loading batch summary:', e);
                }
                return { batch, orderStats: {}, products: [] };
            })
        );

        container.innerHTML = batchSummaries.map(summary => renderBatchSummary(summary)).join('');
    } catch (error) {
        console.error('Error loading batch view:', error);
        container.innerHTML = '<div class="error-state">Failed to load batches</div>';
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
                    <h3>${batch.batchNumber}</h3>
                    <span class="batch-type">${batch.batchType} Batch</span>
                </div>
                <div class="batch-progress-ring" data-progress="${progress}">
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
                                <span class="product-name">${p.productName}</span>
                                <span class="product-qty">
                                    ${p.totalPacked}/${p.totalOrdered} ${p.unit}
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

// Open packing modal
async function openPackingModal(orderId) {
    const modal = document.getElementById('packingModal');
    if (!modal) return;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Show loading state
    document.getElementById('packingModalBody').innerHTML = '<div class="loading">Loading order...</div>';
    document.getElementById('completeBtn').disabled = true;

    try {
        // Load order details
        const response = await fetch(`/api/packing/${orderId}`, {
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to load order');

        const data = await response.json();
        currentOrder = data.data;

        // Start packing session if not already started
        if (currentOrder.packingDetails.status === 'not_started') {
            await startPackingSession(orderId);
        } else if (currentOrder.packingDetails.status === 'on_hold') {
            // Resume if on hold
            await resumePackingSession(orderId);
        }

        currentPackingItems = currentOrder.packingDetails.items || [];
        renderPackingModal();
    } catch (error) {
        console.error('Error loading order:', error);
        showToast('Failed to load order details', 'error');
        closePackingModal();
    }
}

// Start packing session
async function startPackingSession(orderId) {
    try {
        const csrfToken = await Auth.ensureCsrfToken();
        const response = await fetch(`/api/packing/${orderId}/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            credentials: 'include'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to start packing');
        }

        const data = await response.json();
        currentPackingItems = data.data.items || [];
        currentOrder.packingDetails.status = 'in_progress';
    } catch (error) {
        console.error('Error starting packing:', error);
        throw error;
    }
}

// Resume packing session
async function resumePackingSession(orderId) {
    try {
        const csrfToken = await Auth.ensureCsrfToken();
        const response = await fetch(`/api/packing/${orderId}/resume`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            credentials: 'include'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to resume packing');
        }

        currentOrder.packingDetails.status = 'in_progress';
    } catch (error) {
        console.error('Error resuming packing:', error);
        throw error;
    }
}

// Render packing modal content
function renderPackingModal() {
    // Update title
    document.getElementById('packingModalTitle').textContent = `Pack ${currentOrder.orderNumber}`;
    document.getElementById('packingModalSubtitle').textContent =
        `${currentOrder.customer?.name || 'Unknown'} • ${currentOrder.customer?.phone || ''}`;

    // Update progress
    updateProgress();

    // Render body
    const body = document.getElementById('packingModalBody');
    body.innerHTML = `
        <div class="order-details">
            ${currentOrder.deliveryAddress ? `
                <div class="delivery-info">
                    <span class="label">Deliver to:</span>
                    <span class="value">${currentOrder.deliveryAddress}</span>
                </div>
            ` : ''}
            ${currentOrder.notes ? `
                <div class="order-notes">
                    <span class="label">Notes:</span>
                    <span class="value">${currentOrder.notes}</span>
                </div>
            ` : ''}
        </div>

        <div class="checklist-header">
            <span>Items to Pack</span>
            <button class="btn-mini" onclick="markAllPacked()">Mark All Packed</button>
        </div>

        <div class="packing-checklist">
            ${currentPackingItems.map((item, index) => renderChecklistItem(item, index)).join('')}
        </div>
    `;

    // Setup event handlers
    setupChecklistHandlers();

    // Show issues if any
    updateIssuesDisplay();

    // Show acknowledgement checkbox if needed
    const hasIssues = currentOrder.packingDetails.issues?.length > 0 ||
        currentPackingItems.some(i => i.status !== 'packed' && i.status !== 'pending');

    const ackSection = document.getElementById('packingAcknowledgement');
    if (hasIssues) {
        ackSection.style.display = 'block';
    } else {
        ackSection.style.display = 'none';
    }
}

// Render single checklist item
function renderChecklistItem(item, index) {
    const isVerified = item.status !== 'pending';
    const statusIcon = getStatusIcon(item.status);
    const statusClass = getItemStatusClass(item.status);

    return `
        <div class="checklist-item ${statusClass}" data-index="${index}" data-product-id="${item.product}">
            <div class="item-main">
                <div class="item-check ${isVerified ? 'checked' : ''}" onclick="toggleItemStatus(${index})">
                    ${statusIcon}
                </div>
                <div class="item-details">
                    <span class="item-name">${item.productName}</span>
                    <span class="item-qty">Ordered: ${item.orderedQuantity} ${item.unit}</span>
                </div>
            </div>

            <div class="item-input">
                <input type="number"
                    class="qty-input"
                    placeholder="Qty"
                    value="${item.packedQuantity ?? ''}"
                    data-index="${index}"
                    step="0.01"
                    min="0"
                    ${isVerified && item.status === 'packed' ? '' : ''}
                >
                <span class="unit-label">${item.unit}</span>
            </div>

            <div class="item-status">
                <select class="status-select" data-index="${index}" onchange="updateItemStatus(${index}, this.value)">
                    <option value="pending" ${item.status === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="packed" ${item.status === 'packed' ? 'selected' : ''}>Packed</option>
                    <option value="short" ${item.status === 'short' ? 'selected' : ''}>Short</option>
                    <option value="damaged" ${item.status === 'damaged' ? 'selected' : ''}>Damaged</option>
                    <option value="unavailable" ${item.status === 'unavailable' ? 'selected' : ''}>Unavailable</option>
                </select>
            </div>

            ${item.status !== 'packed' && item.status !== 'pending' ? `
                <div class="item-notes">
                    <input type="text"
                        class="notes-input"
                        placeholder="Add note..."
                        value="${item.notes || ''}"
                        data-index="${index}"
                    >
                </div>
            ` : ''}
        </div>
    `;
}

// Get status icon
function getStatusIcon(status) {
    switch (status) {
        case 'packed': return '&#10003;';
        case 'short': return '&#9888;';
        case 'damaged': return '&#10006;';
        case 'unavailable': return '&#8709;';
        default: return '';
    }
}

// Get item status class
function getItemStatusClass(status) {
    switch (status) {
        case 'packed': return 'item-packed';
        case 'short': return 'item-short';
        case 'damaged': return 'item-damaged';
        case 'unavailable': return 'item-unavailable';
        default: return 'item-pending';
    }
}

// Setup checklist handlers
function setupChecklistHandlers() {
    // Quantity input handlers
    document.querySelectorAll('.qty-input').forEach(input => {
        input.addEventListener('change', async (e) => {
            const index = parseInt(e.target.dataset.index);
            const qty = parseFloat(e.target.value) || 0;

            currentPackingItems[index].packedQuantity = qty;

            // Auto-detect if short
            const item = currentPackingItems[index];
            if (qty > 0 && qty < item.orderedQuantity && item.status === 'pending') {
                item.status = 'short';
                renderPackingModal();
            }

            await saveItemUpdate(index);
        });
    });

    // Notes input handlers
    document.querySelectorAll('.notes-input').forEach(input => {
        input.addEventListener('change', async (e) => {
            const index = parseInt(e.target.dataset.index);
            currentPackingItems[index].notes = e.target.value;
            await saveItemUpdate(index);
        });
    });
}

// Toggle item status (quick action)
async function toggleItemStatus(index) {
    const item = currentPackingItems[index];

    if (item.status === 'pending') {
        // Get quantity from input
        const qtyInput = document.querySelector(`.qty-input[data-index="${index}"]`);
        const qty = parseFloat(qtyInput?.value) || item.orderedQuantity;

        item.packedQuantity = qty;

        if (qty >= item.orderedQuantity) {
            item.status = 'packed';
        } else if (qty > 0) {
            item.status = 'short';
        }
    } else if (item.status === 'packed') {
        // Toggle back to pending
        item.status = 'pending';
    }

    await saveItemUpdate(index);
    renderPackingModal();
}

// Update item status from dropdown
async function updateItemStatus(index, status) {
    const item = currentPackingItems[index];
    item.status = status;

    // Get packed quantity
    const qtyInput = document.querySelector(`.qty-input[data-index="${index}"]`);
    if (status === 'packed') {
        item.packedQuantity = parseFloat(qtyInput?.value) || item.orderedQuantity;
    } else if (status === 'unavailable') {
        item.packedQuantity = 0;
    }

    await saveItemUpdate(index);
    renderPackingModal();
}

// Save item update to server
async function saveItemUpdate(index) {
    const item = currentPackingItems[index];

    try {
        const csrfToken = await Auth.ensureCsrfToken();
        const response = await fetch(`/api/packing/${currentOrder._id}/item/${item.product}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            credentials: 'include',
            body: JSON.stringify({
                status: item.status,
                packedQuantity: item.packedQuantity,
                notes: item.notes
            })
        });

        if (!response.ok) {
            throw new Error('Failed to save');
        }

        const data = await response.json();

        // Update issues from response
        if (data.data.issues) {
            currentOrder.packingDetails.issues = data.data.issues;
        }

        updateProgress();
        updateIssuesDisplay();
        updateCompleteButton();
    } catch (error) {
        console.error('Error saving item:', error);
        showToast('Failed to save changes', 'error');
    }
}

// Mark all items as packed
async function markAllPacked() {
    for (let i = 0; i < currentPackingItems.length; i++) {
        const item = currentPackingItems[i];
        if (item.status === 'pending') {
            item.status = 'packed';
            item.packedQuantity = item.orderedQuantity;
            await saveItemUpdate(i);
        }
    }
    renderPackingModal();
}

// Update progress bar
function updateProgress() {
    const total = currentPackingItems.length;
    const verified = currentPackingItems.filter(i => i.status !== 'pending').length;
    const percentage = total > 0 ? Math.round((verified / total) * 100) : 0;

    document.getElementById('progressFill').style.width = `${percentage}%`;
    document.getElementById('progressText').textContent = `${verified}/${total} items`;
}

// Update issues display
function updateIssuesDisplay() {
    const issues = currentOrder.packingDetails.issues || [];
    const issuesSection = document.getElementById('packingIssues');
    const issuesList = document.getElementById('issuesList');

    if (issues.length > 0) {
        issuesSection.style.display = 'block';
        issuesList.innerHTML = issues.map(issue => `
            <div class="issue-item issue-${issue.issueType}">
                <span class="issue-product">${issue.productName}</span>
                <span class="issue-type">${issue.issueType}</span>
                <span class="issue-qty">${issue.quantityAffected} affected</span>
                ${issue.description ? `<span class="issue-desc">${issue.description}</span>` : ''}
            </div>
        `).join('');
    } else {
        issuesSection.style.display = 'none';
    }

    // Update acknowledgement visibility
    const ackSection = document.getElementById('packingAcknowledgement');
    const hasIssues = issues.length > 0 ||
        currentPackingItems.some(i => i.status !== 'packed' && i.status !== 'pending');

    if (hasIssues) {
        ackSection.style.display = 'block';
    } else {
        ackSection.style.display = 'none';
    }

    updateCompleteButton();
}

// Update complete button state
function updateCompleteButton() {
    const completeBtn = document.getElementById('completeBtn');
    const allVerified = currentPackingItems.every(i => i.status !== 'pending');
    const hasIssues = currentOrder.packingDetails.issues?.length > 0 ||
        currentPackingItems.some(i => i.status !== 'packed' && i.status !== 'pending');
    const acknowledged = document.getElementById('acknowledgeCheckbox')?.checked || !hasIssues;

    completeBtn.disabled = !allVerified || (hasIssues && !acknowledged);
}

// Hold order
function holdOrder() {
    document.getElementById('holdModal').classList.add('active');
}

// Close hold modal
function closeHoldModal() {
    document.getElementById('holdModal').classList.remove('active');
    document.getElementById('holdReason').value = '';
}

// Confirm hold
async function confirmHold() {
    const reason = document.getElementById('holdReason').value.trim();
    if (!reason) {
        showToast('Please provide a reason', 'error');
        return;
    }

    try {
        const csrfToken = await Auth.ensureCsrfToken();
        const response = await fetch(`/api/packing/${currentOrder._id}/hold`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            credentials: 'include',
            body: JSON.stringify({ reason })
        });

        if (!response.ok) throw new Error('Failed to hold order');

        showToast('Order put on hold', 'warning');
        closeHoldModal();
        closePackingModal();
        await loadQueue();
        await loadStats();
    } catch (error) {
        console.error('Error holding order:', error);
        showToast('Failed to hold order', 'error');
    }
}

// Complete packing
async function completePacking() {
    const hasIssues = currentOrder.packingDetails.issues?.length > 0 ||
        currentPackingItems.some(i => i.status !== 'packed' && i.status !== 'pending');
    const acknowledged = document.getElementById('acknowledgeCheckbox')?.checked;

    if (hasIssues && !acknowledged) {
        showToast('Please acknowledge issues before completing', 'error');
        return;
    }

    try {
        const csrfToken = await Auth.ensureCsrfToken();
        const response = await fetch(`/api/packing/${currentOrder._id}/complete`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            credentials: 'include',
            body: JSON.stringify({
                acknowledgeIssues: acknowledged || false
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to complete packing');
        }

        showToast('Packing completed!', 'success');
        closePackingModal();
        await loadQueue();
        await loadStats();
    } catch (error) {
        console.error('Error completing packing:', error);
        showToast(error.message || 'Failed to complete packing', 'error');
    }
}

// Close packing modal
function closePackingModal() {
    const modal = document.getElementById('packingModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
    currentOrder = null;
    currentPackingItems = [];
}

// Close print modal
function closePrintModal() {
    document.getElementById('printModal').classList.remove('active');
}

// Print slip
function printSlip() {
    window.print();
}

// Make functions globally available
window.openPackingModal = openPackingModal;
window.closePackingModal = closePackingModal;
window.closeHoldModal = closeHoldModal;
window.confirmHold = confirmHold;
window.holdOrder = holdOrder;
window.completePacking = completePacking;
window.toggleItemStatus = toggleItemStatus;
window.updateItemStatus = updateItemStatus;
window.markAllPacked = markAllPacked;
window.closePrintModal = closePrintModal;
window.printSlip = printSlip;

// Setup acknowledgement checkbox listener
document.getElementById('acknowledgeCheckbox')?.addEventListener('change', updateCompleteButton);

// Initialize
init();
