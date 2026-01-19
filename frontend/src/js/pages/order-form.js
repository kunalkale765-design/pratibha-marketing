
import { showToast, createElement } from '/js/ui.js';
import { logout } from '/js/init.js';

// Wait for Auth to be available
const waitForAuth = () => new Promise((resolve) => {
    if (window.Auth) resolve(window.Auth);
    else setTimeout(() => resolve(waitForAuth()), 10);
});
const Auth = await waitForAuth();

// Logout button
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) logoutBtn.addEventListener('click', logout);

// Customer selector change
const customerSelect = document.getElementById('customerSelect');
if (customerSelect) customerSelect.addEventListener('change', onCustomerChange);

let currentUser = null;
let selectedCustomer = null;
let products = [];
let marketRates = {};
let customers = [];
let isStaff = false;

async function init() {
    // Check for magic link token in URL
    const urlParams = new URLSearchParams(window.location.search);
    const magicToken = urlParams.get('token');

    if (magicToken) {
        // Authenticate via magic link
        try {
            const res = await fetch(`/api/auth/magic/${magicToken}`, {
                credentials: 'include'
            });
            const data = await res.json();

            if (res.ok && data.user) {
                currentUser = data.user;
                Auth.setUser(data.user);
                // Remove token from URL for cleaner bookmarking
                window.history.replaceState({}, '', window.location.pathname);
            } else {
                showToast(data.message || 'Link expired. Please request a new one.', 'info');
                window.location.href = '/pages/auth/login.html';
                return;
            }
        } catch (e) {
            showToast('Authentication issue. Please refresh.', 'info');
            window.location.href = '/pages/auth/login.html';
            return;
        }
    } else {
        // Normal authentication
        currentUser = await Auth.verify();
        if (!currentUser) {
            window.location.href = '/pages/auth/login.html';
            return;
        }
    }

    isStaff = currentUser.role === 'admin' || currentUser.role === 'staff';
    await loadData();

    if (isStaff) {
        const customerBar = document.getElementById('customerBar');
        if (customerBar) customerBar.classList.add('show');
        populateCustomers();
    } else {
        if (currentUser.customer) {
            selectedCustomer = typeof currentUser.customer === 'object'
                ? currentUser.customer
                : { _id: currentUser.customer, pricingType: 'market' };
            renderProducts();
        } else {
            const list = document.getElementById('productList');
            if (list) {
                list.innerHTML = '';
                list.appendChild(createElement('div', { className: 'empty-state' }, 'Account setup in progress. Please check back later.'));
            }
        }
    }
}

async function loadData() {
    try {
        const [productsRes, ratesRes, customersRes] = await Promise.all([
            fetch('/api/products', { credentials: 'include' }),
            fetch('/api/market-rates', { credentials: 'include' }),
            fetch('/api/customers', { credentials: 'include' }).catch(() => ({ ok: false }))
        ]);

        if (productsRes.ok) {
            const data = await productsRes.json();
            products = (data?.data || []).filter(p => p.isActive !== false);
        }

        if (ratesRes.ok) {
            const data = await ratesRes.json();
            (data?.data || []).forEach(rate => {
                const pid = typeof rate.product === 'object' ? rate.product._id : rate.product;
                if (pid) marketRates[pid] = rate.rate;
            });
        }

        if (customersRes.ok) {
            const data = await customersRes.json();
            customers = (data?.data || []).filter(c => c.isActive !== false);
        }
    } catch (e) {
        console.error('Failed to load data:', e);
        // Show retry UI instead of just a toast
        const productList = document.getElementById('productList');
        if (productList) {
            productList.innerHTML = '';
            productList.appendChild(createElement('div', { className: 'empty-state' }, [
                createElement('p', {}, 'Products not available'),
                createElement('button', {
                    id: 'retryDataBtn',
                    style: { marginTop: '1rem', padding: '0.5rem 1rem', background: 'var(--dusty-olive)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' },
                    onclick: () => loadData().then(() => { if (selectedCustomer) renderProducts(); })
                }, 'Try Again')
            ]));
        }
    }
}

function populateCustomers() {
    const select = document.getElementById('customerSelect');
    // Clear existing except first option if any? No, usually start clean if re-populating or append if incremental. 
    // Assuming clear first is safer or checking if empty. But let's follow existing pattern but use createElement.
    // Actually, existing code just appends. But usually we want to clear or keep placeholder.
    // The HTML likely has a placeholder. Let's append to existing.

    // Better to clear existing options to avoid duplicates if called multiple times, keeping the first placeholder if exists
    // But original code didn't clear. Let's just append for now to match behavior, but use createElement.
    // Actually, to be safe and cleaner, let's keep it simple: just append.

    customers.forEach(c => {
        select.appendChild(createElement('option', { value: c._id }, c.name));
    });
}

function onCustomerChange() {
    const id = document.getElementById('customerSelect').value;
    selectedCustomer = customers.find(c => c._id === id) || null;
    if (selectedCustomer) {
        renderProducts();
    } else {
        const list = document.getElementById('productList');
        list.innerHTML = '';
        list.appendChild(createElement('div', { className: 'empty-state' }, 'Select a customer to start'));
    }
    updateSummary();
}

// Helper to safely get contract price (handles Map serialization edge cases)
function getContractPrice(contractPrices, productId) {
    if (!contractPrices) return null;
    // Try direct property access (normal object)
    if (contractPrices[productId] !== undefined) {
        return contractPrices[productId];
    }
    // Try .get() in case it's still a Map-like structure
    if (typeof contractPrices.get === 'function') {
        return contractPrices.get(productId);
    }
    return null;
}

function getPrice(product) {
    if (!selectedCustomer) return marketRates[product._id] || 0;
    const type = selectedCustomer.pricingType || 'market';
    if (type === 'contract') {
        const contractPrice = getContractPrice(selectedCustomer.contractPrices, product._id);
        return contractPrice !== null ? contractPrice : (marketRates[product._id] || 0);
    } else if (type === 'markup') {
        const rate = marketRates[product._id] || 0;
        return Math.round(rate * (1 + (selectedCustomer.markupPercentage || 0) / 100));
    }
    return marketRates[product._id] || 0;
}

// Filter products for contract customers (only show products with contract prices)
function getFilteredProducts() {
    // Staff/admin always see all products
    if (isStaff) {
        return products;
    }

    // Non-contract customers see all products
    if (!selectedCustomer || selectedCustomer.pricingType !== 'contract') {
        return products;
    }

    // Contract customers: filter to only products with contract prices
    const contractPrices = selectedCustomer.contractPrices || {};
    const contractProductIds = Object.keys(contractPrices);

    // If no contract prices configured, return empty array
    if (contractProductIds.length === 0) {
        return [];
    }

    return products.filter(p => contractProductIds.includes(p._id));
}

function buildCategoryPills(displayProducts = products) {
    const categories = [...new Set(displayProducts.map(p => p.category || 'Other'))];
    const container = document.getElementById('categoryPills');
    container.innerHTML = '';

    // Hide pills if no products or only one category
    if (displayProducts.length === 0 || categories.length <= 1) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';

    container.appendChild(createElement('button', {
        className: 'cat-pill active',
        dataset: { cat: 'all' },
        onclick: () => filterByCategory('all')
    }, 'All'));

    categories.forEach(cat => {
        container.appendChild(createElement('button', {
            className: 'cat-pill',
            dataset: { cat },
            onclick: () => filterByCategory(cat)
        }, cat));
    });
}

function filterByCategory(cat) {
    document.querySelectorAll('.cat-pill').forEach(t => t.classList.remove('active'));
    const activeBtn = document.querySelector(`.cat-pill[data-cat="${cat}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    document.querySelectorAll('.product-item').forEach(item => {
        item.style.display = (cat === 'all' || item.dataset.category === cat) ? '' : 'none';
    });

    document.querySelectorAll('.category-header').forEach(header => {
        header.style.display = (cat === 'all' || header.dataset.category === cat) ? '' : 'none';
    });
}

function renderProducts() {
    const container = document.getElementById('productList');
    container.innerHTML = '';

    // Get filtered products based on customer type
    const displayProducts = getFilteredProducts();

    if (!displayProducts.length) {
        // Different message for contract customers with no products configured
        const isContractWithNoProducts = selectedCustomer &&
            selectedCustomer.pricingType === 'contract' &&
            products.length > 0;

        const message = isContractWithNoProducts
            ? 'No products configured for your account. Please contact us to set up pricing.'
            : 'No products available';

        container.appendChild(createElement('div', { className: 'empty-state' }, message));
        return;
    }

    buildCategoryPills(displayProducts);

    const grouped = {};
    displayProducts.forEach(p => {
        const cat = p.category || 'Other';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(p);
    });

    const fragment = document.createDocumentFragment();

    for (const [cat, prods] of Object.entries(grouped)) {
        fragment.appendChild(createElement('div', {
            className: 'category-header',
            dataset: { category: cat }
        }, cat));

        prods.forEach(p => {
            const price = getPrice(p);
            // Use step="1" for piece items to enforce whole numbers
            const step = p.unit === 'piece' ? '1' : '0.01';

            const productItem = createElement('div', {
                className: 'product-item',
                dataset: {
                    id: p._id,
                    category: cat,
                    price: price,
                    unit: p.unit
                }
            }, [
                createElement('div', { className: 'product-info' }, [
                    createElement('div', { className: 'product-name' }, p.name),
                    createElement('div', { className: 'product-meta' }, p.unit)
                ]),
                createElement('div', { className: 'qty-controls' }, [
                    createElement('button', {
                        className: 'qty-btn',
                        onclick: () => window.changeQty(p._id, -1)
                    }, '−'),
                    createElement('input', {
                        type: 'number',
                        className: 'qty-input',
                        id: `qty-${p._id}`,
                        value: '0',
                        min: '0',
                        step: step,
                        inputmode: 'numeric',
                        onfocus: (e) => window.clearZero(e.target),
                        onblur: (e) => window.restoreZero(e.target),
                        onchange: () => window.updateFromInput(p._id)
                    }),
                    createElement('button', {
                        className: 'qty-btn',
                        onclick: () => window.changeQty(p._id, 1)
                    }, '+')
                ])
            ]);
            fragment.appendChild(productItem);
        });
    }

    container.appendChild(fragment);
}

// Expose qty functions to window for inline handlers
function clearZero(input) {
    if (input.value === '0') input.value = '';
    input.select();
}

function restoreZero(input) {
    if (input.value === '') input.value = '0';
    updateFromInput(input.id.replace('qty-', ''));
}

function changeQty(id, delta) {
    const input = document.getElementById('qty-' + id);
    let val = parseFloat(input.value) || 0;
    val = Math.max(0, val + delta);
    input.value = val;
    updateItem(id, val);
}

function updateFromInput(id) {
    const input = document.getElementById('qty-' + id);
    const val = Math.max(0, parseFloat(input.value) || 0);
    input.value = val;
    updateItem(id, val);
}

function updateItem(id, qty) {
    const item = document.querySelector(`.product-item[data-id="${id}"]`);
    const input = document.getElementById('qty-' + id);

    if (item && input) {
        if (qty > 0) {
            item.classList.add('has-qty');
            input.classList.add('has-value');
        } else {
            item.classList.remove('has-qty');
            input.classList.remove('has-value');
        }
    }

    updateSummary();
}

function updateSummary() {
    let items = 0;

    document.querySelectorAll('.product-item').forEach(item => {
        const id = item.dataset.id;
        const input = document.getElementById('qty-' + id);
        const qty = parseFloat(input?.value) || 0;
        if (qty > 0) items++;
    });

    document.getElementById('itemCount').textContent = items;
    document.getElementById('orderBtn').disabled = items === 0 || !selectedCustomer;
}

// Search
const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();

        document.querySelectorAll('.product-item').forEach(item => {
            const name = item.querySelector('.product-name').textContent.toLowerCase();
            item.style.display = name.includes(q) ? '' : 'none';
        });

        document.querySelectorAll('.category-header').forEach(header => {
            const cat = header.dataset.category;
            const hasVisible = [...document.querySelectorAll(`.product-item[data-category="${cat}"]`)]
                .some(i => i.style.display !== 'none');
            header.style.display = hasVisible ? '' : 'none';
        });
    });
}

// Expose placeOrder to window for inline handler
async function placeOrder() {
    if (!selectedCustomer) return;

    const orderProducts = [];
    const pieceErrors = [];

    document.querySelectorAll('.product-item').forEach(item => {
        const id = item.dataset.id;
        const input = document.getElementById('qty-' + id);
        const rawValue = parseFloat(input?.value) || 0;
        const qty = rawValue;
        const price = parseFloat(item.dataset.price) || 0;
        const unit = item.dataset.unit;
        const name = item.querySelector('.product-name')?.textContent || 'Unknown';

        if (qty > 0) {
            // Validate piece quantities are whole numbers
            if (unit === 'piece' && !Number.isInteger(qty)) {
                pieceErrors.push(name);
            }
            // Only include rate if > 0; let backend calculate if not provided
            const orderProduct = { product: id, quantity: qty };
            if (price > 0) {
                orderProduct.rate = price;
            }
            orderProducts.push(orderProduct);
        }
    });

    // Show info if piece items have decimal quantities
    if (pieceErrors.length > 0) {
        showToast(`${pieceErrors.join(', ')}: use whole numbers`, 'info');
        return;
    }

    if (!orderProducts.length) return;

    const btn = document.getElementById('orderBtn');
    btn.disabled = true;
    btn.textContent = 'Placing...';

    try {
        const headers = { 'Content-Type': 'application/json' };
        const csrfToken = await Auth.ensureCsrfToken();
        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        const notesInput = document.getElementById('orderNotes');
        const notes = notesInput?.value?.trim() || '';

        const orderPayload = {
            customer: selectedCustomer._id,
            products: orderProducts
        };

        if (notes) {
            orderPayload.notes = notes;
        }

        let res = await fetch('/api/orders', {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify(orderPayload)
        });

        let data = await res.json();

        // Handle CSRF error with retry
        if (res.status === 403 && data?.message?.toLowerCase().includes('csrf')) {
            const newToken = await Auth.refreshCsrfToken();
            if (newToken) {
                headers['X-CSRF-Token'] = newToken;
                res = await fetch('/api/orders', {
                    method: 'POST',
                    headers,
                    credentials: 'include',
                    body: JSON.stringify(orderPayload)
                });
                data = await res.json();
            }
        }

        if (res.ok) {
            const orderNum = data?.data?.orderNumber || 'New';
            showToast(`Order placed! #${orderNum}`, 'success');

            // Show warning if contract pricing fallback was used
            if (data.warning) {
                setTimeout(() => {
                    showToast(data.warning, 'info');
                }, 1500);
            }

            // Show confirmation if new contract prices were saved
            if (data.message && data.newContractPrices && data.newContractPrices.length > 0) {
                setTimeout(() => {
                    showToast(data.message, 'info');
                }, data.warning ? 3000 : 1500); // Delay if warning shown first
            }

            document.querySelectorAll('.qty-input').forEach(input => {
                input.value = '0';
                input.classList.remove('has-value');
            });
            document.querySelectorAll('.product-item').forEach(item => {
                item.classList.remove('has-qty');
            });
            // Clear notes field
            if (notesInput) notesInput.value = '';
            updateSummary();
        } else {
            showToast(data.message || 'Could not place order', 'info');
        }
    } catch (e) {
        console.error('Order placement error:', e);
        if (!navigator.onLine) {
            showToast('No internet connection', 'info');
        } else {
            showToast('Could not place order. Try again.', 'info');
        }
    } finally {
        btn.disabled = false;
        btn.textContent = 'Place Order';
        updateSummary();
    }
}

// ====================
// TAB MANAGEMENT
// ====================
let activeTab = 'new';

function switchTab(tabName) {
    activeTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.order-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update views
    document.querySelectorAll('.order-view').forEach(view => {
        view.classList.remove('active');
    });

    if (tabName === 'new') {
        const newOrderView = document.getElementById('newOrderView');
        if (newOrderView) newOrderView.classList.add('active');
    } else if (tabName === 'list') {
        const ordersListView = document.getElementById('ordersListView');
        if (ordersListView) ordersListView.classList.add('active');
        loadMyOrders();
    }
}

const newOrderTab = document.getElementById('newOrderTab');
const myOrdersTab = document.getElementById('myOrdersTab');
if (newOrderTab) newOrderTab.addEventListener('click', () => switchTab('new'));
if (myOrdersTab) myOrdersTab.addEventListener('click', () => switchTab('list'));

// ====================
// ORDERS LIST
// ====================
let myOrders = [];
let currentStatusFilter = 'all';

async function loadMyOrders() {
    const container = document.getElementById('ordersContainer');
    container.innerHTML = '';
    container.appendChild(createElement('div', { className: 'loading' }, 'Loading orders...'));

    try {
        const res = await fetch('/api/orders', { credentials: 'include' });
        const data = await res.json();

        if (res.ok) {
            myOrders = data.data || [];
            renderOrdersList();
        } else {
            container.innerHTML = '';
            container.appendChild(createElement('div', { className: 'empty-state' }, data.message || 'Orders not available'));
        }
    } catch (e) {
        console.error('Load orders error:', e);
        container.innerHTML = '';
        container.appendChild(createElement('div', { className: 'empty-state' }, [
            createElement('p', {}, 'Orders not available'),
            createElement('button', {
                id: 'retryOrdersBtn',
                style: { marginTop: '1rem', padding: '0.5rem 1rem', background: 'var(--dusty-olive)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' },
                onclick: loadMyOrders
            }, 'Try Again')
        ]));
    }
}

function renderOrdersList() {
    const container = document.getElementById('ordersContainer');

    let filtered = myOrders;
    if (currentStatusFilter !== 'all') {
        filtered = myOrders.filter(o => o.status === currentStatusFilter);
    }

    container.innerHTML = '';

    if (!filtered.length) {
        container.appendChild(createElement('div', { className: 'empty-state' }, 'No orders found'));
        return;
    }

    const fragment = document.createDocumentFragment();

    filtered.forEach(order => {
        const date = new Date(order.createdAt).toLocaleDateString('en-IN', {
            month: 'short', day: 'numeric', year: 'numeric'
        });

        const badges = [];
        if (order.batch?.batchType) {
            let batchText = `${order.batch.batchType} Batch`;
            // Note: Not modifying text logic here, just structure
            badges.push(createElement('span', { className: 'badge badge-batch' }, batchText));
        }
        badges.push(createElement('span', { className: `badge badge-${order.status}` }, order.status));

        const orderCard = createElement('div', {
            className: 'order-card',
            onclick: () => window.openOrderDetail(order._id)
        }, [
            createElement('div', { className: 'order-top' }, [
                createElement('div', { className: 'order-number' }, [
                    order.orderNumber,
                    order.batchLocked ? ' 🔒' : ''
                ]),
                createElement('div', { className: 'order-products-summary' }, `${order.products.length} item${order.products.length !== 1 ? 's' : ''}`)
            ]),
            createElement('div', { className: 'order-bottom' }, [
                createElement('div', { className: 'order-date' }, date),
                createElement('div', { className: 'order-badges' }, badges)
            ])
        ]);
        fragment.appendChild(orderCard);
    });

    container.appendChild(fragment);
}

function filterOrdersByStatus(status) {
    currentStatusFilter = status;

    document.querySelectorAll('.status-pill').forEach(pill => {
        pill.classList.toggle('active', pill.dataset.status === status);
    });

    renderOrdersList();
}

// Setup filter event listeners
document.querySelectorAll('.status-pill').forEach(pill => {
    pill.addEventListener('click', () => filterOrdersByStatus(pill.dataset.status));
});

// ====================
// ORDER DETAIL/EDIT MODAL
// ====================
let currentOrder = null;
let editedProducts = [];
let orderInvoices = [];

async function openOrderDetail(orderId) {
    try {
        // Fetch order and invoices in parallel
        const [orderRes, invoicesRes] = await Promise.all([
            fetch(`/api/orders/${orderId}`, { credentials: 'include' }),
            fetch(`/api/invoices/my-order/${orderId}`, { credentials: 'include' })
        ]);

        const orderData = await orderRes.json();

        if (orderRes.ok && orderData.data) {
            currentOrder = orderData.data;
            editedProducts = JSON.parse(JSON.stringify(currentOrder.products || []));

            // Load invoices (don't fail if invoice endpoint errors)
            try {
                const invoicesData = await invoicesRes.json();
                orderInvoices = invoicesRes.ok ? (invoicesData.data || []) : [];
            } catch {
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

function closeOrderModal() {
    document.getElementById('orderModal').classList.remove('show');
    document.body.style.overflow = '';
    currentOrder = null;
    editedProducts = [];
    orderInvoices = [];
}

function renderOrderModal() {
    const isPending = currentOrder.status === 'pending' && !currentOrder.batchLocked;
    const isBatchLocked = currentOrder.batchLocked;
    const titleEl = document.getElementById('orderModalTitle');
    const bodyEl = document.getElementById('orderModalBody');
    const footerEl = document.getElementById('orderModalFooter');

    titleEl.textContent = currentOrder.orderNumber;
    bodyEl.innerHTML = '';

    const contentFragment = document.createDocumentFragment();

    // Batch lock notice
    if (isBatchLocked && currentOrder.status === 'pending') {
        contentFragment.appendChild(createElement('div', { className: 'batch-lock-notice' }, [
            createElement('span', { className: 'lock-icon' }, '🔒'),
            createElement('span', {}, "This order's batch has been confirmed. Contact us to make changes.")
        ]));
    }

    // Info Grid
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
        infoGrid.appendChild(createElement('div', {}, [
            createElement('div', { className: 'info-label' }, 'Batch'),
            createElement('span', { className: 'badge badge-batch' }, [
                `${currentOrder.batch.batchType} Batch`,
                isBatchLocked ? ' 🔒' : ''
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

    // Products List
    const productsList = createElement('div', { id: 'orderProductsList' });
    renderOrderProducts(isPending, productsList);
    contentFragment.appendChild(productsList);

    // Invoices
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
                createElement('div', { className: 'invoice-download' }, [
                    // Simple SVG icon using innerHTML for simplicity as it is static SVG
                    // Alternatively could create SVG elements programmatically but that's verbose
                    // Given it's a static icon, we can use a helper or just innerHTML on a small wrapper if known safe.
                    // But to be consistent let's use innerHTML for the icon content only or create element.
                    // Let's rely on a small helper for SVG or just innerHTML for the icon part since it's hardcoded.
                ])
            ]);
            // Manually set SVG innerHTML which is safe here as it's hardcoded
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

    // Render footer
    footerEl.innerHTML = '';
    if (isPending) {
        footerEl.appendChild(createElement('button', {
            className: 'btn btn-secondary',
            onclick: () => window.closeOrderModal()
        }, 'Cancel'));

        footerEl.appendChild(createElement('button', {
            className: 'btn btn-primary',
            style: { flex: '1' },
            onclick: () => window.saveOrderEdit()
        }, 'Save Changes'));
    } else {
        footerEl.appendChild(createElement('button', {
            className: 'btn btn-primary btn-block',
            onclick: () => window.closeOrderModal()
        }, 'Close'));
    }
}

function renderOrderProducts(editable, container) {
    // If container is not provided, we might be calling from elsewhere, but here we expect it.
    // To support returning HTML string as before (if used elsewhere), we'd need to check.
    // The previous implementation returned a string. 
    // BUT we are changing it to append to container.
    // Let's check usages. It's only used in renderOrderModal above.

    if (!container) return; // Should be passed
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
                        onclick: () => window.changeOrderQty(index, -1)
                    }, '−'),
                    createElement('input', {
                        type: 'number',
                        className: 'qty-input',
                        id: `order-qty-${index}`,
                        value: item.quantity,
                        min: '0',
                        inputmode: 'numeric',
                        onchange: () => window.updateOrderQtyFromInput(index)
                    }),
                    createElement('button', {
                        className: 'qty-btn',
                        onclick: () => window.changeOrderQty(index, 1)
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
}

function updateOrderQtyFromInput(index) {
    const input = document.getElementById(`order-qty-${index}`);
    const val = Math.max(0, parseFloat(input.value) || 0);
    input.value = val;
    editedProducts[index].quantity = val;
}

async function downloadInvoice(invoiceNumber) {
    try {
        showToast('Downloading invoice...', 'info');

        const res = await fetch(`/api/invoices/my/${invoiceNumber}/download`, {
            credentials: 'include'
        });

        if (!res.ok) {
            // Try to parse error message from JSON, fallback to status text
            let errorMessage = 'Invoice not ready yet';
            try {
                const error = await res.json();
                errorMessage = error.message || errorMessage;
            } catch {
                // Response might not be JSON
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

async function saveOrderEdit() {
    try {
        // Filter out zero-quantity items
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
        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        const payload = { products };

        let res = await fetch(`/api/orders/${currentOrder._id}/customer-edit`, {
            method: 'PUT',
            headers,
            credentials: 'include',
            body: JSON.stringify(payload)
        });

        let data = await res.json();

        // Handle CSRF retry
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
            closeOrderModal();
            loadMyOrders(); // Refresh list
        } else {
            showToast(data.message || 'Could not update', 'info');
        }
    } catch (e) {
        console.error('Order edit error:', e);
        if (!navigator.onLine) {
            showToast('No internet connection', 'info');
        } else {
            showToast('Could not update. Try again.', 'info');
        }
    } finally {
        const saveBtn = document.querySelector('#orderModalFooter .btn-primary');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
        }
    }
}

// Close modal on overlay click
const orderModal = document.getElementById('orderModal');
if (orderModal) {
    orderModal.addEventListener('click', (e) => {
        if (e.target.id === 'orderModal') {
            closeOrderModal();
        }
    });
}

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('orderModal');
    if (e.key === 'Escape' && modal && modal.classList.contains('show')) {
        closeOrderModal();
    }
});

// Expose functions to window
window.clearZero = clearZero;
window.restoreZero = restoreZero;
window.changeQty = changeQty;
window.updateFromInput = updateFromInput;
window.placeOrder = placeOrder;
window.openOrderDetail = openOrderDetail;
window.closeOrderModal = closeOrderModal;
window.saveOrderEdit = saveOrderEdit;
window.renderOrderProducts = renderOrderProducts;
window.changeOrderQty = changeOrderQty;
window.updateOrderQtyFromInput = updateOrderQtyFromInput;
window.downloadInvoice = downloadInvoice;

init();
