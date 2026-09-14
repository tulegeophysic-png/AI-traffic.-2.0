import { calculateIoU } from './detection.js';
import { canvas, lines, recentVehicles, countsLeft, countsRight, countsTotal, getCountingLineEnabled, isLeftOfDivider } from './main.js';

let uniqueIdCounter = 1;

export function resetTracking() {
    recentVehicles.clear();
    uniqueIdCounter = 1;
}

export function matchAndCountVehicles(detections) {
    const activeVehicles = [];
    const directionMode = document.getElementById('counting-direction').value;
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
                // Tính năng 3: Tối ưu trọng số IoU và khoảng cách để giảm ID Switch
                if (overlap >= 0.05 || distance <= maxMatchDistance) {
                    candidateMatches.push({ detectionIndex, id, score: overlap * 1200 - distance });
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
        
        // Kiểm tra đếm trên tất cả các vạch cấu hình trong mảng lines (Tính năng 2)
        if (oldData && getCountingLineEnabled()) {
            if (!oldData.countedLines) oldData.countedLines = {};

            lines.forEach((line, lineIndex) => {
                if (oldData.countedLines[lineIndex]) return;

                const lineY = line.positionRatio * canvas.height;
                const previousHeight = oldData.height || oldData.bbox[3];
                const previousTop = oldData.cy - previousHeight / 2;
                const previousBottom = oldData.cy + previousHeight / 2;
                const currentTop = centerY - height / 2;
                const currentBottom = centerY + height / 2;
                const movedDown = centerY > oldData.cy;
                const movedUp = centerY < oldData.cy;
                
                const wasAbove = oldData.wasAboveLineMap ? oldData.wasAboveLineMap[lineIndex] : (oldData.cy < lineY);
                const wasBelow = oldData.wasBelowLineMap ? oldData.wasBelowLineMap[lineIndex] : (oldData.cy > lineY);

                const crossedDown = (wasAbove) && centerY >= lineY;
                const crossedUp = (wasBelow) && centerY <= lineY;
                const sweptDown = previousBottom < lineY && currentBottom >= lineY;
                const sweptUp = previousTop > lineY && currentTop <= lineY;
                let crossed = false;

                if (directionMode === 'both') {
                    crossed = (movedDown && (crossedDown || sweptDown)) || (movedUp && (crossedUp || sweptUp));
                } else if (directionMode === 'down') {
                    crossed = movedDown && (crossedDown || sweptDown); 
                } else if (directionMode === 'up') {
                    crossed = movedUp && (crossedUp || sweptUp); 
                }

                if (crossed) {
                    oldData.countedLines[lineIndex] = true;
                    const isLeftSide = oldData.side === 'left' || oldData.leftSideVotes >= oldData.rightSideVotes;
                    
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
            });
        }

        const elapsedSeconds = oldData ? Math.max((nowTime - oldData.time) / 1000, 0.001) : 0;
        const velocityX = oldData ? (centerX - oldData.cx) / elapsedSeconds : 0;
        const velocityY = oldData ? (centerY - oldData.cy) / elapsedSeconds : 0;
        const isLeftOfLaneDivider = isLeftOfDivider(centerX, centerY);
        const leftSideVotes = oldData?.leftSideVotes || (isLeftOfLaneDivider ? 1 : 0);
        const rightSideVotes = oldData?.rightSideVotes || (isLeftOfLaneDivider ? 0 : 1);
        const side = oldData?.side || (isLeftOfLaneDivider ? 'left' : 'right');

        const wasAboveLineMap = oldData?.wasAboveLineMap || {};
        const wasBelowLineMap = oldData?.wasBelowLineMap || {};
        lines.forEach((line, idx) => {
            const lineY = line.positionRatio * canvas.height;
            if (wasAboveLineMap[idx] === undefined) wasAboveLineMap[idx] = centerY < lineY;
            if (wasBelowLineMap[idx] === undefined) wasBelowLineMap[idx] = centerY > lineY;
            wasAboveLineMap[idx] = wasAboveLineMap[idx] || centerY < lineY;
            wasBelowLineMap[idx] = wasBelowLineMap[idx] || centerY > lineY;
        });

        recentVehicles.set(assignedId, {
            cx: centerX,
            cy: centerY,
            bbox: detection.bbox,
            width,
            height,
            className: detection.className,
            countedLines: oldData ? oldData.countedLines : {},
            leftSideVotes,
            rightSideVotes,
            side,
            wasAboveLineMap,
            wasBelowLineMap,
            time: nowTime,
            vx: Math.max(-1000, Math.min(1000, velocityX)),
            vy: Math.max(-1000, Math.min(1000, velocityY))
        });
        activeVehicles.push({ id: assignedId, bbox: [x, y, width, height], className: detection.className, confidence: detection.confidence });
    });

    return activeVehicles;
}