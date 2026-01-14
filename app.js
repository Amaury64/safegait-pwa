
// 1. Gestion du Service Worker (PWA)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then(() => console.log("SafeGait: Service Worker prêt"))
        .catch(err => console.error("Erreur SW:", err));
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

// CONFIGURATION DU LISSAGE (REACTIVITÉ)
// 0.35 : Équilibre idéal pour supprimer la latence tout en gardant des articulations fluides.
const SMOOTHING_FACTOR = 0.35; 

// 2. Initialisation de MediaPipe Pose
const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

pose.setOptions({
    modelComplexity: 1, // Haute précision adaptée au processeur du A55
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

// 3. BOUCLE DE RENDU (Affichage vidéo à 60 FPS)
function renderLoop() {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // On dessine l'image brute de la caméra sans aucun retard
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    
    // On dessine le squelette par-dessus (mis à jour dès que l'IA a fini)
    if (lastLandmarks) {
        drawConnectors(canvasCtx, lastLandmarks, POSE_CONNECTIONS, {color: '#00FF00', lineWidth: 4});
        drawLandmarks(canvasCtx, lastLandmarks, {color: '#FF0000', radius: 3});
    }
    canvasCtx.restore();

    // On lance le calcul de l'IA dès que possible sans bloquer l'affichage
    if (!isProcessing) {
        processPose();
    }
    
    requestAnimationFrame(renderLoop);
}

// 4. CALCUL DE L'IA (Haute Performance)
async function processPose() {
    isProcessing = true;
    
    // On envoie l'image actuelle à l'IA
    await pose.send({image: videoElement});
    
    // On libère le verrou immédiatement pour traiter l'image suivante
    isProcessing = false; 
}

// 5. FILTRE TEMPOREL (Réduit la latence)
pose.onResults((results) => {
    if (results.poseLandmarks) {
        if (!lastLandmarks) {
            lastLandmarks = results.poseLandmarks;
        } else {
            // Interpolation pour que le squelette "colle" au mouvement
            lastLandmarks = results.poseLandmarks.map((lm, i) => {
                return {
                    x: lastLandmarks[i].x * (1 - SMOOTHING_FACTOR) + lm.x * SMOOTHING_FACTOR,
                    y: lastLandmarks[i].y * (1 - SMOOTHING_FACTOR) + lm.y * SMOOTHING_FACTOR,
                    z: lastLandmarks[i].z * (1 - SMOOTHING_FACTOR) + lm.z * SMOOTHING_FACTOR,
                    visibility: lm.visibility
                };
            });
        }

        // Sauvegarde des coordonnées pour le CSV
        if (isRecording) {
            const ts = Date.now();
            lastLandmarks.forEach((lm, i) => {
                csvRows.push(`${ts},${i},${lm.x.toFixed(4)},${lm.y.toFixed(4)},${lm.z.toFixed(4)}`);
            });
        }
    }
});

// 6. ACCÈS À LA CAMÉRA ARRIÈRE
async function startCamera() {
    const constraints = {
        video: { 
            facingMode: 'environment', // Force la caméra arrière
            width: { ideal: 1280 }, 
            height: { ideal: 720 } 
        }
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = stream;
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            // Ajuste le canvas à la résolution réelle de capture
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
            renderLoop();
        };
    } catch (err) {
        console.error("Accès caméra refusé :", err);
        alert("Activez l'autorisation caméra pour utiliser SafeGait.");
    }
}

startCamera();

// 7. BOUTON D'ENREGISTREMENT ET GÉNÉRATION CSV
btnRecord.onclick = () => {
    isRecording = !isRecording;
    btnRecord.innerText = isRecording ? "ARRÊTER L'ACQUISITION" : "DÉMARRER L'ACQUISITION";
    btnRecord.style.backgroundColor = isRecording ? "red" : "#E91E63";
    
    if (!isRecording) {
        downloadCSV();
    } else {
        // Reset des données pour une nouvelle session
        csvRows = ["timestamp,landmark_id,x,y,z,visibility"];
    }
};

function downloadCSV() {
    if (csvRows.length <= 1) return;
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `safegait_session_${Date.now()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url); // Libère la mémoire vive
}