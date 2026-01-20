import { showToast, createElement } from '/js/ui.js';

// Wait for Auth to be available
const waitForAuth = () => new Promise((resolve) => {
    if (window.Auth) resolve(window.Auth);
    else setTimeout(() => resolve(waitForAuth()), 10);
});
const Auth = await waitForAuth();

let orders = [];
const marketRates = {};
let allProducts = []; // All available products for adding to orders
let addedProducts = []; // Newly added products (not yet saved)
let currentFilter = 'all';
let currentOrderId = null;
let currentOrder = null;
let currentUser = null;
let priceChanges = {};
let quantityChanges = {};
let isSaving = false; // Prevent concurrent saves

// Track if global listeners have been initialized (prevents memory leak)
let globalListenersInitialized = false;

// Packing panel state
let packingOrder = null;
let packingItems = [];
let isPackingPanelOpen = false;

async function init() {
    currentUser = await Auth.requireAuth();
    if (!currentUser) return;

    // Hide status controls for customers
    if (currentUser.role === 'customer') {
        const footer = document.getElementById('modalFooter');
        if (footer) footer.style.display = 'none';
    }

    // Initialize global event listeners ONCE
    initGlobalListeners();

    await Promise.all([loadOrders(), loadMarketRates(), loadProducts()]);
    setupFilters();
    setupSearch();

    // Handle deep links: /pages/orders/?order=<id>&action=pack
    handleDeepLink();
}

// Handle deep links from Packing Station or other pages
function handleDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('order');
    const action = params.get('action');

    if (orderId) {
        // Clear URL params without reload
        window.history.replaceState({}, '', window.location.pathname);

        if (action === 'pack') {
            // Open packing panel directly
            openPackingPanel(orderId);
        } else {
            // Open order detail modal
            viewOrder(orderId);
        }
    }
}

// Initialize listeners that should only be added once (not per render)
function initGlobalListeners() {
    if (globalListenersInitialized) return;
    globalListenersInitialized = true;

    const container = document.getElementById('ordersList');
    if (!container) return;

    // Close swipe items when tapping elsewhere (ONCE, not per render)
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.swipe-item')) {
            document.querySelectorAll('.swipe-item.swiped, .swipe-item.swiped-single').forEach(item => {
                item.classList.remove('swiped', 'swiped-single');
            });
        }
    });

    // Delegated touch handling for swipe gestures
    let touchState = { startX: 0, isDragging: false, currentItem: null };

    container.addEventListener('touchstart', (e) => {
        const swipeItem = e.target.closest('.swipe-item');
        if (!swipeItem) return;

        touchState = {
            startX: e.touches[0].clientX,
            isDragging: true,
            currentItem: swipeItem
        };

        // Close other open swipe items
        document.querySelectorAll('.swipe-item.swiped, .swipe-item.swiped-single').forEach(item => {
            if (item !== swipeItem) {
                item.classList.remove('swiped', 'swiped-single');
            }
        });
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
        if (!touchState.isDragging || !touchState.currentItem) return;

        const isAdmin = currentUser?.role === 'admin';
        const diff = touchState.startX - e.touches[0].clientX;

        if (diff > 50) {
            touchState.currentItem.classList.remove('swiped-single', 'swiped');
            touchState.currentItem.classList.add(isAdmin ? 'swiped' : 'swiped-single');
        } else if (diff < -20) {
            touchState.currentItem.classList.remove('swiped', 'swiped-single');
        }
    }, { passive: true });

    container.addEventListener('touchend', () => {
        touchState.isDragging = false;
        touchState.currentItem = null;
    }, { passive: true });

    // Close modal on overlay click
    const orderModal = document.getElementById('orderModal');
    if (orderModal) {
        orderModal.onclick = (e) => {
            if (e.target.id === 'orderModal') closeModal();
        };
    }

    // Close invoice modal on overlay click
    const invoiceModal = document.getElementById('invoiceModal');
    if (invoiceModal) {
        invoiceModal.onclick = (e) => {
            if (e.target.id === 'invoiceModal') closeInvoiceModal();
        };
    }
}

async function loadMarketRates() {
    try {
        const res = await fetch('/api/market-rates', { credentials: 'include' });
        if (!res.ok) {
            throw new Error(`Server returned ${res.status}`);
        }
        const data = await res.json();
        (data.data || []).forEach(r => {
            const pid = typeof r.product === 'object' ? r.product._id : r.product;
            marketRates[pid] = r.rate;
        });
    } catch (e) {
        // Silently fail - market rates are supplementary data
        console.error('Failed to load market rates:', e);
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
    }
}

async function loadOrders() {
    try {
        const res = await fetch('/api/orders?limit=100', { credentials: 'include' });
        if (!res.ok) {
            throw new Error(`Server returned ${res.status}`);
        }
        const data = await res.json();
        if (!data.success) {
            throw new Error(data.message || 'Orders temporarily unavailable');
        }
        orders = data.data || [];
        // Debug: Log any orders with missing or invalid IDs
        const invalidOrders = orders.filter(o => !o._id || !/^[a-f\d]{24}$/i.test(o._id));
        if (invalidOrders.length > 0) {
            console.warn('Orders with invalid IDs:', invalidOrders.map(o => ({ orderNumber: o.orderNumber, _id: o._id })));
        }
        renderOrders();
    } catch (e) {
        console.error('Failed to load orders:', e);
        // Show retry UI if no orders loaded yet
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
    if (words.length === 1) {
        return words[0].substring(0, 2).toUpperCase();
    }
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function renderOrders() {
    const container = document.getElementById('ordersList');
    if (!container) return;

    const searchInput = document.getElementById('searchInput');
    const search = searchInput ? searchInput.value.toLowerCase() : '';
    const isAdmin = currentUser?.role === 'admin';
    const isStaff = currentUser?.role === 'admin' || currentUser?.role === 'staff';

    // Filter out orders without valid _id first
    let filtered = orders.filter(o => o._id && /^[a-f\d]{24}$/i.test(o._id));

    // Filter by status
    if (currentFilter === 'all') {
        // "All" shows everything except cancelled (there's a dedicated Cancelled tab)
        filtered = filtered.filter(o => o.status !== 'cancelled');
    } else {
        filtered = filtered.filter(o => o.status === currentFilter);
    }

    // Filter by search
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

    // Clear container
    container.innerHTML = '';

    const fragment = document.createDocumentFragment();

    filtered.forEach((o, idx) => {
        // Batch Badge
        let batchBadge = null;
        if (o.batch?.batchType) {
            batchBadge = createElement('span', { className: 'badge badge-batch' }, [
                o.batch.batchType,
                o.batchLocked ? ' 🔒' : ''
            ]);
        }

        // Packing Status Badge - show for confirmed/processing orders
        let packingBadge = null;
        if (isStaff && ['confirmed', 'processing', 'packed'].includes(o.status)) {
            const packingStatus = o.packingDetails?.status || 'not_started';
            const packingProgress = o.packingProgress || { total: 0, verified: 0 };

            if (packingStatus === 'in_progress') {
                packingBadge = createElement('span', { className: 'packing-status-badge status-packing' },
                    `📦 ${packingProgress.verified}/${packingProgress.total}`);
            } else if (packingStatus === 'completed' || o.status === 'packed') {
                packingBadge = createElement('span', { className: 'packing-status-badge status-packed' }, '✓ Packed');
            } else if (packingStatus === 'on_hold') {
                packingBadge = createElement('span', { className: 'packing-status-badge status-on-hold' }, '⏸ Hold');
            } else if (['confirmed', 'processing'].includes(o.status)) {
                packingBadge = createElement('span', { className: 'packing-status-badge status-ready' }, 'Ready');
            }
        }

        // Swipe Content
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

        // Swipe Actions - add Pack action for packable orders
        const actions = [];
        const isPackable = isStaff && ['confirmed', 'processing'].includes(o.status);
        const packingStatus = o.packingDetails?.status || 'not_started';
        const canPack = isPackable && packingStatus !== 'completed';

        if (canPack) {
            const packLabel = packingStatus === 'in_progress' ? 'Resume' :
                             packingStatus === 'on_hold' ? 'Resume' : 'Pack';
            actions.push(createElement('button', {
                className: 'swipe-action pack',
                onclick: (e) => { e.stopPropagation(); window.openPackingPanel(o._id); }
            }, packLabel));
        }
        if (isStaff) {
            actions.push(createElement('button', {
                className: 'swipe-action edit',
                onclick: (e) => { e.stopPropagation(); window.printOrder(o._id); }
            }, 'Print'));
        }
        if (isAdmin) {
            actions.push(createElement('button', {
                className: 'swipe-action delete',
                onclick: (e) => { e.stopPropagation(); window.deleteOrder(o._id); }
            }, 'Delete'));
        }
        const swipeActions = createElement('div', { className: 'swipe-actions' }, actions);

        // Main Card
        const card = createElement('div', {
            className: 'swipe-item card-fade-in',
            dataset: { orderId: o._id },
            style: { animationDelay: `${idx * 0.05}s` }
        }, [swipeContent, swipeActions]);

        fragment.appendChild(card);
    });

    container.appendChild(fragment);
    // Swipe handlers are now initialized once in initGlobalListeners() using event delegation
}

function setupFilters() {
    const segmentControl = document.getElementById('filterSegments');
    const indicator = document.getElementById('segmentIndicator');
    const buttons = segmentControl.querySelectorAll('.segment-btn');

    // Function to move indicator to a button
    function moveIndicator(btn) {
        const controlRect = segmentControl.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();

        // Calculate position relative to the segment control
        const left = btnRect.left - controlRect.left;
        const width = btnRect.width;

        indicator.style.left = left + 'px';
        indicator.style.width = width + 'px';
    }

    // Initialize indicator position
    const activeBtn = segmentControl.querySelector('.segment-btn.active');
    if (activeBtn) {
        // Small delay to ensure layout is complete
        setTimeout(() => moveIndicator(activeBtn), 10);
    }

    // Handle clicks
    buttons.forEach(btn => {
        btn.onclick = () => {
            // Update active state
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Slide the indicator
            moveIndicator(btn);

            // Update filter and re-render with animation
            currentFilter = btn.dataset.filter;
            const container = document.getElementById('ordersList');
            container.classList.add('segment-content');
            renderOrders();

            // Remove animation class after it plays
            setTimeout(() => container.classList.remove('segment-content'), 300);
        };
    });

    // Recalculate on window resize
    window.addEventListener('resize', () => {
        const active = segmentControl.querySelector('.segment-btn.active');
        if (active) moveIndicator(active);
    });
}

// Debounce utility to prevent excessive function calls
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
        const debouncedRender = debounce(renderOrders, 200);
        searchInput.addEventListener('input', debouncedRender);
    }
}

// Invoice state
let invoiceData = null;
let selectedFirmId = null;
let selectedProductIds = new Set();

async function printOrder(orderId) {
    // Only staff/admin can print invoices
    if (currentUser?.role === 'customer') {
        showToast('Invoice printing is not available', 'info');
        return;
    }

    // Close swipe
    document.querySelectorAll('.swipe-item.swiped, .swipe-item.swiped-single').forEach(item => {
        item.classList.remove('swiped', 'swiped-single');
    });

    // Validate order ID before proceeding
    const isValidMongoId = /^[a-f\d]{24}$/i.test(orderId);
    if (!orderId || !isValidMongoId) {
        console.error('Invalid order ID:', orderId);
        showToast('Order data updating. Please refresh.', 'info');
        return;
    }

    // Show invoice modal with loading
    document.getElementById('invoiceModal').classList.add('show');
    document.getElementById('invoiceModal').classList.add('show');
    const modalBody = document.getElementById('invoiceModalBody');
    modalBody.innerHTML = '';
    modalBody.appendChild(createElement('div', { className: 'invoice-loading' }, 'Loading invoice data...'));
    const generateBtn = document.getElementById('generateInvoiceBtn');
    if (generateBtn) generateBtn.disabled = true;

    try {
        // Load firms list first
        await loadFirms();

        // Fetch split data from API
        const res = await fetch(`/api/invoices/${orderId}/split`, { credentials: 'include' });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || 'Invoice data temporarily unavailable');
        }
        const data = await res.json();
        invoiceData = data.data;

        // Set modal title
        document.getElementById('invoiceModalTitle').textContent = `Invoice for ${invoiceData.orderNumber}`;

        // Render firms and items
        renderInvoiceModal();
    } catch (error) {
        console.error('Print order error:', error);
        document.getElementById('invoiceModalBody').innerHTML = ''; // Clear loading
        document.getElementById('invoiceModalBody').appendChild(createElement('div', { className: 'invoice-no-items' }, [
            createElement('p', {}, 'Invoice data not available'),
            createElement('p', { style: { fontSize: '0.75rem', marginTop: '0.5rem' } }, error.message)
        ]));
    }
}

// All available firms (fetched once)
let allFirms = [];

async function loadFirms() {
    if (allFirms.length > 0) return;
    try {
        const res = await fetch('/api/invoices/firms', { credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            allFirms = data.data || [];
        }
    } catch (e) {
        console.error('Failed to load firms:', e);
    }
}

function renderInvoiceModal() {
    const modalBody = document.getElementById('invoiceModalBody');
    if (!invoiceData) {
        modalBody.innerHTML = '';
        modalBody.appendChild(createElement('div', { className: 'invoice-no-items' }, 'No items to invoice'));
        return;
    }

    // Get all items from all firms (flatten)
    const allItems = invoiceData.firms.flatMap(f => f.items);
    if (allItems.length === 0) {
        modalBody.innerHTML = '';
        modalBody.appendChild(createElement('div', { className: 'invoice-no-items' }, 'No items to invoice'));
        return;
    }

    // Auto-select first firm and all items if none selected
    if (!selectedFirmId) {
        selectedFirmId = allFirms.length > 0 ? allFirms[0].id : (invoiceData?.firms?.[0]?.firmId || 'pratibha');
        selectedProductIds = new Set(allItems.map(i => i.productId));
    }

    // Calculate selected total
    const selectedTotal = allItems
        .filter(i => selectedProductIds.has(i.productId))
        .reduce((sum, i) => sum + (i.amount || 0), 0);

    // Build firm selector
    const firmsToShow = allFirms.length > 0 ? allFirms : (invoiceData?.firms || []).map(f => ({ id: f.firmId, name: f.firmName }));

    modalBody.innerHTML = '';
    const fragment = document.createDocumentFragment();

    // Firm Selector
    const firmSelector = createElement('div', { className: 'invoice-firm-selector' }, [
        createElement('div', { className: 'info-label', style: { marginBottom: '0.5rem' } }, 'Select Firm'),
        createElement('div', { className: 'firm-options' }, firmsToShow.map(firm =>
            createElement('label', {
                className: `firm-option ${selectedFirmId === firm.id ? 'selected' : ''}`,
                onclick: () => window.selectFirm(firm.id)
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

    // Items Section
    fragment.appendChild(createElement('div', { className: 'info-label', style: { margin: '1rem 0 0.5rem' } }, 'Select Items'));
    fragment.appendChild(createElement('div', { className: 'invoice-items-list' }, allItems.map(item =>
        createElement('div', { className: 'invoice-item' }, [
            createElement('input', {
                type: 'checkbox',
                className: 'invoice-item-checkbox',
                dataset: { product: item.productId },
                checked: selectedProductIds.has(item.productId),
                onchange: () => window.toggleInvoiceItem(null, item.productId)
            }),
            createElement('div', { className: 'invoice-item-details' }, [
                createElement('div', { className: 'invoice-item-name' }, item.productName),
                createElement('div', { className: 'invoice-item-meta' }, `${item.quantity || 0} ${item.unit || ''} × ₹${(item.rate || 0).toLocaleString('en-IN')}`)
            ]),
            createElement('div', { className: 'invoice-item-amount' }, `₹${(item.amount || 0).toLocaleString('en-IN')}`)
        ])
    )));

    // Summary Section
    fragment.appendChild(createElement('div', { className: 'invoice-summary' }, [
        createElement('div', { className: 'invoice-summary-label' }, 'Total'),
        createElement('div', { className: 'invoice-summary-total' }, `₹${selectedTotal.toLocaleString('en-IN')}`)
    ]));

    modalBody.appendChild(fragment);
    const generateBtn = document.getElementById('generateInvoiceBtn');
    if (generateBtn) generateBtn.disabled = selectedProductIds.size === 0;
}

function selectFirm(firmId) {
    selectedFirmId = firmId;
    renderInvoiceModal();
}

function toggleInvoiceItem(firmId, productId) {
    if (selectedProductIds.has(productId)) {
        selectedProductIds.delete(productId);
    } else {
        selectedProductIds.add(productId);
    }
    renderInvoiceModal();
}

async function generateInvoice() {
    // Button should already be disabled if no items selected
    if (!invoiceData || !selectedFirmId || selectedProductIds.size === 0) {
        return;
    }

    const btn = document.getElementById('generateInvoiceBtn');
    btn.classList.add('btn-loading');
    btn.disabled = true;

    try {
        const headers = { 'Content-Type': 'application/json' };
        const csrfToken = await Auth.ensureCsrfToken();
        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

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

        // Download the PDF
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

function closeInvoiceModal() {
    document.getElementById('invoiceModal').classList.remove('show');
    invoiceData = null;
    selectedFirmId = null;
    selectedProductIds = new Set();
}

function printFromModal() {
    // Silently return if no order - button shouldn't be clickable without an order
    if (!currentOrderId) {
        return;
    }
    // Save the ID before closeModal clears it
    const orderId = currentOrderId;
    closeModal(); // Close order detail modal (this sets currentOrderId = null)
    printOrder(orderId); // Open invoice modal with saved ID
}

async function deleteOrder(orderId) {
    // Admin check - button should be hidden for non-admins anyway
    if (currentUser?.role !== 'admin') {
        return;
    }

    if (!confirm('Are you sure you want to delete this order? This action cannot be undone.')) {
        return;
    }

    const item = document.querySelector(`.swipe-item[data-order-id="${orderId}"]`);

    try {
        const headers = { 'Content-Type': 'application/json' };
        const csrfToken = await Auth.ensureCsrfToken();
        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        const res = await fetch(`/api/orders/${orderId}`, {
            method: 'DELETE',
            headers,
            credentials: 'include'
        });

        if (res.ok) {
            // Add delete animation then reload orders
            if (item) {
                item.classList.add('deleting');
                setTimeout(() => {
                    loadOrders(); // Reload from server
                }, 300);
            } else {
                loadOrders(); // Reload from server
            }
            showToast('Order cancelled', 'success');
        } else {
            const errData = await res.json().catch(() => ({ message: 'Could not cancel. Try again.' }));
            showToast(errData.message || 'Could not cancel', 'info');
        }
    } catch (e) {
        console.error('Delete order error:', e);
        showToast('Could not delete order', 'info');
    }
}

async function viewOrder(id) {
    // Prevent opening new order while saving is in progress
    if (isSaving) {
        showToast('Please wait, saving in progress...', 'info');
        return;
    }

    try {
        const res = await fetch(`/api/orders/${id}`, { credentials: 'include' });

        // Handle non-JSON responses
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
        addedProducts = [];

        const modalTitle = document.getElementById('modalTitle');
        if (modalTitle) modalTitle.textContent = `#${order.orderNumber}`;

        const saveBtn = document.getElementById('savePricesBtn');
        if (saveBtn) saveBtn.disabled = true;

        const isStaff = currentUser.role === 'admin' || currentUser.role === 'staff';

        const _batchInfo = order.batch?.batchType
            ? `<span class="badge badge-batch">${order.batch.batchType}${order.batchLocked ? ' 🔒' : ''}</span>`
            : '-';

        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = ''; // Clear existing content

        const fragment = document.createDocumentFragment();

        // Customer Info Row
        const infoRow1 = createElement('div', { className: 'info-row' }, [
            createElement('div', {}, [
                createElement('div', { className: 'info-label' }, 'Customer'),
                createElement('div', { className: 'info-value' }, order.customer?.name || '')
            ]),
            createElement('div', {}, [
                createElement('div', { className: 'info-label' }, 'Phone'),
                createElement('div', { className: 'info-value' }, order.customer?.phone || '-')
            ])
        ]);
        fragment.appendChild(infoRow1);

        // Date and Batch Row
        const batchBadge = order.batch?.batchType
            ? createElement('span', { className: 'badge badge-batch' }, [
                order.batch.batchType,
                order.batchLocked ? ' 🔒' : ''
            ])
            : '-';

        const infoRow2 = createElement('div', { className: 'info-row' }, [
            createElement('div', {}, [
                createElement('div', { className: 'info-label' }, 'Date'),
                createElement('div', { className: 'info-value' }, new Date(order.createdAt).toLocaleDateString('en-IN'))
            ]),
            createElement('div', {}, [
                createElement('div', { className: 'info-label' }, 'Batch'),
                createElement('div', { className: 'info-value' }, Array.isArray(batchBadge) ? batchBadge : [batchBadge])
            ])
        ]);
        fragment.appendChild(infoRow2);

        // Status Row
        const infoRow3 = createElement('div', { className: 'info-row' }, [
            createElement('div', {}, [
                createElement('div', { className: 'info-label' }, 'Status'),
                createElement('div', { className: 'info-value' }, [
                    createElement('span', { className: `badge badge-${order.status}` }, order.status)
                ])
            ]),
            createElement('div', {})
        ]);
        fragment.appendChild(infoRow3);

        // Products Section
        const infoSection = createElement('div', { className: 'info-section' });
        infoSection.appendChild(createElement('div', { className: 'info-label' }, 'Products'));

        order.products.forEach((p, idx) => {
            const productId = typeof p.product === 'object' ? p.product._id : p.product;
            const purchasePrice = marketRates[productId] || p.rate || null;
            const purchaseDisplay = purchasePrice ? `₹${purchasePrice.toLocaleString('en-IN')}` : 'N/A';

            // Qty Controls (Staff) or Display (Customer)
            let qtyDisplay;
            if (isStaff) {
                const qtyInput = createElement('input', {
                    type: 'number',
                    className: 'qty-input-sm input-animated',
                    id: `quantity-${idx}`,
                    value: p.quantity,
                    min: '0',
                    step: '0.01',
                    dataset: {
                        idx: idx,
                        original: p.quantity,
                        unit: p.unit
                    },
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

            // Selling Price Controls (Staff) or Display (Customer)
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
                    dataset: {
                        idx: idx,
                        original: p.rate,
                        qty: p.quantity,
                        contract: p.isContractPrice || false
                    },
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

            const productItem = createElement('div', { className: 'product-item', dataset: { idx: idx } }, [
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
            ]);
            infoSection.appendChild(productItem);
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

            const productSelector = createElement('select', {
                id: 'productSelector',
                className: 'product-select',
                onchange: () => window.addProductToOrder()
            }, productOptions);

            const addProductDiv = createElement('div', { className: 'add-product-section' }, [productSelector]);
            infoSection.appendChild(addProductDiv);
        }

        fragment.appendChild(infoSection);

        // Total Section
        const totalSection = createElement('div', { className: 'total-section' }, [
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
        ]);
        fragment.appendChild(totalSection);

        modalBody.appendChild(fragment);

        // Dynamic Footer Actions
        if (isStaff) {
            const footer = document.getElementById('modalFooter');
            if (footer) {
                footer.innerHTML = ''; // Clear existing static buttons

                // 1. Print Invoice Button
                const printBtn = createElement('button', {
                    className: 'btn-modal secondary btn-animated',
                    onclick: () => window.printFromModal()
                }, createElement('span', { className: 'btn-text' }, 'Invoice'));
                footer.appendChild(printBtn);

                // 2. Action Button (Status Change) OR Save Button
                // We show specific status actions if no unsaved changes, otherwise Save

                // Confirm Order (Pending -> Confirmed)
                if (order.status === 'pending') {
                    const confirmBtn = createElement('button', {
                        className: 'btn-modal primary btn-animated status-action-btn',
                        style: { background: 'var(--dusty-olive)', color: 'white', flex: '1.5' },
                        onclick: () => window.updateOrderStatus(order._id, 'confirmed')
                    }, 'Confirm Order');
                    footer.appendChild(confirmBtn);
                }

                // Mark Delivered (Confirmed+ -> Delivered)
                else if (['confirmed', 'processing', 'packed', 'shipped'].includes(order.status)) {
                    const deliverBtn = createElement('button', {
                        className: 'btn-modal primary btn-animated status-action-btn',
                        style: { background: 'var(--gunmetal)', color: 'white', flex: '1.5' },
                        onclick: () => window.updateOrderStatus(order._id, 'delivered')
                    }, 'Mark Delivered');
                    footer.appendChild(deliverBtn);
                }

                // Pack Order button (for confirmed/processing orders)
                const packingStatus = order.packingDetails?.status || 'not_started';
                const canPack = ['confirmed', 'processing'].includes(order.status) && packingStatus !== 'completed';

                if (canPack) {
                    const packLabel = packingStatus === 'in_progress' ? 'Resume Packing' :
                                     packingStatus === 'on_hold' ? 'Resume Packing' : 'Start Packing';
                    const packBtn = createElement('button', {
                        className: 'btn-modal secondary btn-animated',
                        style: { background: 'var(--dusty-olive)', color: 'white', border: 'none' },
                        onclick: () => { window.closeModal(); setTimeout(() => window.openPackingPanel(order._id), 200); }
                    }, packLabel);
                    footer.appendChild(packBtn);
                }

                // 3. Save Changes Button (Always present but maybe hidden/disabled until changes)
                // Actually, let's keep it simple: Save Button is always there but disabled if no changes
                // But we want prominent status buttons. 
                // Let's add Save button too.

                const saveBtn = createElement('button', {
                    className: 'btn-save-prices btn-animated',
                    id: 'savePricesBtn',
                    disabled: true, // Initially disabled
                    onclick: () => window.savePrices()
                }, createElement('span', { className: 'btn-text' }, 'Save'));
                footer.appendChild(saveBtn);
            }
        }

        document.getElementById('orderModal').classList.add('show');
    } catch (_e) {
        showToast('Could not load order', 'info');
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
    const qtyInput = document.getElementById(`quantity-${idx}`);
    const original = parseFloat(input.dataset.original);
    const current = parseFloat(input.value) || 0;
    // Use quantity from input if exists, otherwise from data attribute
    const qty = qtyInput ? (parseFloat(qtyInput.value) || 0) : parseFloat(input.dataset.qty);

    input.classList.toggle('changed', current !== original);

    // Update amount display (round to 2 decimal places for consistency)
    const amount = Math.round(current * qty * 100) / 100;
    const amountEl = document.getElementById(`amount-${idx}`);
    if (amountEl) amountEl.textContent = `₹${amount.toLocaleString('en-IN')}`;

    // Update total
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

    // Enable/disable save button
    updateSaveButtonState();
}

// Quantity change handlers
function changeQuantity(idx, delta) {
    const input = document.getElementById(`quantity-${idx}`);
    if (!input) return;

    const current = parseFloat(input.value) || 0;
    let newValue = current + delta;

    // Minimum quantity for all units
    const minQty = 0.01;

    // Snap to 0 if going below minimum (allows removal)
    if (newValue < minQty && newValue > 0) {
        newValue = 0;
    }

    // Don't go below 0
    if (newValue < 0) {
        newValue = 0;
    }

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

    // Visual feedback for changed quantity
    qtyInput.classList.remove('changed', 'removed');
    if (currentQty === 0) {
        qtyInput.classList.add('removed');
    } else if (currentQty !== originalQty) {
        qtyInput.classList.add('changed');
    }

    // Get current rate (may be modified)
    const rate = priceInput ? (parseFloat(priceInput.value) || 0) : (currentOrder?.products[idx]?.rate || 0);

    // Recalculate amount
    const amount = Math.round(currentQty * rate * 100) / 100;
    const amountEl = document.getElementById(`amount-${idx}`);
    if (amountEl) amountEl.textContent = `₹${amount.toLocaleString('en-IN')}`;

    // Update total
    updateOrderTotal();
}

function handleQuantityChange(idx) {
    const input = document.getElementById(`quantity-${idx}`);
    if (!input) return;

    const original = parseFloat(input.dataset.original);
    const current = parseFloat(input.value) || 0;

    // Validate minimum quantity
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

    // Enable/disable save button (check price, quantity changes, and added products)
    updateSaveButtonState();

    // Trigger amount recalculation
    handleQuantityInput(idx);
}

function updateSaveButtonState() {
    const hasChanges = Object.keys(priceChanges).length > 0 ||
        Object.keys(quantityChanges).length > 0 ||
        addedProducts.length > 0;
    const saveBtn = document.getElementById('savePricesBtn');
    if (saveBtn) saveBtn.disabled = !hasChanges;
}

function addProductToOrder() {
    const select = document.getElementById('productSelector');
    const productId = select.value;
    if (!productId) return;

    const option = select.options[select.selectedIndex];
    const productName = option.dataset.name;
    const unit = option.dataset.unit;

    // Get market rate for this product
    const rate = marketRates[productId] || 0;

    // Add to addedProducts array
    addedProducts.push({
        product: productId,
        productName: productName,
        unit: unit,
        quantity: 1,
        rate: rate
    });

    // Remove from dropdown
    option.remove();

    // Render added products
    renderAddedProducts();
    updateOrderTotal();
    updateSaveButtonState();

    // Reset select
    select.value = '';
}

function renderAddedProducts() {
    const container = document.getElementById('addedProductsContainer');
    if (!container) return;

    container.innerHTML = '';
    const fragment = document.createDocumentFragment();

    addedProducts.forEach((p, idx) => {
        const productItem = createElement('div', { className: 'product-item added-product', dataset: { addedIdx: idx } }, [
            createElement('div', { className: 'product-top' }, [
                createElement('div', {}, [
                    createElement('div', { className: 'product-name' }, [
                        p.productName,
                        ' ',
                        createElement('span', { className: 'new-badge' }, 'New')
                    ]),
                    createElement('div', { className: 'qty-controls-inline' }, [
                        createElement('button', { className: 'qty-btn-sm', onclick: () => window.changeAddedQty(idx, -1), type: 'button' }, '−'),
                        createElement('input', {
                            type: 'number',
                            className: 'qty-input-sm input-animated',
                            id: `added-qty-${idx}`,
                            value: p.quantity,
                            min: '0',
                            step: '0.01',
                            onchange: () => window.handleAddedQtyChange(idx),
                            oninput: () => window.handleAddedQtyInput(idx)
                        }),
                        createElement('button', { className: 'qty-btn-sm', onclick: () => window.changeAddedQty(idx, 1), type: 'button' }, '+'),
                        createElement('span', { className: 'qty-unit' }, p.unit)
                    ])
                ]),
                createElement('button', { className: 'remove-btn', onclick: () => window.removeAddedProduct(idx), title: 'Remove' }, '×')
            ]),
            createElement('div', { className: 'prices-container' }, [
                createElement('div', { className: 'price-box' }, [
                    createElement('div', { className: 'price-label' }, 'Purchase'),
                    createElement('div', { className: 'price-value' }, p.rate ? `₹${p.rate.toLocaleString('en-IN')}` : 'N/A')
                ]),
                createElement('div', { className: 'price-box' }, [
                    createElement('div', { className: 'price-label' }, 'Selling'),
                    createElement('input', {
                        type: 'number',
                        className: 'price-input input-animated',
                        id: `added-price-${idx}`,
                        value: p.rate || 0,
                        min: '0',
                        step: '0.01',
                        onchange: () => window.handleAddedPriceChange(idx)
                    })
                ])
            ]),
            createElement('div', { className: 'amount-row' }, [
                createElement('span', { className: 'amount-label' }, 'Amount'),
                createElement('span', { className: 'amount-display', id: `added-amount-${idx}` }, `₹${((p.rate || 0) * (p.quantity || 0)).toLocaleString('en-IN')}`)
            ])
        ]);
        fragment.appendChild(productItem);
    });

    container.appendChild(fragment);
}

function changeAddedQty(idx, delta) {
    const input = document.getElementById(`added-qty-${idx}`);
    if (!input) return;
    let val = parseFloat(input.value) || 0;
    val = Math.max(0, val + delta);
    if (val > 0 && val < 0.01) val = 0.01;
    input.value = val;
    addedProducts[idx].quantity = val;
    updateAddedAmount(idx);
    updateOrderTotal();
}

function handleAddedQtyChange(idx) {
    const input = document.getElementById(`added-qty-${idx}`);
    if (!input) return;
    let val = parseFloat(input.value) || 0;
    if (val > 0 && val < 0.01) {
        showToast('Minimum quantity: 0.01', 'info');
        val = 0.01;
        input.value = val;
    }
    addedProducts[idx].quantity = val;
    updateAddedAmount(idx);
    updateOrderTotal();
}

function handleAddedQtyInput(idx) {
    const input = document.getElementById(`added-qty-${idx}`);
    if (!input) return;
    const val = parseFloat(input.value) || 0;
    addedProducts[idx].quantity = val;
    updateAddedAmount(idx);
    updateOrderTotal();
}

function handleAddedPriceChange(idx) {
    const input = document.getElementById(`added-price-${idx}`);
    if (!input) return;
    const val = parseFloat(input.value) || 0;
    addedProducts[idx].rate = val;
    updateAddedAmount(idx);
    updateOrderTotal();
}

function handleAddedPriceInput(idx) {
    const input = document.getElementById(`added-price-${idx}`);
    if (!input) return;
    const val = parseFloat(input.value) || 0;
    addedProducts[idx].rate = val;
    updateAddedAmount(idx);
    updateOrderTotal();
}

function updateAddedAmount(idx) {
    const amountEl = document.getElementById(`added-amount-${idx}`);
    if (!amountEl) return;
    const p = addedProducts[idx];
    const amount = (p.quantity || 0) * (p.rate || 0);
    amountEl.textContent = `₹${amount.toLocaleString('en-IN')}`;
}

function removeAddedProduct(idx) {
    const removed = addedProducts.splice(idx, 1)[0];

    // Add back to dropdown
    const select = document.getElementById('productSelector');
    if (select && removed) {
        const opt = document.createElement('option');
        opt.value = removed.product;
        opt.dataset.name = removed.productName;
        opt.dataset.unit = removed.unit;
        opt.textContent = `${removed.productName} (${removed.unit})`;
        select.appendChild(opt);
    }

    renderAddedProducts();
    updateOrderTotal();
    updateSaveButtonState();
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

    // Include added products
    addedProducts.forEach(p => {
        total += (p.quantity || 0) * (p.rate || 0);
    });

    // Round to 2 decimal places for consistency with backend
    total = Math.round(total * 100) / 100;
    const balance = Math.round((total - (currentOrder.paidAmount || 0)) * 100) / 100;

    const totalEl = document.getElementById('orderTotal');
    const balanceEl = document.getElementById('orderBalance');
    if (totalEl) totalEl.textContent = `₹${total.toLocaleString('en-IN')}`;
    if (balanceEl) balanceEl.textContent = `₹${balance.toLocaleString('en-IN')}`;
}

// Check if invoices exist for an order
async function checkInvoicesExist(orderId) {
    try {
        const res = await fetch(`/api/invoices/order/${orderId}`, { credentials: 'include' });
        if (!res.ok) return false;
        const data = await res.json();
        return data.data && data.data.length > 0;
    } catch (e) {
        console.error('Failed to check invoices:', e);
        return false;
    }
}

async function savePrices() {
    // Check for price, quantity changes, or added products
    const hasChanges = Object.keys(priceChanges).length > 0 ||
        Object.keys(quantityChanges).length > 0 ||
        addedProducts.length > 0;
    if (!currentOrderId || !currentOrder || !currentOrder.products || !hasChanges) return;

    // Prevent concurrent saves
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

    // Check if invoices exist
    let hasInvoices = false;
    try {
        hasInvoices = await checkInvoicesExist(currentOrderId);
        if (hasInvoices) {
            const proceed = confirm(
                'Invoices exist for this order. Changes will not update existing invoices.\n\n' +
                'You may need to regenerate invoices after saving. Continue?'
            );
            if (!proceed) {
                isSaving = false;
                if (btn) {
                    btn.classList.remove('btn-loading');
                    btn.disabled = false;
                }
                return;
            }
        }
    } catch (e) {
        console.error('Invoice check failed:', e);
        // Continue anyway - don't block save
    }

    try {
        // Build updated products array with quantities
        const existingProducts = currentOrder.products
            .map((p, idx) => {
                let price = priceChanges[idx] !== undefined ? priceChanges[idx] : p.rate;
                let quantity = quantityChanges[idx] !== undefined ? quantityChanges[idx] : p.quantity;

                // Safety checks
                if (!price || price <= 0) price = p.rate;
                if (quantity < 0) quantity = p.quantity;

                return {
                    product: typeof p.product === 'object' ? p.product._id : p.product,
                    quantity: quantity,
                    priceAtTime: price
                };
            })
            .filter(item => item.quantity > 0); // Remove items with quantity = 0

        // Include newly added products
        const newProducts = addedProducts
            .filter(p => p.quantity > 0)
            .map(p => ({
                product: p.product,
                quantity: p.quantity,
                priceAtTime: p.rate
            }));

        const updatedProducts = [...existingProducts, ...newProducts];

        const headers = { 'Content-Type': 'application/json' };
        const csrfToken = await Auth.ensureCsrfToken();
        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        const payload = { products: updatedProducts };
        const orderId = currentOrderId; // Capture to avoid race conditions

        let res = await fetch(`/api/orders/${orderId}`, {
            method: 'PUT',
            headers,
            credentials: 'include',
            body: JSON.stringify(payload)
        });

        // Handle CSRF error with single retry
        if (res.status === 403) {
            let errData;
            try {
                errData = await res.json();
            } catch (parseError) {
                console.warn('Failed to parse CSRF error response:', parseError.message);
                errData = { message: `Access denied (code: ${res.status})` };
            }

            if (errData.message?.toLowerCase().includes('csrf')) {
                const newToken = await Auth.refreshCsrfToken();
                if (newToken) {
                    headers['X-CSRF-Token'] = newToken;
                    res = await fetch(`/api/orders/${orderId}`, {
                        method: 'PUT',
                        headers,
                        credentials: 'include',
                        body: JSON.stringify(payload)
                    });

                    // If retry also fails with CSRF, tell user to refresh
                    if (res.status === 403) {
                        showToast('Session expired. Please refresh the page.', 'info');
                        isSaving = false;
                        if (btn) {
                            btn.classList.remove('btn-loading');
                            btn.disabled = false;
                        }
                        return;
                    }
                } else {
                    showToast('Session expired. Please refresh the page.', 'info');
                    isSaving = false;
                    if (btn) {
                        btn.classList.remove('btn-loading');
                        btn.disabled = false;
                    }
                    return;
                }
            } else {
                showToast(errData.message || 'Access temporarily unavailable', 'info');
                isSaving = false;
                if (btn) {
                    btn.classList.remove('btn-loading');
                    btn.disabled = false;
                }
                return;
            }
        }

        if (res.ok) {
            showToast('Changes saved', 'success');
            priceChanges = {};
            quantityChanges = {};
            addedProducts = [];
            if (btn) {
                btn.classList.remove('btn-loading');
                btn.classList.add('btn-success');
                setTimeout(() => btn.classList.remove('btn-success'), 1500);
                btn.disabled = true;
            }
            loadOrders();

            // Prompt to regenerate invoice if needed
            if (hasInvoices) {
                setTimeout(() => {
                    if (confirm('Order updated. Regenerate invoice with new quantities?')) {
                        const orderIdToEdit = orderId; // Capture before modal closes
                        closeModal();
                        setTimeout(() => printOrder(orderIdToEdit), 300);
                    }
                }, 500);
            }

            // Refresh the modal if still viewing same order
            if (currentOrderId === orderId) {
                viewOrder(orderId);
            }
        } else {
            let errData;
            try {
                errData = await res.json();
            } catch (parseError) {
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
    // Warn about unsaved changes (price, quantity, or added products)
    const hasChanges = Object.keys(priceChanges).length > 0 ||
        Object.keys(quantityChanges).length > 0 ||
        addedProducts.length > 0;
    if (hasChanges) {
        if (!confirm('You have unsaved changes. Discard them?')) {
            return;
        }
    }
    const orderModal = document.getElementById('orderModal');
    if (orderModal) orderModal.classList.remove('show');
    currentOrderId = null;
    currentOrder = null;
    priceChanges = {};
    quantityChanges = {};
    addedProducts = [];
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
window.printOrder = printOrder;
// Invoice modal functions
window.closeInvoiceModal = closeInvoiceModal;
window.selectFirm = selectFirm;
window.toggleInvoiceItem = toggleInvoiceItem;
window.generateInvoice = generateInvoice;
window.printFromModal = printFromModal;

// Added product functions
window.addProductToOrder = addProductToOrder;
window.renderAddedProducts = renderAddedProducts;
window.changeAddedQty = changeAddedQty;
window.handleAddedQtyChange = handleAddedQtyChange;
window.handleAddedQtyInput = handleAddedQtyInput;
window.handleAddedPriceChange = handleAddedPriceChange;
window.handleAddedPriceInput = handleAddedPriceInput;
window.removeAddedProduct = removeAddedProduct;


async function updateOrderStatus(orderId, newStatus) {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'staff')) return;

    // Optimistic UI update/Loading state could go here, but for now just wait for API

    try {
        const headers = { 'Content-Type': 'application/json' };
        const csrfToken = await Auth.ensureCsrfToken();
        if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

        const res = await fetch(`/api/orders/${orderId}/status`, {
            method: 'PUT',
            headers,
            credentials: 'include',
            body: JSON.stringify({ status: newStatus })
        });

        const data = await res.json();

        if (res.ok) {
            showToast(`Order marked as ${newStatus}`, 'success');
            // Reload order to update UI (logs, timestamps etc)
            viewOrder(orderId);
            // Also refresh list in background
            loadOrders();
        } else {
            showToast(data.message || 'Failed to update status', 'error');
            // Revert select by reloading view
            viewOrder(orderId);
        }
    } catch (error) {
        console.error('Status update error:', error);
        showToast('Network error updating status', 'error');
        viewOrder(orderId);
    }
}

window.updateOrderStatus = updateOrderStatus;

// ============================================
// PACKING PANEL FUNCTIONS
// ============================================

// Open packing panel for an order
async function openPackingPanel(orderId) {
    const panel = document.getElementById('packingPanel');
    const overlay = document.getElementById('packingPanelOverlay');
    if (!panel || !overlay) return;

    // Close any open swipe items
    document.querySelectorAll('.swipe-item.swiped, .swipe-item.swiped-single').forEach(item => {
        item.classList.remove('swiped', 'swiped-single');
    });

    // Show panel with loading state
    panel.classList.add('active');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    isPackingPanelOpen = true;

    document.getElementById('packingPanelBody').innerHTML = '<div class="packing-loading">Loading order...</div>';
    document.getElementById('packingCompleteBtn').disabled = true;

    try {
        // Load packing details
        const response = await fetch(`/api/packing/${orderId}`, { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to load order');

        const data = await response.json();
        packingOrder = data.data;

        // Start or resume packing session
        const packingStatus = packingOrder.packingDetails?.status || 'not_started';

        if (packingStatus === 'not_started') {
            await startPackingSession(orderId);
        } else if (packingStatus === 'on_hold') {
            await resumePackingSession(orderId);
        }

        packingItems = packingOrder.packingDetails?.items || [];
        renderPackingPanel();
    } catch (error) {
        console.error('Error loading packing order:', error);
        showToast('Failed to load order details', 'error');
        closePackingPanel();
    }
}

// Start a new packing session
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
        packingItems = data.data.items || [];
        packingOrder.packingDetails.status = 'in_progress';
    } catch (error) {
        console.error('Error starting packing:', error);
        throw error;
    }
}

// Resume packing session from hold
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

        packingOrder.packingDetails.status = 'in_progress';
    } catch (error) {
        console.error('Error resuming packing:', error);
        throw error;
    }
}

// Render the packing panel content
function renderPackingPanel() {
    // Update title
    document.getElementById('packingPanelTitle').textContent = `Pack ${packingOrder.orderNumber}`;
    document.getElementById('packingPanelSubtitle').textContent =
        `${packingOrder.customer?.name || 'Unknown'} • ${packingOrder.customer?.phone || ''}`;

    // Update progress
    updatePackingProgress();

    // Render body
    const body = document.getElementById('packingPanelBody');

    let orderDetailsHtml = '';
    if (packingOrder.deliveryAddress || packingOrder.notes) {
        orderDetailsHtml = `<div class="packing-order-details">`;
        if (packingOrder.deliveryAddress) {
            orderDetailsHtml += `
                <div class="packing-delivery-info">
                    <span class="packing-label">Deliver to</span>
                    <span class="packing-value">${packingOrder.deliveryAddress}</span>
                </div>`;
        }
        if (packingOrder.notes) {
            orderDetailsHtml += `
                <div class="packing-order-notes">
                    <span class="packing-label">Notes</span>
                    <span class="packing-value">${packingOrder.notes}</span>
                </div>`;
        }
        orderDetailsHtml += `</div>`;
    }

    const checklistItems = packingItems.map((item, index) => {
        const isVerified = item.status !== 'pending';
        const statusIcon = getPackingStatusIcon(item.status);
        const statusClass = getPackingItemStatusClass(item.status);

        return `
            <div class="packing-checklist-item ${statusClass}" data-index="${index}" data-product-id="${item.product}">
                <div class="packing-item-main">
                    <div class="packing-item-check ${isVerified ? 'checked' : ''}" onclick="togglePackingItemStatus(${index})">
                        ${statusIcon}
                    </div>
                    <div class="packing-item-details">
                        <span class="packing-item-name">${item.productName}</span>
                        <span class="packing-item-qty">Ordered: ${item.orderedQuantity} ${item.unit}</span>
                    </div>
                </div>

                <div class="packing-item-input">
                    <input type="number"
                        class="packing-qty-input"
                        placeholder="Qty"
                        value="${item.packedQuantity ?? ''}"
                        data-index="${index}"
                        step="0.01"
                        min="0"
                        onchange="handlePackingQtyChange(${index})"
                    >
                    <span class="packing-unit-label">${item.unit}</span>
                </div>

                <div class="packing-item-status">
                    <select class="packing-status-select" data-index="${index}" onchange="updatePackingItemStatus(${index}, this.value)">
                        <option value="pending" ${item.status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="packed" ${item.status === 'packed' ? 'selected' : ''}>Packed</option>
                        <option value="short" ${item.status === 'short' ? 'selected' : ''}>Short</option>
                        <option value="damaged" ${item.status === 'damaged' ? 'selected' : ''}>Damaged</option>
                        <option value="unavailable" ${item.status === 'unavailable' ? 'selected' : ''}>Unavailable</option>
                    </select>
                </div>

                ${item.status !== 'packed' && item.status !== 'pending' ? `
                    <div class="packing-item-notes">
                        <input type="text"
                            class="packing-notes-input"
                            placeholder="Add note..."
                            value="${item.notes || ''}"
                            data-index="${index}"
                            onchange="handlePackingNotesChange(${index})"
                        >
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    body.innerHTML = `
        ${orderDetailsHtml}
        <div class="packing-checklist-header">
            <span>Items to Pack</span>
            <button class="packing-btn-mini" onclick="markAllPacked()">Mark All Packed</button>
        </div>
        <div class="packing-checklist">
            ${checklistItems}
        </div>
    `;

    // Update issues display
    updatePackingIssues();

    // Update acknowledgement visibility
    const hasIssues = (packingOrder.packingDetails?.issues?.length > 0) ||
        packingItems.some(i => i.status !== 'packed' && i.status !== 'pending');

    const ackSection = document.getElementById('packingPanelAcknowledgement');
    if (hasIssues) {
        ackSection.style.display = 'block';
    } else {
        ackSection.style.display = 'none';
    }

    // Setup acknowledgement checkbox listener
    const ackCheckbox = document.getElementById('packingAcknowledgeCheckbox');
    if (ackCheckbox) {
        ackCheckbox.onchange = updatePackingCompleteButton;
    }

    updatePackingCompleteButton();
}

// Get status icon for packing item
function getPackingStatusIcon(status) {
    switch (status) {
        case 'packed': return '✓';
        case 'short': return '⚠';
        case 'damaged': return '✕';
        case 'unavailable': return '∅';
        default: return '';
    }
}

// Get status class for packing item
function getPackingItemStatusClass(status) {
    switch (status) {
        case 'packed': return 'item-packed';
        case 'short': return 'item-short';
        case 'damaged': return 'item-damaged';
        case 'unavailable': return 'item-unavailable';
        default: return 'item-pending';
    }
}

// Toggle item status (quick action - click on check circle)
async function togglePackingItemStatus(index) {
    const item = packingItems[index];

    if (item.status === 'pending') {
        // Get quantity from input
        const qtyInput = document.querySelector(`.packing-qty-input[data-index="${index}"]`);
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

    await savePackingItemUpdate(index);
    renderPackingPanel();
}

// Update item status from dropdown
async function updatePackingItemStatus(index, status) {
    const item = packingItems[index];
    item.status = status;

    // Get packed quantity
    const qtyInput = document.querySelector(`.packing-qty-input[data-index="${index}"]`);
    if (status === 'packed') {
        item.packedQuantity = parseFloat(qtyInput?.value) || item.orderedQuantity;
    } else if (status === 'unavailable') {
        item.packedQuantity = 0;
    }

    await savePackingItemUpdate(index);
    renderPackingPanel();
}

// Handle quantity change
async function handlePackingQtyChange(index) {
    const qtyInput = document.querySelector(`.packing-qty-input[data-index="${index}"]`);
    const qty = parseFloat(qtyInput?.value) || 0;
    const item = packingItems[index];

    item.packedQuantity = qty;

    // Auto-detect if short
    if (qty > 0 && qty < item.orderedQuantity && item.status === 'pending') {
        item.status = 'short';
        renderPackingPanel();
    }

    await savePackingItemUpdate(index);
}

// Handle notes change
async function handlePackingNotesChange(index) {
    const notesInput = document.querySelector(`.packing-notes-input[data-index="${index}"]`);
    packingItems[index].notes = notesInput?.value || '';
    await savePackingItemUpdate(index);
}

// Save item update to server
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
        if (data.data?.issues) {
            packingOrder.packingDetails.issues = data.data.issues;
        }

        updatePackingProgress();
        updatePackingIssues();
        updatePackingCompleteButton();
    } catch (error) {
        console.error('Error saving packing item:', error);
        showToast('Failed to save changes', 'error');
    }
}

// Mark all items as packed
async function markAllPacked() {
    for (let i = 0; i < packingItems.length; i++) {
        const item = packingItems[i];
        if (item.status === 'pending') {
            item.status = 'packed';
            item.packedQuantity = item.orderedQuantity;
            await savePackingItemUpdate(i);
        }
    }
    renderPackingPanel();
}

// Update progress bar
function updatePackingProgress() {
    const total = packingItems.length;
    const verified = packingItems.filter(i => i.status !== 'pending').length;
    const percentage = total > 0 ? Math.round((verified / total) * 100) : 0;

    document.getElementById('packingProgressFill').style.width = `${percentage}%`;
    document.getElementById('packingProgressText').textContent = `${verified}/${total} items`;
}

// Update issues display
function updatePackingIssues() {
    const issues = packingOrder.packingDetails?.issues || [];
    const issuesSection = document.getElementById('packingPanelIssues');
    const issuesList = document.getElementById('packingIssuesList');

    if (issues.length > 0) {
        issuesSection.style.display = 'block';
        issuesList.innerHTML = issues.map(issue => `
            <div class="packing-issue-item issue-${issue.issueType}">
                <span class="packing-issue-product">${issue.productName}</span>
                <span class="packing-issue-type">${issue.issueType}</span>
                <span class="packing-issue-qty">${issue.quantityAffected} affected</span>
                ${issue.description ? `<span class="packing-issue-desc">${issue.description}</span>` : ''}
            </div>
        `).join('');
    } else {
        issuesSection.style.display = 'none';
    }

    // Update acknowledgement visibility
    const ackSection = document.getElementById('packingPanelAcknowledgement');
    const hasIssues = issues.length > 0 ||
        packingItems.some(i => i.status !== 'packed' && i.status !== 'pending');

    if (hasIssues) {
        ackSection.style.display = 'block';
    } else {
        ackSection.style.display = 'none';
    }

    updatePackingCompleteButton();
}

// Update complete button state
function updatePackingCompleteButton() {
    const completeBtn = document.getElementById('packingCompleteBtn');
    const allVerified = packingItems.every(i => i.status !== 'pending');
    const hasIssues = (packingOrder.packingDetails?.issues?.length > 0) ||
        packingItems.some(i => i.status !== 'packed' && i.status !== 'pending');
    const acknowledged = document.getElementById('packingAcknowledgeCheckbox')?.checked || !hasIssues;

    completeBtn.disabled = !allVerified || (hasIssues && !acknowledged);
}

// Hold packing order
function holdPackingOrder() {
    document.getElementById('packingHoldModal').classList.add('active');
}

// Close hold modal
function closePackingHoldModal() {
    document.getElementById('packingHoldModal').classList.remove('active');
    document.getElementById('packingHoldReason').value = '';
}

// Confirm hold
async function confirmPackingHold() {
    const reason = document.getElementById('packingHoldReason').value.trim();
    if (!reason) {
        showToast('Please provide a reason', 'error');
        return;
    }

    try {
        const csrfToken = await Auth.ensureCsrfToken();
        const response = await fetch(`/api/packing/${packingOrder._id}/hold`, {
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
        closePackingHoldModal();
        closePackingPanel();
        await loadOrders();
    } catch (error) {
        console.error('Error holding order:', error);
        showToast('Failed to hold order', 'error');
    }
}

// Complete packing session
async function completePackingSession() {
    const hasIssues = (packingOrder.packingDetails?.issues?.length > 0) ||
        packingItems.some(i => i.status !== 'packed' && i.status !== 'pending');
    const acknowledged = document.getElementById('packingAcknowledgeCheckbox')?.checked;

    if (hasIssues && !acknowledged) {
        showToast('Please acknowledge issues before completing', 'error');
        return;
    }

    const completeBtn = document.getElementById('packingCompleteBtn');
    completeBtn.disabled = true;
    completeBtn.innerHTML = '<span class="btn-text">Completing...</span>';

    try {
        const csrfToken = await Auth.ensureCsrfToken();
        const response = await fetch(`/api/packing/${packingOrder._id}/complete`, {
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
        closePackingPanel();
        await loadOrders();
    } catch (error) {
        console.error('Error completing packing:', error);
        showToast(error.message || 'Failed to complete packing', 'error');
        completeBtn.disabled = false;
        completeBtn.innerHTML = '<span class="btn-text">Complete Packing</span>';
    }
}

// Close packing panel
function closePackingPanel() {
    const panel = document.getElementById('packingPanel');
    const overlay = document.getElementById('packingPanelOverlay');

    panel.classList.remove('active');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    isPackingPanelOpen = false;

    packingOrder = null;
    packingItems = [];
}

// Expose packing functions to window
window.openPackingPanel = openPackingPanel;
window.closePackingPanel = closePackingPanel;
window.togglePackingItemStatus = togglePackingItemStatus;
window.updatePackingItemStatus = updatePackingItemStatus;
window.handlePackingQtyChange = handlePackingQtyChange;
window.handlePackingNotesChange = handlePackingNotesChange;
window.markAllPacked = markAllPacked;
window.holdPackingOrder = holdPackingOrder;
window.closePackingHoldModal = closePackingHoldModal;
window.confirmPackingHold = confirmPackingHold;
window.completePackingSession = completePackingSession;

init();
