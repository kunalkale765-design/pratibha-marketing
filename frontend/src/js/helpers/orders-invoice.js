import { showToast, createElement } from '/js/ui.js';

// Invoice state (module-scoped)
let invoiceData = null;
let selectedFirmId = null;
let selectedProductIds = new Set();
let allFirms = [];

// Auth reference — set via setAuth()
let Auth = null;

export function setAuth(authRef) {
    Auth = authRef;
}

async function loadFirms() {
    if (allFirms.length > 0) return { success: true };
    try {
        const res = await fetch('/api/invoices/firms', { credentials: 'include' });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data = await res.json();
        allFirms = data.data || [];
        return { success: true };
    } catch (e) {
        console.error('Failed to load firms:', e);
        return { success: false, error: e.message };
    }
}

export async function printOrder(orderId, currentUser) {
    if (currentUser?.role === 'customer') {
        showToast('Invoice printing is not available', 'info');
        return;
    }

    document.querySelectorAll('.swipe-item.swiped, .swipe-item.swiped-single').forEach(item => {
        item.classList.remove('swiped', 'swiped-single');
    });

    const isValidMongoId = /^[a-f\d]{24}$/i.test(orderId);
    if (!orderId || !isValidMongoId) {
        console.error('Invalid order ID:', orderId);
        showToast('Order data updating. Please refresh.', 'info');
        return;
    }

    document.getElementById('invoiceModal').classList.add('show');
    const modalBody = document.getElementById('invoiceModalBody');
    modalBody.innerHTML = '';
    modalBody.appendChild(createElement('div', { className: 'invoice-loading' }, 'Loading invoice data...'));
    const generateBtn = document.getElementById('generateInvoiceBtn');
    if (generateBtn) generateBtn.disabled = true;

    try {
        const firmsResult = await loadFirms();
        if (!firmsResult.success) {
            throw new Error('Could not load firm list. Please try again.');
        }

        const res = await fetch(`/api/invoices/${orderId}/split`, { credentials: 'include' });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || 'Invoice data temporarily unavailable');
        }
        const data = await res.json();
        invoiceData = data.data;

        document.getElementById('invoiceModalTitle').textContent = `Invoice for ${invoiceData.orderNumber}`;
        renderInvoiceModal();
    } catch (error) {
        console.error('Print order error:', error);
        document.getElementById('invoiceModalBody').innerHTML = '';
        document.getElementById('invoiceModalBody').appendChild(createElement('div', { className: 'invoice-no-items' }, [
            createElement('p', {}, 'Invoice data not available'),
            createElement('p', { style: { fontSize: '0.75rem', marginTop: '0.5rem' } }, error.message)
        ]));
    }
}

function renderInvoiceModal() {
    const modalBody = document.getElementById('invoiceModalBody');
    if (!invoiceData) {
        modalBody.innerHTML = '';
        modalBody.appendChild(createElement('div', { className: 'invoice-no-items' }, 'No items to invoice'));
        return;
    }

    const allItems = invoiceData.firms.flatMap(f => f.items);
    if (allItems.length === 0) {
        modalBody.innerHTML = '';
        modalBody.appendChild(createElement('div', { className: 'invoice-no-items' }, 'No items to invoice'));
        return;
    }

    if (!selectedFirmId) {
        selectedFirmId = allFirms.length > 0 ? allFirms[0].id : (invoiceData?.firms?.[0]?.firmId || 'pratibha');
        selectedProductIds = new Set(allItems.map(i => i.productId));
    }

    const selectedTotal = allItems
        .filter(i => selectedProductIds.has(i.productId))
        .reduce((sum, i) => sum + (i.amount || 0), 0);

    const firmsToShow = allFirms.length > 0 ? allFirms : (invoiceData?.firms || []).map(f => ({ id: f.firmId, name: f.firmName }));

    modalBody.innerHTML = '';
    const fragment = document.createDocumentFragment();

    const firmSelector = createElement('div', { className: 'invoice-firm-selector' }, [
        createElement('div', { className: 'info-label', style: { marginBottom: '0.5rem' } }, 'Select Firm'),
        createElement('div', { className: 'firm-options' }, firmsToShow.map(firm =>
            createElement('label', {
                className: `firm-option ${selectedFirmId === firm.id ? 'selected' : ''}`,
                onclick: () => selectFirm(firm.id)
            }, [
                createElement('input', {
                    type: 'radio',
                    name: 'firm',
                    value: firm.id,
                    checked: selectedFirmId === firm.id
                }),
                createElement('span', { className: 'firm-option-name' }, firm.name)
            ])
        ))
    ]);
    fragment.appendChild(firmSelector);

    fragment.appendChild(createElement('div', { className: 'info-label', style: { margin: '1rem 0 0.5rem' } }, 'Select Items'));
    fragment.appendChild(createElement('div', { className: 'invoice-items-list' }, allItems.map(item =>
        createElement('div', { className: 'invoice-item' }, [
            createElement('input', {
                type: 'checkbox',
                className: 'invoice-item-checkbox',
                dataset: { product: item.productId },
                checked: selectedProductIds.has(item.productId),
                onchange: () => toggleInvoiceItem(item.productId)
            }),
            createElement('div', { className: 'invoice-item-details' }, [
                createElement('div', { className: 'invoice-item-name' }, item.productName),
                createElement('div', { className: 'invoice-item-meta' }, `${item.quantity || 0} ${item.unit || ''} × ₹${(item.rate || 0).toLocaleString('en-IN')}`)
            ]),
            createElement('div', { className: 'invoice-item-amount' }, `₹${(item.amount || 0).toLocaleString('en-IN')}`)
        ])
    )));

    fragment.appendChild(createElement('div', { className: 'invoice-summary' }, [
        createElement('div', { className: 'invoice-summary-label' }, 'Total'),
        createElement('div', { className: 'invoice-summary-total' }, `₹${selectedTotal.toLocaleString('en-IN')}`)
    ]));

    modalBody.appendChild(fragment);
    const generateBtn = document.getElementById('generateInvoiceBtn');
    if (generateBtn) generateBtn.disabled = selectedProductIds.size === 0;
}

export function selectFirm(firmId) {
    selectedFirmId = firmId;
    renderInvoiceModal();
}

export function toggleInvoiceItem(productId) {
    if (selectedProductIds.has(productId)) {
        selectedProductIds.delete(productId);
    } else {
        selectedProductIds.add(productId);
    }
    renderInvoiceModal();
}

export async function generateInvoice() {
    if (!invoiceData || !selectedFirmId || selectedProductIds.size === 0) return;

    const btn = document.getElementById('generateInvoiceBtn');
    btn.classList.add('btn-loading');
    btn.disabled = true;

    try {
        const headers = { 'Content-Type': 'application/json' };
        const csrfToken = await Auth.ensureCsrfToken();
        if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

        const res = await fetch(`/api/invoices/${invoiceData.orderId}/pdf`, {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify({
                firmId: selectedFirmId,
                productIds: Array.from(selectedProductIds)
            })
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || 'Invoice generation temporarily unavailable');
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `INV${invoiceData.orderNumber.replace('ORD', '')}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('Invoice downloaded', 'success');
        closeInvoiceModal();
    } catch (error) {
        console.error('Generate invoice error:', error);
        showToast(error.message || 'Could not generate invoice', 'info');
    } finally {
        btn.classList.remove('btn-loading');
        btn.disabled = false;
    }
}

export function closeInvoiceModal() {
    document.getElementById('invoiceModal').classList.remove('show');
    invoiceData = null;
    selectedFirmId = null;
    selectedProductIds = new Set();
}

export async function downloadDeliveryBill(orderId, batchId, currentUser) {
    if (currentUser?.role === 'customer') {
        showToast('Delivery bills are not available', 'info');
        return;
    }

    document.querySelectorAll('.swipe-item.swiped, .swipe-item.swiped-single').forEach(item => {
        item.classList.remove('swiped', 'swiped-single');
    });

    const isValidMongoId = /^[a-f\d]{24}$/i.test(orderId);
    const isValidBatchId = /^[a-f\d]{24}$/i.test(batchId);
    if (!orderId || !isValidMongoId || !batchId || !isValidBatchId) {
        console.error('Invalid order or batch ID:', orderId, batchId);
        showToast('Order data updating. Please refresh.', 'info');
        return;
    }

    const billBtn = document.querySelector(`.swipe-item[data-order-id="${orderId}"] .swipe-action.bill`);
    if (billBtn) {
        billBtn.disabled = true;
        billBtn.classList.add('btn-loading');
    }

    showToast('Downloading delivery bill...', 'info');

    try {
        const response = await fetch(`/api/batches/${batchId}/bills/${orderId}/download?copy=original`, {
            credentials: 'include'
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || 'Failed to download delivery bill');
        }

        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'delivery-bill.pdf';
        if (contentDisposition) {
            const match = contentDisposition.match(/filename="?([^";\n]+)"?/);
            if (match) filename = match[1];
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();

        showToast('Delivery bill downloaded!', 'success');
    } catch (error) {
        console.error('Error downloading delivery bill:', error);
        showToast(error.message || 'Failed to download delivery bill', 'error');
    } finally {
        if (billBtn) {
            billBtn.disabled = false;
            billBtn.classList.remove('btn-loading');
        }
    }
}

export async function checkInvoicesExist(orderId) {
    try {
        const res = await fetch(`/api/invoices/order/${orderId}`, { credentials: 'include' });
        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                return { exists: false, error: 'auth' };
            }
            return { exists: false, error: `Server returned ${res.status}` };
        }
        const data = await res.json();
        return { exists: data.data && data.data.length > 0 };
    } catch (e) {
        console.error('Failed to check invoices:', e);
        return { exists: false, error: e.message };
    }
}
