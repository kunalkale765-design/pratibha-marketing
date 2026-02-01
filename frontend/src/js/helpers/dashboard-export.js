import { showToast } from '/js/ui.js';
import { escapeHtml } from '/js/utils.js';

export function printList(procurementData, searchQuery, selectedCategory) {
    const filterItems = (items) => {
        return items.filter(item => {
            const matchesSearch = !searchQuery || item.productName.toLowerCase().includes(searchQuery);
            const matchesCategory = !selectedCategory || item.category === selectedCategory;
            return matchesSearch && matchesCategory;
        });
    };

    const filteredToProcure = filterItems(procurementData.toProcure);
    const filteredProcured = filterItems(procurementData.procured);

    let toProcureRows = '';
    let currentCategory = '';
    filteredToProcure.forEach(item => {
        if (item.category !== currentCategory) {
            currentCategory = item.category;
            toProcureRows += `<div class="category-header">${escapeHtml(currentCategory)}</div>`;
        }
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

export function exportCSV(procurementData) {
    const allItems = [...procurementData.toProcure, ...procurementData.procured];
    const csvEscape = (val) => `"${String(val).replace(/"/g, '""')}"`;

    const headers = ['Category', 'Product', 'Unit', 'Procured Qty', 'New Qty', 'Total Qty', 'Rate', 'Status'];
    const rows = allItems.map(item => {
        const status = procurementData.procured.find(p => p.productId === item.productId) ? 'Procured' : 'To Procure';
        const rate = item.rate || item.currentRate || 0;

        return [
            csvEscape(item.category),
            csvEscape(item.productName),
            csvEscape(item.unit),
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
