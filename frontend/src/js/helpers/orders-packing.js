import { showToast } from '/js/ui.js';
import { escapeHtml } from '/js/utils.js';

// Packing panel state (module-scoped)
let packingOrder = null;
let packingItems = [];

// Auth reference — set via setAuth()
let Auth = null;

export function setAuth(authRef) {
    Auth = authRef;
}

export async function openPackingPanel(orderId) {
    const panel = document.getElementById('packingPanel');
    const overlay = document.getElementById('packingPanelOverlay');
    if (!panel || !overlay) return;

    document.querySelectorAll('.swipe-item.swiped, .swipe-item.swiped-single').forEach(item => {
        item.classList.remove('swiped', 'swiped-single');
    });

    panel.classList.add('active');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    document.getElementById('packingPanelBody').innerHTML = '<div class="packing-loading">Loading order...</div>';
    document.getElementById('packingCompleteBtn').disabled = true;

    try {
        const response = await fetch(`/api/packing/${orderId}`, { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to load order');

        const data = await response.json();
        packingOrder = data.data;
        packingItems = packingOrder.items || [];
        renderPackingPanel();
    } catch (error) {
        console.error('Error loading packing order:', error);
        showToast('Failed to load order details', 'error');
        packingOrder = null;
        packingItems = [];
        closePackingPanel();
    }
}

function renderPackingPanel() {
    document.getElementById('packingPanelTitle').textContent = `Pack ${packingOrder.orderNumber}`;
    document.getElementById('packingPanelSubtitle').textContent =
        `${packingOrder.customer?.name || 'Unknown'} • ${packingOrder.customer?.phone || ''}`;

    updatePackingProgress();

    const body = document.getElementById('packingPanelBody');

    let orderDetailsHtml = '';
    if (packingOrder.deliveryAddress || packingOrder.notes) {
        orderDetailsHtml = `<div class="packing-order-details">`;
        if (packingOrder.deliveryAddress) {
            orderDetailsHtml += `
                <div class="packing-delivery-info">
                    <span class="packing-label">Deliver to</span>
                    <span class="packing-value">${escapeHtml(packingOrder.deliveryAddress)}</span>
                </div>`;
        }
        if (packingOrder.notes) {
            orderDetailsHtml += `
                <div class="packing-order-notes">
                    <span class="packing-label">Notes</span>
                    <span class="packing-value">${escapeHtml(packingOrder.notes)}</span>
                </div>`;
        }
        orderDetailsHtml += `</div>`;
    }

    const checklistItems = packingItems.map((item, index) => {
        const packedQty = item.packedQuantity ?? item.orderedQuantity;
        const isModified = item.packedQuantity !== undefined && item.packedQuantity !== item.orderedQuantity;
        const isPacked = item.packed || false;

        return `
            <div class="packing-checklist-item ${isPacked ? 'item-packed' : ''} ${isModified ? 'item-modified' : ''}" data-index="${index}" data-product-id="${item.product}">
                <div class="packing-item-main">
                    <div class="packing-item-check ${isPacked ? 'checked' : ''}" onclick="togglePackedItem(${index})">
                        ${isPacked ? '✓' : ''}
                    </div>
                    <div class="packing-item-details">
                        <span class="packing-item-name">${escapeHtml(item.productName)}</span>
                        <span class="packing-item-qty">Ordered: ${item.orderedQuantity} ${item.unit}</span>
                    </div>
                </div>
                <div class="packing-item-input">
                    <input type="number"
                        class="packing-qty-input ${isModified ? 'modified' : ''}"
                        value="${packedQty}"
                        data-index="${index}"
                        data-original="${item.orderedQuantity}"
                        step="0.01"
                        min="0"
                        onchange="handlePackingQtyChange(${index})"
                    >
                    <span class="packing-unit-label">${item.unit}</span>
                </div>
            </div>
        `;
    }).join('');

    body.innerHTML = `
        ${orderDetailsHtml}
        <div class="packing-checklist-header">
            <span>Items to Pack</span>
        </div>
        <div class="packing-checklist">
            ${checklistItems}
        </div>
    `;

    const ackSection = document.getElementById('packingPanelAcknowledgement');
    if (ackSection) ackSection.style.display = 'none';

    const issuesSection = document.getElementById('packingPanelIssues');
    if (issuesSection) issuesSection.style.display = 'none';

    updatePackingCompleteButton();
}

export async function togglePackedItem(index) {
    const item = packingItems[index];
    const newPacked = !item.packed;

    item.packed = newPacked;
    renderPackingPanel();

    try {
        const csrfToken = await Auth.ensureCsrfToken();
        const response = await fetch(`/api/packing/${packingOrder._id}/item/${item.product}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            credentials: 'include',
            body: JSON.stringify({ packed: newPacked })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || `Server error (${response.status})`);
        }
    } catch (error) {
        console.error('Error toggling packed status:', error);
        item.packed = !newPacked;
        renderPackingPanel();

        if (!navigator.onLine) {
            showToast('No connection. Check internet and retry.', 'error');
        } else if (error.message?.includes('401') || error.message?.includes('403') || error.message?.includes('auth')) {
            showToast('Session expired. Please refresh the page.', 'error');
        } else if (error.message?.includes('404')) {
            showToast('Order not found. It may have been modified.', 'error');
        } else {
            showToast(`Update failed: ${error.message}`, 'error');
        }
    }
}

export async function handlePackingQtyChange(index) {
    const qtyInput = document.querySelector(`.packing-qty-input[data-index="${index}"]`);
    const qty = parseFloat(qtyInput?.value) || 0;
    const original = parseFloat(qtyInput?.dataset.original) || 0;

    const previousQty = packingItems[index].packedQuantity;
    packingItems[index].packedQuantity = qty;

    qtyInput.classList.toggle('modified', qty !== original);
    const itemEl = qtyInput.closest('.packing-checklist-item');
    if (itemEl) {
        itemEl.classList.toggle('item-modified', qty !== original);
    }

    const result = await savePackingItemUpdate(index);

    if (!result.success) {
        packingItems[index].packedQuantity = previousQty;
        qtyInput.value = previousQty ?? original;
        qtyInput.classList.toggle('modified', (previousQty ?? original) !== original);
        if (itemEl) {
            itemEl.classList.toggle('item-modified', (previousQty ?? original) !== original);
        }
    }
}

async function savePackingItemUpdate(index) {
    const item = packingItems[index];

    try {
        const csrfToken = await Auth.ensureCsrfToken();
        const response = await fetch(`/api/packing/${packingOrder._id}/item/${item.product}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            credentials: 'include',
            body: JSON.stringify({ quantity: item.packedQuantity })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || `Server error (${response.status})`);
        }
        return { success: true };
    } catch (error) {
        console.error('Error saving packing item:', error);
        let userMsg = 'Failed to save changes';
        if (!navigator.onLine) {
            userMsg = 'No connection. Changes not saved.';
        } else if (error.message?.includes('401') || error.message?.includes('403')) {
            userMsg = 'Session expired. Please refresh.';
        }
        showToast(userMsg, 'error');
        return { success: false, error: error.message };
    }
}

function updatePackingProgress() {
    const total = packingItems.length;
    const packed = packingItems.filter(item => item.packed).length;
    const percentage = total > 0 ? Math.round((packed / total) * 100) : 0;

    document.getElementById('packingProgressFill').style.width = `${percentage}%`;
    document.getElementById('packingProgressText').textContent = `${packed}/${total} items packed`;
}

function updatePackingCompleteButton() {
    const completeBtn = document.getElementById('packingCompleteBtn');
    if (completeBtn) {
        const total = packingItems.length;
        const packed = packingItems.filter(item => item.packed).length;
        const allPacked = packed === total && total > 0;

        completeBtn.disabled = !allPacked;

        if (!allPacked && total > 0) {
            const remaining = total - packed;
            completeBtn.title = `${remaining} item(s) remaining`;
        } else {
            completeBtn.title = '';
        }
    }
}

export async function completePackingSession(onComplete) {
    const completeBtn = document.getElementById('packingCompleteBtn');
    completeBtn.disabled = true;
    completeBtn.innerHTML = '<span class="btn-text">Completing...</span>';

    try {
        const csrfToken = await Auth.ensureCsrfToken();
        const response = await fetch(`/api/packing/${packingOrder._id}/done`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            credentials: 'include'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to complete packing');
        }

        showToast('Packing completed!', 'success');
        closePackingPanel();
        if (onComplete) await onComplete();
    } catch (error) {
        console.error('Error completing packing:', error);
        showToast(error.message || 'Failed to complete packing', 'error');
        completeBtn.disabled = false;
        completeBtn.innerHTML = '<span class="btn-text">Mark Done</span>';
    }
}

export function closePackingPanel() {
    const panel = document.getElementById('packingPanel');
    const overlay = document.getElementById('packingPanelOverlay');

    panel.classList.remove('active');
    overlay.classList.remove('active');
    document.body.style.overflow = '';

    packingOrder = null;
    packingItems = [];
}
