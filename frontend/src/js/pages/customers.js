
import { showToast, createElement } from '/js/ui.js';

// Wait for Auth to be available
const waitForAuth = () => new Promise((resolve) => {
    if (window.Auth) resolve(window.Auth);
    else setTimeout(() => resolve(waitForAuth()), 10);
});
const Auth = await waitForAuth();

let allCustomers = [];
let allProducts = [];
let currentContractPrices = {};
let selectedContractCategory = '';
let showTestCustomers = false;

async function init() {
    // Pre-fetch CSRF token to ensure it's ensureCsrfTokenready before form submissions
    Auth.ensureCsrfToken().catch(err => console.warn('CSRF pre-fetch failed:', err));

    const user = await Auth.requireAuth(['admin', 'staff']);
    if (!user) return;
    await Promise.all([loadCustomers(), loadProducts()]);
}

async function loadProducts() {
    try {
        const res = await fetch('/api/products', { credentials: 'include' });
        if (!res.ok) {
            throw new Error(`Server returned ${res.status}`);
        }
        const data = await res.json();
        allProducts = data.data || [];
    } catch (e) {
        console.error('Failed to load products:', e);
        showToast('Products not available. Try again.', 'info');
    }
}

async function loadCustomers() {
    try {
        const url = showTestCustomers ? '/api/customers?includeTest=true' : '/api/customers';
        const res = await fetch(url, { credentials: 'include' });
        const data = await res.json();
        allCustomers = data.data || [];
        displayCustomers(allCustomers);
    } catch (e) {
        console.error('Failed to load customers:', e);
        const container = document.getElementById('customersList');
        const errorMsg = !navigator.onLine ? 'No internet connection' : 'Customers not available';
        container.innerHTML = '';
        container.appendChild(createElement('div', { className: 'empty-state' }, [
            createElement('p', {}, errorMsg),
            createElement('button', {
                id: 'retryCustomersBtn',
                style: { marginTop: '1rem', padding: '0.5rem 1rem', background: 'var(--dusty-olive)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' },
                onclick: loadCustomers
            }, 'Try Again')
        ]));
    }
}

function getPricingBadge(customer) {
    const type = customer.pricingType || 'market';
    if (type === 'contract') {
        return createElement('span', { className: 'badge badge-contract' }, 'Contract');
    } else if (type === 'markup') {
        return createElement('span', { className: 'badge badge-markup' }, `+${customer.markupPercentage || 0}%`);
    }
    return createElement('span', { className: 'badge badge-market' }, 'Market');
}

function _formatCurrency(amount) {
    if (amount === undefined || amount === null) return '-';
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

function displayCustomers(customers) {
    const container = document.getElementById('customersList');

    if (!customers || !customers.length) {
        container.innerHTML = '';
        container.appendChild(createElement('div', { className: 'empty-state' }, 'No customers found'));
        return;
    }

    container.innerHTML = '';
    const fragment = document.createDocumentFragment();

    customers.forEach((c, idx) => {
        const details = [];
        if (c.phone) details.push(createElement('span', {}, c.phone));
        if (c.address) details.push(createElement('span', {}, c.address));

        const actions = [
            createElement('button', {
                onclick: () => window.shareMagicLink(c._id),
                className: 'btn-action link',
                title: 'Share order link'
            }, 'Link')
        ];

        if (c.pricingType === 'contract') {
            actions.push(createElement('button', {
                onclick: () => window.openContractPrices(c._id),
                className: 'btn-action'
            }, 'Prices'));
        }

        actions.push(createElement('button', {
            onclick: () => window.editCustomerById(c._id),
            className: 'btn-action primary'
        }, 'Edit'));

        actions.push(createElement('button', {
            onclick: () => window.deleteCustomer(c._id),
            className: 'btn-action danger'
        }, 'Delete'));

        const badges = [getPricingBadge(c)];
        if (c.isTestCustomer) {
            badges.unshift(createElement('span', { className: 'badge badge-test' }, 'Test'));
        }

        const card = createElement('div', {
            className: `customer-card card-animated card-fade-in${c.isTestCustomer ? ' test-customer' : ''}`,
            style: { animationDelay: `${idx * 0.05}s` }
        }, [
            createElement('div', { className: 'customer-header' }, [
                createElement('div', { className: 'customer-name' }, c.name),
                createElement('div', { className: 'customer-badges' }, badges)
            ]),
            createElement('div', { className: 'customer-details' }, details),
            createElement('div', { className: 'customer-actions' }, actions)
        ]);
        fragment.appendChild(card);
    });

    container.appendChild(fragment);
}

function searchCustomers() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    const filtered = allCustomers.filter(c =>
        c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q))
    );
    displayCustomers(filtered);
}

function toggleMarkupField() {
    const type = document.getElementById('customerPricingType').value;
    document.getElementById('markupField').classList.toggle('hidden', type !== 'markup');
    document.getElementById('contractInfo').classList.toggle('hidden', type !== 'contract');
}

function showAddCustomerForm() {
    document.getElementById('modalTitle').textContent = 'Add Customer';
    document.getElementById('customerForm').reset();
    document.getElementById('customerId').value = '';
    document.getElementById('customerIsTest').checked = false;
    document.getElementById('customerPricingType').value = 'market';
    toggleMarkupField();
    document.getElementById('customerModal').classList.add('show');
}

function editCustomer(customer) {
    document.getElementById('modalTitle').textContent = 'Edit Customer';
    document.getElementById('customerId').value = customer._id;
    document.getElementById('customerName').value = customer.name;
    document.getElementById('customerPhone').value = customer.phone || '';
    document.getElementById('customerWhatsapp').value = customer.whatsapp || '';
    document.getElementById('customerAddress').value = customer.address || '';
    document.getElementById('customerIsTest').checked = customer.isTestCustomer || false;
    document.getElementById('customerPricingType').value = customer.pricingType || 'market';
    document.getElementById('customerMarkup').value = customer.markupPercentage || 0;
    toggleMarkupField();
    document.getElementById('customerModal').classList.add('show');
}

function closeModal() {
    document.getElementById('customerModal').classList.remove('show');
}

// Global listener setup
// We can't attach this in strict module scope if the element doesn't exist yet, 
// so we'll do it possibly in init or check existence.
// Ideally, we move this logic to inside init or a setup function.
function setupFormListeners() {
    const form = document.getElementById('customerForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const btn = document.getElementById('saveCustomerBtn');
            const id = document.getElementById('customerId').value;
            const pricingType = document.getElementById('customerPricingType').value;

            // Client-side validation
            const name = document.getElementById('customerName').value.trim();
            const phone = document.getElementById('customerPhone').value.trim();
            const whatsapp = document.getElementById('customerWhatsapp').value.trim();

            if (!name) {
                showToast('Please enter customer name', 'info');
                document.getElementById('customerName').focus();
                return;
            }

            // Validate phone number format (if provided)
            if (phone && !/^[0-9]{10}$/.test(phone)) {
                showToast('Phone should be 10 digits', 'info');
                document.getElementById('customerPhone').focus();
                return;
            }

            // Validate WhatsApp number format (if provided)
            if (whatsapp && !/^[0-9]{10}$/.test(whatsapp)) {
                showToast('WhatsApp should be 10 digits', 'info');
                document.getElementById('customerWhatsapp').focus();
                return;
            }

            // Validate markup percentage
            const markupValue = parseFloat(document.getElementById('customerMarkup').value) || 0;
            if (pricingType === 'markup' && (markupValue < 0 || markupValue > 200)) {
                showToast('Markup should be 0-200%', 'info');
                document.getElementById('customerMarkup').focus();
                return;
            }

            btn.classList.add('btn-loading');
            btn.disabled = true;

            const data = {
                name: name,
                phone: phone,
                whatsapp: whatsapp,
                address: document.getElementById('customerAddress').value.trim(),
                isTestCustomer: document.getElementById('customerIsTest').checked,
                pricingType: pricingType,
                markupPercentage: pricingType === 'markup' ? markupValue : 0
            };

            try {
                const url = id ? `/api/customers/${id}` : '/api/customers';
                const method = id ? 'PUT' : 'POST';

                const headers = { 'Content-Type': 'application/json' };
                const csrfToken = await Auth.ensureCsrfToken();
                if (csrfToken) {
                    headers['X-CSRF-Token'] = csrfToken;
                }

                let res = await fetch(url, {
                    method,
                    headers,
                    credentials: 'include',
                    body: JSON.stringify(data)
                });

                // Handle CSRF error with retry
                if (res.status === 403) {
                    const err = await res.json();
                    if (err.message?.toLowerCase().includes('csrf')) {
                        const newToken = await Auth.refreshCsrfToken();
                        if (newToken) {
                            headers['X-CSRF-Token'] = newToken;
                            res = await fetch(url, {
                                method,
                                headers,
                                credentials: 'include',
                                body: JSON.stringify(data)
                            });
                        }
                    } else {
                        const msg = err.errors?.[0]?.msg || err.message || 'Could not save. Try again.';
                        showToast(msg, 'info');
                        btn.classList.remove('btn-loading');
                        btn.disabled = false;
                        return;
                    }
                }

                if (res.ok) {
                    btn.classList.remove('btn-loading');
                    btn.classList.add('btn-success');
                    showToast(id ? 'Customer updated' : 'Customer added', 'success');
                    setTimeout(() => {
                        btn.classList.remove('btn-success');
                        closeModal();
                    }, 800);
                    loadCustomers();
                } else {
                    const err = await res.json();
                    const msg = err.errors?.[0]?.msg || err.message || 'Could not save. Try again.';
                    showToast(msg, 'info');
                }
            } catch (e) {
                console.error('Save customer error:', e);
                if (!navigator.onLine) {
                    showToast('No internet connection', 'info');
                } else {
                    showToast('Could not save. Please try again.', 'info');
                }
            } finally {
                btn.classList.remove('btn-loading');
                btn.disabled = false;
            }
        });
    }
}

async function deleteCustomer(id, _isRetry = false) {
    if (!_isRetry && !confirm('Delete this customer?')) return;

    try {
        const headers = {};
        const csrfToken = await Auth.ensureCsrfToken();
        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        const res = await fetch(`/api/customers/${id}`, {
            method: 'DELETE',
            headers,
            credentials: 'include'
        });

        // Handle CSRF error with retry
        if (res.status === 403 && !_isRetry) {
            const err = await res.json();
            if (err.message?.toLowerCase().includes('csrf')) {
                await Auth.refreshCsrfToken();
                return deleteCustomer(id, true);
            }
        }

        if (res.ok) {
            showToast('Customer deleted', 'success');
            loadCustomers();
        } else {
            const err = await res.json();
            showToast(err.message || 'Could not delete', 'info');
        }
    } catch (e) {
        console.error('Delete customer error:', e);
        if (!navigator.onLine) {
            showToast('No internet connection', 'info');
        } else {
            showToast('Could not delete. Please try again.', 'info');
        }
    }
}

function editCustomerById(id) {
    const customer = allCustomers.find(c => c._id === id);
    if (customer) editCustomer(customer);
}

// Magic Link sharing
async function shareMagicLink(customerId, _isRetry = false) {
    const customer = allCustomers.find(c => c._id === customerId);
    if (!customer) {
        showToast('Customer data updating. Please refresh.', 'info');
        return;
    }

    try {
        const headers = {};
        const csrfToken = await Auth.ensureCsrfToken();
        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        const res = await fetch(`/api/customers/${customerId}/magic-link`, {
            method: 'POST',
            headers,
            credentials: 'include'
        });

        const data = await res.json();

        // Handle CSRF error with retry
        if (res.status === 403 && data?.message?.toLowerCase().includes('csrf') && !_isRetry) {
            await Auth.refreshCsrfToken();
            return shareMagicLink(customerId, true);
        }

        if (res.ok && data.data) {
            const link = data.data.link;

            // Try to copy to clipboard
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(link);
                showToast(`Link copied for ${customer.name}`, 'success');
            } else {
                // Fallback - show the link in a prompt
                prompt('Copy this order link:', link);
            }

            // Also try to share if available (mobile)
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: 'Pratibha Marketing - Order',
                        text: `Place your order here, ${customer.name}`,
                        url: link
                    });
                } catch (shareErr) {
                    // Only silence AbortError (user cancelled)
                    if (shareErr.name !== 'AbortError') {
                        console.warn('Share API failed:', shareErr.name, shareErr.message);
                    }
                    // Link already copied to clipboard, so no user action needed
                }
            }
        } else {
            showToast(data.message || 'Could not generate link', 'info');
        }
    } catch (e) {
        console.error('Magic link error:', e);
        if (!navigator.onLine) {
            showToast('No internet connection', 'info');
        } else {
            showToast('Could not generate link. Try again.', 'info');
        }
    }
}

// Contract Prices
async function openContractPrices(customerId) {
    const customer = allCustomers.find(c => c._id === customerId);
    if (!customer) {
        showToast('Customer data updating. Please refresh.', 'info');
        return;
    }

    // Make sure products are loaded
    if (!allProducts.length) {
        await loadProducts();
    }

    document.getElementById('contractCustomerId').value = customerId;
    document.getElementById('contractCustomerName').textContent = customer.name;

    // Handle both Map and Object formats
    if (customer.contractPrices instanceof Map) {
        currentContractPrices = Object.fromEntries(customer.contractPrices);
    } else {
        currentContractPrices = customer.contractPrices || {};
    }

    // Build category pills
    buildContractCategoryPills();
    selectedContractCategory = '';
    document.getElementById('productSearch').value = '';

    displayContractProducts(allProducts);
    document.getElementById('contractModal').classList.add('show');
}

function buildContractCategoryPills() {
    const categories = [...new Set(allProducts.map(p => p.category || 'Other'))].sort();
    const container = document.getElementById('contractCategoryPills');

    container.innerHTML = '';
    const fragment = document.createDocumentFragment();

    fragment.appendChild(createElement('button', {
        className: 'cat-pill active',
        dataset: { category: '' },
        onclick: () => window.filterByContractCategory('')
    }, 'All'));

    categories.forEach(cat => {
        const displayName = cat.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        fragment.appendChild(createElement('button', {
            className: 'cat-pill',
            dataset: { category: cat },
            onclick: () => window.filterByContractCategory(cat)
        }, displayName));
    });

    container.appendChild(fragment);
}

function displayContractProducts(products) {
    const container = document.getElementById('contractPricesList');
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();

    products.forEach(p => {
        const price = currentContractPrices[p._id] || '';
        const item = createElement('div', { className: 'contract-item' }, [
            createElement('div', { className: 'contract-item-info' }, [
                createElement('div', { className: 'contract-item-name' }, p.name),
                createElement('div', { className: 'contract-item-base' }, `per ${p.unit}`)
            ]),
            createElement('input', {
                type: 'number',
                step: '0.01',
                min: '0',
                className: 'contract-price-input input-animated',
                dataset: { productId: p._id },
                value: String(price),
                placeholder: '₹'
            }),
            createElement('span', { className: 'contract-item-unit' }, `/${p.unit}`)
        ]);
        fragment.appendChild(item);
    });

    container.appendChild(fragment);
}

// Sync current DOM input values to state before filtering/saving
function syncPricesToState() {
    document.querySelectorAll('.contract-price-input').forEach(input => {
        const productId = input.dataset.productId;
        const price = parseFloat(input.value);
        if (!isNaN(price) && price > 0) {
            currentContractPrices[productId] = price;
        } else {
            delete currentContractPrices[productId];
        }
    });
}

function filterContractProducts() {
    syncPricesToState(); // Preserve prices before re-rendering
    const q = document.getElementById('productSearch').value.toLowerCase();
    const filtered = allProducts.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(q);
        const matchesCategory = !selectedContractCategory || (p.category || 'Other') === selectedContractCategory;
        return matchesSearch && matchesCategory;
    });
    displayContractProducts(filtered);
}

function filterByContractCategory(category) {
    syncPricesToState(); // Preserve prices before switching category
    selectedContractCategory = category;

    // Update active pill
    document.querySelectorAll('#contractCategoryPills .cat-pill').forEach(pill => {
        pill.classList.toggle('active', pill.dataset.category === category);
    });

    filterContractProducts();
}

async function saveContractPrices() {
    const customerId = document.getElementById('contractCustomerId').value;
    const customer = allCustomers.find(c => c._id === customerId);
    if (!customer) {
        showToast('Customer data updating. Please refresh.', 'info');
        return;
    }

    const btn = document.getElementById('saveContractBtn');
    btn.classList.add('btn-loading');
    btn.disabled = true;

    // Sync current visible inputs to state before saving
    syncPricesToState();

    // Use the complete state (includes prices from all categories)
    const contractPrices = { ...currentContractPrices };

    try {
        const headers = { 'Content-Type': 'application/json' };
        const csrfToken = await Auth.ensureCsrfToken();
        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        const payload = {
            name: customer.name,
            phone: customer.phone,
            contractPrices
        };

        let res = await fetch(`/api/customers/${customerId}`, {
            method: 'PUT',
            headers,
            credentials: 'include',
            body: JSON.stringify(payload)
        });

        // Handle CSRF error with retry
        if (res.status === 403) {
            const err = await res.json();
            if (err.message?.toLowerCase().includes('csrf')) {
                const newToken = await Auth.refreshCsrfToken();
                if (newToken) {
                    headers['X-CSRF-Token'] = newToken;
                    res = await fetch(`/api/customers/${customerId}`, {
                        method: 'PUT',
                        headers,
                        credentials: 'include',
                        body: JSON.stringify(payload)
                    });
                }
            }
        }

        if (res.ok) {
            btn.classList.remove('btn-loading');
            btn.classList.add('btn-success');
            showToast('Prices saved', 'success');
            setTimeout(() => {
                btn.classList.remove('btn-success');
                closeContractModal();
            }, 800);
            loadCustomers();
        } else {
            const err = await res.json();
            showToast(err.errors?.[0]?.msg || err.message || 'Could not save', 'info');
        }
    } catch (e) {
        console.error('Save contract prices error:', e);
        if (!navigator.onLine) {
            showToast('No internet connection', 'info');
        } else {
            showToast('Could not save prices. Try again.', 'info');
        }
    } finally {
        btn.classList.remove('btn-loading');
        btn.disabled = false;
    }
}

function closeContractModal() {
    document.getElementById('contractModal').classList.remove('show');
    document.getElementById('productSearch').value = '';
}

function toggleTestCustomers() {
    showTestCustomers = document.getElementById('showTestCustomers').checked;
    loadCustomers();
}

// Expose functions to window for inline handlers
window.showAddCustomerForm = showAddCustomerForm;
window.searchCustomers = searchCustomers;
window.toggleMarkupField = toggleMarkupField;
window.toggleTestCustomers = toggleTestCustomers;
window.closeModal = closeModal;
window.editCustomerById = editCustomerById;
window.deleteCustomer = deleteCustomer;
window.shareMagicLink = shareMagicLink;
window.openContractPrices = openContractPrices;
window.filterContractProducts = filterContractProducts;
window.filterByContractCategory = filterByContractCategory;
window.saveContractPrices = saveContractPrices;
window.closeContractModal = closeContractModal;
// ... add others if needed, but the HTML uses them directly from window.

// Modals overlay click handlers - Initialize in a setup function calling after DOM load if needed,
// but since we import this module at the bottom of the body, elements should exist.
const customerModal = document.getElementById('customerModal');
if (customerModal) {
    customerModal.onclick = (e) => {
        if (e.target.id === 'customerModal') closeModal();
    };
}
const contractModal = document.getElementById('contractModal');
if (contractModal) {
    contractModal.onclick = (e) => {
        if (e.target.id === 'contractModal') closeContractModal();
    };
}

// Call setup listeners
setupFormListeners();

init();
