// Enregistrement du Service Worker pour le mode hors-ligne
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
}

const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const btnRecord = document.getElementById('btnRecord');

let isRecording = false;
let csvRows = ["timestamp,landmark_id,x,y,z"];

// Configuration de MediaPipe Pose (33 points)
const pose = new Pose({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`});
pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });

pose.onResults((results) => {
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    
    if (results.poseLandmarks && isRecording) {
        const ts = Date.now();
        results.poseLandmarks.forEach((lm, i) => {
            csvRows.push(`${ts},${i},${lm.x},${lm.y},${lm.z}`);
        });
    }
});

const camera = new Camera(videoElement, {
    onFrame: async () => { await pose.send({image: videoElement}); },
    width: 640, height: 480
});
camera.start();

btnRecord.onclick = () => {
    isRecording = !isRecording;
    btnRecord.innerText = isRecording ? "ARRÊTER ET TÉLÉCHARGER" : "DÉMARRER L'ACQUISITION";
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