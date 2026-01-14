// 1. Enregistrement du Service Worker pour le mode PWA hors-ligne
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then(() => console.log("Service Worker SafeGait actif"))
        .catch(err => console.log("Erreur SW:", err));
}

const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const btnRecord = document.getElementById('btnRecord');

let isRecording = false;
let csvRows = ["timestamp,landmark_id,x,y,z,visibility"];

// 2. Initialisation de MediaPipe Pose
const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

// Configuration pour un bon compromis entre précision et fluidité
pose.setOptions({
    modelComplexity: 1, // 1 pour la précision standard, 2 pour la haute précision (plus lent)
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

// 3. Traitement et Dessin du Squelette
pose.onResults((results) => {
    // Ajustement de la résolution du canvas pour correspondre à la caméra réelle
    if (results.image) {
        if (canvasElement.width !== results.image.width) {
            canvasElement.width = results.image.width;
            canvasElement.height = results.image.height;
        }

        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        
        // Affichage du flux vidéo HD
        canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

        // Dessin du squelette par-dessus
        if (results.poseLandmarks) {
            // Dessin des lignes (vert)
            drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS,
                {color: '#00FF00', lineWidth: 4});
            // Dessin des articulations (rouge)
            drawLandmarks(canvasCtx, results.poseLandmarks,
                {color: '#FF0000', lineWidth: 2, radius: 4});

            // Enregistrement des données si l'acquisition est lancée
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

// 4. Configuration de la Caméra (Forçage HD et Caméra Arrière)
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await pose.send({image: videoElement});
    },
    // Forçage de la résolution Full HD et du capteur arrière
    width: 1920,
    height: 1080,
    facingMode: 'environment' 
});

camera.start();

// 5. Gestion du bouton d'enregistrement
btnRecord.onclick = () => {
    if (!isRecording) {
        // Démarrage
        isRecording = true;
        csvRows = ["timestamp,landmark_id,x,y,z,visibility"]; // Reset
        btnRecord.innerText = "ARRÊTER ET TÉLÉCHARGER";
        btnRecord.style.background = "red";
    } else {
        // Arrêt
        isRecording = false;
        btnRecord.innerText = "DÉMARRER L'ACQUISITION";
        btnRecord.style.background = "#6200EE";
        downloadCSV();
    }
};

// Fonction de génération du fichier CSV
function downloadCSV() {
    if (csvRows.length <= 1) return;
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `safegait_session_${dateStr}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}
