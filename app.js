// 1. Service Worker pour le support hors-ligne (PWA)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error("SW error:", err));
}

const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const btnRecord = document.getElementById('btnRecord');

// --- CONFIGURATION ---
let isRecording = false;
// Nouveau Header avec 'v' pour visibility et 'w_' pour les coordonnées en mètres
let csvRows = ["timestamp,landmark_id,x_world,y_world,z_world,visibility"];
let isProcessing = false; 
let lastLandmarks = null; 

const SMOOTHING_FACTOR = 0.7; // 0.7 = réactivité maximale, 0.1 = très fluide mais lent

// 2. Initialisation de Pose - Mode "Lite" (vitesse maximale pour mobile)
const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

pose.setOptions({
    modelComplexity: 0, // 0: Lite (rapide), 1: Full, 2: Heavy
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

// 3. Traitement des résultats de l'IA
pose.onResults((results) => {
    // A. PRÉPARATION POUR L'AFFICHAGE (Image Landmarks)
    if (results.poseLandmarks) {
        if (!lastLandmarks) {
            lastLandmarks = results.poseLandmarks;
        } else {
            // Lissage pour éviter que le squelette ne tremble trop à l'écran
            lastLandmarks = results.poseLandmarks.map((lm, i) => ({
                x: lastLandmarks[i].x * (1 - SMOOTHING_FACTOR) + lm.x * SMOOTHING_FACTOR,
                y: lastLandmarks[i].y * (1 - SMOOTHING_FACTOR) + lm.y * SMOOTHING_FACTOR,
                z: lastLandmarks[i].z * (1 - SMOOTHING_FACTOR) + lm.z * SMOOTHING_FACTOR,
                visibility: lm.visibility
            }));
        }
    }

    // B. ENREGISTREMENT SCIENTIFIQUE (World Landmarks en mètres)
    // On n'enregistre que si on est en mode RECORD et que l'IA voit des points
    if (isRecording && results.poseWorldLandmarks) {
        const ts = Date.now();
        results.poseWorldLandmarks.forEach((lm, i) => {
            // FILTRE DE CONFIANCE : On ignore les points "hallucinés" par l'IA
            if (lm.visibility > 0.5) {
                csvRows.push(`${ts},${i},${lm.x.toFixed(4)},${lm.y.toFixed(4)},${lm.z.toFixed(4)},${lm.visibility.toFixed(2)}`);
            }
        });
    }
});

// 4. Boucle de rendu (Affichage fluide)
function renderLoop() {
    canvasCtx.save();
    
    // Efface le canvas
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Dessine l'image de la caméra
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    
    // Dessine le squelette (Landmarks 2D pour l'écran)
    if (lastLandmarks) {
        // Dessine les lignes de connexion (vertes)
        drawConnectors(canvasCtx, lastLandmarks, POSE_CONNECTIONS, {color: '#00FF00', lineWidth: 4});
        // Dessine les articulations (rouges)
        drawLandmarks(canvasCtx, lastLandmarks, {color: '#FF0000', radius: 3});
    }
    
    canvasCtx.restore();

    // Envoie l'image suivante à l'IA si elle a fini la précédente
    if (!isProcessing) {
        processPose();
    }
    
    requestAnimationFrame(renderLoop);
}

async function processPose() {
    isProcessing = true;
    await pose.send({image: videoElement});
    isProcessing = false;
}

// 5. Lancement de la caméra (Optimisé pour Samsung A55)
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: 'environment', 
                width: { ideal: 640 }, 
                height: { ideal: 480 },
                frameRate: { ideal: 30 } 
            }
        });
        videoElement.srcObject = stream;
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
            renderLoop();
        };
    } catch (err) {
        console.error("Caméra inaccessible :", err);
        alert("Veuillez autoriser la caméra pour utiliser SafeGait.");
    }
}

// 6. Gestion du bouton d'enregistrement et export CSV
btnRecord.onclick = () => {
    isRecording = !isRecording;
    
    if (isRecording) {
        // Démarrage
        csvRows = ["timestamp,landmark_id,x_world,y_world,z_world,visibility"]; // Reset
        btnRecord.innerText = "ARRÊTER L'ACQUISITION";
        btnRecord.style.backgroundColor = "#F44336"; // Rouge
    } else {
        // Arrêt et Téléchargement
        btnRecord.innerText = "DÉMARRER L'ACQUISITION";
        btnRecord.style.backgroundColor = "#2196F3"; // Bleu
        downloadCSV();
    }
};

function downloadCSV() {
    if (csvRows.length <= 1) return; // Rien à télécharger

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    a.style.display = 'none';
    a.href = url;
    a.download = `safegait_data_${new Date().toISOString().slice(0,19)}.csv`;
    
    document.body.appendChild(a);
    a.click();
    
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

// Go !
startCamera();