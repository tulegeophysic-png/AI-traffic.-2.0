import { session } from './model.js';
import { preprocessWithLetterbox, parseYolov10Output } from './model.js';
import { canvas, ctx, inferenceCanvas, inferenceCtx, latestDetections, setLatestDetections, isInferencing, setInferencing, isRunning, setRunning, loadLinesConfig } from './main.js';
import { matchAndCountVehicles } from './tracking.js';
import { drawScene } from './counting.js';
import { updateUIStats, setStatus } from './dashboard.js';

// Tính năng 4: Lưu vết thời gian pipeline thực thi từng khâu
export const pipelineMetrics = { preprocess: 0, inference: 0, postprocess: 0, render: 0 };

export function processFrame() {
    if (!isRunning()) return;
    if (videoElement.paused || videoElement.ended) {
        stopAI();
        return;
    }

    const now = performance.now();
    updateFps(now);
    
    const tRenderStart = performance.now();
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    drawScene(latestDetections);
    pipelineMetrics.render = performance.now() - tRenderStart;

    // Tính năng 5: Cơ chế bỏ frame thông minh khi AI đang quá tải suy luận frame trước
    if (!isInferencing()) {
        setInferencing(true);
        inferenceCtx.drawImage(videoElement, 0, 0, inferenceCanvas.width, inferenceCanvas.height);
        
        setTimeout(async () => {
            try {
                const tPre = performance.now();
                const { tensor, ratio, dw, dh } = preprocessWithLetterbox(inferenceCanvas, 640);
                pipelineMetrics.preprocess = performance.now() - tPre;

                const tInf = performance.now();
                const results = await session.run({ [session.inputNames[0]]: tensor });
                pipelineMetrics.inference = performance.now() - tInf;

                const tPost = performance.now();
                const detections = parseYolov10Output(results[session.outputNames[0]], canvas.width, canvas.height, ratio, dw, dh);
                setLatestDetections(matchAndCountVehicles(detections));
                pipelineMetrics.postprocess = performance.now() - tPost;

                updateUIStats();
            } catch (error) {
                console.error('Lỗi xử lý frame AI:', error);
                setStatus('stopped', 'AI ERROR');
                stopAI();
            } finally {
                setInferencing(false);
            }
        }, 0);
    }
    requestAnimationFrame(processFrame);
}

export async function startAI() {
    if (!videoElement.src && !videoElement.srcObject) return;
    if (!session) return;
    try {
        await videoElement.play();
    } catch (error) {
        console.error('Không thể phát video/camera:', error);
        stopAI();
        return;
    }
    setRunning(true);
    document.getElementById('btn-start').disabled = true;
    document.getElementById('btn-stop').disabled = false;
    document.getElementById('btn-capture').disabled = false;
    setStatus('ready', 'RUNNING');
    requestAnimationFrame(processFrame);
}

export function stopAI() {
    setRunning(false);
    videoElement.pause();
    const hasSource = videoElement.src || videoElement.srcObject;
    document.getElementById('btn-start').disabled = !(hasSource && session);
    document.getElementById('btn-stop').disabled = true;
    document.getElementById('btn-capture').disabled = true;
    setStatus('stopped', 'AI STOPPED');
}

export function captureFrame() {
    const link = document.createElement('a');
    link.download = `capture-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

export async function setupLiveCamera() {
    if (isRunning()) stopAI();
    
    const selectElement = document.getElementById('camera-url-select');
    let streamUrl = selectElement ? selectElement.value : '';

    if (!streamUrl) {
        streamUrl = prompt("Nhập địa chỉ URL luồng camera cho khu vực mới:", "http://");
    }

    if (!streamUrl) {
        alert("Vui lòng chọn hoặc nhập đường dẫn URL camera hợp lệ!");
        return;
    }

    try {
        videoElement.srcObject = null;
        videoElement.src = streamUrl;
        videoElement.crossOrigin = "anonymous";
        videoElement.load();
        
        videoElement.onloadedmetadata = () => {
            canvas.width = videoElement.videoWidth || 1280;
            canvas.height = videoElement.videoHeight || 720;
            inferenceCanvas.width = canvas.width;
            inferenceCanvas.height = canvas.height;
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
            loadLinesConfig();
            drawScene([]);
            if (session) {
                document.getElementById('btn-start').disabled = false;
                setStatus('ready', 'CAMERA READY');
            }
        };

        videoElement.onerror = () => {
            alert('Không thể kết nối tới khu vực camera này. Kiểm tra lại đường dẫn URL hoặc CORS!');
            setStatus('error', 'CAMERA ERROR');
        };
    } catch (error) {
        console.error('Lỗi thiết lập luồng camera:', error);
        alert('Lỗi kết nối luồng camera khu vực.');
    }
}

function updateFps(now) {
    const state = getFpsState();
    state.frameCount++;
    if (now - state.lastTime >= 1000) {
        state.currentFps = (state.frameCount * 1000) / (now - state.lastTime);
        const fpsDisp = document.getElementById('fps-display');
        if (fpsDisp) fpsDisp.innerText = state.currentFps.toFixed(1);
        state.frameCount = 0;
        state.lastTime = now;
    }
}

function getFpsState() {
    if (!window.__trafficFpsState) {
        window.__trafficFpsState = { lastTime: performance.now(), frameCount: 0, currentFps: 0 };
    }
    return window.__trafficFpsState;
}

const videoElement = document.getElementById('video-source');