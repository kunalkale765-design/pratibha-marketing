
import { showToast, createElement } from '/js/ui.js';
import { logout } from '/js/init.js';
import { waitForAuth } from '/js/helpers/auth-wait.js';

// Import helpers
import {
    setAuth as setHistoryAuth, setOnSave,
    openOrderDetail, closeOrderModal, downloadInvoice
} from '/js/helpers/order-form-history.js';
import { renderOrdersList } from '/js/helpers/order-form-orders-list.js';

const Auth = await waitForAuth();
setHistoryAuth(Auth);

// Logout button
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) logoutBtn.addEventListener('click', logout);

// Customer selector change
const customerSelect = document.getElementById('customerSelect');
if (customerSelect) customerSelect.addEventListener('change', onCustomerChange);

let currentUser = null;
let selectedCustomer = null;
let products = [];
const marketRates = {};
let customers = [];
let isStaff = false;

async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    const magicToken = urlParams.get('token');

    if (magicToken) {
        try {
            const res = await fetch(`/api/auth/magic/${magicToken}`, { credentials: 'include' });
            const data = await res.json();

            if (res.ok && data.user) {
                currentUser = data.user;
                Auth.setUser(data.user);
                window.history.replaceState({}, '', window.location.pathname);
            } else {
                showToast(data.message || 'Link expired. Please request a new one.', 'info');
                window.location.href = '/pages/auth/login.html';
                return;
            }
        } catch (_e) {
            showToast('Authentication issue. Please refresh.', 'info');
            window.location.href = '/pages/auth/login.html';
            return;
        }
    } else {
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
        const fetches = [
            fetch('/api/products', { credentials: 'include' }),
            fetch('/api/market-rates', { credentials: 'include' }),
            isStaff ? fetch('/api/customers', { credentials: 'include' }).catch(() => ({ ok: false })) : Promise.resolve({ ok: false })
        ];
        const [productsRes, ratesRes, customersRes] = await Promise.all(fetches);

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

    if (customers.length === 0) {
        const loadingOption = createElement('option', { value: '', disabled: true, selected: true }, 'Loading customers...');
        select.appendChild(loadingOption);
        return;
    }

    select.innerHTML = '';
    select.appendChild(createElement('option', { value: '' }, 'Select customer'));
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

function getContractPrice(contractPrices, productId) {
    if (!contractPrices) return null;
    if (contractPrices[productId] !== undefined) return contractPrices[productId];
    if (typeof contractPrices.get === 'function') return contractPrices.get(productId);
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

function getFilteredProducts() {
    if (isStaff) return products;
    if (!selectedCustomer || selectedCustomer.pricingType !== 'contract') return products;

    const allowedProductIds = selectedCustomer.allowedProducts
        || (selectedCustomer.contractPrices ? Object.keys(selectedCustomer.contractPrices) : []);

    if (allowedProductIds.length === 0) return [];
    return products.filter(p => allowedProductIds.includes(p._id));
}

function buildCategoryPills(displayProducts = products) {
    const categories = [...new Set(displayProducts.map(p => p.category || 'Other'))];
    const container = document.getElementById('categoryPills');
    container.innerHTML = '';

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

    const displayProducts = getFilteredProducts();

    if (!displayProducts.length) {
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
            const price = isStaff ? getPrice(p) : 0;
            const step = p.unit === 'piece' ? '1' : '0.01';

            const itemDataset = { id: p._id, category: cat, unit: p.unit };
            if (isStaff) itemDataset.price = price;

            const productItem = createElement('div', {
                className: 'product-item',
                dataset: itemDataset
            }, [
                createElement('div', { className: 'product-info' }, [
                    createElement('div', { className: 'product-name' }, p.name),
                    createElement('div', { className: 'product-meta' }, p.unit)
                ]),
                createElement('div', { className: 'qty-controls' }, [
                    createElement('button', { className: 'qty-btn', onclick: () => window.changeQty(p._id, -1) }, '−'),
                    createElement('input', {
                        type: 'number', className: 'qty-input', id: `qty-${p._id}`,
                        value: '0', min: '0', step: step, inputmode: 'numeric',
                        onfocus: (e) => window.clearZero(e.target),
                        onblur: (e) => window.restoreZero(e.target),
                        onchange: () => window.updateFromInput(p._id)
                    }),
                    createElement('button', { className: 'qty-btn', onclick: () => window.changeQty(p._id, 1) }, '+')
                ])
            ]);
            fragment.appendChild(productItem);
        });
    }

    container.appendChild(fragment);
}

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
        if (qty > 0) { item.classList.add('has-qty'); input.classList.add('has-value'); }
        else { item.classList.remove('has-qty'); input.classList.remove('has-value'); }
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

    const itemCountEl = document.getElementById('itemCount');
    const orderBtn = document.getElementById('orderBtn');
    if (itemCountEl) itemCountEl.textContent = items;
    if (orderBtn) orderBtn.disabled = items === 0 || !selectedCustomer;
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

async function placeOrder() {
    if (!selectedCustomer) return;

    const orderProducts = [];
    const pieceErrors = [];

    document.querySelectorAll('.product-item').forEach(item => {
        const id = item.dataset.id;
        const input = document.getElementById('qty-' + id);
        const qty = parseFloat(input?.value) || 0;
        const price = isStaff ? (parseFloat(item.dataset.price) || 0) : 0;
        const unit = item.dataset.unit;
        const name = item.querySelector('.product-name')?.textContent || 'Unknown';

        if (qty > 0) {
            if (unit === 'piece' && !Number.isInteger(qty)) pieceErrors.push(name);
            const orderProduct = { product: id, quantity: qty };
            if (isStaff && price > 0) orderProduct.rate = price;
            orderProducts.push(orderProduct);
        }
    });

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
        if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

        const notesInput = document.getElementById('orderNotes');
        const notes = notesInput?.value?.trim() || '';

        const orderPayload = {
            customer: selectedCustomer._id,
            products: orderProducts,
            idempotencyKey: crypto.randomUUID()
        };
        if (notes) orderPayload.notes = notes;

        let res = await fetch('/api/orders', {
            method: 'POST', headers, credentials: 'include',
            body: JSON.stringify(orderPayload)
        });
        let data = await res.json();

        if (res.status === 403 && data?.message?.toLowerCase().includes('csrf')) {
            const newToken = await Auth.refreshCsrfToken();
            if (newToken) {
                headers['X-CSRF-Token'] = newToken;
                res = await fetch('/api/orders', {
                    method: 'POST', headers, credentials: 'include',
                    body: JSON.stringify(orderPayload)
                });
                data = await res.json();
            }
        }

        if (res.ok) {
            const orderNum = data?.data?.orderNumber || 'New';
            showToast(`Order placed! #${orderNum}`, 'success');

            if (data.warning) {
                setTimeout(() => showToast(data.warning, 'info'), 1500);
            }
            if (data.message && data.newContractPrices && data.newContractPrices.length > 0) {
                setTimeout(() => showToast(data.message, 'info'), data.warning ? 3000 : 1500);
            }

            document.querySelectorAll('.qty-input').forEach(input => {
                input.value = '0';
                input.classList.remove('has-value');
            });
            document.querySelectorAll('.product-item').forEach(item => item.classList.remove('has-qty'));
            if (notesInput) notesInput.value = '';
            updateSummary();
        } else {
            showToast(data.message || 'Could not place order', 'info');
        }
    } catch (e) {
        console.error('Order placement error:', e);
        if (!navigator.onLine) showToast('No internet connection', 'info');
        else showToast('Could not place order. Try again.', 'info');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Place Order'; }
        updateSummary();
    }
}

// ====================
// TAB MANAGEMENT
// ====================
let _activeTab = 'new';

function switchTab(tabName) {
    _activeTab = tabName;
    document.querySelectorAll('.order-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    document.querySelectorAll('.order-view').forEach(view => view.classList.remove('active'));

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

// Wire up helper callback for after-save refresh
setOnSave(() => loadMyOrders());

async function loadMyOrders() {
    const container = document.getElementById('ordersContainer');
    container.innerHTML = '';
    container.appendChild(createElement('div', { className: 'loading' }, 'Loading orders...'));

    try {
        const res = await fetch('/api/orders', { credentials: 'include' });
        const data = await res.json();

        if (res.ok) {
            myOrders = data.data || [];
            _renderOrdersList();
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

function _renderOrdersList() {
    const container = document.getElementById('ordersContainer');
    renderOrdersList(myOrders, currentStatusFilter, container, (orderId) => openOrderDetail(orderId));
}

function filterOrdersByStatus(status) {
    currentStatusFilter = status;
    document.querySelectorAll('.status-pill').forEach(pill => {
        pill.classList.toggle('active', pill.dataset.status === status);
    });
    _renderOrdersList();
}

document.querySelectorAll('.status-pill').forEach(pill => {
    pill.addEventListener('click', () => filterOrdersByStatus(pill.dataset.status));
});

// Close modal on overlay click
const orderModal = document.getElementById('orderModal');
if (orderModal) {
    orderModal.addEventListener('click', (e) => {
        if (e.target.id === 'orderModal') closeOrderModal();
    });
}

document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('orderModal');
    if (e.key === 'Escape' && modal && modal.classList.contains('show')) closeOrderModal();
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && _activeTab === 'list') loadMyOrders();
});

// Expose functions to window
window.clearZero = clearZero;
window.restoreZero = restoreZero;
window.changeQty = changeQty;
window.updateFromInput = updateFromInput;
window.placeOrder = placeOrder;
window.openOrderDetail = openOrderDetail;
window.closeOrderModal = closeOrderModal;
window.downloadInvoice = downloadInvoice;

init();
