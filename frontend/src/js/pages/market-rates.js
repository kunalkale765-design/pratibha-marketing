
import { showToast, createElement } from '/js/ui.js';

// Wait for Auth to be available (with timeout to prevent infinite recursion)
const waitForAuth = (maxWait = 10000) => new Promise((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
        if (window.Auth) return resolve(window.Auth);
        if (Date.now() - startTime > maxWait) return reject(new Error('Auth not available'));
        setTimeout(check, 50);
    };
    check();
});
const Auth = await waitForAuth();

let products = [];
const rates = {};
let changedRates = {};
let historyData = null;

async function init() {
    const user = await Auth.requireAuth(['admin', 'staff']);
    if (!user) return;

    document.getElementById('dateBar').textContent = new Date().toLocaleDateString('en-IN', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    await loadData();
    await loadHistory();
}

async function loadData() {
    try {
        const [productsRes, ratesRes] = await Promise.all([
            fetch('/api/products', { credentials: 'include' }),
            fetch('/api/market-rates', { credentials: 'include' })
        ]);

        if (!productsRes.ok) {
            throw new Error(`Products: server returned ${productsRes.status}`);
        }
        if (!ratesRes.ok) {
            throw new Error(`Market rates: server returned ${ratesRes.status}`);
        }

        const productsData = await productsRes.json();
        const ratesData = await ratesRes.json();

        products = (productsData.data || []).filter(p => p.isActive);

        // Map rates by product ID
        (ratesData.data || []).forEach(rate => {
            const pid = typeof rate.product === 'object' ? rate.product._id : rate.product;
            rates[pid] = rate.rate;
        });

        renderProducts();
    } catch (e) {
        console.error(e);
        const container = document.getElementById('productList');
        const errorMsg = !navigator.onLine ? 'No internet connection' : 'Data not available';
        container.innerHTML = '';
        container.appendChild(createElement('div', { className: 'loading' }, [
            createElement('p', {}, errorMsg),
            createElement('button', {
                id: 'retryDataBtn',
                style: { marginTop: '1rem', padding: '0.5rem 1rem', background: 'var(--dusty-olive)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' },
                onclick: loadData
            }, 'Try Again')
        ]));
    }
}

function renderProducts() {
    const container = document.getElementById('productList');
    container.innerHTML = '';

    if (!products.length) {
        container.appendChild(createElement('div', { className: 'loading' }, 'No products found'));
        return;
    }

    // Group by category
    const grouped = {};
    products.forEach(p => {
        const cat = p.category || 'other';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(p);
    });

    const fragment = document.createDocumentFragment();
    let itemIdx = 0;

    for (const [cat, prods] of Object.entries(grouped)) {
        const catName = cat.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        fragment.appendChild(createElement('div', { className: 'category-header' }, catName));

        prods.forEach(p => {
            const currentRate = rates[p._id] || 0;
            const productItem = createElement('div', {
                className: 'product-item card-animated card-fade-in',
                style: { animationDelay: `${itemIdx * 0.03}s` }
            }, [
                createElement('div', { className: 'product-info' }, [
                    createElement('div', { className: 'product-name' }, p.name),
                    createElement('div', { className: 'product-unit' }, `per ${p.unit}`)
                ]),
                createElement('input', {
                    type: 'number',
                    className: 'rate-input input-animated',
                    id: `rate-${p._id}`,
                    dataset: { id: p._id, original: String(currentRate) },
                    value: String(currentRate),
                    min: '0',
                    step: '0.01',
                    onfocus: (e) => window.clearZero(e.target),
                    onblur: (e) => window.restoreValue(e.target),
                    onchange: (e) => window.handleChange(e.target),
                    oninput: (e) => window.handleInput(e.target)
                })
            ]);
            fragment.appendChild(productItem);
            itemIdx++;
        });
    }

    container.appendChild(fragment);
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
    handleChange(input);
}

function handleInput(input) {
    const original = parseFloat(input.dataset.original);
    const current = parseFloat(input.value);
    input.classList.toggle('changed', current !== original);
}

function handleChange(input) {
    const id = input.dataset.id;
    const original = parseFloat(input.dataset.original);
    const current = parseFloat(input.value);

    if (current !== original && current > 0) {
        changedRates[id] = current;
        input.classList.add('changed');
    } else {
        delete changedRates[id];
        input.classList.remove('changed');
    }

    updateSaveButton();
}

function updateSaveButton() {
    const count = Object.keys(changedRates).length;
    document.getElementById('changesCount').textContent = count;
    document.getElementById('saveBtn').disabled = count === 0;
}

async function saveRates() {
    const btn = document.getElementById('saveBtn');

    // Client-side validation: Check for negative or invalid rates
    const invalidRates = [];
    for (const [productId, rate] of Object.entries(changedRates)) {
        if (isNaN(rate) || rate < 0) {
            const product = products.find(p => p._id === productId);
            invalidRates.push(product?.name || productId);
        }
    }

    if (invalidRates.length > 0) {
        showToast(`${invalidRates.slice(0, 2).join(', ')}: rates must be 0 or higher`, 'info');
        return;
    }

    btn.disabled = true;
    btn.classList.add('btn-loading');

    let success = 0, failed = 0;
    let firstError = null;
    const failedProducts = [];

    const headers = { 'Content-Type': 'application/json' };
    let csrfToken = await Auth.ensureCsrfToken();
    if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
    }

    for (const [productId, rate] of Object.entries(changedRates)) {
        try {
            let res = await fetch('/api/market-rates', {
                method: 'POST',
                headers,
                credentials: 'include',
                body: JSON.stringify({
                    product: productId,
                    rate: rate,
                    effectiveDate: new Date().toISOString()
                })
            });

            // Handle CSRF error with retry
            if (res.status === 403) {
                const err = await res.json().catch(() => ({}));
                if (err.message?.toLowerCase().includes('csrf')) {
                    csrfToken = await Auth.refreshCsrfToken();
                    if (csrfToken) {
                        headers['X-CSRF-Token'] = csrfToken;
                        res = await fetch('/api/market-rates', {
                            method: 'POST',
                            headers,
                            credentials: 'include',
                            body: JSON.stringify({
                                product: productId,
                                rate: rate,
                                effectiveDate: new Date().toISOString()
                            })
                        });
                    }
                }
            }

            if (res.ok) {
                success++;
                // Update the original value
                const input = document.getElementById('rate-' + productId);
                if (input) {
                    input.dataset.original = rate;
                    input.classList.remove('changed');
                }
                rates[productId] = rate;
            } else {
                failed++;
                const errData = await res.json().catch(() => ({}));
                const errorMsg = errData.message || `HTTP ${res.status}`;
                console.error('Failed to save rate for product:', productId, errorMsg);
                if (!firstError) firstError = errorMsg;
                failedProducts.push(productId);
            }
        } catch (e) {
            failed++;
            console.error('Failed to save rate for product:', productId, e.message);
            if (!firstError) firstError = e.message || 'Network error';
            failedProducts.push(productId);
        }
    }

    // Keep only failed rates for retry (clear successfully saved ones)
    const remainingRates = {};
    Object.keys(changedRates).forEach(pid => {
        if (failedProducts.includes(pid)) {
            remainingRates[pid] = changedRates[pid];
        }
    });
    changedRates = remainingRates;
    updateSaveButton();

    btn.classList.remove('btn-loading');

    if (success > 0) {
        btn.classList.add('btn-success');
        setTimeout(() => btn.classList.remove('btn-success'), 1500);
        showToast(`${success} rate(s) saved`, 'success');
    }
    if (failed > 0) {
        showToast(`${failed} rate(s) not saved`, 'info');
    }
}

// History functions
async function loadHistory() {
    const container = document.getElementById('historyContent');
    const categorySelect = document.getElementById('historyCategory');
    const selectedCategory = categorySelect.value;

    container.innerHTML = '';
    container.appendChild(createElement('div', { className: 'history-loading' }, 'Loading history...'));

    try {
        const url = `/api/market-rates/history-summary?days=7${selectedCategory !== 'all' ? `&category=${encodeURIComponent(selectedCategory)}` : ''}`;
        const res = await fetch(url, { credentials: 'include' });

        if (!res.ok) {
            throw new Error('History temporarily unavailable');
        }

        const data = await res.json();
        historyData = data;

        // Populate category dropdown (only on first load)
        if (categorySelect.options.length <= 1 && data.categories) {
            data.categories.forEach(cat => {
                const displayName = cat.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                categorySelect.appendChild(createElement('option', { value: cat }, displayName));
            });
        }

        renderHistory(data);
    } catch (e) {
        console.error('Failed to load history:', e);
        container.innerHTML = '';
        container.appendChild(createElement('div', { className: 'history-loading' }, 'History not available'));
    }
}

function renderHistory(data) {
    const container = document.getElementById('historyContent');
    container.innerHTML = '';

    if (!data.data || data.data.length === 0 || !data.data[0]?.rates?.length) {
        container.appendChild(createElement('div', { className: 'history-loading' }, 'No history data available'));
        return;
    }

    // Build date headers
    const dates = data.data[0].rates.map(r => r.date);
    const dateHeaders = dates.map(dateStr => {
        const date = new Date(dateStr);
        const day = date.toLocaleDateString('en-IN', { weekday: 'short' });
        const formatted = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        return createElement('th', { className: 'date-header' }, [
            formatted,
            createElement('span', { className: 'date-day' }, day)
        ]);
    });

    const headerRow = createElement('tr', {}, [
        createElement('th', {}, 'Product'),
        ...dateHeaders
    ]);

    const infoCell = (product) => createElement('td', {}, [
        product.name,
        createElement('br'),
        createElement('small', { style: { color: 'var(--text-muted)', fontWeight: '400' } }, `per ${product.unit}`)
    ]);

    const tableBody = createElement('tbody');
    data.data.forEach(product => {
        const row = createElement('tr');
        row.appendChild(infoCell(product));

        product.rates.forEach(r => {
            if (r.rate === null) {
                row.appendChild(createElement('td', { className: 'rate-cell rate-null' }, '-'));
            } else {
                const trendClass = r.trend || 'stable';
                const trendIcon = r.trend === 'up' ? '↑' : (r.trend === 'down' ? '↓' : '');
                const cellContent = [r.rate.toFixed(2)];
                if (trendIcon) {
                    cellContent.push(createElement('span', { className: 'trend-indicator' }, trendIcon));
                }
                row.appendChild(createElement('td', { className: `rate-cell ${trendClass}` }, cellContent));
            }
        });
        tableBody.appendChild(row);
    });

    const table = createElement('table', { className: 'history-table' }, [
        createElement('thead', {}, [headerRow]),
        tableBody
    ]);

    container.appendChild(table);
}

function exportToPDF() {
    if (!historyData || !historyData.data || historyData.data.length === 0 || !historyData.data[0]?.rates?.length) {
        showToast('No data available to export', 'info');
        return;
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });

        // Title
        doc.setFontSize(18);
        doc.setTextColor(46, 53, 50);
        doc.text('Pratibha Marketing - 7-Day Market Rate History', 14, 20);

        // Subtitle with date range
        doc.setFontSize(10);
        doc.setTextColor(138, 145, 140);
        const categorySelect = document.getElementById('historyCategory');
        const selectedCategory = categorySelect.value === 'all' ? 'All Categories' : categorySelect.options[categorySelect.selectedIndex].text;
        doc.text(`${historyData.startDate} to ${historyData.endDate} | ${selectedCategory}`, 14, 27);

        // Prepare table data
        const dates = historyData.data[0].rates.map(r => {
            const date = new Date(r.date);
            return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        });

        const tableHead = [['Product', 'Unit', ...dates]];
        const tableBody = historyData.data.map(product => {
            const rates = product.rates.map(r => r.rate !== null ? r.rate.toFixed(2) : '-');
            return [product.name, product.unit, ...rates];
        });

        // Generate table
        doc.autoTable({
            startY: 32,
            head: tableHead,
            body: tableBody,
            theme: 'grid',
            headStyles: {
                fillColor: [46, 53, 50],
                textColor: [255, 255, 255],
                fontSize: 8,
                fontStyle: 'bold'
            },
            bodyStyles: {
                fontSize: 8,
                textColor: [31, 36, 33]
            },
            columnStyles: {
                0: { fontStyle: 'bold', cellWidth: 40 },
                1: { cellWidth: 20 }
            },
            alternateRowStyles: {
                fillColor: [249, 247, 243]
            },
            margin: { left: 14, right: 14 }
        });

        // Footer
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(138, 145, 140);
            doc.text(`Generated on ${new Date().toLocaleString('en-IN')} | Page ${i} of ${pageCount}`, 14, doc.internal.pageSize.height - 10);
        }

        // Save the PDF
        const filename = `market-rates-${historyData.startDate}-to-${historyData.endDate}.pdf`;
        doc.save(filename);

        showToast('PDF exported successfully', 'success');
    } catch (e) {
        console.error('PDF export failed:', e);
        showToast('Could not export PDF', 'info');
    }
}

// Expose functions to window for inline handlers
window.clearZero = clearZero;
window.restoreValue = restoreValue;
window.handleChange = handleChange;
window.handleInput = handleInput;
window.saveRates = saveRates;
window.loadHistory = loadHistory;
window.exportToPDF = exportToPDF;

init();
