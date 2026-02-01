import { showToast, createElement } from '/js/ui.js';

// Added products state (module-scoped)
let addedProducts = [];

export function getAddedProducts() {
    return addedProducts;
}

export function resetAddedProducts() {
    addedProducts = [];
}

export function addProductToOrder(allProducts, marketRates, currentOrder, { onUpdate }) {
    const select = document.getElementById('productSelector');
    const productId = select.value;
    if (!productId) {
        if (allProducts.length === 0 || select.options.length <= 1) {
            showToast('No products available', 'info');
        }
        return;
    }

    const option = select.options[select.selectedIndex];
    const productName = option.dataset.name;
    const unit = option.dataset.unit;
    const rate = marketRates[productId] || 0;

    addedProducts.push({
        product: productId,
        productName: productName,
        unit: unit,
        quantity: 1,
        rate: rate
    });

    option.remove();
    renderAddedProducts();
    if (onUpdate) onUpdate();
    select.value = '';
}

export function renderAddedProducts() {
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

export function changeAddedQty(idx, delta, onUpdate) {
    const input = document.getElementById(`added-qty-${idx}`);
    if (!input) return;
    let val = parseFloat(input.value) || 0;
    val = Math.max(0, val + delta);
    if (val > 0 && val < 0.01) val = 0.01;
    input.value = val;
    addedProducts[idx].quantity = val;
    updateAddedAmount(idx);
    if (onUpdate) onUpdate();
}

export function handleAddedQtyChange(idx, onUpdate) {
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
    if (onUpdate) onUpdate();
}

export function handleAddedQtyInput(idx, onUpdate) {
    const input = document.getElementById(`added-qty-${idx}`);
    if (!input) return;
    const val = parseFloat(input.value) || 0;
    addedProducts[idx].quantity = val;
    updateAddedAmount(idx);
    if (onUpdate) onUpdate();
}

export function handleAddedPriceChange(idx, onUpdate) {
    const input = document.getElementById(`added-price-${idx}`);
    if (!input) return;
    const val = parseFloat(input.value) || 0;
    addedProducts[idx].rate = val;
    updateAddedAmount(idx);
    if (onUpdate) onUpdate();
}

function updateAddedAmount(idx) {
    const amountEl = document.getElementById(`added-amount-${idx}`);
    if (!amountEl) return;
    const p = addedProducts[idx];
    const amount = (p.quantity || 0) * (p.rate || 0);
    amountEl.textContent = `₹${amount.toLocaleString('en-IN')}`;
}

export function removeAddedProduct(idx, onUpdate) {
    const removed = addedProducts.splice(idx, 1)[0];

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
    if (onUpdate) onUpdate();
}
