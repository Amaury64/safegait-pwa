// 1. Service Worker pour le support hors-ligne (PWA)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error(err));
}

const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const btnRecord = document.getElementById('btnRecord');

// INDICATEUR VISUEL : Le bouton doit être BLEU
btnRecord.style.backgroundColor = "#2196F3"; 

let isRecording = false;
let csvRows = ["timestamp,landmark_id,x,y,z,visibility"];
let isProcessing = false; 
let lastLandmarks = null; 

// RÉGLAGE RÉACTIVITÉ : 0.7 = suit ton mouvement instantanément
const SMOOTHING_FACTOR = 0.7; 

// 2. Initialisation de Pose - Mode "Lite" (vitesse maximale)
const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

pose.setOptions({
    modelComplexity: 0, // Mode ultra-rapide pour mobile
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

// 3. Boucle d'affichage vidéo (60 FPS constants)
function renderLoop() {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // On dessine le flux caméra en temps réel
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    
    // On dessine le squelette dès qu'un calcul est disponible
    if (lastLandmarks) {
        drawConnectors(canvasCtx, lastLandmarks, POSE_CONNECTIONS, {color: '#00FF00', lineWidth: 4});
        drawLandmarks(canvasCtx, lastLandmarks, {color: '#FF0000', radius: 3});
    }
    canvasCtx.restore();

    // Si l'IA a fini le calcul précédent, on lui envoie l'image suivante
    if (!isProcessing) {
        processPose();
    }
    requestAnimationFrame(renderLoop);
}

// 4. Calcul de l'IA sans délai artificiel
async function processPose() {
    isProcessing = true;
    await pose.send({image: videoElement});
    isProcessing = false; // Relance le calcul immédiatement
}

// 5. Filtre de lissage léger pour coller au corps
pose.onResults((results) => {
    if (results.poseLandmarks) {
        if (!lastLandmarks) {
            lastLandmarks = results.poseLandmarks;
        } else {
            // Interpolation rapide pour supprimer la traîne (lag)
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

// 6. Lancement caméra (Résolution optimisée pour le A55)
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: 640, height: 480 }
        });
        videoElement.srcObject = stream;
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
            renderLoop();
        };
    } catch (err) {
        alert("Erreur Caméra : " + err);
    }
}

startCamera();

// 7. Bouton et téléchargement CSV
btnRecord.onclick = () => {
    isRecording = !isRecording;
    btnRecord.innerText = isRecording ? "ARRÊTER" : "DÉMARRER";
    btnRecord.style.backgroundColor = isRecording ? "red" : "#2196F3";
    
    if (!isRecording) {
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `safegait_${Date.now()}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    } else {
        csvRows = ["timestamp,landmark_id,x,y,z,visibility"];
    }
};