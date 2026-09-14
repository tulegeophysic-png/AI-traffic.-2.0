let session = null;

const classConfidenceThresholds = {
    motorcycle: 0.10,
    car: 0.15,
    bus: 0.45,
    truck: 0.25
};

const classMap = { 2: 'car', 3: 'motorcycle', 5: 'bus', 7: 'truck' };

export { session, classConfidenceThresholds, classMap };

export async function loadModel(setStatus, onReady) {
    try {
        setStatus('ready', 'LOADING...');
        ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";
        session = await ort.InferenceSession.create('./yolov10n.onnx', { executionProviders: ['wasm'] });
        setStatus('ready', 'AI READY');
        onReady();
    } catch (error) {
        console.error('Không thể tải model:', error);
        setStatus('stopped', 'AI ERROR');
    }
}

export function preprocessWithLetterbox(srcCanvas, targetSize = 640) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = targetSize;
    tempCanvas.height = targetSize;
    const tempContext = tempCanvas.getContext('2d');
    const sourceWidth = srcCanvas.width;
    const sourceHeight = srcCanvas.height;
    const ratio = Math.min(targetSize / sourceWidth, targetSize / sourceHeight);
    const resizedWidth = sourceWidth * ratio;
    const resizedHeight = sourceHeight * ratio;
    const offsetX = (targetSize - resizedWidth) / 2;
    const offsetY = (targetSize - resizedHeight) / 2;

    tempContext.fillStyle = '#111827';
    tempContext.fillRect(0, 0, targetSize, targetSize);
    tempContext.drawImage(srcCanvas, offsetX, offsetY, resizedWidth, resizedHeight);

    const imageData = tempContext.getImageData(0, 0, targetSize, targetSize);
    const data = imageData.data;
    const float32Data = new Float32Array(3 * targetSize * targetSize);
    for (let index = 0; index < targetSize * targetSize; index++) {
        float32Data[index] = data[index * 4] / 255.0;
        float32Data[targetSize * targetSize + index] = data[index * 4 + 1] / 255.0;
        float32Data[2 * targetSize * targetSize + index] = data[index * 4 + 2] / 255.0;
    }

    return {
        tensor: new ort.Tensor('float32', float32Data, [1, 3, targetSize, targetSize]),
        ratio,
        dw: offsetX,
        dh: offsetY
    };
}

export function parseYolov10Output(output, originalWidth, originalHeight, ratio, offsetX, offsetY) {
    const detections = [];
    if (!output || !output.data || !output.dims || output.dims.length !== 3) {
        throw new Error('Output model không đúng định dạng 3 chiều');
    }

    const data = output.data;
    const dims = output.dims;
    const parseBox = (x1, y1, x2, y2, confidence, classId) => {
        if (![x1, y1, x2, y2, confidence, classId].every(Number.isFinite)) return;
        if (Math.max(Math.abs(x1), Math.abs(y1), Math.abs(x2), Math.abs(y2)) <= 1.5) {
            x1 *= 640;
            y1 *= 640;
            x2 *= 640;
            y2 *= 640;
        }

        let resolvedX1 = (x1 - offsetX) / ratio;
        let resolvedY1 = (y1 - offsetY) / ratio;
        let resolvedX2 = (x2 - offsetX) / ratio;
        let resolvedY2 = (y2 - offsetY) / ratio;
        resolvedX1 = Math.max(0, Math.min(originalWidth, resolvedX1));
        resolvedY1 = Math.max(0, Math.min(originalHeight, resolvedY1));
        resolvedX2 = Math.max(0, Math.min(originalWidth, resolvedX2));
        resolvedY2 = Math.max(0, Math.min(originalHeight, resolvedY2));

        const width = resolvedX2 - resolvedX1;
        const height = resolvedY2 - resolvedY1;
        if (width < 2 || height < 2) return;

        const className = classMap[classId];
        if (className) {
            const threshold = classConfidenceThresholds[className] || 0.25;
            if (confidence >= threshold) {
                detections.push({
                    bbox: [resolvedX1, resolvedY1, width, height],
                    className,
                    confidence
                });
            }
        }
    };

    if (dims[2] === 6) {
        for (let index = 0; index < dims[1]; index++) {
            const offset = index * 6;
            parseBox(data[offset], data[offset + 1], data[offset + 2], data[offset + 3], data[offset + 4], Math.round(data[offset + 5]));
        }
    } else if (dims[1] === 6) {
        for (let index = 0; index < dims[2]; index++) {
            parseBox(data[index], data[dims[2] + index], data[2 * dims[2] + index], data[3 * dims[2] + index], data[4 * dims[2] + index], data[5 * dims[2] + index]);
        }
    }

    return detections;
}
