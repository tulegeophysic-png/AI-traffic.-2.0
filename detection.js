export function calculateIoU(firstBox, secondBox) {
    const [firstX, firstY, firstWidth, firstHeight] = firstBox;
    const [secondX, secondY, secondWidth, secondHeight] = secondBox;
    const intersectionX = Math.max(firstX, secondX);
    const intersectionY = Math.max(firstY, secondY);
    const intersectionRight = Math.min(firstX + firstWidth, secondX + secondWidth);
    const intersectionBottom = Math.min(firstY + firstHeight, secondY + secondHeight);
    const intersectionArea = Math.max(0, intersectionRight - intersectionX) * Math.max(0, intersectionBottom - intersectionY);
    const unionArea = firstWidth * firstHeight + secondWidth * secondHeight - intersectionArea;
    return unionArea > 0 ? intersectionArea / unionArea : 0;
}

export function suppressOverlappingDetections(detections) {
    const filtered = [];
    const detectionsByClass = new Map();

    detections.forEach(detection => {
        if (!detectionsByClass.has(detection.className)) detectionsByClass.set(detection.className, []);
        detectionsByClass.get(detection.className).push(detection);
    });

    detectionsByClass.forEach((classDetections, className) => {
        classDetections.sort((first, second) => second.confidence - first.confidence);
        const overlapThreshold = className === 'motorcycle' ? 0.70 : 0.55;
        while (classDetections.length > 0) {
            const bestDetection = classDetections.shift();
            filtered.push(bestDetection);
            for (let index = classDetections.length - 1; index >= 0; index--) {
                if (calculateIoU(bestDetection.bbox, classDetections[index].bbox) >= overlapThreshold) {
                    classDetections.splice(index, 1);
                }
            }
        }
    });

    return filtered;
}
