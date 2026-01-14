// Enregistrement du Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error(err));
}

const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const btnRecord = document.getElementById('btnRecord');

let isRecording = false;
let csvRows = ["timestamp,landmark_id,x,y,z,visibility"];
let frameCounter = 0; // Pour compter les images

// 1. Initialisation Pose (Mode Ultra-Léger)
const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

pose.setOptions({
    modelComplexity: 0, // Indispensable pour la fluidité
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

// 2. Boucle de détection avec saut d'image
async function detectionLoop() {
    if (videoElement.paused || videoElement.ended) return;

    frameCounter++;

    // On n'envoie à l'IA qu'une image sur deux pour soulager le processeur
    if (frameCounter % 2 === 0) {
        await pose.send({image: videoElement});
    } else {
        // Pour les images sautées, on dessine juste la vidéo sans IA pour la fluidité visuelle
        drawVideoOnly();
    }
    
    window.requestAnimationFrame(detectionLoop);
}

function drawVideoOnly() {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();
}

pose.onResults((results) => {
    if (!results.image) return;

    canvasElement.width = results.image.width;
    canvasElement.height = results.image.height;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.poseLandmarks) {
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {color: '#00FF00', lineWidth: 4});
        drawLandmarks(canvasCtx, results.poseLandmarks, {color: '#FF0000', lineWidth: 1, radius: 3});

        if (isRecording) {
            const ts = Date.now();
            results.poseLandmarks.forEach((lm, i) => {
                csvRows.push(`${ts},${i},${lm.x.toFixed(4)},${lm.y.toFixed(4)},${lm.z.toFixed(4)},${lm.visibility.toFixed(4)}`);
            });
        }
    }
    canvasCtx.restore();
});

// 3. Caméra Standardisée (640x480)
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: 640, height: 480 }
        });
        videoElement.srcObject = stream;
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            detectionLoop();
        };
    } catch (err) {
        alert("Erreur caméra : " + err);
    }
}

startCamera();

btnRecord.onclick = () => {
    isRecording = !isRecording;
    btnRecord.innerText = isRecording ? "ARRÊTER" : "DÉMARRER";
    btnRecord.style.background = isRecording ? "red" : "#6200EE";
    if (!isRecording) downloadCSV();
};

function downloadCSV() {
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `safegait_${Date.now()}.csv`;
    a.click();
}