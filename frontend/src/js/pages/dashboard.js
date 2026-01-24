import { formatCurrency } from '/js/utils.js';
import { initPage, logout } from '/js/init.js';
import { showToast, createElement } from '/js/ui.js';

// Wait for Auth to be available (with timeout to prevent infinite recursion)
const waitForAuth = (attempts = 0) => new Promise((resolve, reject) => {
    if (window.Auth) {
        resolve(window.Auth);
    } else if (attempts > 500) {
        // 5 second timeout (500 * 10ms)
        reject(new Error('Auth module failed to load'));
    } else {
        setTimeout(() => waitForAuth(attempts + 1).then(resolve).catch(reject), 10);
    }
});

let Auth;
try {
    Auth = await waitForAuth();
} catch (e) {
    console.error('Auth initialization failed:', e);
    window.location.href = '/pages/auth/login.html';
}

// Initialize page
initPage();

// State
let rates = [];
let procurementData = { toProcure: [], procured: [], categories: [] };
let searchQuery = '';
let selectedCategory = '';
const changedRates = {};
let lastQuantities = {}; // Track quantities to detect new orders
let pollingInterval = null;

// Sound for new order notifications
let audioContext = null;
let notificationAudio = null;
let soundEnabled = false;
let isPolling = false; // Mutex to prevent concurrent polling

// Preload notification sound file
function preloadNotificationSound() {
    notificationAudio = new Audio('/assets/sounds/notification.wav');
    notificationAudio.preload = 'auto';
    notificationAudio.volume = 0.5;
}

// Cleanup resources on page unload to prevent memory leaks
window.addEventListener('beforeunload', () => {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
    if (audioContext) {
        audioContext.close().catch(() => {});
        audioContext = null;
    }
    if (notificationAudio) {
        notificationAudio = null;
    }
});

// Pause polling when page is hidden, resume when visible
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    } else {
        // Resume polling when page becomes visible again
        if (!pollingInterval) {
            startPolling();
        }
    }
});

// Play notification sound - tries audio file first, falls back to Web Audio API
function playNotificationSound() {
    if (!soundEnabled) return;

    // Try playing the preloaded audio file first
    if (notificationAudio) {
        notificationAudio.currentTime = 0;
        notificationAudio.play().catch(() => {
            // Fall back to Web Audio API if file playback fails
            playWebAudioNotification();
        });
        return;
    }

    // Fall back to Web Audio API
    playWebAudioNotification();
}

// Web Audio API fallback for notification sound
function playWebAudioNotification() {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        // Resume context if suspended (browser autoplay policy)
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        // Create a pleasant notification sound (two-tone beep)
        const osc1 = audioContext.createOscillator();
        const osc2 = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // First tone
        osc1.frequency.value = 880; // A5
        osc1.type = 'sine';

        // Second tone (harmony)
        osc2.frequency.value = 1108.73; // C#6
        osc2.type = 'sine';

        // Volume envelope
        const now = audioContext.currentTime;
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.3, now + 0.05);
        gainNode.gain.linearRampToValueAtTime(0.2, now + 0.15);
        gainNode.gain.linearRampToValueAtTime(0.3, now + 0.2);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.35);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.35);
        osc2.stop(now + 0.35);
    } catch (e) {
        console.log('Could not play notification sound:', e);
    }
}

// Elements
const logoutBtn = document.getElementById('logoutBtn');
const printBtn = document.getElementById('printBtn');
const exportBtn = document.getElementById('exportBtn');
const saveRatesBtn = document.getElementById('saveRatesBtn');
const purchaseSearch = document.getElementById('purchaseSearch');
const newOrderBadge = document.getElementById('newOrderBadge');
const procuredHeader = document.getElementById('procuredHeader');

// Event listeners
if (logoutBtn) logoutBtn.addEventListener('click', logout);
if (printBtn) printBtn.addEventListener('click', printList);
if (exportBtn) exportBtn.addEventListener('click', exportCSV);
if (saveRatesBtn) saveRatesBtn.addEventListener('click', saveAllRates);

// Search input
if (purchaseSearch) {
    purchaseSearch.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim().toLowerCase();
        displayProcurementList();
    });
}

// Category filter pills - event delegation for dynamically added pills
const categoryPillsContainer = document.getElementById('categoryPills');
if (categoryPillsContainer) {
    categoryPillsContainer.addEventListener('click', (e) => {
        const pill = e.target.closest('.category-pill');
        if (!pill) return;

        document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        selectedCategory = pill.dataset.category;
        displayProcurementList();
    });
}

// Populate category pills from API response
function populateCategoryPills(categories) {
    const container = document.getElementById('categoryPills');
    if (!container) return;

    // Keep "All" button, remove others
    container.innerHTML = '<button class="category-pill active" data-category="">All</button>';

    // Short display names for categories
    const displayNames = {
        'Indian Vegetables': 'Vegetables',
        'Exotic Vegetables': 'Exotic',
        'Fruits': 'Fruits',
        'Frozen': 'Frozen',
        'Dairy': 'Dairy'
    };

    categories.forEach(cat => {
        const pill = createElement('button', {
            className: 'category-pill' + (selectedCategory === cat ? ' active' : ''),
            dataset: { category: cat }
        }, displayNames[cat] || cat);
        container.appendChild(pill);
    });

    // Re-select current category if it exists
    if (selectedCategory) {
        const currentPill = container.querySelector(`[data-category="${selectedCategory}"]`);
        if (currentPill) {
            container.querySelector('.active')?.classList.remove('active');
            currentPill.classList.add('active');
        } else {
            // Category no longer exists, reset to All
            selectedCategory = '';
        }
    }
}

// Procured section toggle
if (procuredHeader) {
    procuredHeader.addEventListener('click', () => {
        procuredHeader.classList.toggle('collapsed');
    });
}

// Initialize sound on first user interaction
function initSound() {
    if (soundEnabled) return;

    try {
        // Initialize AudioContext (requires user interaction on mobile)
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        // Preload the notification audio file
        preloadNotificationSound();
        soundEnabled = true;
    } catch (e) {
        console.log('Could not initialize audio:', e);
    }
}

// Enable sound on first click anywhere
document.addEventListener('click', initSound, { once: true });
document.addEventListener('touchstart', initSound, { once: true });

async function loadDashboardStats() {
    try {
        const [ordersRes, productsRes, ratesRes, procurementRes] = await Promise.all([
            fetch('/api/orders', { credentials: 'include' }),
            fetch('/api/products', { credentials: 'include' }),
            fetch('/api/market-rates', { credentials: 'include' }),
            fetch('/api/supplier/procurement-summary', { credentials: 'include' })
        ]);

        // Validate responses before parsing
        if (!ordersRes.ok || !productsRes.ok || !ratesRes.ok || !procurementRes.ok) {
            const failedEndpoint = !ordersRes.ok ? 'orders' :
                                   !productsRes.ok ? 'products' :
                                   !ratesRes.ok ? 'rates' : 'procurement';
            throw new Error(`Failed to load ${failedEndpoint} data (status: ${
                !ordersRes.ok ? ordersRes.status :
                !productsRes.ok ? productsRes.status :
                !ratesRes.ok ? ratesRes.status : procurementRes.status
            })`);
        }

        const orders = await ordersRes.json();
        const ratesData = await ratesRes.json();
        const procurementResponse = await procurementRes.json();

        rates = ratesData.data || [];
        procurementData = {
            toProcure: procurementResponse.toProcure || [],
            procured: procurementResponse.procured || [],
            categories: procurementResponse.categories || []
        };

        // Populate category filter pills
        populateCategoryPills(procurementData.categories);

        // Check for new orders
        detectNewOrders(procurementData);

        // Store current quantities for future comparison
        storeQuantities(procurementData);

        // Calculate Total Sale (from delivered/completed orders)
        const ordersList = orders.data || [];
        const totalSale = ordersList
            .filter(o => o.status === 'delivered' || o.paymentStatus === 'paid')
            .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

        // Calculate Profit (estimate based on 15% margin)
        const profitMargin = 0.15;
        const totalProfit = totalSale * profitMargin;

        document.getElementById('totalSale').textContent = formatCurrency(totalSale);
        document.getElementById('totalProfit').textContent = formatCurrency(totalProfit);

        displayProcurementList();
        loadAnalytics(ordersList);

        // Start polling for new orders
        startPolling();
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
        const saleEl = document.getElementById('totalSale');
        const profitEl = document.getElementById('totalProfit');
        const toProcureEl = document.getElementById('toProcureList');
        if (saleEl) saleEl.textContent = '—';
        if (profitEl) profitEl.textContent = '—';
        if (toProcureEl) {
            toProcureEl.innerHTML = '';
            toProcureEl.appendChild(createElement('div', { className: 'empty-state' }, [
                createElement('p', {}, 'Data not available'),
                createElement('button', {
                    id: 'retryBtn',
                    className: 'btn-retry',
                    style: { marginTop: '1rem', padding: '0.5rem 1rem', background: 'var(--dusty-olive)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' },
                    onclick: loadDashboardStats
                }, 'Try Again')
            ]));
        }
    }
}

function storeQuantities(data) {
    lastQuantities = {};
    [...data.toProcure, ...data.procured].forEach(item => {
        lastQuantities[item.productId] = item.totalQty;
    });
}

function detectNewOrders(newData) {
    if (Object.keys(lastQuantities).length === 0) return; // First load

    let newOrderCount = 0;
    const allItems = [...newData.toProcure, ...newData.procured];

    allItems.forEach(item => {
        const prevQty = lastQuantities[item.productId] || 0;
        if (item.totalQty > prevQty) {
            newOrderCount++;
        }
    });

    if (newOrderCount > 0) {
        // Play notification sound
        playNotificationSound();

        // Show badge
        if (newOrderBadge) {
            newOrderBadge.textContent = `${newOrderCount} new`;
            newOrderBadge.classList.remove('hidden');

            // Auto-hide badge after 30 seconds
            setTimeout(() => {
                newOrderBadge.classList.add('hidden');
            }, 30000);
        }

        showToast(`${newOrderCount} product(s) have new orders!`, 'info');
    }
}

function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);

    // Poll every 30 seconds for new orders
    pollingInterval = setInterval(async () => {
        // Mutex to prevent concurrent polling requests
        if (isPolling) return;
        isPolling = true;

        try {
            const res = await fetch('/api/supplier/procurement-summary', { credentials: 'include' });
            if (!res.ok) {
                console.warn('Polling failed:', res.status);
                return;
            }
            const data = await res.json();

            if (res.ok) {
                const newProcurementData = {
                    toProcure: data.toProcure || [],
                    procured: data.procured || [],
                    categories: data.categories || []
                };

                // Detect new orders before updating
                detectNewOrders(newProcurementData);

                // Update data
                procurementData = newProcurementData;
                storeQuantities(procurementData);

                // Re-render (preserving unsaved rate inputs)
                displayProcurementList(true);
            }
        } catch (error) {
            console.error('Polling error:', error);
        } finally {
            isPolling = false;
        }
    }, 30000);
}

function displayProcurementList(preserveInputs = false) {
    const toProcureContainer = document.getElementById('toProcureList');
    const procuredContainer = document.getElementById('procuredList');
    const emptyState = document.getElementById('procurementEmpty');
    const procuredCountEl = document.getElementById('procuredCount');

    // Guard: abort early if required containers are missing from the DOM
    if (!toProcureContainer || !procuredContainer) {
        console.error('Purchase List: Required DOM elements missing (toProcureList or procuredList). Check index.html structure.');
        const fallback = document.querySelector('.procurement-container');
        if (fallback) {
            const existing = fallback.querySelector('.procurement-error');
            if (!existing) {
                const errDiv = document.createElement('div');
                errDiv.className = 'procurement-error';
                errDiv.style.cssText = 'padding:1.5rem;text-align:center;color:var(--error);font-size:0.875rem;';
                errDiv.textContent = 'Purchase list failed to load. Please refresh the page.';
                fallback.appendChild(errDiv);
            }
        }
        return;
    }

    // Preserve current input values before re-rendering
    const inputValues = {};
    if (preserveInputs) {
        document.querySelectorAll('.item-rate-input').forEach(input => {
            if (input.value) {
                inputValues[input.dataset.productId] = input.value;
            }
        });
    }

    // Clear containers
    toProcureContainer.innerHTML = '';
    procuredContainer.innerHTML = '';

    // Filter items based on search and category
    const filterItems = (items) => {
        return items.filter(item => {
            const matchesSearch = !searchQuery || item.productName.toLowerCase().includes(searchQuery);
            const matchesCategory = !selectedCategory || item.category === selectedCategory;
            return matchesSearch && matchesCategory;
        });
    };

    const filteredToProcure = filterItems(procurementData.toProcure);
    const filteredProcured = filterItems(procurementData.procured);

    // Update procured count
    if (procuredCountEl) {
        procuredCountEl.textContent = filteredProcured.length;
    }

    // Show empty state if nothing to procure
    if (filteredToProcure.length === 0 && procurementData.toProcure.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        toProcureContainer.innerHTML = '<div class="empty-list-msg">No items to procure</div>';
    } else {
        if (emptyState) emptyState.classList.add('hidden');
    }

    // Build rate map for current rates
    const rateMap = {};
    rates.forEach(rate => { rateMap[rate.product] = rate; });

    // Render TO PROCURE section
    if (filteredToProcure.length > 0) {
        const fragment = document.createDocumentFragment();

        // Add column header
        fragment.appendChild(createElement('div', { className: 'procurement-column-header' }, [
            createElement('span', { className: 'col-expand' }),
            createElement('span', { className: 'col-name' }, 'Product'),
            createElement('span', { className: 'col-qty' }, 'Qty'),
            createElement('span', { className: 'col-input' }, 'Rate')
        ]));

        // Group by category
        let currentCategory = '';
        filteredToProcure.forEach(item => {
            // Category divider
            if (item.category !== currentCategory) {
                currentCategory = item.category;
                fragment.appendChild(createElement('div', { className: 'category-divider' }, currentCategory));
            }

            const rate = rateMap[item.productId];
            const currentRate = item.currentRate || rate?.rate || 0;
            const savedValue = inputValues[item.productId] || '';
            const unsavedClass = currentRate === 0 ? ' unsaved' : '';

            // Build quantity display based on procurement status
            let qtyDisplay;
            if (item.wasProcured) {
                // Show "procuredQty + newQty" format
                qtyDisplay = createElement('span', { className: 'qty-breakdown' }, [
                    createElement('span', { className: 'procured-qty' }, String(item.procuredQty || 0)),
                    createElement('span', { className: 'separator' }, '+'),
                    createElement('span', { className: 'new-qty highlight-new' }, String(item.newQty || 0))
                ]);
            } else {
                // Show just totalQty
                qtyDisplay = createElement('span', { className: 'qty-simple' }, String(item.totalQty || 0));
            }

            // Build details section
            const detailRows = [
                createElement('div', { className: 'detail-row' }, [
                    createElement('span', { className: 'detail-label' }, 'Total Orders'),
                    createElement('span', { className: 'detail-value' }, item.totalOrders || 0)
                ])
            ];

            // Show last rate if previously procured
            if (item.wasProcured && item.lastRate) {
                detailRows.unshift(createElement('div', { className: 'detail-row highlight-info' }, [
                    createElement('span', { className: 'detail-label' }, 'Last Rate'),
                    createElement('span', { className: 'detail-value' }, `₹${item.lastRate}/${item.unit}`)
                ]));
            }

            detailRows.push(
                createElement('div', { className: 'detail-row' }, [
                    createElement('span', { className: 'detail-label' }, 'Est. Cost'),
                    createElement('span', { className: 'detail-value highlight' },
                        item.totalQty > 0 && currentRate > 0 ? formatCurrency(item.totalQty * currentRate) : '—')
                ]),
                createElement('div', { className: 'detail-row' }, [
                    createElement('span', { className: 'detail-label' }, 'Trend'),
                    createElement('span', { className: 'detail-value' },
                        item.trend === 'up' ? '↑ Up' : item.trend === 'down' ? '↓ Down' : '— Stable')
                ])
            );

            const procurementItem = createElement('div', {
                className: `procurement-item${unsavedClass}${item.wasProcured ? ' was-procured' : ''}`,
                dataset: { productId: item.productId }
            }, [
                createElement('div', {
                    className: 'item-main',
                    onclick: (e) => window.toggleExpand(e.currentTarget)
                }, [
                    createElement('span', { className: 'item-expand' }, '▶'),
                    createElement('span', { className: 'item-name' }, item.productName),
                    qtyDisplay,
                    createElement('span', { className: 'item-unit' }, item.unit),
                    createElement('input', {
                        type: 'number',
                        className: 'item-rate-input' + (savedValue ? ' changed' : ''),
                        dataset: {
                            productId: item.productId,
                            productName: item.productName,
                            currentRate: currentRate,
                            quantity: item.totalQty || 0
                        },
                        placeholder: '₹0',
                        value: savedValue,
                        step: '0.01',
                        min: '0',
                        onclick: (e) => e.stopPropagation(),
                        onchange: (e) => window.handleRateChange(e.target),
                        oninput: (e) => window.handleRateInput(e.target)
                    })
                ]),
                createElement('div', { className: 'item-details' }, detailRows)
            ]);
            fragment.appendChild(procurementItem);
        });

        toProcureContainer.appendChild(fragment);
    } else if (searchQuery || selectedCategory) {
        toProcureContainer.innerHTML = '<div class="empty-list-msg">No matching items</div>';
    }

    // Render PROCURED section
    if (filteredProcured.length > 0) {
        const fragment = document.createDocumentFragment();

        // Group by category
        let currentCategory = '';
        filteredProcured.forEach(item => {
            // Category divider
            if (item.category !== currentCategory) {
                currentCategory = item.category;
                fragment.appendChild(createElement('div', { className: 'category-divider' }, currentCategory));
            }

            const procurementItem = createElement('div', {
                className: 'procurement-item procured-item',
                dataset: { productId: item.productId }
            }, [
                createElement('div', {
                    className: 'item-main',
                    onclick: (e) => window.toggleExpand(e.currentTarget)
                }, [
                    createElement('span', { className: 'item-expand' }, '▶'),
                    createElement('span', { className: 'item-name' }, '✓ ' + item.productName),
                    createElement('span', { className: 'qty-simple' }, String(item.procuredQty || 0)),
                    createElement('span', { className: 'item-unit' }, item.unit),
                    createElement('span', { className: 'procured-rate' }, `₹${item.rate}`)
                ]),
                createElement('div', { className: 'item-details' }, [
                    createElement('div', { className: 'detail-row' }, [
                        createElement('span', { className: 'detail-label' }, 'Procured At'),
                        createElement('span', { className: 'detail-value' },
                            new Date(item.procuredAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }))
                    ]),
                    createElement('div', { className: 'detail-row' }, [
                        createElement('span', { className: 'detail-label' }, 'Total Orders'),
                        createElement('span', { className: 'detail-value' }, item.totalOrders || 0)
                    ]),
                    createElement('div', { className: 'detail-row' }, [
                        createElement('span', { className: 'detail-label' }, 'Total Value'),
                        createElement('span', { className: 'detail-value highlight' }, formatCurrency(item.procuredQty * item.rate))
                    ]),
                    createElement('div', { className: 'detail-actions' }, [
                        createElement('button', {
                            className: 'btn-undo',
                            onclick: (e) => {
                                e.stopPropagation();
                                window.undoProcurement(item.productId, item.productName);
                            }
                        }, 'Undo')
                    ])
                ])
            ]);
            fragment.appendChild(procurementItem);
        });

        procuredContainer.appendChild(fragment);
    }
}

// Global functions for inline event handlers
window.toggleExpand = function (element) {
    element.closest('.procurement-item').classList.toggle('expanded');
};

window.handleRateInput = function (input) {
    const currentRate = parseFloat(input.dataset.currentRate);
    const newRate = parseFloat(input.value);
    input.classList.toggle('changed', input.value && newRate !== currentRate);
};

window.handleRateChange = function (input) {
    const productId = input.dataset.productId;
    const productName = input.dataset.productName;
    const currentRate = parseFloat(input.dataset.currentRate);
    const quantity = parseFloat(input.dataset.quantity) || 0;
    const newRate = parseFloat(input.value);

    if (input.value && newRate !== currentRate && newRate > 0) {
        changedRates[productId] = { product: productId, productName, rate: newRate, previousRate: currentRate, quantity };
        input.classList.add('changed');
    } else {
        delete changedRates[productId];
        input.classList.remove('changed');
    }

    if (saveRatesBtn) saveRatesBtn.classList.toggle('show', Object.keys(changedRates).length > 0);
};

// Undo procurement - move item back to TO PROCURE
window.undoProcurement = async function (productId, productName) {
    if (!confirm(`Remove ${productName} from procured list?`)) return;

    try {
        const csrfToken = await Auth.ensureCsrfToken();
        const headers = { 'Content-Type': 'application/json' };
        if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

        const res = await fetch(`/api/supplier/procure/${productId}`, {
            method: 'DELETE',
            credentials: 'include',
            headers
        });

        if (!res.ok) {
            const data = await res.json();
            showToast(data.message || 'Could not undo', 'error');
            return;
        }

        showToast(`${productName} moved back to TO PROCURE`, 'success');
        loadDashboardStats();
    } catch (error) {
        console.error('Error undoing procurement:', error);
        showToast('Could not undo', 'error');
    }
};

function printList() {
    // Build print content from data model (not DOM innerHTML) to prevent XSS
    const escapeHtml = (str) => {
        if (typeof str !== 'string') return String(str);
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    // Filter items based on current search and category
    const filterItems = (items) => {
        return items.filter(item => {
            const matchesSearch = !searchQuery || item.productName.toLowerCase().includes(searchQuery);
            const matchesCategory = !selectedCategory || item.category === selectedCategory;
            return matchesSearch && matchesCategory;
        });
    };

    const filteredToProcure = filterItems(procurementData.toProcure);
    const filteredProcured = filterItems(procurementData.procured);

    // Build TO PROCURE rows from data
    let toProcureRows = '';
    let currentCategory = '';
    filteredToProcure.forEach(item => {
        if (item.category !== currentCategory) {
            currentCategory = item.category;
            toProcureRows += `<div class="category-header">${escapeHtml(currentCategory)}</div>`;
        }
        // Show procuredQty + newQty if previously procured, else just totalQty
        const qtyDisplay = item.wasProcured
            ? `${item.procuredQty || 0} + ${item.newQty || 0}`
            : `${item.totalQty || 0}`;
        toProcureRows += `
            <div class="procurement-item">
                <span class="item-name">${escapeHtml(item.productName)}</span>
                <span class="qty-breakdown">${qtyDisplay}</span>
                <span class="item-unit">${escapeHtml(item.unit)}</span>
                <span class="current-rate">₹${(item.currentRate || 0).toFixed(0)}</span>
            </div>`;
    });

    // Build PROCURED rows from data
    let procuredRows = '';
    currentCategory = '';
    filteredProcured.forEach(item => {
        if (item.category !== currentCategory) {
            currentCategory = item.category;
            procuredRows += `<div class="category-header">${escapeHtml(currentCategory)}</div>`;
        }
        procuredRows += `
            <div class="procurement-item procured-item">
                <span class="item-name">${escapeHtml(item.productName)}</span>
                <span class="qty-breakdown">${item.procuredQty || 0}</span>
                <span class="item-unit">${escapeHtml(item.unit)}</span>
                <span class="procured-rate">₹${item.rate}</span>
            </div>`;
    });

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showToast('Popup blocked. Please allow popups for this site.', 'error');
        return;
    }

    printWindow.document.write(`
        <html>
        <head>
            <title>Purchase List - Pratibha Marketing</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h1 { font-size: 18px; margin-bottom: 10px; }
                h2 { font-size: 14px; margin-top: 20px; color: #666; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
                .date { color: #666; margin-bottom: 20px; }
                .category-header { font-weight: bold; color: #666; margin: 15px 0 5px; font-size: 12px; text-transform: uppercase; }
                .procurement-item { padding: 8px 0; border-bottom: 1px solid #eee; display: flex; gap: 10px; align-items: center; }
                .item-name { font-weight: bold; flex: 1; }
                .qty-breakdown { font-family: monospace; min-width: 100px; }
                .item-unit { color: #666; min-width: 50px; }
                .current-rate { color: #666; min-width: 60px; text-align: right; }
                .procured-rate { color: #5d7a5f; font-weight: bold; min-width: 60px; text-align: right; }
                .procured-item .item-name::before { content: '✓ '; color: #5d7a5f; }
                .empty-msg { color: #999; font-style: italic; padding: 10px 0; }
            </style>
        </head>
        <body>
            <h1>Purchase List - Pratibha Marketing</h1>
            <div class="date">${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
            <h2>TO PROCURE (${filteredToProcure.length} items)</h2>
            ${toProcureRows || '<div class="empty-msg">No items to procure</div>'}
            <h2>PROCURED (${filteredProcured.length} items)</h2>
            ${procuredRows || '<div class="empty-msg">No procured items</div>'}
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
}

function exportCSV() {
    const allItems = [...procurementData.toProcure, ...procurementData.procured];

    const headers = ['Category', 'Product', 'Unit', 'Procured Qty', 'New Qty', 'Total Qty', 'Rate', 'Status'];
    const rows = allItems.map(item => {
        const status = procurementData.procured.find(p => p.productId === item.productId) ? 'Procured' : 'To Procure';
        const rate = item.rate || item.currentRate || 0;

        return [
            `"${item.category}"`,
            `"${item.productName}"`,
            item.unit,
            item.procuredQty || 0,
            item.newQty || 0,
            item.totalQty || item.procuredQty || 0,
            rate,
            status
        ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchase-list-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

async function saveAllRates() {
    if (!saveRatesBtn) return;
    saveRatesBtn.textContent = 'Saving...';
    saveRatesBtn.disabled = true;

    const failures = [];
    const successfulProducts = [];

    const headers = { 'Content-Type': 'application/json' };
    let csrfToken = await Auth.ensureCsrfToken();
    if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
    }

    for (const [productId, rateData] of Object.entries(changedRates)) {
        try {
            // Use the new /api/supplier/procure endpoint which marks as procured AND updates market rate
            let response = await fetch('/api/supplier/procure', {
                method: 'POST',
                headers,
                credentials: 'include',
                body: JSON.stringify({
                    productId: rateData.product,
                    rate: rateData.rate,
                    quantity: rateData.quantity || 0
                })
            });

            // Handle CSRF error with retry
            if (response.status === 403) {
                const errorData = await response.json().catch(() => ({}));
                if (errorData.message?.toLowerCase().includes('csrf')) {
                    csrfToken = await Auth.refreshCsrfToken();
                    if (csrfToken) {
                        headers['X-CSRF-Token'] = csrfToken;
                        response = await fetch('/api/supplier/procure', {
                            method: 'POST',
                            headers,
                            credentials: 'include',
                            body: JSON.stringify({
                                productId: rateData.product,
                                rate: rateData.rate,
                                quantity: rateData.quantity || 0
                            })
                        });
                    }
                } else {
                    failures.push({ productName: rateData.productName || productId, error: errorData.message || `HTTP ${response.status}` });
                    continue;
                }
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                failures.push({ productName: rateData.productName || productId, error: errorData.message || `HTTP ${response.status}` });
            } else {
                successfulProducts.push(productId);
            }
        } catch (error) {
            console.error('Error saving rate:', error);
            failures.push({ productName: rateData.productName || productId, error: error.message || 'Network error' });
        }
    }

    // Only clear successful rates from changedRates
    for (const productId of successfulProducts) {
        delete changedRates[productId];
    }

    saveRatesBtn.textContent = 'Save';
    saveRatesBtn.disabled = false;

    if (failures.length > 0) {
        showToast(`${failures.length} rate(s) not saved. Try again.`, 'info');
        if (Object.keys(changedRates).length > 0) {
            saveRatesBtn.classList.add('show');
        } else {
            saveRatesBtn.classList.remove('show');
        }
    } else {
        saveRatesBtn.classList.remove('show');
        document.querySelectorAll('.item-rate-input').forEach(input => {
            input.value = '';
            input.classList.remove('changed');
        });
        showToast('Items marked as procured!', 'success');
    }

    loadDashboardStats();
}

async function checkAPIHealth() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();

        if (data.status === 'ok') {
            document.getElementById('apiDot').classList.remove('offline');
            document.getElementById('apiStatus').textContent = 'API Online';
        } else {
            document.getElementById('apiDot').classList.add('offline');
            document.getElementById('apiStatus').textContent = 'API Offline';
        }
    } catch (_error) {
        document.getElementById('apiDot').classList.add('offline');
        document.getElementById('apiStatus').textContent = 'API Offline';
    }
}

// Analytics Charts
let orderStatusChart = null;
let revenueChart = null;
let topProductsChart = null;

const chartColors = {
    olive: 'rgb(126, 145, 129)',
    oliveLight: 'rgba(126, 145, 129, 0.2)',
    gunmetal: 'rgb(46, 53, 50)',
    terracotta: 'rgb(196, 167, 125)',
    success: 'rgb(93, 122, 95)',
    warning: 'rgb(184, 154, 90)',
    error: 'rgb(154, 101, 101)',
    slate: 'rgb(199, 206, 219)'
};

async function loadAnalytics(ordersList) {
    try {
        // Order Status Distribution (simplified: pending, confirmed, delivered, cancelled)
        const statusCounts = {
            pending: 0, confirmed: 0, delivered: 0, cancelled: 0
        };

        ordersList.forEach(order => {
            if (Object.hasOwn(statusCounts, order.status)) {
                statusCounts[order.status]++;
            }
        });

        // Update summary counts
        document.getElementById('pendingCount').textContent = statusCounts.pending;
        document.getElementById('processingCount').textContent = statusCounts.confirmed;
        document.getElementById('deliveredCount').textContent = statusCounts.delivered;

        // Order Status Doughnut Chart
        const statusCtx = document.getElementById('orderStatusChart');
        if (!statusCtx) {
            console.warn('Order status chart canvas not found');
        } else {
            if (orderStatusChart) orderStatusChart.destroy();

            orderStatusChart = new Chart(statusCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Pending', 'Confirmed', 'Delivered', 'Cancelled'],
                    datasets: [{
                        data: [
                            statusCounts.pending, statusCounts.confirmed,
                            statusCounts.delivered, statusCounts.cancelled
                        ],
                        backgroundColor: [
                            chartColors.warning, chartColors.olive,
                            chartColors.success, chartColors.error
                        ],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '60%',
                    plugins: { legend: { display: false } }
                }
            });
        }

        // Revenue Trend (Last 7 Days)
        const last7Days = [];
        const revenueByDay = {};

        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            last7Days.push(dateStr);
            revenueByDay[dateStr] = 0;
        }

        ordersList.forEach(order => {
            if (order.status !== 'cancelled') {
                const orderDate = new Date(order.createdAt).toISOString().split('T')[0];
                if (Object.hasOwn(revenueByDay, orderDate)) {
                    revenueByDay[orderDate] += order.totalAmount || 0;
                }
            }
        });

        const revenueData = last7Days.map(date => revenueByDay[date]);
        const weekTotal = revenueData.reduce((sum, val) => sum + val, 0);
        const avgDaily = weekTotal / 7;

        document.getElementById('weekTotal').textContent = formatCurrency(weekTotal);
        document.getElementById('avgDaily').textContent = formatCurrency(Math.round(avgDaily));

        const revenueCtx = document.getElementById('revenueChart');
        if (!revenueCtx) {
            console.warn('Revenue chart canvas not found');
        } else {
            if (revenueChart) revenueChart.destroy();

            revenueChart = new Chart(revenueCtx, {
                type: 'line',
                data: {
                    labels: last7Days.map(d => {
                        const date = new Date(d);
                        return date.toLocaleDateString('en-IN', { weekday: 'short' });
                    }),
                    datasets: [{
                        label: 'Revenue',
                        data: revenueData,
                        borderColor: chartColors.olive,
                        backgroundColor: chartColors.oliveLight,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointBackgroundColor: chartColors.olive
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { callback: value => '₹' + value.toLocaleString('en-IN') }
                        }
                    }
                }
            });
        }

        // Top Products by Quantity
        const productQuantities = {};
        ordersList.forEach(order => {
            if (order.status !== 'cancelled' && order.products) {
                order.products.forEach(item => {
                    const name = item.productName || 'Unknown';
                    productQuantities[name] = (productQuantities[name] || 0) + (item.quantity || 0);
                });
            }
        });

        const sortedProducts = Object.entries(productQuantities)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const topProductsCtx = document.getElementById('topProductsChart');
        if (!topProductsCtx) {
            console.warn('Top products chart canvas not found');
        } else {
            if (topProductsChart) topProductsChart.destroy();

            topProductsChart = new Chart(topProductsCtx, {
                type: 'bar',
                data: {
                    labels: sortedProducts.map(([name]) => name.length > 12 ? name.slice(0, 12) + '...' : name),
                    datasets: [{
                        label: 'Quantity',
                        data: sortedProducts.map(([, qty]) => qty),
                        backgroundColor: [
                            chartColors.olive, chartColors.terracotta, chartColors.gunmetal,
                            chartColors.success, chartColors.warning
                        ],
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    plugins: { legend: { display: false } },
                    scales: { x: { beginAtZero: true } }
                }
            });
        }

    } catch (error) {
        console.error('Error loading analytics:', error);
    }
}

// ====================
// LEDGER REPORT
// ====================
let ledgerCustomers = [];

async function loadLedgerCustomers() {
    try {
        const res = await fetch('/api/customers', { credentials: 'include' });
        const data = await res.json();
        if (res.ok) {
            ledgerCustomers = data.data || [];
            const select = document.getElementById('ledgerCustomer');
            select.innerHTML = '';
            select.appendChild(createElement('option', { value: '' }, 'All Customers'));
            ledgerCustomers.forEach(c => {
                select.appendChild(createElement('option', { value: c._id }, c.name));
            });
        }
    } catch (e) {
        console.error('Error loading customers:', e);
    }
}

window.openLedgerModal = function () {
    // Load customers if not loaded
    if (ledgerCustomers.length === 0) {
        loadLedgerCustomers();
    }
    // Set default dates (current month)
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    document.getElementById('ledgerFromDate').value = firstDay.toISOString().split('T')[0];
    document.getElementById('ledgerToDate').value = now.toISOString().split('T')[0];

    document.getElementById('ledgerModal').classList.add('show');
    document.body.style.overflow = 'hidden';
};

window.closeLedgerModal = function () {
    document.getElementById('ledgerModal').classList.remove('show');
    document.body.style.overflow = '';
};

window.downloadLedger = async function () {
    const customerId = document.getElementById('ledgerCustomer').value;
    const fromDate = document.getElementById('ledgerFromDate').value;
    const toDate = document.getElementById('ledgerToDate').value;

    // Build query params
    const params = new URLSearchParams();
    if (customerId) params.append('customerId', customerId);
    if (fromDate) params.append('fromDate', fromDate);
    if (toDate) params.append('toDate', toDate);

    try {
        showToast('Downloading ledger...', 'info');

        const res = await fetch(`/api/reports/ledger?${params}`, {
            credentials: 'include'
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.message || 'Ledger temporarily unavailable');
        }

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);

        // Get filename from header or generate
        const disposition = res.headers.get('Content-Disposition');
        let filename = 'ledger.xlsx';
        if (disposition && disposition.includes('filename=')) {
            filename = disposition.split('filename=')[1].replace(/"/g, '');
        }

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        showToast('Ledger downloaded!', 'success');
        window.closeLedgerModal();
    } catch (e) {
        console.error('Download ledger error:', e);
        showToast(e.message || 'Could not download', 'info');
    }
};

async function init() {
    const user = await Auth.requireAuth(['admin', 'staff']);
    if (!user) return;

    document.getElementById('userBadge').textContent = user.name || user.email || 'User';
    loadDashboardStats();
    checkAPIHealth();
}

init();
