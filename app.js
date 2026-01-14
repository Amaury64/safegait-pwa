// 1. Gestion du Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error(err));
}

const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const btnRecord = document.getElementById('btnRecord');

let isRecording = false;
let csvRows = ["timestamp,landmark_id,x,y,z,visibility"];

// 2. Initialisation Pose (Optimisée)
const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

pose.setOptions({
    modelComplexity: 0, 
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

// 3. Boucle de rendu sécurisée
async function detectionLoop() {
    if (videoElement.paused || videoElement.ended) return;
    
    // On envoie l'image à l'IA et on ATTEND la réponse avant de continuer
    await pose.send({image: videoElement});
    
    // On demande la prochaine image dès que possible (environ 30fps)
    window.requestAnimationFrame(detectionLoop);
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

// 4. Lancement de la caméra avec les API standards du navigateur
async function startCamera() {
    const constraints = {
        video: {
            facingMode: 'environment', // Caméra arrière
            width: { ideal: 640 },
            height: { ideal: 480 }
        }
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = stream;
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            detectionLoop(); // On lance la boucle une fois la vidéo prête
        };
    } catch (err) {
        console.error("Erreur caméra : ", err);
        alert("Impossible d'accéder à la caméra arrière.");
    }
}

startCamera();

// 5. Enregistrement CSV
btnRecord.onclick = () => {
    isRecording = !isRecording;
    btnRecord.innerText = isRecording ? "ARRÊTER" : "DÉMARRER";
    btnRecord.style.background = isRecording ? "red" : "#6200EE";
    if (!isRecording) downloadCSV();
};

function downloadCSV() {
    if (csvRows.length <= 1) return;
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `safegait_${Date.now()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}