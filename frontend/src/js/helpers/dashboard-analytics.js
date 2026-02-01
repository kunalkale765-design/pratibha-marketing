import { formatCurrency } from '/js/utils.js';
import Chart from 'chart.js/auto';

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

export async function loadAnalytics(ordersList) {
    try {
        const statusCounts = {
            pending: 0, confirmed: 0, delivered: 0, cancelled: 0
        };

        ordersList.forEach(order => {
            if (Object.hasOwn(statusCounts, order.status)) {
                statusCounts[order.status]++;
            }
        });

        document.getElementById('pendingCount').textContent = statusCounts.pending;
        document.getElementById('processingCount').textContent = statusCounts.confirmed;
        document.getElementById('deliveredCount').textContent = statusCounts.delivered;

        const statusCtx = document.getElementById('orderStatusChart');
        if (statusCtx) {
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
        if (revenueCtx) {
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
        if (topProductsCtx) {
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
