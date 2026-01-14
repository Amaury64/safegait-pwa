// 1. Enregistrement du Service Worker (PWA)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error("Erreur SW:", err));
}

const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const btnRecord = document.getElementById('btnRecord');

// État de l'application
let isRecording = false;
let csvRows = ["timestamp,landmark_id,x,y,z,visibility"];
let isProcessing = false; 
let lastLandmarks = null; 

// CONFIGURATION DE LA STABILITÉ
// 0.1 = Squelette très stable (gomme les sauts). 
// Augmente à 0.2 si tu trouves que le squelette est trop lent à te suivre.
const SMOOTHING_FACTOR = 0.1; 

// 2. Initialisation de MediaPipe Pose
const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

pose.setOptions({
    modelComplexity: 1, // Équilibre précision/vitesse pour Samsung A55
    smoothLandmarks: true,
    minDetectionConfidence: 0.7, // On ignore les détections incertaines pour éviter les sauts
    minTrackingConfidence: 0.7
});

// 3. BOUCLE DE RENDU VISUEL (Toujours fluide à 60 FPS)
function renderLoop() {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Dessin du flux vidéo en arrière-plan
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    
    // Dessin du squelette lissé par-dessus
    if (lastLandmarks) {
        drawConnectors(canvasCtx, lastLandmarks, POSE_CONNECTIONS, {color: '#00FF00', lineWidth: 4});
        drawLandmarks(canvasCtx, lastLandmarks, {color: '#FF0000', radius: 3});
    }
    canvasCtx.restore();

    // Si l'IA est prête, on lance un nouveau calcul
    if (!isProcessing) {
        processPose();
    }
    
    requestAnimationFrame(renderLoop);
}

// 4. CALCUL DE L'IA (Séparé pour éviter de figer l'image)
async function processPose() {
    isProcessing = true;
    await pose.send({image: videoElement});
    // Petite pause de sécurité pour laisser le processeur respirer
    setTimeout(() => { isProcessing = false; }, 30); 
}

// 5. FILTRE DE LISSAGE DES RÉSULTATS
pose.onResults((results) => {
    if (results.poseLandmarks) {
        if (!lastLandmarks) {
            lastLandmarks = results.poseLandmarks;
        } else {
            // On applique le filtre passe-bas pour supprimer les tremblements
            lastLandmarks = results.poseLandmarks.map((lm, i) => {
                return {
                    x: lastLandmarks[i].x * (1 - SMOOTHING_FACTOR) + lm.x * SMOOTHING_FACTOR,
                    y: lastLandmarks[i].y * (1 - SMOOTHING_FACTOR) + lm.y * SMOOTHING_FACTOR,
                    z: lastLandmarks[i].z * (1 - SMOOTHING_FACTOR) + lm.z * SMOOTHING_FACTOR,
                    visibility: lm.visibility
                };
            });
        }

        // Enregistrement des données CSV
        if (isRecording) {
            const ts = Date.now();
            lastLandmarks.forEach((lm, i) => {
                csvRows.push(`${ts},${i},${lm.x.toFixed(4)},${lm.y.toFixed(4)},${lm.z.toFixed(4)}`);
            });
        }
    }
});

// 6. DÉMARRAGE DE LA CAMÉRA ARRIÈRE
async function startCamera() {
    const constraints = {
        video: { 
            facingMode: 'environment', 
            width: { ideal: 1280 }, 
            height: { ideal: 720 } 
        }
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = stream;
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            // On ajuste le canvas à la taille réelle de la vidéo capturée
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
            renderLoop();
        };
    } catch (err) {
        console.error("Erreur Caméra:", err);
        alert("Impossible d'activer la caméra arrière. Vérifiez les autorisations.");
    }
}

startCamera();

// 7. GESTION DE L'ENREGISTREMENT CSV
btnRecord.onclick = () => {
    isRecording = !isRecording;
    btnRecord.innerText = isRecording ? "ARRÊTER L'ACQUISITION" : "DÉMARRER L'ACQUISITION";
    btnRecord.style.background = isRecording ? "red" : "#FF9800";
    
    if (!isRecording) {
        downloadCSV();
    } else {
        csvRows = ["timestamp,landmark_id,x,y,z,visibility"]; // Reset au démarrage
    }
};

function downloadCSV() {
    if (csvRows.length <= 1) return;
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `safegait_data_${Date.now()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}