import { showToast, createElement } from '/js/ui.js';

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

export function openLedgerModal() {
    if (ledgerCustomers.length === 0) {
        loadLedgerCustomers();
    }
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    document.getElementById('ledgerFromDate').value = firstDay.toISOString().split('T')[0];
    document.getElementById('ledgerToDate').value = now.toISOString().split('T')[0];

    document.getElementById('ledgerModal').classList.add('show');
    document.body.style.overflow = 'hidden';
}

export function closeLedgerModal() {
    document.getElementById('ledgerModal').classList.remove('show');
    document.body.style.overflow = '';
}

export async function downloadLedger() {
    const customerId = document.getElementById('ledgerCustomer').value;
    const fromDate = document.getElementById('ledgerFromDate').value;
    const toDate = document.getElementById('ledgerToDate').value;

    const params = new URLSearchParams();
    if (customerId) params.append('customerId', customerId);
    if (fromDate) params.append('fromDate', fromDate);
    if (toDate) params.append('toDate', toDate);

    const downloadBtn = document.querySelector('#ledgerModal .btn-download, #ledgerModal button[onclick*="downloadLedger"]');
    if (downloadBtn) {
        downloadBtn.disabled = true;
        downloadBtn.classList.add('btn-loading');
    }

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
        closeLedgerModal();
    } catch (e) {
        console.error('Download ledger error:', e);
        showToast(e.message || 'Could not download', 'info');
    } finally {
        if (downloadBtn) {
            downloadBtn.disabled = false;
            downloadBtn.classList.remove('btn-loading');
        }
    }
}
