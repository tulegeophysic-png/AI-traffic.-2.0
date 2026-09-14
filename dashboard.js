import { countsLeft, countsRight, countsTotal } from './main.js';

let chartInstance = null;

export function initChart() {
    const chartCanvas = document.getElementById('trafficChart');
    if (!chartCanvas) return;
    chartInstance = new Chart(chartCanvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['Car', 'Motorcycle', 'Bus', 'Truck'],
            datasets: [
                { label: 'Bên Trái', data: [0, 0, 0, 0], backgroundColor: '#2563eb' },
                { label: 'Bên Phải', data: [0, 0, 0, 0], backgroundColor: '#16a34a' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: '#1e293b' }, ticks: { color: '#f8fafc', font: { size: 9 } } },
                x: { grid: { display: false }, ticks: { color: '#f8fafc', font: { size: 9 } } }
            },
            plugins: { legend: { labels: { color: '#f8fafc', font: { size: 9 } } } }
        }
    });
}

export function setStatus(className, text) {
    const badge = document.getElementById('system-status');
    if (badge) {
        badge.className = `status-pill ${className}`;
        badge.innerText = text;
    }
}

export function updateUIStats() {
    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.innerText = value;
    };
    setText('count-car-left', countsLeft.car); setText('count-car-right', countsRight.car); setText('count-car', countsTotal.car);
    setText('count-moto-left', countsLeft.motorcycle); setText('count-moto-right', countsRight.motorcycle); setText('count-moto', countsTotal.motorcycle);
    setText('count-bus-left', countsLeft.bus); setText('count-bus-right', countsRight.bus); setText('count-bus', countsTotal.bus);
    setText('count-truck-left', countsLeft.truck); setText('count-truck-right', countsRight.truck); setText('count-truck', countsTotal.truck);
    setText('count-left-total', countsLeft.total); setText('count-right-total', countsRight.total); setText('count-total', countsTotal.total);

    let density = 'LOW';
    let densityClass = 'density-low';
    if (countsTotal.total >= 40) {
        density = 'HIGH';
        densityClass = 'density-high';
    } else if (countsTotal.total >= 15) {
        density = 'MEDIUM';
        densityClass = 'density-med';
    }

    const densityBadge = document.getElementById('density-status');
    if (densityBadge) {
        densityBadge.className = `density-badge ${densityClass}`;
        densityBadge.innerText = density;
    }

    const banner = document.getElementById('congestion-banner');
    if (banner) {
        if (density === 'HIGH') {
            banner.style.background = '#dc2626';
            banner.innerText = '⚠️ TRAFFIC CONGESTION WARNING';
        } else {
            banner.style.background = '#16a34a';
            banner.innerText = '✓ TRAFFIC NORMAL';
        }
    }

    if (chartInstance) {
        chartInstance.data.datasets[0].data = [countsLeft.car, countsLeft.motorcycle, countsLeft.bus, countsLeft.truck];
        chartInstance.data.datasets[1].data = [countsRight.car, countsRight.motorcycle, countsRight.bus, countsRight.truck];
        chartInstance.update();
    }
}

// BỔ SUNG: Hàm xuất dữ liệu thống kê ra file Excel (.xlsx)
export function exportToExcel() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dataToExport = [
        { "Loại phương tiện": "Ô tô (Car)", "Bên Trái": countsLeft.car, "Bên Phải": countsRight.car, "Tổng cộng": countsTotal.car },
        { "Loại phương tiện": "Xe máy (Motorcycle)", "Bên Trái": countsLeft.motorcycle, "Bên Phải": countsRight.motorcycle, "Tổng cộng": countsTotal.motorcycle },
        { "Loại phương tiện": "Xe buýt (Bus)", "Bên Trái": countsLeft.bus, "Bên Phải": countsRight.bus, "Tổng cộng": countsTotal.bus },
        { "Loại phương tiện": "Xe tải (Truck)", "Bên Trái": countsLeft.truck, "Bên Phải": countsRight.truck, "Tổng cộng": countsTotal.truck },
        { "Loại phương tiện": "TỔNG CỘNG", "Bên Trái": countsLeft.total, "Bên Phải": countsRight.total, "Tổng cộng": countsTotal.total }
    ];

    if (typeof XLSX === 'undefined') {
        alert("Thư viện SheetJS (XLSX) chưa được tích hợp trong file index.html. Đang tiến hành xuất dạng CSV thay thế...");
        exportToCSV(dataToExport, `BaoCaoGiaoThong_${timestamp}.csv`);
        return;
    }

    try {
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "ThongKeGiaoThong");
        XLSX.writeFile(workbook, `BaoCaoGiaoThong_${timestamp}.xlsx`);
    } catch (error) {
        console.error("Lỗi khi xuất file Excel:", error);
        alert("Có lỗi xảy ra khi xuất file Excel!");
    }
}

function exportToCSV(data, filename) {
    const headers = Object.keys(data[0]);
    let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n";
    data.forEach(row => {
        csvContent += Object.values(row).join(",") + "\n";
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}