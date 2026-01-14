// Enregistrement du Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error(err));
}

const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const btnRecord = document.getElementById('btnRecord');

btnRecord.style.background = "#FF9800"; // Toujours orange pour vérification

let isRecording = false;
let csvRows = ["timestamp,landmark_id,x,y,z,visibility"];
let isProcessing = false; // Verrou pour empêcher la saturation

const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

pose.setOptions({
    modelComplexity: 0,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

// BOUCLE DE RENDU : Sépare la vidéo du calcul pour éviter le freeze
function renderLoop() {
    // 1. On dessine la vidéo en continu (60fps) pour que l'image ne se bloque JAMAIS
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    
    // 2. Si l'IA n'est pas déjà en train de calculer, on lui envoie une image
    if (!isProcessing) {
        processPose();
    }
    
    requestAnimationFrame(renderLoop);
}

async function processPose() {
    isProcessing = true;
    
    // On envoie l'image à l'IA
    await pose.send({image: videoElement});
    
    // PAUSE OBLIGATOIRE de 100ms pour laisser souffler le Samsung A55
    setTimeout(() => {
        isProcessing = false;
    }, 100); 
}

pose.onResults((results) => {
    // On dessine le squelette par-dessus l'image déjà présente
    if (results.poseLandmarks) {
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {color: '#00FF00', lineWidth: 2});
        drawLandmarks(canvasCtx, results.poseLandmarks, {color: '#FF0000', radius: 2});

        if (isRecording) {
            const ts = Date.now();
            results.poseLandmarks.forEach((lm, i) => {
                csvRows.push(`${ts},${i},${lm.x.toFixed(3)},${lm.y.toFixed(3)},${lm.z.toFixed(3)},${lm.visibility.toFixed(3)}`);
            });
        }
    }
});

async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 640, height: 480 }
    });
    videoElement.srcObject = stream;
    videoElement.onloadedmetadata = () => {
        videoElement.play();
        canvasElement.width = 640;
        canvasElement.height = 480;
        renderLoop();
    };
}

startCamera();

btnRecord.onclick = () => {
    isRecording = !isRecording;
    btnRecord.innerText = isRecording ? "ARRÊTER" : "DÉMARRER";
    btnRecord.style.background = isRecording ? "red" : "#FF9800";
    if (!isRecording) {
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `safegait_${Date.now()}.csv`;
        a.click();
    }
};