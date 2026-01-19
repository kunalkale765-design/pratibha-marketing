
import { showToast, createElement } from '/js/ui.js';

// Wait for Auth to be available
const waitForAuth = () => new Promise((resolve) => {
    if (window.Auth) resolve(window.Auth);
    else setTimeout(() => resolve(waitForAuth()), 10);
});
const Auth = await waitForAuth();

let allProducts = [];
let allCategories = [];
let selectedCategory = '';

async function init() {
    const user = await Auth.requireAuth(['admin', 'staff']);
    if (!user) return;
    await loadProducts();
}

async function loadProducts() {
    try {
        const res = await fetch('/api/products', { credentials: 'include' });
        const data = await res.json();
        allProducts = data.data || [];

        // Extract unique categories
        const cats = new Set();
        allProducts.forEach(p => {
            if (p.category) cats.add(p.category);
        });
        allCategories = Array.from(cats).sort();

        updateCategoryPills();
        updateCategorySelect();
        searchProducts();
    } catch (e) {
        console.error('Failed to load products:', e);
        const container = document.getElementById('productsList');
        const errorMsg = !navigator.onLine ? 'No internet connection' : 'Products not available';
        container.innerHTML = '';
        container.appendChild(createElement('div', { className: 'empty-state' }, [
            createElement('p', {}, errorMsg),
            createElement('button', {
                id: 'retryProductsBtn',
                style: { marginTop: '1rem', padding: '0.5rem 1rem', background: 'var(--dusty-olive)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' },
                onclick: loadProducts
            }, 'Try Again')
        ]));
    }
}

function updateCategoryPills() {
    const container = document.getElementById('categoryPills');
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();

    fragment.appendChild(createElement('button', {
        className: `cat-pill ${selectedCategory === '' ? 'active' : ''}`,
        onclick: () => window.filterByCategory('')
    }, 'All'));

    allCategories.forEach(cat => {
        fragment.appendChild(createElement('button', {
            className: `cat-pill ${selectedCategory === cat ? 'active' : ''}`,
            onclick: () => window.filterByCategory(cat)
        }, cat));
    });

    container.appendChild(fragment);
}

function updateCategorySelect() {
    const select = document.getElementById('productCategory');
    select.innerHTML = '';
    select.appendChild(createElement('option', { value: '' }, 'Select...'));

    allCategories.forEach(cat => {
        select.appendChild(createElement('option', { value: cat }, cat));
    });
}

function filterByCategory(cat) {
    selectedCategory = cat;
    updateCategoryPills();
    searchProducts();
}

function displayProducts(products) {
    const container = document.getElementById('productsList');
    container.innerHTML = '';

    if (!products || !products.length) {
        container.appendChild(createElement('div', { className: 'empty-state' }, 'No products found'));
        return;
    }

    // Group products by category
    const grouped = {};
    products.forEach(p => {
        const cat = p.category || 'Uncategorized';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(p);
    });

    // Sort categories (Uncategorized at end)
    const sortedCategories = Object.keys(grouped).sort((a, b) => {
        if (a === 'Uncategorized') return 1;
        if (b === 'Uncategorized') return -1;
        return a.localeCompare(b);
    });

    const fragment = document.createDocumentFragment();
    let idx = 0;

    sortedCategories.forEach(cat => {
        fragment.appendChild(createElement('div', { className: 'category-header' }, cat));

        grouped[cat].forEach(p => {
            const productCard = createElement('div', {
                className: 'product-card card-animated card-fade-in',
                style: { animationDelay: `${idx * 0.05}s` }
            }, [
                createElement('div', { className: 'product-info' }, [
                    createElement('div', { className: 'product-name' }, p.name),
                    createElement('div', { className: 'product-meta' }, [
                        createElement('span', {}, p.unit || '')
                    ])
                ]),
                createElement('div', { className: 'product-actions' }, [
                    createElement('button', {
                        onclick: () => window.editProductById(p._id),
                        className: 'btn-icon'
                    }, '✎'),
                    createElement('button', {
                        onclick: () => window.deleteProduct(p._id),
                        className: 'btn-icon danger'
                    }, '✕')
                ])
            ]);
            fragment.appendChild(productCard);
            idx++;
        });
    });

    container.appendChild(fragment);
}

function searchProducts() {
    const q = document.getElementById('searchInput').value.toLowerCase();

    const filtered = allProducts.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(q);
        const matchesCategory = !selectedCategory || p.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    displayProducts(filtered);
}

function showAddProductForm() {
    document.getElementById('modalTitle').textContent = 'Add Product';
    document.getElementById('productForm').reset();
    document.getElementById('productId').value = '';
    document.getElementById('productModal').classList.add('show');
}

function editProductById(id) {
    const product = allProducts.find(p => p._id === id);
    if (!product) return;

    document.getElementById('modalTitle').textContent = 'Edit Product';
    document.getElementById('productId').value = product._id;
    document.getElementById('productName').value = product.name;
    document.getElementById('productCategory').value = product.category || '';
    document.getElementById('productUnit').value = product.unit;
    document.getElementById('productModal').classList.add('show');
}

function closeModal() {
    document.getElementById('productModal').classList.remove('show');
}

function setupFormListeners() {
    const form = document.getElementById('productForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveProduct();
        });
    }

    // Add category on Enter key
    const newCatInput = document.getElementById('newCategoryInput');
    if (newCatInput) {
        newCatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addCategory();
            }
        });
    }
}

async function saveProduct(_isRetry = false) {
    const id = document.getElementById('productId').value;
    const category = document.getElementById('productCategory').value;
    const name = document.getElementById('productName').value.trim();
    const unit = document.getElementById('productUnit').value;

    // Client-side validation
    if (!name) {
        showToast('Please enter product name', 'info');
        document.getElementById('productName').focus();
        return;
    }

    if (!unit) {
        showToast('Please select a unit', 'info');
        document.getElementById('productUnit').focus();
        return;
    }

    const data = {
        name: name,
        unit: unit
    };
    if (category) data.category = category;

    try {
        const url = id ? `/api/products/${id}` : '/api/products';
        const method = id ? 'PUT' : 'POST';

        const headers = { 'Content-Type': 'application/json' };
        const csrfToken = await Auth.ensureCsrfToken();
        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        const res = await fetch(url, {
            method,
            headers,
            credentials: 'include',
            body: JSON.stringify(data)
        });

        // Handle CSRF error with retry
        if (res.status === 403 && !_isRetry) {
            const err = await res.json();
            if (err.message?.toLowerCase().includes('csrf')) {
                await Auth.refreshCsrfToken();
                return saveProduct(true);
            }
        }

        if (res.ok) {
            showToast(id ? 'Product updated' : 'Product added', 'success');
            closeModal();
            loadProducts();
        } else {
            const err = await res.json();
            showToast(err.message || 'Could not save', 'info');
        }
    } catch (e) {
        console.error('Save product error:', e);
        if (!navigator.onLine) {
            showToast('No internet connection', 'info');
        } else {
            showToast('Could not save. Try again.', 'info');
        }
    }
}

async function deleteProduct(id, _isRetry = false) {
    if (!_isRetry && !confirm('Delete this product?')) return;

    try {
        const headers = {};
        const csrfToken = await Auth.ensureCsrfToken();
        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        const res = await fetch(`/api/products/${id}`, {
            method: 'DELETE',
            headers,
            credentials: 'include'
        });

        // Handle CSRF error with retry
        if (res.status === 403 && !_isRetry) {
            const err = await res.json();
            if (err.message?.toLowerCase().includes('csrf')) {
                await Auth.refreshCsrfToken();
                return deleteProduct(id, true);
            }
        }

        if (res.ok) {
            showToast('Product deleted', 'success');
            loadProducts();
        } else {
            const err = await res.json();
            showToast(err.message || 'Could not delete', 'info');
        }
    } catch (e) {
        console.error('Delete product error:', e);
        if (!navigator.onLine) {
            showToast('No internet connection', 'info');
        } else {
            showToast('Could not delete. Try again.', 'info');
        }
    }
}

// Category Management
function showCategoryModal() {
    displayCategoryList();
    document.getElementById('categoryModal').classList.add('show');
}

function closeCategoryModal() {
    document.getElementById('categoryModal').classList.remove('show');
    document.getElementById('newCategoryInput').value = '';
}

function displayCategoryList() {
    const container = document.getElementById('categoryList');
    container.innerHTML = '';

    if (!allCategories.length) {
        container.appendChild(createElement('div', { className: 'empty-state' }, 'No categories yet'));
        return;
    }

    const fragment = document.createDocumentFragment();

    allCategories.forEach(cat => {
        const count = allProducts.filter(p => p.category === cat).length;
        const item = createElement('div', { className: 'category-item' }, [
            createElement('div', {}, [
                createElement('div', { className: 'category-item-name' }, cat),
                createElement('div', { className: 'category-item-count' }, `${count} product${count !== 1 ? 's' : ''}`)
            ])
        ]);

        if (count === 0) {
            item.appendChild(createElement('button', {
                onclick: () => window.deleteCategory(cat),
                className: 'btn-icon danger',
                style: { width: '32px', height: '32px' }
            }, '×'));
        }

        fragment.appendChild(item);
    });

    container.appendChild(fragment);
}

function addCategory() {
    const input = document.getElementById('newCategoryInput');
    const name = input.value.trim();

    if (!name) {
        // Focus the input to guide user
        input.focus();
        return;
    }

    if (allCategories.includes(name)) {
        showToast('Category already exists', 'info');
        input.select();
        return;
    }

    allCategories.push(name);
    allCategories.sort();

    input.value = '';
    updateCategoryPills();
    updateCategorySelect();
    displayCategoryList();
    showToast('Category added', 'success');
}

function deleteCategory(name) {
    const count = allProducts.filter(p => p.category === name).length;
    if (count > 0) {
        showToast(`Move or delete ${count} product(s) first`, 'info');
        return;
    }

    allCategories = allCategories.filter(c => c !== name);
    updateCategoryPills();
    updateCategorySelect();
    displayCategoryList();
    showToast('Category removed', 'success');
}

// Expose functions to window for inline handlers
window.showAddProductForm = showAddProductForm;
window.showCategoryModal = showCategoryModal;
window.filterByCategory = filterByCategory;
window.searchProducts = searchProducts;
window.editProductById = editProductById;
window.deleteProduct = deleteProduct;
window.closeModal = closeModal;
window.closeCategoryModal = closeCategoryModal;
window.addCategory = addCategory;
window.deleteCategory = deleteCategory;

// Close modals on overlay click
// We should check existence as scripts load
const productModal = document.getElementById('productModal');
if (productModal) {
    productModal.onclick = (e) => {
        if (e.target.id === 'productModal') closeModal();
    };
}
const categoryModal = document.getElementById('categoryModal');
if (categoryModal) {
    categoryModal.onclick = (e) => {
        if (e.target.id === 'categoryModal') closeCategoryModal();
    };
}

setupFormListeners();

init();
