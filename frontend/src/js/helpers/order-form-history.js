import { showToast, createElement } from '/js/ui.js';

let currentOrder = null;
let editedProducts = [];
let orderInvoices = [];
let _orderFormDirty = false;

// Auth reference — set via setAuth()
let Auth = null;
let _onSaveCallback = null;

export function setAuth(authRef) {
    Auth = authRef;
}

export function setOnSave(cb) {
    _onSaveCallback = cb;
}

export function isFormDirty() {
    return _orderFormDirty;
}

export async function openOrderDetail(orderId) {
    try {
        const [orderRes, invoicesRes] = await Promise.all([
            fetch(`/api/orders/${orderId}`, { credentials: 'include' }),
            fetch(`/api/invoices/my-order/${orderId}`, { credentials: 'include' })
        ]);

        const orderData = await orderRes.json();

        if (orderRes.ok && orderData.data) {
            currentOrder = orderData.data;
            editedProducts = JSON.parse(JSON.stringify(currentOrder.products || []));

            try {
                const invoicesData = await invoicesRes.json();
                orderInvoices = invoicesRes.ok ? (invoicesData.data || []) : [];
            } catch (invoiceParseError) {
                console.warn('Failed to load invoices:', invoiceParseError.message);
                orderInvoices = [];
            }

            renderOrderModal();
            document.getElementById('orderModal').classList.add('show');
            document.body.style.overflow = 'hidden';
        } else {
            showToast(orderData.message || 'Could not load order', 'info');
        }
    } catch (e) {
        console.error('Load order detail error:', e);
        showToast('Could not load details', 'info');
    }
}

export function closeOrderModal() {
    if (_orderFormDirty) {
        if (!confirm('You have unsaved changes. Discard them?')) {
            return;
        }
    }
    document.getElementById('orderModal').classList.remove('show');
    document.body.style.overflow = '';
    currentOrder = null;
    editedProducts = [];
    orderInvoices = [];
    _orderFormDirty = false;
}

function renderOrderModal() {
    const isPending = currentOrder.status === 'pending';
    const titleEl = document.getElementById('orderModalTitle');
    const bodyEl = document.getElementById('orderModalBody');
    const footerEl = document.getElementById('orderModalFooter');

    titleEl.textContent = currentOrder.orderNumber;
    bodyEl.innerHTML = '';

    const contentFragment = document.createDocumentFragment();

    const infoGrid = createElement('div', { className: 'order-info-grid' }, [
        createElement('div', {}, [
            createElement('div', { className: 'info-label' }, 'Status'),
            createElement('span', { className: `badge badge-${currentOrder.status}` }, currentOrder.status)
        ]),
        createElement('div', {}, [
            createElement('div', { className: 'info-label' }, 'Date'),
            createElement('div', { className: 'info-value' }, new Date(currentOrder.createdAt).toLocaleDateString('en-IN', {
                month: 'short', day: 'numeric', year: 'numeric'
            }))
        ])
    ]);

    if (currentOrder.batch?.batchType) {
        const batchLocked = currentOrder.batch?.status === 'confirmed';
        infoGrid.appendChild(createElement('div', {}, [
            createElement('div', { className: 'info-label' }, 'Batch'),
            createElement('span', { className: 'badge badge-batch' }, [
                `${currentOrder.batch.batchType} Batch`,
                batchLocked ? ' 🔒' : ''
            ])
        ]));
    }

    const orderInfoSection = createElement('div', { className: 'order-info-section' }, [
        infoGrid,
        currentOrder.deliveryAddress ? createElement('div', { style: { marginTop: '1rem' } }, [
            createElement('div', { className: 'info-label' }, 'Delivery Address'),
            createElement('div', { className: 'info-value' }, currentOrder.deliveryAddress)
        ]) : null,
        currentOrder.notes ? createElement('div', { style: { marginTop: '1rem' } }, [
            createElement('div', { className: 'info-label' }, 'Notes'),
            createElement('div', { className: 'info-value' }, currentOrder.notes)
        ]) : null
    ].filter(Boolean));

    contentFragment.appendChild(orderInfoSection);
    contentFragment.appendChild(createElement('div', { className: 'divider' }));
    contentFragment.appendChild(createElement('div', { className: 'info-label', style: { marginBottom: '0.5rem' } }, 'Products'));

    const productsList = createElement('div', { id: 'orderProductsList' });
    renderOrderProducts(isPending, productsList);
    contentFragment.appendChild(productsList);

    if (orderInvoices.length > 0) {
        contentFragment.appendChild(createElement('div', { className: 'divider' }));
        contentFragment.appendChild(createElement('div', { className: 'info-label', style: { marginBottom: '0.5rem' } }, 'Invoices'));

        const invoicesList = createElement('div', { className: 'invoices-list' });
        orderInvoices.forEach(inv => {
            const date = new Date(inv.generatedAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
            const item = createElement('div', {
                className: 'invoice-item',
                onclick: () => window.downloadInvoice(inv.invoiceNumber)
            }, [
                createElement('div', { className: 'invoice-info' }, [
                    createElement('div', { className: 'invoice-number' }, inv.invoiceNumber),
                    createElement('div', { className: 'invoice-meta' }, `${inv.firm?.name || 'Unknown Firm'} • ${date}`)
                ]),
                createElement('div', { className: 'invoice-download' }, [])
            ]);
            item.querySelector('.invoice-download').innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>`;
            invoicesList.appendChild(item);
        });
        contentFragment.appendChild(invoicesList);
    }

    bodyEl.appendChild(contentFragment);

    footerEl.innerHTML = '';
    if (isPending) {
        footerEl.appendChild(createElement('button', {
            className: 'btn btn-secondary',
            onclick: () => closeOrderModal()
        }, 'Cancel'));

        footerEl.appendChild(createElement('button', {
            className: 'btn btn-primary',
            style: { flex: '1' },
            onclick: () => saveOrderEdit()
        }, 'Save Changes'));
    } else {
        footerEl.appendChild(createElement('button', {
            className: 'btn btn-primary btn-block',
            onclick: () => closeOrderModal()
        }, 'Close'));
    }
}

function renderOrderProducts(editable, container) {
    if (!container) return;
    container.innerHTML = '';

    editedProducts.forEach((item, index) => {
        if (editable) {
            container.appendChild(createElement('div', {
                className: 'product-item-edit',
                dataset: { index: index }
            }, [
                createElement('div', { className: 'product-info' }, [
                    createElement('div', { className: 'product-name' }, item.productName),
                    createElement('div', { className: 'product-meta' }, item.unit)
                ]),
                createElement('div', { className: 'qty-controls' }, [
                    createElement('button', {
                        className: 'qty-btn',
                        onclick: () => changeOrderQty(index, -1)
                    }, '−'),
                    createElement('input', {
                        type: 'number',
                        className: 'qty-input',
                        id: `order-qty-${index}`,
                        value: item.quantity,
                        min: '0',
                        inputmode: 'numeric',
                        onchange: () => updateOrderQtyFromInput(index)
                    }),
                    createElement('button', {
                        className: 'qty-btn',
                        onclick: () => changeOrderQty(index, 1)
                    }, '+')
                ])
            ]));
        } else {
            container.appendChild(createElement('div', {
                className: 'product-item-edit readonly'
            }, [
                createElement('div', { className: 'product-info' }, [
                    createElement('div', { className: 'product-name' }, item.productName),
                    createElement('div', { className: 'product-meta' }, `${item.quantity} ${item.unit}`)
                ])
            ]));
        }
    });
}

function changeOrderQty(index, delta) {
    const input = document.getElementById(`order-qty-${index}`);
    let val = parseFloat(input.value) || 0;
    val = Math.max(0, val + delta);
    input.value = val;
    editedProducts[index].quantity = val;
    _orderFormDirty = true;
}

function updateOrderQtyFromInput(index) {
    const input = document.getElementById(`order-qty-${index}`);
    const val = Math.max(0, parseFloat(input.value) || 0);
    input.value = val;
    editedProducts[index].quantity = val;
    _orderFormDirty = true;
}

async function saveOrderEdit() {
    try {
        const products = editedProducts
            .filter(p => p.quantity > 0)
            .map(p => ({
                product: typeof p.product === 'object' ? p.product._id : p.product,
                quantity: p.quantity
            }));

        if (!products.length) {
            showToast('Add at least one product', 'info');
            return;
        }

        const saveBtn = document.querySelector('#orderModalFooter .btn-primary');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
        }

        const headers = { 'Content-Type': 'application/json' };
        const csrfToken = await Auth.ensureCsrfToken();
        if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

        const payload = { products };

        let res = await fetch(`/api/orders/${currentOrder._id}/customer-edit`, {
            method: 'PUT',
            headers,
            credentials: 'include',
            body: JSON.stringify(payload)
        });

        let data = await res.json();

        if (res.status === 403 && data?.message?.toLowerCase().includes('csrf')) {
            const newToken = await Auth.refreshCsrfToken();
            if (newToken) {
                headers['X-CSRF-Token'] = newToken;
                res = await fetch(`/api/orders/${currentOrder._id}/customer-edit`, {
                    method: 'PUT',
                    headers,
                    credentials: 'include',
                    body: JSON.stringify(payload)
                });
                data = await res.json();
            }
        }

        if (res.ok) {
            showToast('Order updated successfully', 'success');
            _orderFormDirty = false;
            closeOrderModal();
            if (_onSaveCallback) _onSaveCallback();
            return { success: true };
        } else {
            showToast(data.message || 'Could not update', 'info');
            return { success: false };
        }
    } catch (e) {
        console.error('Order edit error:', e);
        if (!navigator.onLine) {
            showToast('No internet connection', 'info');
        } else {
            showToast('Could not update. Try again.', 'info');
        }
        return { success: false };
    } finally {
        const saveBtn = document.querySelector('#orderModalFooter .btn-primary');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
        }
    }
}

export async function downloadInvoice(invoiceNumber) {
    try {
        showToast('Downloading invoice...', 'info');

        const res = await fetch(`/api/invoices/my/${invoiceNumber}/download`, {
            credentials: 'include'
        });

        if (!res.ok) {
            let errorMessage = 'Invoice not ready yet';
            try {
                const error = await res.json();
                errorMessage = error.message || errorMessage;
            } catch (parseError) {
                console.warn('Failed to parse invoice download error:', parseError.message);
                errorMessage = res.status === 404 ? 'Invoice not ready yet' :
                    res.status === 403 ? 'Invoice access pending' :
                        'Invoice temporarily unavailable';
            }
            throw new Error(errorMessage);
        }

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${invoiceNumber}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        showToast('Invoice downloaded!', 'success');
    } catch (e) {
        console.error('Download invoice error:', e);
        showToast(e.message || 'Could not download', 'info');
    }
}
