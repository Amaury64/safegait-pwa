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

// 1. Initialisation de Pose avec complexité réduite pour la fluidité
const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

pose.setOptions({
    modelComplexity: 0, // 0 = Lite (très fluide), 1 = Full. Testez avec 0 pour stopper le freeze.
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

pose.onResults((results) => {
    if (!results.image) return;

    // Ajustement de la résolution du canvas au flux réel
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
                csvRows.push(`${ts},${i},${lm.x},${lm.y},${lm.z},${lm.visibility}`);
            });
        }
    }
    canvasCtx.restore();
});

// 2. Configuration Caméra 720p (Équilibre parfait Précision/Vitesse)
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await pose.send({image: videoElement});
    },
    facingMode: 'environment', // Caméra arrière forcée
    width: 1280, 
    height: 720
});

camera.start();

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