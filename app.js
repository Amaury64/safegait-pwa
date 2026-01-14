// 1. Enregistrement du Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error(err));
}

const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const btnRecord = document.getElementById('btnRecord');

let isRecording = false;
let csvRows = ["timestamp,landmark_id,x,y,z,visibility"];

// 2. Initialisation de l'IA Pose
const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

pose.onResults((results) => {
    // Ajustement dynamique de la résolution pour la netteté
    if (results.image) {
        canvasElement.width = results.image.width;
        canvasElement.height = results.image.height;

        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

        if (results.poseLandmarks) {
            drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {color: '#00FF00', lineWidth: 4});
            drawLandmarks(canvasCtx, results.poseLandmarks, {color: '#FF0000', lineWidth: 2, radius: 4});

            if (isRecording) {
                const ts = Date.now();
                results.poseLandmarks.forEach((lm, i) => {
                    csvRows.push(`${ts},${i},${lm.x},${lm.y},${lm.z},${lm.visibility}`);
                });
            }
        }
        canvasCtx.restore();
    }
});

// 3. Lancement de la Caméra ARRIÈRE (Correction forcée)
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await pose.send({image: videoElement});
    },
    // On demande explicitement le capteur arrière
    facingMode: 'environment',
    width: 1280, 
    height: 720
});

camera.start();

// 4. Bouton d'enregistrement
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