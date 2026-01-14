// 1. Service Worker pour le mode PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error(err));
}

const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const btnRecord = document.getElementById('btnRecord');

let isRecording = false;
let csvRows = ["timestamp,landmark_id,x,y,z,visibility"];
let isProcessing = false;
let lastLandmarks = null; 

// RÉGLAGE DE LA FLUIDITÉ : 
// Plus ce chiffre est bas, plus le squelette est stable (moins de sauts)
const SMOOTHING_FACTOR = 0.2; 

const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

pose.setOptions({
    modelComplexity: 1, // Équilibre parfait pour le Samsung A55
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

// 2. BOUCLE DE RENDU (Sépare la vidéo du calcul IA)
function renderLoop() {
    // Dessine la vidéo en fond (toujours fluide à 60fps)
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    
    // Si nous avons des points calculés, on les dessine par-dessus
    if (lastLandmarks) {
        drawConnectors(canvasCtx, lastLandmarks, POSE_CONNECTIONS, {color: '#00FF00', lineWidth: 4});
        drawLandmarks(canvasCtx, lastLandmarks, {color: '#FF0000', radius: 3});
    }
    canvasCtx.restore();

    // Si l'IA est libre, on lui demande un nouveau calcul
    if (!isProcessing) {
        processPose();
    }
    requestAnimationFrame(renderLoop);
}

async function processPose() {
    isProcessing = true;
    await pose.send({image: videoElement});
    // On attend un tout petit peu (30ms) pour ne pas saturer le processeur
    setTimeout(() => { isProcessing = false; }, 30); 
}

// 3. TRAITEMENT DES RÉSULTATS AVEC FILTRE PASSE-BAS
pose.onResults((results) => {
    if (results.poseLandmarks) {
        if (!lastLandmarks) {
            lastLandmarks = results.poseLandmarks;
        } else {
            // On lisse chaque point en fonction de sa position précédente
            lastLandmarks = results.poseLandmarks.map((lm, i) => {
                return {
                    x: lastLandmarks[i].x * (1 - SMOOTHING_FACTOR) + lm.x * SMOOTHING_FACTOR,
                    y: lastLandmarks[i].y * (1 - SMOOTHING_FACTOR) + lm.y * SMOOTHING_FACTOR,
                    z: lastLandmarks[i].z * (1 - SMOOTHING_FACTOR) + lm.z * SMOOTHING_FACTOR,
                    visibility: lm.visibility
                };
            });
        }

        if (isRecording) {
            const ts = Date.now();
            lastLandmarks.forEach((lm, i) => {
                csvRows.push(`${ts},${i},${lm.x.toFixed(4)},${lm.y.toFixed(4)},${lm.z.toFixed(4)}`);
            });
        }
    }
});

// 4. LANCEMENT CAMÉRA ET INTERFACE
async function startCamera() {
    const constraints = {
        video: { facingMode: 'environment', width: 640, height: 480 }
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = stream;
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            // On aligne la taille du canvas sur la vidéo réelle
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
            renderLoop();
        };
    } catch (err) {
        alert("Erreur Caméra : " + err);
    }
}

startCamera();

btnRecord.onclick = () => {
    isRecording = !isRecording;
    btnRecord.innerText = isRecording ? "ARRÊTER L'ENREGISTREMENT" : "DÉMARRER L'ACQUISITION";
    btnRecord.style.background = isRecording ? "red" : "#FF9800";
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
    window.URL.revokeObjectURL(url); // Nettoyage mémoire
}