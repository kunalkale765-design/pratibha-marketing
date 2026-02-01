import { showToast, createElement } from '/js/ui.js';
import { waitForAuth } from '/js/helpers/auth-wait.js';

// Import helpers
import {
    setAuth as setInvoiceAuth, printOrder as _printOrder, selectFirm, toggleInvoiceItem as _toggleInvoiceItem,
    generateInvoice, closeInvoiceModal, downloadDeliveryBill as _downloadDeliveryBill, checkInvoicesExist
} from '/js/helpers/orders-invoice.js';
import {
    setAuth as setPackingAuth, openPackingPanel, togglePackedItem, handlePackingQtyChange,
    completePackingSession as _completePackingSession, closePackingPanel
} from '/js/helpers/orders-packing.js';
import {
    getAddedProducts, resetAddedProducts, addProductToOrder as _addProductToOrder,
    renderAddedProducts, changeAddedQty as _changeAddedQty,
    handleAddedQtyChange as _handleAddedQtyChange, handleAddedQtyInput as _handleAddedQtyInput,
    handleAddedPriceChange as _handleAddedPriceChange, removeAddedProduct as _removeAddedProduct
} from '/js/helpers/orders-added-products.js';

const Auth = await waitForAuth();
setInvoiceAuth(Auth);
setPackingAuth(Auth);

let orders = [];
const marketRates = {};
let allProducts = [];
let currentFilter = 'all';
let currentOrderId = null;
let currentOrder = null;
let currentUser = null;
let priceChanges = {};
let quantityChanges = {};
let isSaving = false;
let isDeleting = false;
let globalListenersInitialized = false;

async function init() {
    currentUser = await Auth.requireAuth();
    if (!currentUser) return;

    if (currentUser.role === 'customer') {
        const footer = document.getElementById('modalFooter');
        if (footer) footer.style.display = 'none';
    }

    initGlobalListeners();
    await Promise.all([loadOrders(), loadMarketRates(), loadProducts()]);
    setupFilters();
    setupSearch();
    handleDeepLink();
}

function handleDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('order');
    const action = params.get('action');

    if (orderId) {
        window.history.replaceState({}, '', window.location.pathname);
        if (action === 'pack') {
            openPackingPanel(orderId);
        } else {
            viewOrder(orderId);
        }
    }
}

function initGlobalListeners() {
    if (globalListenersInitialized) return;
    globalListenersInitialized = true;

    const container = document.getElementById('ordersList');
    if (!container) return;

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.swipe-item')) {
            document.querySelectorAll('.swipe-item.swiped, .swipe-item.swiped-single').forEach(item => {
                item.classList.remove('swiped', 'swiped-single');
            });
        }
    });

    let touchState = { startX: 0, isDragging: false, currentItem: null };

    container.addEventListener('touchstart', (e) => {
        const swipeItem = e.target.closest('.swipe-item');
        if (!swipeItem) return;
        touchState = { startX: e.touches[0].clientX, isDragging: true, currentItem: swipeItem };
        document.querySelectorAll('.swipe-item.swiped, .swipe-item.swiped-single').forEach(item => {
            if (item !== swipeItem) item.classList.remove('swiped', 'swiped-single');
        });
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
        if (!touchState.isDragging || !touchState.currentItem) return;
        const diff = touchState.startX - e.touches[0].clientX;
        const actionCount = touchState.currentItem.querySelectorAll('.swipe-action').length;
        if (diff > 50) {
            touchState.currentItem.classList.remove('swiped-single', 'swiped');
            touchState.currentItem.classList.add(actionCount === 1 ? 'swiped-single' : 'swiped');
        } else if (diff < -20) {
            touchState.currentItem.classList.remove('swiped', 'swiped-single');
        }
    }, { passive: true });

    container.addEventListener('touchend', () => {
        touchState.isDragging = false;
        touchState.currentItem = null;
    }, { passive: true });

    let mouseState = { startX: 0, isDragging: false, currentItem: null };

    container.addEventListener('mousedown', (e) => {
        const swipeItem = e.target.closest('.swipe-item');
        if (!swipeItem) return;
        if (e.target.closest('button')) return;
        mouseState = { startX: e.clientX, isDragging: true, currentItem: swipeItem };
        document.querySelectorAll('.swipe-item.swiped, .swipe-item.swiped-single').forEach(item => {
            if (item !== swipeItem) item.classList.remove('swiped', 'swiped-single');
        });
    });

    container.addEventListener('mousemove', (e) => {
        if (!mouseState.isDragging || !mouseState.currentItem) return;
        const diff = mouseState.startX - e.clientX;
        const actionCount = mouseState.currentItem.querySelectorAll('.swipe-action').length;
        if (diff > 50) {
            mouseState.currentItem.classList.remove('swiped-single', 'swiped');
            mouseState.currentItem.classList.add(actionCount === 1 ? 'swiped-single' : 'swiped');
        } else if (diff < -20) {
            mouseState.currentItem.classList.remove('swiped', 'swiped-single');
        }
    });

    container.addEventListener('mouseup', () => { mouseState.isDragging = false; mouseState.currentItem = null; });
    container.addEventListener('mouseleave', () => { mouseState.isDragging = false; mouseState.currentItem = null; });

    const orderModal = document.getElementById('orderModal');
    if (orderModal) {
        orderModal.onclick = (e) => { if (e.target.id === 'orderModal') closeModal(); };
    }

    const invoiceModal = document.getElementById('invoiceModal');
    if (invoiceModal) {
        invoiceModal.onclick = (e) => { if (e.target.id === 'invoiceModal') closeInvoiceModal(); };
    }
}

async function loadMarketRates() {
    try {
        const res = await fetch('/api/market-rates', { credentials: 'include' });
        if (res.status === 401) { window.location.href = '/pages/auth/login.html'; return; }
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data = await res.json();
        (data.data || []).forEach(r => {
            const pid = typeof r.product === 'object' ? r.product._id : r.product;
            marketRates[pid] = r.rate;
        });
    } catch (e) {
        console.error('Failed to load market rates:', e);
        showDataLoadWarning('market-rates', 'Market rates may be outdated');
    }
}

async function loadProducts() {
    try {
        const res = await fetch('/api/products', { credentials: 'include' });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data = await res.json();
        allProducts = (data.data || []).filter(p => p.isActive !== false);
    } catch (e) {
        console.error('Failed to load products:', e);
        showDataLoadWarning('products', 'Product list unavailable');
    }
}

function showDataLoadWarning(type, message) {
    if (document.querySelector(`.data-warning[data-type="${type}"]`)) return;
    const warning = createElement('div', {
        className: 'data-warning',
        dataset: { type: type },
        style: {
            background: 'var(--warning, #b89a5a)', color: 'white', padding: '0.5rem 1rem',
            fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem'
        }
    }, [
        createElement('span', {}, `⚠️ ${message}`),
        createElement('button', {
            style: { background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1rem', padding: '0 0.25rem' },
            onclick: (e) => { e.target.closest('.data-warning').remove(); }
        }, '×')
    ]);
    const container = document.getElementById('ordersList');
    if (container && container.parentElement) {
        container.parentElement.insertBefore(warning, container);
    }
}

async function loadOrders() {
    try {
        const res = await fetch('/api/orders?limit=100', { credentials: 'include' });
        if (res.status === 401) { window.location.href = '/pages/auth/login.html'; return; }
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Orders temporarily unavailable');
        orders = data.data || [];
        const invalidOrders = orders.filter(o => !o._id || !/^[a-f\d]{24}$/i.test(o._id));
        if (invalidOrders.length > 0) {
            console.warn('Orders with invalid IDs:', invalidOrders.map(o => ({ orderNumber: o.orderNumber, _id: o._id })));
        }
        renderOrders();
    } catch (e) {
        console.error('Failed to load orders:', e);
        if (!orders || orders.length === 0) {
            const container = document.getElementById('ordersList');
            const errorMsg = !navigator.onLine ? 'No internet connection' : 'Orders not available';
            container.innerHTML = '';
            container.appendChild(createElement('div', { className: 'empty-state' }, [
                createElement('p', {}, errorMsg),
                createElement('button', {
                    id: 'retryOrdersBtn',
                    style: { marginTop: '1rem', padding: '0.5rem 1rem', background: 'var(--dusty-olive)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' },
                    onclick: loadOrders
                }, 'Try Again')
            ]));
        }
    }
}

function getInitials(name) {
    if (!name) return '?';
    const words = name.trim().split(/\s+/);
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function renderOrders() {
    const container = document.getElementById('ordersList');
    if (!container) return;

    const searchInput = document.getElementById('searchInput');
    const search = searchInput ? searchInput.value.toLowerCase() : '';
    const isAdmin = currentUser?.role === 'admin';
    const isStaff = currentUser?.role === 'admin' || currentUser?.role === 'staff';

    let filtered = orders.filter(o => o._id && /^[a-f\d]{24}$/i.test(o._id));

    if (currentFilter === 'all') {
        filtered = filtered.filter(o => o.status !== 'cancelled');
    } else {
        filtered = filtered.filter(o => o.status === currentFilter);
    }

    if (search) {
        filtered = filtered.filter(o =>
            o.orderNumber?.toLowerCase().includes(search) ||
            o.customer?.name?.toLowerCase().includes(search)
        );
    }

    if (!filtered.length) {
        container.innerHTML = '';
        container.appendChild(createElement('div', { className: 'empty-state' }, 'No orders found'));
        return;
    }

    container.innerHTML = '';
    const fragment = document.createDocumentFragment();

    filtered.forEach((o, idx) => {
        let batchBadge = null;
        if (o.batch?.batchType) {
            batchBadge = createElement('span', { className: 'badge badge-batch' }, o.batch.batchType);
        }

        let packingBadge = null;
        if (isStaff && o.status === 'confirmed') {
            if (o.packingDone) {
                packingBadge = createElement('span', { className: 'packing-status-badge status-packed' }, '✓ Packed');
            } else {
                packingBadge = createElement('span', { className: 'packing-status-badge status-ready' }, 'Ready');
            }
        }

        const swipeContent = createElement('div', {
            className: 'swipe-content',
            onclick: () => window.viewOrder(o._id)
        }, [
            createElement('div', { className: 'order-avatar' }, getInitials(o.customer?.name)),
            createElement('div', { className: 'order-info' }, [
                createElement('div', { className: 'order-customer' }, o.customer?.name || 'Unknown'),
                o.notes ? createElement('div', { className: 'order-notes' }, o.notes) : null,
                createElement('div', { className: 'order-meta-row' }, [
                    createElement('span', { className: 'order-number' }, `Order #${o.orderNumber}`),
                    batchBadge,
                    packingBadge
                ])
            ]),
            createElement('div', { className: 'order-amount-pill' }, `₹${(o.totalAmount || 0).toLocaleString('en-IN')}`)
        ]);

        const actions = [];
        const canPack = isStaff && o.status === 'confirmed' && !o.packingDone;
        if (canPack) {
            actions.push(createElement('button', {
                className: 'swipe-action pack',
                onclick: (e) => { e.stopPropagation(); window.openPackingPanel(o._id); }
            }, 'Pack'));
        }
        const canDownloadBill = isStaff && o.status === 'confirmed' && o.batch;
        if (canDownloadBill) {
            actions.push(createElement('button', {
                className: 'swipe-action bill',
                onclick: (e) => { e.stopPropagation(); window.downloadDeliveryBill(o._id, o.batch?._id || o.batch); }
            }, 'Bill'));
        }
        if (isAdmin) {
            actions.push(createElement('button', {
                className: 'swipe-action delete',
                onclick: (e) => { e.stopPropagation(); window.deleteOrder(o._id); }
            }, 'Delete'));
        }
        const swipeActions = createElement('div', { className: 'swipe-actions' }, actions);

        let actionCountClass = '';
        if (actions.length === 1) actionCountClass = 'single-action';
        else if (actions.length === 2) actionCountClass = 'two-actions';

        const card = createElement('div', {
            className: `swipe-item card-fade-in ${actionCountClass}`.trim(),
            dataset: { orderId: o._id },
            style: { animationDelay: `${idx * 0.05}s` }
        }, [swipeContent, swipeActions]);

        fragment.appendChild(card);
    });

    container.appendChild(fragment);
}

function setupFilters() {
    const segmentControl = document.getElementById('filterSegments');
    const indicator = document.getElementById('segmentIndicator');
    const buttons = segmentControl.querySelectorAll('.segment-btn');

    function moveIndicator(btn) {
        const controlRect = segmentControl.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();
        indicator.style.left = (btnRect.left - controlRect.left) + 'px';
        indicator.style.width = btnRect.width + 'px';
    }

    const activeBtn = segmentControl.querySelector('.segment-btn.active');
    if (activeBtn) setTimeout(() => moveIndicator(activeBtn), 10);

    buttons.forEach(btn => {
        btn.onclick = () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            moveIndicator(btn);
            currentFilter = btn.dataset.filter;
            const container = document.getElementById('ordersList');
            container.classList.add('segment-content');
            renderOrders();
            setTimeout(() => container.classList.remove('segment-content'), 300);
        };
    });

    window.addEventListener('resize', () => {
        const active = segmentControl.querySelector('.segment-btn.active');
        if (active) moveIndicator(active);
    });
}

function debounce(fn, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(renderOrders, 200));
    }
}

function printFromModal() {
    if (!currentOrderId) return;
    const orderId = currentOrderId;
    closeModal();
    _printOrder(orderId, currentUser);
}

async function deleteOrder(orderId) {
    if (isDeleting) return;
    if (currentUser?.role !== 'admin') return;
    if (!confirm('Are you sure you want to delete this order? This action cannot be undone.')) return;

    isDeleting = true;
    const item = document.querySelector(`.swipe-item[data-order-id="${orderId}"]`);

    try {
        const headers = { 'Content-Type': 'application/json' };
        const csrfToken = await Auth.ensureCsrfToken();
        if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

        const res = await fetch(`/api/orders/${orderId}`, { method: 'DELETE', headers, credentials: 'include' });

        if (res.ok) {
            if (item) {
                item.classList.add('deleting');
                setTimeout(() => loadOrders(), 300);
            } else {
                loadOrders();
            }
            showToast('Order cancelled', 'success');
        } else {
            const errData = await res.json().catch(() => ({ message: 'Could not cancel. Try again.' }));
            showToast(errData.message || 'Could not cancel', 'info');
        }
    } catch (e) {
        console.error('Delete order error:', e);
        showToast('Could not delete order', 'info');
    } finally {
        isDeleting = false;
    }
}

async function viewOrder(id) {
    if (isSaving) {
        showToast('Please wait, saving in progress...', 'info');
        return;
    }

    try {
        const res = await fetch(`/api/orders/${id}`, { credentials: 'include' });

        let data;
        try {
            data = await res.json();
        } catch (parseError) {
            console.error('Failed to parse order response:', parseError);
            showToast('Server issue. Please refresh.', 'info');
            return;
        }

        if (!res.ok) {
            showToast(data?.message || 'Could not load order', 'info');
            return;
        }

        const order = data.data;
        if (!order || !order.products) {
            showToast('Order data updating. Refresh page.', 'info');
            return;
        }

        currentOrderId = id;
        currentOrder = order;
        priceChanges = {};
        quantityChanges = {};
        resetAddedProducts();

        const modalTitle = document.getElementById('modalTitle');
        if (modalTitle) modalTitle.textContent = `#${order.orderNumber}`;

        const saveBtn = document.getElementById('savePricesBtn');
        if (saveBtn) saveBtn.disabled = true;

        const isStaff = currentUser.role === 'admin' || currentUser.role === 'staff';

        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = '';

        const fragment = document.createDocumentFragment();

        // Customer Info Row
        fragment.appendChild(createElement('div', { className: 'info-row' }, [
            createElement('div', {}, [
                createElement('div', { className: 'info-label' }, 'Customer'),
                createElement('div', { className: 'info-value' }, order.customer?.name || '')
            ]),
            createElement('div', {}, [
                createElement('div', { className: 'info-label' }, 'Phone'),
                createElement('div', { className: 'info-value' }, order.customer?.phone || '-')
            ])
        ]));

        // Date and Batch Row
        const batchBadge = order.batch?.batchType
            ? createElement('span', { className: 'badge badge-batch' }, order.batch.batchType)
            : '-';

        fragment.appendChild(createElement('div', { className: 'info-row' }, [
            createElement('div', {}, [
                createElement('div', { className: 'info-label' }, 'Date'),
                createElement('div', { className: 'info-value' }, new Date(order.createdAt).toLocaleDateString('en-IN'))
            ]),
            createElement('div', {}, [
                createElement('div', { className: 'info-label' }, 'Batch'),
                createElement('div', { className: 'info-value' }, Array.isArray(batchBadge) ? batchBadge : [batchBadge])
            ])
        ]));

        // Status Row
        fragment.appendChild(createElement('div', { className: 'info-row' }, [
            createElement('div', {}, [
                createElement('div', { className: 'info-label' }, 'Status'),
                createElement('div', { className: 'info-value' }, [
                    createElement('span', { className: `badge badge-${order.status}` }, order.status)
                ])
            ]),
            createElement('div', {})
        ]));

        // Products Section
        const infoSection = createElement('div', { className: 'info-section' });
        infoSection.appendChild(createElement('div', { className: 'info-label' }, 'Products'));

        order.products.forEach((p, idx) => {
            const productId = typeof p.product === 'object' ? p.product._id : p.product;
            const purchasePrice = marketRates[productId] || p.rate || null;
            const purchaseDisplay = purchasePrice ? `₹${purchasePrice.toLocaleString('en-IN')}` : 'N/A';

            let qtyDisplay;
            if (isStaff) {
                const qtyInput = createElement('input', {
                    type: 'number',
                    className: 'qty-input-sm input-animated',
                    id: `quantity-${idx}`,
                    value: p.quantity,
                    min: '0',
                    step: '0.01',
                    dataset: { idx: idx, original: p.quantity, unit: p.unit },
                    onfocus: (e) => window.clearZero(e.target),
                    onblur: (e) => window.restoreValue(e.target),
                    onchange: () => window.handleQuantityChange(idx),
                    oninput: () => window.handleQuantityInput(idx)
                });

                qtyDisplay = createElement('div', { className: 'qty-controls-inline' }, [
                    createElement('button', { className: 'qty-btn-sm', type: 'button', onclick: () => window.changeQuantity(idx, -1) }, '−'),
                    qtyInput,
                    createElement('button', { className: 'qty-btn-sm', type: 'button', onclick: () => window.changeQuantity(idx, 1) }, '+'),
                    createElement('span', { className: 'qty-unit' }, p.unit)
                ]);
            } else {
                qtyDisplay = createElement('div', { className: 'product-qty' }, `${p.quantity} ${p.unit}`);
            }

            const sellingLabelChildren = ['Selling'];
            if (p.isContractPrice) {
                sellingLabelChildren.push(' ');
                sellingLabelChildren.push(createElement('span', { className: 'contract-badge' }, 'Fixed'));
            }

            let sellingDisplay;
            if (isStaff) {
                const priceInput = createElement('input', {
                    type: 'number',
                    className: `price-input input-animated${p.isContractPrice ? ' contract-locked' : ''}`,
                    id: `price-${idx}`,
                    value: p.rate,
                    min: '0',
                    step: '0.01',
                    dataset: { idx: idx, original: p.rate, qty: p.quantity, contract: p.isContractPrice || false },
                    onfocus: (e) => window.clearZero(e.target),
                    onblur: (e) => window.restoreValue(e.target),
                    onchange: () => window.handlePriceChange(idx),
                    oninput: () => window.handlePriceInput(idx)
                });
                if (p.isContractPrice) {
                    priceInput.disabled = true;
                    priceInput.title = 'Contract price - edit in customer management';
                }
                sellingDisplay = priceInput;
            } else {
                sellingDisplay = createElement('div', { className: 'price-value' }, `₹${p.rate}`);
            }

            infoSection.appendChild(createElement('div', { className: 'product-item', dataset: { idx: idx } }, [
                createElement('div', { className: 'product-top' }, [
                    createElement('div', {}, [
                        createElement('div', { className: 'product-name' }, p.productName),
                        qtyDisplay
                    ])
                ]),
                createElement('div', { className: 'prices-container' }, [
                    createElement('div', { className: 'price-box' }, [
                        createElement('div', { className: 'price-label' }, 'Purchase'),
                        createElement('div', { className: 'price-value' }, purchaseDisplay)
                    ]),
                    createElement('div', { className: 'price-box' }, [
                        createElement('div', { className: 'price-label' }, sellingLabelChildren),
                        sellingDisplay
                    ])
                ]),
                createElement('div', { className: 'amount-row' }, [
                    createElement('span', { className: 'amount-label' }, 'Amount'),
                    createElement('span', { className: 'amount-display', id: `amount-${idx}` }, `₹${p.amount}`)
                ])
            ]));
        });

        // Added Products Container
        infoSection.appendChild(createElement('div', { id: 'addedProductsContainer' }));

        // Add Product Section (Staff Only)
        if (isStaff) {
            const productOptions = [createElement('option', { value: '' }, '+ Add Product...')];
            allProducts
                .filter(p => !order.products.some(op => (typeof op.product === 'object' ? op.product._id : op.product) === p._id))
                .forEach(p => {
                    productOptions.push(createElement('option', {
                        value: p._id,
                        dataset: { name: p.name, unit: p.unit }
                    }, `${p.name} (${p.unit})`));
                });

            infoSection.appendChild(createElement('div', { className: 'add-product-section' }, [
                createElement('select', {
                    id: 'productSelector',
                    className: 'product-select',
                    onchange: () => window.addProductToOrder()
                }, productOptions)
            ]));
        }

        fragment.appendChild(infoSection);

        // Total Section
        fragment.appendChild(createElement('div', { className: 'total-section' }, [
            createElement('div', { className: 'total-row' }, [
                createElement('span', {}, 'Total'),
                createElement('span', { id: 'orderTotal' }, `₹${order.totalAmount}`)
            ]),
            createElement('div', { className: 'total-row' }, [
                createElement('span', {}, 'Paid'),
                createElement('span', {}, `₹${order.paidAmount || 0}`)
            ]),
            createElement('div', { className: 'total-row main' }, [
                createElement('span', {}, 'Balance'),
                createElement('span', { id: 'orderBalance' }, `₹${order.totalAmount - (order.paidAmount || 0)}`)
            ])
        ]));

        modalBody.appendChild(fragment);

        // Dynamic Footer Actions
        if (isStaff) {
            const footer = document.getElementById('modalFooter');
            if (footer) {
                footer.innerHTML = '';

                footer.appendChild(createElement('button', {
                    className: 'btn-modal secondary btn-animated',
                    onclick: () => window.printFromModal()
                }, createElement('span', { className: 'btn-text' }, 'Invoice')));

                if (order.status === 'pending') {
                    footer.appendChild(createElement('button', {
                        className: 'btn-modal primary btn-animated status-action-btn',
                        style: { background: 'var(--dusty-olive)', color: 'white', flex: '1.5' },
                        onclick: () => window.updateOrderStatus(order._id, 'confirmed')
                    }, 'Confirm Order'));
                } else if (order.status === 'confirmed' && order.packingDone) {
                    footer.appendChild(createElement('button', {
                        className: 'btn-modal primary btn-animated status-action-btn',
                        style: { background: 'var(--gunmetal)', color: 'white', flex: '1.5' },
                        onclick: () => window.updateOrderStatus(order._id, 'delivered')
                    }, 'Mark Delivered'));
                }

                if (order.status === 'confirmed' && !order.packingDone) {
                    footer.appendChild(createElement('button', {
                        className: 'btn-modal secondary btn-animated',
                        style: { background: 'var(--dusty-olive)', color: 'white', border: 'none' },
                        onclick: () => { window.closeModal(); setTimeout(() => window.openPackingPanel(order._id), 200); }
                    }, 'Start Packing'));
                }

                footer.appendChild(createElement('button', {
                    className: 'btn-save-prices btn-animated',
                    id: 'savePricesBtn',
                    disabled: true,
                    onclick: () => window.savePrices()
                }, createElement('span', { className: 'btn-text' }, 'Save')));
            }
        }

        document.getElementById('orderModal').classList.add('show');
    } catch (err) {
        console.error('Error in viewOrder:', err);
        currentOrder = null;
        currentOrderId = null;
        const modal = document.getElementById('orderModal');
        if (modal) modal.classList.remove('show');

        if (!navigator.onLine) {
            showToast('No internet connection. Check your network.', 'error');
        } else if (err.message?.includes('401') || err.message?.includes('403')) {
            showToast('Session expired. Please log in again.', 'error');
            setTimeout(() => { window.location.href = '/pages/auth/login.html'; }, 1500);
        } else if (err.message?.includes('404')) {
            showToast('Order not found. It may have been deleted.', 'error');
        } else if (err.message?.includes('500')) {
            showToast('Server error. Please try again in a moment.', 'error');
        } else {
            showToast('Could not load order. Please try again.', 'info');
        }
    }
}

function clearZero(input) {
    input.dataset.prevValue = input.value;
    input.value = '';
    input.select();
}

function restoreValue(input) {
    if (input.value === '') {
        input.value = input.dataset.prevValue || input.dataset.original;
    }
    const idx = parseInt(input.dataset.idx);
    handlePriceChange(idx);
}

function handlePriceInput(idx) {
    const input = document.getElementById(`price-${idx}`);
    if (!input) return;
    const qtyInput = document.getElementById(`quantity-${idx}`);
    const original = parseFloat(input.dataset.original);
    const current = parseFloat(input.value) || 0;
    const qty = qtyInput ? (parseFloat(qtyInput.value) || 0) : parseFloat(input.dataset.qty);

    input.classList.toggle('changed', current !== original);

    const amount = Math.round(current * qty * 100) / 100;
    const amountEl = document.getElementById(`amount-${idx}`);
    if (amountEl) amountEl.textContent = `₹${amount.toLocaleString('en-IN')}`;

    updateOrderTotal();
}

function handlePriceChange(idx) {
    const input = document.getElementById(`price-${idx}`);
    if (!input) return;
    const original = parseFloat(input.dataset.original);
    const current = parseFloat(input.value) || 0;

    if (current !== original && current > 0) {
        priceChanges[idx] = current;
    } else {
        delete priceChanges[idx];
    }
    updateSaveButtonState();
}

function changeQuantity(idx, delta) {
    const input = document.getElementById(`quantity-${idx}`);
    if (!input) return;

    const current = parseFloat(input.value) || 0;
    let newValue = current + delta;
    const minQty = 0.01;

    if (newValue < minQty && newValue > 0) newValue = 0;
    if (newValue < 0) newValue = 0;

    input.value = newValue;
    handleQuantityChange(idx);
    handleQuantityInput(idx);
}

function handleQuantityInput(idx) {
    const qtyInput = document.getElementById(`quantity-${idx}`);
    const priceInput = document.getElementById(`price-${idx}`);
    if (!qtyInput) return;

    const originalQty = parseFloat(qtyInput.dataset.original);
    const currentQty = parseFloat(qtyInput.value) || 0;

    qtyInput.classList.remove('changed', 'removed');
    if (currentQty === 0) {
        qtyInput.classList.add('removed');
    } else if (currentQty !== originalQty) {
        qtyInput.classList.add('changed');
    }

    const rate = priceInput ? (parseFloat(priceInput.value) || 0) : (currentOrder?.products[idx]?.rate || 0);
    const amount = Math.round(currentQty * rate * 100) / 100;
    const amountEl = document.getElementById(`amount-${idx}`);
    if (amountEl) amountEl.textContent = `₹${amount.toLocaleString('en-IN')}`;

    updateOrderTotal();
}

function handleQuantityChange(idx) {
    const input = document.getElementById(`quantity-${idx}`);
    if (!input) return;

    const original = parseFloat(input.dataset.original);
    const current = parseFloat(input.value) || 0;
    const minQty = 0.01;

    if (current > 0 && current < minQty) {
        showToast(`Minimum quantity: ${minQty} ${input.dataset.unit}`, 'info');
        input.value = original;
        delete quantityChanges[idx];
    } else if (current !== original) {
        quantityChanges[idx] = current;
    } else {
        delete quantityChanges[idx];
    }

    updateSaveButtonState();
    handleQuantityInput(idx);
}

function updateSaveButtonState() {
    const addedProducts = getAddedProducts();
    const hasChanges = Object.keys(priceChanges).length > 0 ||
        Object.keys(quantityChanges).length > 0 ||
        addedProducts.length > 0;
    const saveBtn = document.getElementById('savePricesBtn');
    if (saveBtn) saveBtn.disabled = !hasChanges;
}

function updateOrderTotal() {
    if (!currentOrder || !currentOrder.products) return;

    let total = 0;
    currentOrder.products.forEach((p, idx) => {
        const priceInput = document.getElementById(`price-${idx}`);
        const qtyInput = document.getElementById(`quantity-${idx}`);
        const rate = priceInput ? (parseFloat(priceInput.value) || 0) : p.rate;
        const quantity = qtyInput ? (parseFloat(qtyInput.value) || 0) : p.quantity;
        total += rate * quantity;
    });

    const addedProducts = getAddedProducts();
    addedProducts.forEach(p => {
        total += (p.quantity || 0) * (p.rate || 0);
    });

    total = Math.round(total * 100) / 100;
    const balance = Math.round((total - (currentOrder.paidAmount || 0)) * 100) / 100;

    const totalEl = document.getElementById('orderTotal');
    const balanceEl = document.getElementById('orderBalance');
    if (totalEl) totalEl.textContent = `₹${total.toLocaleString('en-IN')}`;
    if (balanceEl) balanceEl.textContent = `₹${balance.toLocaleString('en-IN')}`;
}

async function savePrices() {
    const addedProducts = getAddedProducts();
    const hasChanges = Object.keys(priceChanges).length > 0 ||
        Object.keys(quantityChanges).length > 0 ||
        addedProducts.length > 0;
    if (!currentOrderId || !currentOrder || !currentOrder.products || !hasChanges) return;

    if (isSaving) {
        showToast('Save in progress...', 'info');
        return;
    }

    isSaving = true;
    const btn = document.getElementById('savePricesBtn');
    if (btn) {
        btn.disabled = true;
        btn.classList.add('btn-loading');
    }

    let hasInvoices = false;
    const invoiceCheck = await checkInvoicesExist(currentOrderId);
    if (invoiceCheck.error) {
        const proceedAnyway = confirm(
            'Could not check if invoices exist for this order.\n\n' +
            'If invoices exist, they may need to be regenerated after saving. Continue?'
        );
        if (!proceedAnyway) {
            isSaving = false;
            if (btn) { btn.classList.remove('btn-loading'); btn.disabled = false; }
            return;
        }
    } else if (invoiceCheck.exists) {
        hasInvoices = true;
        const proceed = confirm(
            'Invoices exist for this order. Changes will not update existing invoices.\n\n' +
            'You may need to regenerate invoices after saving. Continue?'
        );
        if (!proceed) {
            isSaving = false;
            if (btn) { btn.classList.remove('btn-loading'); btn.disabled = false; }
            return;
        }
    }

    try {
        const existingProducts = currentOrder.products
            .map((p, idx) => {
                let price = priceChanges[idx] !== undefined ? priceChanges[idx] : p.rate;
                let quantity = quantityChanges[idx] !== undefined ? quantityChanges[idx] : p.quantity;
                if (!price || price <= 0) price = p.rate;
                if (quantity < 0) quantity = p.quantity;

                return {
                    product: typeof p.product === 'object' ? p.product._id : p.product,
                    quantity: quantity,
                    priceAtTime: price
                };
            })
            .filter(item => item.quantity > 0);

        const newProducts = addedProducts
            .filter(p => p.quantity > 0)
            .map(p => ({ product: p.product, quantity: p.quantity, priceAtTime: p.rate }));

        const updatedProducts = [...existingProducts, ...newProducts];

        const headers = { 'Content-Type': 'application/json' };
        const csrfToken = await Auth.ensureCsrfToken();
        if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

        const payload = { products: updatedProducts };
        const orderId = currentOrderId;

        let res = await fetch(`/api/orders/${orderId}`, {
            method: 'PUT', headers, credentials: 'include',
            body: JSON.stringify(payload)
        });

        if (res.status === 403) {
            let errData;
            try { errData = await res.json(); } catch (parseError) {
                console.warn('Failed to parse CSRF error response:', parseError.message);
                errData = { message: `Access denied (code: ${res.status})` };
            }

            if (errData.message?.toLowerCase().includes('csrf')) {
                const newToken = await Auth.refreshCsrfToken();
                if (newToken) {
                    headers['X-CSRF-Token'] = newToken;
                    res = await fetch(`/api/orders/${orderId}`, {
                        method: 'PUT', headers, credentials: 'include',
                        body: JSON.stringify(payload)
                    });
                    if (res.status === 403) {
                        showToast('Session expired. Please refresh the page.', 'info');
                        isSaving = false;
                        if (btn) { btn.classList.remove('btn-loading'); btn.disabled = false; }
                        return;
                    }
                } else {
                    showToast('Session expired. Please refresh the page.', 'info');
                    isSaving = false;
                    if (btn) { btn.classList.remove('btn-loading'); btn.disabled = false; }
                    return;
                }
            } else {
                showToast(errData.message || 'Access temporarily unavailable', 'info');
                isSaving = false;
                if (btn) { btn.classList.remove('btn-loading'); btn.disabled = false; }
                return;
            }
        }

        if (res.ok) {
            showToast('Changes saved', 'success');
            priceChanges = {};
            quantityChanges = {};
            resetAddedProducts();
            if (btn) {
                btn.classList.remove('btn-loading');
                btn.classList.add('btn-success');
                setTimeout(() => btn.classList.remove('btn-success'), 1500);
                btn.disabled = true;
            }
            loadOrders();

            if (hasInvoices) {
                setTimeout(() => {
                    if (confirm('Order updated. Regenerate invoice with new quantities?')) {
                        const orderIdToEdit = orderId;
                        closeModal();
                        setTimeout(() => _printOrder(orderIdToEdit, currentUser), 300);
                    }
                }, 500);
            }

            if (currentOrderId === orderId) {
                viewOrder(orderId);
            }
        } else {
            let errData;
            try { errData = await res.json(); } catch (parseError) {
                console.warn('Failed to parse order save error response:', parseError.message);
                errData = { message: `Server error (${res.status})` };
            }
            showToast(errData.message || 'Could not update', 'info');
            if (btn) btn.disabled = false;
        }
    } catch (e) {
        console.error('Save changes error:', e);
        if (!navigator.onLine) {
            showToast('No internet connection', 'info');
        } else {
            showToast('Could not save. Try again.', 'info');
        }
        if (btn) btn.disabled = false;
    } finally {
        isSaving = false;
        if (btn) btn.classList.remove('btn-loading');
    }
}

function closeModal() {
    const addedProducts = getAddedProducts();
    const hasChanges = Object.keys(priceChanges).length > 0 ||
        Object.keys(quantityChanges).length > 0 ||
        addedProducts.length > 0;
    if (hasChanges) {
        if (!confirm('You have unsaved changes. Discard them?')) return;
    }
    const orderModal = document.getElementById('orderModal');
    if (orderModal) orderModal.classList.remove('show');
    currentOrderId = null;
    currentOrder = null;
    priceChanges = {};
    quantityChanges = {};
    resetAddedProducts();
}

async function updateOrderStatus(orderId, newStatus) {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'staff')) return;

    const statusBtns = document.querySelectorAll('#modalBody .btn-confirm, #modalBody .btn-deliver');
    statusBtns.forEach(b => { b.disabled = true; b.classList.add('btn-loading'); });

    try {
        const headers = { 'Content-Type': 'application/json' };
        const csrfToken = await Auth.ensureCsrfToken();
        if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

        const res = await fetch(`/api/orders/${orderId}/status`, {
            method: 'PUT', headers, credentials: 'include',
            body: JSON.stringify({ status: newStatus })
        });

        const data = await res.json();

        if (res.ok) {
            showToast(`Order marked as ${newStatus}`, 'success');
            viewOrder(orderId);
            loadOrders();
        } else {
            showToast(data.message || 'Failed to update status', 'error');
            viewOrder(orderId);
        }
    } catch (error) {
        console.error('Status update error:', error);
        showToast('Network error updating status', 'error');
        viewOrder(orderId);
    } finally {
        statusBtns.forEach(b => { b.disabled = false; b.classList.remove('btn-loading'); });
    }
}

// Expose to window for onclick handlers
window.closeModal = closeModal;
window.viewOrder = viewOrder;
window.clearZero = clearZero;
window.restoreValue = restoreValue;
window.handlePriceChange = handlePriceChange;
window.handlePriceInput = handlePriceInput;
window.handleQuantityChange = handleQuantityChange;
window.handleQuantityInput = handleQuantityInput;
window.changeQuantity = changeQuantity;
window.savePrices = savePrices;
window.deleteOrder = deleteOrder;
window.updateOrderStatus = updateOrderStatus;
window.printFromModal = printFromModal;

// Invoice helpers (delegated)
window.printOrder = (orderId) => _printOrder(orderId, currentUser);
window.downloadDeliveryBill = (orderId, batchId) => _downloadDeliveryBill(orderId, batchId, currentUser);
window.closeInvoiceModal = closeInvoiceModal;
window.selectFirm = selectFirm;
window.toggleInvoiceItem = (_firmId, productId) => _toggleInvoiceItem(productId);
window.generateInvoice = generateInvoice;

// Packing helpers (delegated)
window.openPackingPanel = openPackingPanel;
window.closePackingPanel = closePackingPanel;
window.handlePackingQtyChange = handlePackingQtyChange;
window.completePackingSession = () => _completePackingSession(loadOrders);
window.togglePackedItem = togglePackedItem;

// Added product helpers (delegated with callbacks)
const onAddedProductUpdate = () => { updateOrderTotal(); updateSaveButtonState(); };
window.addProductToOrder = () => _addProductToOrder(allProducts, marketRates, currentOrder, { onUpdate: onAddedProductUpdate });
window.renderAddedProducts = renderAddedProducts;
window.changeAddedQty = (idx, delta) => _changeAddedQty(idx, delta, onAddedProductUpdate);
window.handleAddedQtyChange = (idx) => _handleAddedQtyChange(idx, onAddedProductUpdate);
window.handleAddedQtyInput = (idx) => _handleAddedQtyInput(idx, onAddedProductUpdate);
window.handleAddedPriceChange = (idx) => _handleAddedPriceChange(idx, onAddedProductUpdate);
window.removeAddedProduct = (idx) => _removeAddedProduct(idx, onAddedProductUpdate);

init();
