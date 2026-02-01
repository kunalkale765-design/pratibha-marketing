import { showToast } from '/js/ui.js';
import { escapeHtml } from '/js/utils.js';

import { waitForAuth } from '/js/helpers/auth-wait.js';
const Auth = await waitForAuth();

// State
let pendingOrders = [];
let currentOrder = null;
let currentOrderData = null;
let todayCompletedCount = 0;

// Initialize
async function init() {
    const user = await Auth.requireAuth(['admin', 'staff']);
    if (!user) return;

    checkHelpBanner();
    await loadPendingOrders();
}

// Load pending orders for reconciliation
async function loadPendingOrders() {
    try {
        const response = await fetch('/api/reconciliation/pending', {
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to load pending orders');

        const data = await response.json();
        pendingOrders = data.data || [];
        todayCompletedCount = data.todayCompleted || 0;

        updateStats();
        renderOrders();
    } catch (error) {
        console.error('Error loading pending orders:', error);
        const orderList = document.getElementById('orderList');
        if (orderList) {
            orderList.innerHTML = `
                <div class="error-state" style="text-align:center;padding:2rem;color:var(--error);">
                    <p>Failed to load orders</p>
                    <button onclick="window.location.reload()" style="margin-top:1rem;padding:0.5rem 1rem;background:var(--dusty-olive);color:white;border:none;border-radius:8px;cursor:pointer;">Retry</button>
                </div>
            `;
        }
    }
}

// Update stats display
function updateStats() {
    document.getElementById('statTotal').textContent = pendingOrders.length + todayCompletedCount;
    document.getElementById('statPending').textContent = pendingOrders.length;
    document.getElementById('statCompleted').textContent = todayCompletedCount;
}

// Render orders list
function renderOrders() {
    const container = document.getElementById('orderList');
    if (!container) return;

    if (pendingOrders.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">&#10003;</div>
                <h3>All caught up!</h3>
                <p>No orders pending reconciliation</p>
            </div>
        `;
        return;
    }

    // SECURITY: Use data attributes and event delegation instead of inline onclick
    // Escape all user-provided content to prevent XSS
    container.innerHTML = pendingOrders.map(order => {
        const initials = escapeHtml(getInitials(order.customer?.name || 'U'));
        const customerName = escapeHtml(order.customer?.name || 'Unknown');
        const orderNumber = escapeHtml(order.orderNumber);
        const batchType = escapeHtml(order.batch?.batchType || '1st');
        const orderId = escapeHtml(order._id);
        return `
            <div class="order-card card-animated" data-order-id="${orderId}">
                <div class="order-avatar">${initials}</div>
                <div class="order-details">
                    <div class="order-customer">${customerName}</div>
                    <div class="order-meta">
                        <span class="order-number">${orderNumber}</span>
                        ${order.batch ? `<span class="order-batch">${batchType}</span>` : ''}
                    </div>
                    <div class="order-items">${order.itemCount} items</div>
                </div>
                <div class="order-amount">&#8377;${order.totalAmount?.toLocaleString() || 0}</div>
                <div class="order-arrow">&rarr;</div>
            </div>
        `;
    }).join('');

    // Event delegation for order card clicks
    container.querySelectorAll('.order-card').forEach(card => {
        card.addEventListener('click', () => {
            const orderId = card.dataset.orderId;
            if (orderId) openReconciliation(orderId);
        });
    });
}

// Get initials from name
function getInitials(name) {
    return name
        .split(' ')
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

// Open reconciliation modal for an order
async function openReconciliation(orderId) {
    try {
        currentOrder = orderId;

        // Show loading state
        const modal = document.getElementById('reconcileModal');
        modal.classList.add('active');
        document.getElementById('reconcileItems').innerHTML = '<div class="loading">Loading order details...</div>';

        // Fetch order details
        const response = await fetch(`/api/reconciliation/${orderId}`, {
            credentials: 'include'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to load order');
        }

        const data = await response.json();
        currentOrderData = data.data;

        // Update modal header
        document.getElementById('modalTitle').textContent = 'Reconcile Order';
        document.getElementById('modalSubtitle').textContent = currentOrderData.orderNumber;
        document.getElementById('infoCustomer').textContent = currentOrderData.customer?.name || 'Unknown';
        document.getElementById('infoTotal').textContent = `₹${currentOrderData.totalAmount?.toLocaleString() || 0}`;

        // Render items
        renderReconcileItems();
        updateSummary();

    } catch (error) {
        console.error('Error loading order:', error);
        showToast(error.message || 'Failed to load order', 'error');
        closeModal();
    }
}

// Render reconciliation items
function renderReconcileItems() {
    const container = document.getElementById('reconcileItems');
    if (!currentOrderData) return;

    // SECURITY: Escape user-provided content
    container.innerHTML = currentOrderData.products.map((item, index) => {
        const productName = escapeHtml(item.productName);
        const unit = escapeHtml(item.unit);
        return `
        <div class="reconcile-item" id="item-${index}" data-index="${index}">
            <div class="item-info">
                <div class="item-name">${productName}</div>
                <div class="item-unit">${unit} @ ₹${item.rate}</div>
            </div>
            <div class="item-ordered">${item.orderedQty}</div>
            <div class="item-delivered">
                <input type="number"
                    class="qty-input"
                    id="qty-${index}"
                    value="${item.deliveredQty}"
                    min="0"
                    step="0.1"
                    data-original="${item.orderedQty}"
                    data-index="${index}">
            </div>
            <div class="item-reason" id="reason-row-${index}" style="display: none;">
                <input type="text"
                    class="reason-input"
                    id="reason-${index}"
                    placeholder="Reason for change (optional)"
                    maxlength="200">
            </div>
        </div>
    `;}).join('');

    // Event delegation for quantity inputs
    container.querySelectorAll('.qty-input').forEach(input => {
        input.addEventListener('change', () => onQuantityChange(parseInt(input.dataset.index)));
        input.addEventListener('input', () => onQuantityInput(parseInt(input.dataset.index)));
    });
}

// Handle quantity input (real-time visual feedback)
function onQuantityInput(index) {
    const input = document.getElementById(`qty-${index}`);
    const item = document.getElementById(`item-${index}`);
    const reasonRow = document.getElementById(`reason-row-${index}`);
    const originalQty = parseFloat(input.dataset.original);
    const newQty = parseFloat(input.value) || 0;

    // Update visual classes
    item.classList.remove('modified', 'zeroed');
    input.classList.remove('modified', 'zeroed');

    if (newQty === 0) {
        item.classList.add('zeroed');
        input.classList.add('zeroed');
        reasonRow.style.display = 'block';
    } else if (newQty !== originalQty) {
        item.classList.add('modified');
        input.classList.add('modified');
        reasonRow.style.display = 'block';
    } else {
        reasonRow.style.display = 'none';
    }

    updateSummary();
}

// Handle quantity change (on blur)
function onQuantityChange(index) {
    onQuantityInput(index);
}

// Update summary totals
function updateSummary() {
    if (!currentOrderData) return;

    const originalTotal = currentOrderData.totalAmount;
    let adjustedTotal = 0;

    currentOrderData.products.forEach((item, index) => {
        const input = document.getElementById(`qty-${index}`);
        const deliveredQty = parseFloat(input?.value) || 0;
        adjustedTotal += deliveredQty * item.rate;
    });

    adjustedTotal = Math.round(adjustedTotal * 100) / 100;
    const difference = Math.round((originalTotal - adjustedTotal) * 100) / 100;

    document.getElementById('summaryOriginal').textContent = `₹${originalTotal.toLocaleString()}`;
    document.getElementById('summaryAdjusted').textContent = `₹${adjustedTotal.toLocaleString()}`;

    const diffRow = document.getElementById('summaryDifferenceRow');
    if (difference !== 0) {
        diffRow.style.display = 'flex';
        document.getElementById('summaryDifference').textContent = `-₹${difference.toLocaleString()}`;
    } else {
        diffRow.style.display = 'none';
    }
}

// Complete reconciliation
async function completeReconciliation() {
    if (!currentOrder || !currentOrderData) return;

    // Gather reconciliation data first for validation
    const items = currentOrderData.products.map((item, index) => {
        const input = document.getElementById(`qty-${index}`);
        const reasonInput = document.getElementById(`reason-${index}`);
        return {
            product: item.product,
            deliveredQty: parseFloat(input?.value) || 0,
            reason: reasonInput?.value || ''
        };
    });

    // Check if all quantities are zero
    const allZero = items.every(item => item.deliveredQty === 0);
    if (allZero) {
        if (!confirm('All quantities are zero. Are you sure?')) {
            return;
        }
    }

    // Confirmation before completing
    if (!confirm('Mark this order as delivered?')) {
        return;
    }

    const btn = document.getElementById('btnComplete');
    btn.disabled = true;
    btn.textContent = 'Processing...';

    try {

        const notes = document.getElementById('reconcileNotes')?.value || '';

        // Get CSRF token
        const csrfToken = await Auth.ensureCsrfToken();
        const headers = { 'Content-Type': 'application/json' };
        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        // Submit reconciliation
        const response = await fetch(`/api/reconciliation/${currentOrder}/complete`, {
            method: 'POST',
            headers: headers,
            credentials: 'include',
            body: JSON.stringify({ items, notes })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to complete reconciliation');
        }

        const result = await response.json();

        const orderNum = result?.data?.orderNumber;
        showToast(orderNum ? `Order ${orderNum} reconciled successfully` : 'Order reconciled successfully', 'success');

        // Update stats
        todayCompletedCount++;

        // Close modal and refresh list
        closeModal();
        await loadPendingOrders();

    } catch (error) {
        console.error('Error completing reconciliation:', error);
        showToast(error.message || 'Failed to complete reconciliation', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Complete Reconciliation';
    }
}

// Close modal
function closeModal() {
    const modal = document.getElementById('reconcileModal');
    modal.classList.remove('active');
    currentOrder = null;
    currentOrderData = null;

    // Reset notes
    const notesInput = document.getElementById('reconcileNotes');
    if (notesInput) notesInput.value = '';
}

// Close modal when clicking on overlay (outside modal content)
const reconcileModalOverlay = document.getElementById('reconcileModal');
if (reconcileModalOverlay) {
    reconcileModalOverlay.addEventListener('click', (e) => {
        // Only close if clicking the overlay itself, not the modal content
        if (e.target === reconcileModalOverlay || e.target.classList.contains('modal-overlay')) {
            closeModal();
        }
    });
}

// Safe localStorage wrapper (private browsing may throw)
function safeStorage(key, value) {
    try {
        if (value === undefined) return localStorage.getItem(key);
        localStorage.setItem(key, value);
    } catch { return null; }
}

// Dismiss help banner
function dismissHelp() {
    const banner = document.getElementById('helpBanner');
    if (banner) {
        banner.style.display = 'none';
        safeStorage('reconciliationHelpDismissed', 'true');
    }
}

// Check if help banner should be shown
function checkHelpBanner() {
    const dismissed = safeStorage('reconciliationHelpDismissed');
    const banner = document.getElementById('helpBanner');
    if (banner && dismissed === 'true') {
        banner.style.display = 'none';
    }
}

// Refresh pending orders when page becomes visible again
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        loadPendingOrders();
    }
});

// Make functions globally available
window.openReconciliation = openReconciliation;
window.closeModal = closeModal;
window.completeReconciliation = completeReconciliation;
window.onQuantityChange = onQuantityChange;
window.onQuantityInput = onQuantityInput;
window.dismissHelp = dismissHelp;

// Initialize
init();
