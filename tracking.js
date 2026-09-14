import { calculateIoU } from './detection.js';
import { canvas, lineConfig, recentVehicles, countsLeft, countsRight, countsTotal, getCountingLineEnabled, isLeftOfDivider } from './main.js';

let uniqueIdCounter = 1;

export function resetTracking() {
    recentVehicles.clear();
    uniqueIdCounter = 1;
}

export function matchAndCountVehicles(detections) {
    const activeVehicles = [];
    const directionMode = document.getElementById('counting-direction').value;
    const lineY = lineConfig.positionRatio * canvas.height;
    const nowTime = Date.now();

    for (const [id, value] of recentVehicles.entries()) {
        if (nowTime - value.time > 8000) recentVehicles.delete(id);
    }

    const orderedDetections = [...detections].sort((first, second) => second.confidence - first.confidence);
    const candidateMatches = [];
    const baseMatchDistance = Math.max(220, Math.min(canvas.width, canvas.height) * 0.20);

    orderedDetections.forEach((detection, detectionIndex) => {
        const [x, y, width, height] = detection.bbox;
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        for (const [id, value] of recentVehicles.entries()) {
            if (value.className === detection.className) {
                const elapsedSeconds = Math.min((nowTime - value.time) / 1000, 1);
                const predictedX = value.cx + (value.vx || 0) * elapsedSeconds;
                const predictedY = value.cy + (value.vy || 0) * elapsedSeconds;
                const distance = Math.hypot(centerX - predictedX, centerY - predictedY);
                const overlap = value.bbox ? calculateIoU(detection.bbox, value.bbox) : 0;
                const speedAllowance = Math.hypot(value.vx || 0, value.vy || 0) * elapsedSeconds;
                const maxMatchDistance = Math.max(baseMatchDistance, speedAllowance + 120);
                if (overlap >= 0.05 || distance <= maxMatchDistance) {
                    candidateMatches.push({ detectionIndex, id, score: overlap * 1000 - distance });
                }
            }
        }
    });

    candidateMatches.sort((first, second) => second.score - first.score);
    const assignedIds = new Map();
    const usedIds = new Set();
    const usedDetections = new Set();
    candidateMatches.forEach(match => {
        if (!usedIds.has(match.id) && !usedDetections.has(match.detectionIndex)) {
            assignedIds.set(match.detectionIndex, match.id);
            usedIds.add(match.id);
            usedDetections.add(match.detectionIndex);
        }
    });

    orderedDetections.forEach((detection, detectionIndex) => {
        const [x, y, width, height] = detection.bbox;
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        let assignedId = assignedIds.get(detectionIndex);
        if (!assignedId) assignedId = uniqueIdCounter++;

        const oldData = recentVehicles.get(assignedId);
        if (oldData && getCountingLineEnabled() && !oldData.counted) {
            const previousHeight = oldData.height || oldData.bbox[3];
            const previousTop = oldData.cy - previousHeight / 2;
            const previousBottom = oldData.cy + previousHeight / 2;
            const currentTop = centerY - height / 2;
            const currentBottom = centerY + height / 2;
            const movedDown = centerY > oldData.cy;
            const movedUp = centerY < oldData.cy;
            const crossedDown = (oldData.cy < lineY || oldData.wasAboveLine) && centerY >= lineY;
            const crossedUp = (oldData.cy > lineY || oldData.wasBelowLine) && centerY <= lineY;
            const sweptDown = previousBottom < lineY && currentBottom >= lineY;
            const sweptUp = previousTop > lineY && currentTop <= lineY;
            let crossed = false;

            // KIỂM TRA ĐIỀU KIỆN ĐẾM THEO HƯỚNG ĐƯỢC CHỌN TRÊN GIAO DIỆN[cite: 7]
            if (directionMode === 'both') {
                crossed = (movedDown && (crossedDown || sweptDown)) || (movedUp && (crossedUp || sweptUp));
            } else if (directionMode === 'down') {
                crossed = movedDown && (crossedDown || sweptDown); 
            } else if (directionMode === 'up') {
                crossed = movedUp && (crossedUp || sweptUp); 
            }

            if (crossed) {
                oldData.counted = true;
                const isLeftSide = oldData.side === 'left' || oldData.leftSideVotes >= oldData.rightSideVotes;
                
                // ÁNH XẠ HƯỚNG ĐẾM VỚI LÀN ĐƯỜNG:
                // - 'down' (Từ trên xuống): Chỉ ghi nhận làn bên trái
                // - 'up' (Từ dưới lên): Chỉ ghi nhận làn bên phải
                // - 'both': Ghi nhận cả 2 bên
                let allowCount = false;
                let targetSideCounts = null;

                if (directionMode === 'both') {
                    allowCount = true;
                    targetSideCounts = isLeftSide ? countsLeft : countsRight;
                } else if (directionMode === 'down' && isLeftSide) {
                    allowCount = true;
                    targetSideCounts = countsLeft;
                } else if (directionMode === 'up' && !isLeftSide) {
                    allowCount = true;
                    targetSideCounts = countsRight;
                }

                if (allowCount && targetSideCounts) {
                    targetSideCounts[detection.className]++;
                    targetSideCounts.total++;
                    countsTotal[detection.className]++;
                    countsTotal.total++;
                }
            }
        }

        const elapsedSeconds = oldData ? Math.max((nowTime - oldData.time) / 1000, 0.001) : 0;
        const velocityX = oldData ? (centerX - oldData.cx) / elapsedSeconds : 0;
        const velocityY = oldData ? (centerY - oldData.cy) / elapsedSeconds : 0;
        const isLeftOfLaneDivider = isLeftOfDivider(centerX, centerY);
        const leftSideVotes = oldData?.leftSideVotes || (isLeftOfLaneDivider ? 1 : 0);
        const rightSideVotes = oldData?.rightSideVotes || (isLeftOfLaneDivider ? 0 : 1);
        const side = oldData?.side || (isLeftOfLaneDivider ? 'left' : 'right');
        recentVehicles.set(assignedId, {
            cx: centerX,
            cy: centerY,
            bbox: detection.bbox,
            width,
            height,
            className: detection.className,
            counted: oldData ? oldData.counted : false,
            leftSideVotes,
            rightSideVotes,
            side,
            wasAboveLine: oldData ? (oldData.wasAboveLine || centerY < lineY) : centerY < lineY,
            wasBelowLine: oldData ? (oldData.wasBelowLine || centerY > lineY) : centerY > lineY,
            time: nowTime,
            vx: Math.max(-1000, Math.min(1000, velocityX)),
            vy: Math.max(-1000, Math.min(1000, velocityY))
        });
        activeVehicles.push({ id: assignedId, bbox: [x, y, width, height], className: detection.className, confidence: detection.confidence });
    });

    return activeVehicles;
}