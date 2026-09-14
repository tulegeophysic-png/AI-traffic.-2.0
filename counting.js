import { canvas, ctx, lineConfig, latestDetections, sideDividerConfig, getCountingLineEnabled, getDraggingLine, getDividerDragMode } from './main.js';

export function drawScene(vehicles) {
    if (getCountingLineEnabled()) {
        const lineY = lineConfig.positionRatio * canvas.height;
        ctx.strokeStyle = getDraggingLine() ? '#38bdf8' : '#ef4444';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, lineY);
        ctx.lineTo(canvas.width, lineY);
        ctx.stroke();

        ctx.fillStyle = getDraggingLine() ? '#38bdf8' : '#ef4444';
        ctx.font = 'bold 13px Segoe UI';
        ctx.fillText('VẠCH ĐẾM PHƯƠNG TIỆN', 15, lineY - 8);
    }

    if (vehicles) {
        vehicles.forEach(vehicle => {
            const [x, y, width, height] = vehicle.bbox;
            const color = getCategoryColor(vehicle.className);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, width, height);

            ctx.fillStyle = color;
            ctx.fillRect(x, y > 18 ? y - 18 : 0, 110, 16);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 10px Segoe UI';
            ctx.fillText(`${vehicle.className.toUpperCase()} #${vehicle.id} (${(vehicle.confidence * 100).toFixed(0)}%)`, x + 2, y > 18 ? y - 5 : 12);
        });
    }

    drawSideDivider();
}

function drawSideDivider() {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const startX = sideDividerConfig.start.x * canvas.width;
    const startY = sideDividerConfig.start.y * canvas.height;
    const endX = sideDividerConfig.end.x * canvas.width;
    const endY = sideDividerConfig.end.y * canvas.height;
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#111827';
    ctx.setLineDash([18, 12]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = 'bold 13px Segoe UI';
    const rightLabelX = Math.max(12, startX + 12);
    ctx.fillStyle = 'rgba(17, 24, 39, 0.9)';
    ctx.fillRect(8, 7, 54, 22);
    ctx.fillRect(rightLabelX - 5, 7, 58, 22);
    ctx.fillStyle = '#22c55e';
    ctx.fillText('TRÁI', 14, 23);
    ctx.fillText('PHẢI', rightLabelX, 23);
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(startX, startY, 11, 0, Math.PI * 2);
    ctx.arc(endX, endY, 11, 0, Math.PI * 2);
    ctx.fill();
    if (getDividerDragMode()) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Segoe UI';
        ctx.fillText('KÉO VẠCH PHÂN LÀN', Math.min(canvas.width - 190, startX + 15), Math.max(18, startY + 18));
    }
    ctx.restore();
}

export function resetLinePosition() {
    lineConfig.positionRatio = 0.35;
    drawScene(latestDetections);
}

function getCategoryColor(className) {
    switch (className) {
        case 'car': return '#2563eb';
        case 'motorcycle': return '#16a34a';
        case 'bus': return '#d97706';
        case 'truck': return '#dc2626';
        default: return '#38bdf8';
    }
}
