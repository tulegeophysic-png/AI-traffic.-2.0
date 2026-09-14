import { loadModel, classConfidenceThresholds, session } from './model.js';
import { initChart, setStatus, updateUIStats, exportToExcel } from './dashboard.js';
import { drawScene, resetLinePosition } from './counting.js';
import { resetTracking } from './tracking.js';
import { captureFrame, startAI, stopAI, setupLiveCamera } from './video.js';

export const videoElement = document.getElementById('video-source');
export const canvas = document.getElementById('canvas');
export const ctx = canvas.getContext('2d');
export const inferenceCanvas = document.createElement('canvas');
export const inferenceCtx = inferenceCanvas.getContext('2d');

export const countsLeft = { car: 0, motorcycle: 0, bus: 0, truck: 0, total: 0 };
export const countsRight = { car: 0, motorcycle: 0, bus: 0, truck: 0, total: 0 };
export const countsTotal = { car: 0, motorcycle: 0, bus: 0, truck: 0, total: 0 };
export const recentVehicles = new Map();

// Tính năng 1 & 2: Quản lý đa vạch và lưu/tải vị trí vạch theo từng video/camera
export let lines = [
    { id: 1, positionRatio: 0.35, label: 'Vạch Đếm Chính' }
];

export function saveLinesConfig() {
    const videoSource = videoElement.src || videoElement.currentSrc || videoElement.srcObject || 'default_stream';
    localStorage.setItem(`traffic_lines_${btoa(videoSource.toString()).substring(0, 30)}`, JSON.stringify(lines));
}

export function loadLinesConfig() {
    const videoSource = videoElement.src || videoElement.currentSrc || videoElement.srcObject || 'default_stream';
    const saved = localStorage.getItem(`traffic_lines_${btoa(videoSource.toString()).substring(0, 30)}`);
    if (saved) {
        try {
            lines = JSON.parse(saved);
        } catch (e) {
            lines = [{ id: 1, positionRatio: 0.35, label: 'Vạch Đếm Chính' }];
        }
    } else {
        lines = [{ id: 1, positionRatio: 0.35, label: 'Vạch Đếm Chính' }];
    }
}

export const sideDividerConfig = {
    start: { x: 0.5, y: 0.02 },
    end: { x: 0.5, y: 0.98 }
};
export let latestDetections = [];

let running = false;
let inferencing = false;
let draggingLine = false;
let activeDraggingLineIndex = 0;
let dividerDragMode = null;
let dividerPreviousPoint = null;
let countingLineEnabled = true;
let videoObjectUrl = null;

export const isRunning = () => running;
export const setRunning = value => { running = value; };
export const isInferencing = () => inferencing;
export const setInferencing = value => { inferencing = value; };
export const setLatestDetections = value => { latestDetections = value; };
export const getCountingLineEnabled = () => countingLineEnabled;
export const getDraggingLine = () => draggingLine;
export const getDividerDragMode = () => dividerDragMode;

setInterval(() => {
    const clockElement = document.getElementById('clock');
    if (clockElement) clockElement.innerText = new Date().toTimeString().split(' ')[0];
}, 1000);

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-start').addEventListener('click', startAI);
    document.getElementById('btn-stop').addEventListener('click', stopAI);
    document.getElementById('btn-reset').addEventListener('click', resetSystem);
    document.getElementById('btn-capture').addEventListener('click', captureFrame);
    document.getElementById('btn-toggle-line').addEventListener('click', toggleCountingLineUI);
    document.getElementById('btn-reset-line').addEventListener('click', resetLinePosition);

    const btnExportExcel = document.getElementById('btn-export-excel');
    if (btnExportExcel) btnExportExcel.addEventListener('click', exportToExcel);

    const btnLiveCamera = document.getElementById('btn-live-camera');
    if (btnLiveCamera) btnLiveCamera.addEventListener('click', setupLiveCamera);

    setupSlider('conf-moto-slider', 'motorcycle', 'conf-moto-val');
    setupSlider('conf-car-slider', 'car', 'conf-car-val');
    setupSlider('conf-bus-slider', 'bus', 'conf-bus-val');
    setupSlider('conf-truck-slider', 'truck', 'conf-truck-val');
    setupLineDragging();
    setupVideoUpload();

    initChart();
    loadModel(setStatus, () => {
        if (videoElement.src || videoElement.srcObject) document.getElementById('btn-start').disabled = false;
    });
});

function setupSlider(sliderId, vehicleKey, valueSpanId) {
    const slider = document.getElementById(sliderId);
    const valueSpan = document.getElementById(valueSpanId);
    if (slider && valueSpan) {
        slider.value = classConfidenceThresholds[vehicleKey];
        valueSpan.innerText = classConfidenceThresholds[vehicleKey].toFixed(2);
        slider.addEventListener('input', event => {
            const value = parseFloat(event.target.value);
            classConfidenceThresholds[vehicleKey] = value;
            valueSpan.innerText = value.toFixed(2);
        });
    }
}

function toggleCountingLineUI() {
    countingLineEnabled = !countingLineEnabled;
    const button = document.getElementById('btn-toggle-line');
    button.className = countingLineEnabled ? 'btn btn-success' : 'btn btn-danger';
    button.innerText = countingLineEnabled ? 'Vạch: ON' : 'Vạch: OFF';
    drawScene(latestDetections);
}

function setupLineDragging() {
    canvas.addEventListener('pointerdown', event => {
        const rect = canvas.getBoundingClientRect();
        const scaleY = canvas.height / rect.height;
        const scaleX = canvas.width / rect.width;
        const mouseY = (event.clientY - rect.top) * scaleY;
        const mouseX = (event.clientX - rect.left) * scaleX;
        const dividerPoint = getDividerPointAtY(mouseY);
        const startPoint = getDividerScreenPoint(sideDividerConfig.start);
        const endPoint = getDividerScreenPoint(sideDividerConfig.end);

        if (distance(mouseX, mouseY, startPoint.x, startPoint.y) < 35) {
            dividerDragMode = 'start';
            canvas.setPointerCapture(event.pointerId);
            return;
        }
        if (distance(mouseX, mouseY, endPoint.x, endPoint.y) < 35) {
            dividerDragMode = 'end';
            canvas.setPointerCapture(event.pointerId);
            return;
        }
        if (distance(mouseX, mouseY, dividerPoint.x, dividerPoint.y) < 28) {
            dividerDragMode = 'line';
            dividerPreviousPoint = { x: mouseX / canvas.width, y: mouseY / canvas.height };
            canvas.setPointerCapture(event.pointerId);
            return;
        }

        if (!countingLineEnabled) return;
        
        // Kiểm tra xem click gần vạch nào trong danh sách lines
        for (let i = 0; i < lines.length; i++) {
            const lineY = canvas.height * lines[i].positionRatio;
            if (Math.abs(mouseY - lineY) < 40) {
                draggingLine = true;
                activeDraggingLineIndex = i;
                canvas.setPointerCapture(event.pointerId);
                return;
            }
        }
    });

    window.addEventListener('pointermove', event => {
        if (dividerDragMode) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const point = {
                x: Math.max(0, Math.min(1, ((event.clientX - rect.left) * scaleX) / canvas.width)),
                y: Math.max(0, Math.min(1, ((event.clientY - rect.top) * scaleY) / canvas.height))
            };
            if (dividerDragMode === 'start') sideDividerConfig.start = point;
            if (dividerDragMode === 'end') sideDividerConfig.end = point;
            if (dividerDragMode === 'line') {
                const deltaX = point.x - dividerPreviousPoint.x;
                const deltaY = point.y - dividerPreviousPoint.y;
                sideDividerConfig.start.x = Math.max(0, Math.min(1, sideDividerConfig.start.x + deltaX));
                sideDividerConfig.end.x = Math.max(0, Math.min(1, sideDividerConfig.end.x + deltaX));
                sideDividerConfig.start.y = Math.max(0, Math.min(1, sideDividerConfig.start.y + deltaY));
                sideDividerConfig.end.y = Math.max(0, Math.min(1, sideDividerConfig.end.y + deltaY));
                dividerPreviousPoint = point;
            }
            drawScene(latestDetections);
            return;
        }
        if (!draggingLine || !countingLineEnabled) return;
        const rect = canvas.getBoundingClientRect();
        const scaleY = canvas.height / rect.height;
        const mouseY = (event.clientY - rect.top) * scaleY;
        lines[activeDraggingLineIndex].positionRatio = Math.max(0.05, Math.min(0.95, mouseY / canvas.height));
        drawScene(latestDetections);
    });

    window.addEventListener('pointerup', () => { 
        if (draggingLine) {
            saveLinesConfig();
        }
        draggingLine = false; 
        dividerDragMode = null; 
        dividerPreviousPoint = null; 
    });
    window.addEventListener('pointercancel', () => { draggingLine = false; dividerDragMode = null; dividerPreviousPoint = null; });
}

function getDividerScreenPoint(point) {
    return { x: point.x * canvas.width, y: point.y * canvas.height };
}

function getDividerPointAtY(y) {
    const start = getDividerScreenPoint(sideDividerConfig.start);
    const end = getDividerScreenPoint(sideDividerConfig.end);
    const ratio = end.y === start.y ? 0 : (y - start.y) / (end.y - start.y);
    return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
}

function distance(firstX, firstY, secondX, secondY) {
    return Math.hypot(firstX - secondX, firstY - secondY);
}

export function getDividerXAtY(y) {
    return getDividerPointAtY(y).x;
}

export function isLeftOfDivider(x, y) {
    return x < getDividerXAtY(y);
}

function setupVideoUpload() {
    const uploadInput = document.getElementById('upload-video');
    if (!uploadInput) return;
    uploadInput.addEventListener('change', event => {
        const file = event.target.files[0];
        if (!file) return;
        if (running) stopAI();
        resetSystemDataOnly();
        if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
        
        videoElement.srcObject = null;
        videoObjectUrl = URL.createObjectURL(file);
        videoElement.src = videoObjectUrl;
        videoElement.load();
        
        videoElement.onloadedmetadata = () => {
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            inferenceCanvas.width = canvas.width;
            inferenceCanvas.height = canvas.height;
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
            loadLinesConfig();
            drawScene([]);
            if (session) {
                document.getElementById('btn-start').disabled = false;
                setStatus('ready', 'AI READY');
            }
        };
    });
}

function resetSystemDataOnly() {
    [countsLeft, countsRight, countsTotal].forEach(counts => {
        counts.car = 0;
        counts.motorcycle = 0;
        counts.bus = 0;
        counts.truck = 0;
        counts.total = 0;
    });
    resetTracking();
    setLatestDetections([]);
    updateUIStats();
}

function resetSystem() {
    stopAI();
    resetSystemDataOnly();
    resetLinePosition();
    if (videoElement) {
        if (videoElement.src) {
            videoElement.currentTime = 0;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        drawScene([]);
    }
}

window.addEventListener('beforeunload', () => {
    if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
});