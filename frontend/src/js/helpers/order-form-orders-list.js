import { createElement } from '/js/ui.js';

export function renderOrdersList(orders, currentStatusFilter, container, onDetailClick) {
    let filtered = orders;
    if (currentStatusFilter !== 'all') {
        filtered = orders.filter(o => o.status === currentStatusFilter);
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
            const batchText = `${order.batch.batchType} Batch`;
            badges.push(createElement('span', { className: 'badge badge-batch' }, batchText));
        }
        badges.push(createElement('span', { className: `badge badge-${order.status}` }, order.status));

        const orderCard = createElement('div', {
            className: 'order-card',
            onclick: () => onDetailClick(order._id)
        }, [
            createElement('div', { className: 'order-top' }, [
                createElement('div', { className: 'order-number' }, order.orderNumber),
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
