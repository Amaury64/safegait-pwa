const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const btnRecord = document.getElementById('btnRecord');

// CHANGEMENT VISUEL : Bouton Orange pour vérifier que la mise à jour est active
btnRecord.style.background = "#FF9800"; 

let isRecording = false;
let csvRows = ["timestamp,landmark_id,x,y,z,visibility"];
let frameCount = 0;

const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

pose.setOptions({
    modelComplexity: 0, 
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

async function detectionLoop() {
    if (videoElement.paused || videoElement.ended) return;
    
    frameCount++;
    // ON ANALYSE SEULEMENT 1 IMAGE SUR 5 (Trés fluide pour le téléphone)
    if (frameCount % 5 === 0) {
        await pose.send({image: videoElement});
    } else {
        // On dessine juste la vidéo pour garder l'écran fluide
        canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    }
    window.requestAnimationFrame(detectionLoop);
}

pose.onResults((results) => {
    canvasElement.width = results.image.width;
    canvasElement.height = results.image.height;
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

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
    canvasCtx.restore();
});

async function startCamera() {
    const constraints = {
        video: { 
            facingMode: 'environment', 
            width: { ideal: 320 }, // RÉSOLUTION TRÈS BASSE POUR LA STABILITÉ
            height: { ideal: 240 } 
        }
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoElement.srcObject = stream;
    videoElement.onloadedmetadata = () => {
        videoElement.play();
        detectionLoop();
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