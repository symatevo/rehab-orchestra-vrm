import { Camera } from "@mediapipe/camera_utils";
import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils";
import { useEffect, useRef, useState } from "react";
import { useVideoRecognition } from "../hooks/useVideoRecognition";
import {
    HAND_CONNECTIONS,
    Holistic,
    POSE_CONNECTIONS,
} from "@mediapipe/holistic";
export const CameraWidget = ({ onCameraStart }) => {
    const [start, setStart] = useState(false);
    const videoElement = useRef();
    const drawCanvas = useRef();
    const [showContact, setShowContact] = useState(false);
    const setVideoElement = useVideoRecognition((state) => state.setVideoElement);
    const cycleAvatar = useVideoRecognition((state) => state.cycleAvatar);

    const setPaused = useVideoRecognition((state) => state.setPaused);
    //const gameState = useVideoRecognition((state) => state.gameState);

    useEffect(() => {
        if (useVideoRecognition.getState().gameState !== "started") return;
        if (!start) {
            setPaused(true);
        } else {
            setPaused(false);
        }
    }, [start]);

    const drawResults = (results) => {
        drawCanvas.current.width = videoElement.current.videoWidth;
        drawCanvas.current.height = videoElement.current.videoHeight;
        let canvasCtx = drawCanvas.current.getContext("2d");
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, drawCanvas.current.width, drawCanvas.current.height);
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {
            color: "#00cff7", lineWidth: 4,
        });
        drawLandmarks(canvasCtx, results.poseLandmarks, {
            color: "#ff0364", lineWidth: 2,
        });
        drawConnectors(canvasCtx, results.leftHandLandmarks, HAND_CONNECTIONS, {
            color: "#eb1064", lineWidth: 5,
        });
        drawLandmarks(canvasCtx, results.leftHandLandmarks, {
            color: "#00cff7", lineWidth: 2,
        });
        drawConnectors(canvasCtx, results.rightHandLandmarks, HAND_CONNECTIONS, {
            color: "#22c3e3", lineWidth: 5,
        });
        drawLandmarks(canvasCtx, results.rightHandLandmarks, {
            color: "#ff0364", lineWidth: 2,
        });
    };

    const cameraRef = useRef(null);
    const holisticRef = useRef(null);

    useEffect(() => {
        if (!start) {
            setVideoElement(null);
            if (cameraRef.current) {
                cameraRef.current.stop();
                cameraRef.current = null;
            }
            if (holisticRef.current) {
                holisticRef.current.close();
                holisticRef.current = null;
            }
            return;
        }
        if (useVideoRecognition.getState().videoElement) {
            return;
        }
        setVideoElement(videoElement.current);
        const holistic = new Holistic({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1635989137/${file}`;
            },
        });
        holistic.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.7,
            refineFaceLandmarks: false,
            enableFaceGeometry: false,
        });
        holisticRef.current = holistic;
        holistic.onResults((results) => {
            drawResults(results);
            const state = useVideoRecognition.getState();
            state.resultsCallback?.(results);
            state.movementDetectionCallback?.(results);
            state.romCalibrationCallback?.(results);
        });
        const camera = new Camera(videoElement.current, {
            onFrame: async () => {
                await holistic.send({ image: videoElement.current });
            },
            width: 640,
            height: 480,
        });
        camera.start();
        cameraRef.current = camera;
    }, [start]);


    return (
        <>
            {/* Video Preview - Top Left */}
            <div
                className={`fixed z-[999999] top-4 left-4 w-[320px] h-[240px] rounded-[20px] overflow-hidden ${!start ? "hidden" : ""}`}
            >
                <canvas
                    ref={drawCanvas}
                    className="absolute z-10 w-full h-full bg-black/50 top-0 left-0"
                    style={{ transform: "scaleX(-1)" }}
                />
                <video
                    ref={videoElement}
                    className="absolute z-0 w-full h-full top-0 left-0"
                    style={{ transform: "scaleX(-1)" }}
                />
            </div>

            {/* FAB Cluster - Bottom Right */}
            <div className="fixed bottom-6 right-6 z-20" style={{ width: "180px", height: "180px" }}>

                {/* Main large circle - bottom right (camera) */}
                <div
    className="absolute bg-[#2a3f4f]"
    style={{
        width: "120px",
        height: "120px",
        borderRadius: "50%",
        bottom: "0px",
        right: "0px",
    }}
/>

                {/* Small circle - top right (phone) */}
                <div
                    className="absolute bg-[#2a3f4f]"
                    style={{
                        width: "60px",
                        height: "60px",
                        borderRadius: "50%",
                        top: "0px",
                        right: "20px",
                        
                    }}
                />

                {/* Small circle - left (character) */}
                <div
                    className="absolute bg-[#2a3f4f]"
                    style={{
                        width: "60px",
                        height: "60px",
                        borderRadius: "50%",
                        bottom: "20px",
                        left: "0px",
                    }}
                />

                {/* Phone button - centered in top circle */}
                <button
                    href="tel:+306970501697"
                    onClick={() => setShowContact((prev) => !prev)}
                    className="absolute flex items-center justify-center w-10 h-10 rounded-full hover:bg-[#4a6078] transition-colors"
                    style={{ top: "10px", right: "30px" }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                        strokeWidth={1.5} stroke="white" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round"
                            d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 6.75Z"
                        />
                    </svg>
                </button>
                {showContact && (
                    <div className="absolute bottom-[190px] right-0 bg-[#1e2f3d] rounded-2xl p-4 w-[270px] shadow-xl z-50">
                        {/* Close button */}
                        <button
                            onClick={() => setShowContact(false)}
                            className="absolute top-2 right-2 text-white/50 hover:text-white text-xs"
                        >
                            ✕
                        </button>

                        {/* Name */}
                        <p className="text-white font-semibold text-sm mb-3">
                            Syuzanna Matevosyan
                        </p>

                        <div className="w-full h-px bg-white/10 mb-3" />

                        {/* Phone */}
                        <p
                            href="tel:+306970501697"
                            className="flex items-center gap-2 text-white/80 hover:text-white text-xs mb-2 transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                                strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 shrink-0">
                                <path strokeLinecap="round" strokeLinejoin="round"
                                    d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 6.75Z"
                                />
                            </svg>
                            +30 6970501697
                        </p>

                        {/* Email */}
                        <p
                            href="mailto:syuzi.matevosyan1802@gmail.com"
                            className="flex items-center gap-2 text-white/80 hover:text-white text-xs transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                                strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 shrink-0">
                                <path strokeLinecap="round" strokeLinejoin="round"
                                    d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
                                />
                            </svg>
                            syuzi.matevosyan1802@gmail.com
                        </p>
                    </div >
                )}
                {/* Character button - centered in left circle */}
                <button
                    onClick={cycleAvatar}
                    className="absolute flex items-center justify-center w-10 h-10 rounded-full hover:bg-[#4a6078] transition-colors"
                    style={{ bottom: "30px", left: "10px" }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                        strokeWidth={1.5} stroke="white" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round"
                            d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                        />
                    </svg>
                </button>

                {/* Main camera button - centered in big circle */}
                <button
                    onClick={() => {
    const next = !start;
    setStart(next);
    if (next) onCameraStart?.();
}}
                    className={`absolute flex items-center justify-center w-22 h-22 rounded-full transition-colors shadow-lg ${start ? "bg-[#bd466a] hover:bg-[#b7506f]" : "bg-[#009df7] hover:bg-[#0ca1f7]"
                        }`}
                    style={{ bottom: "15px", right: "15px", boxShadow: !start
            ? '0 0 0 3px rgba(0,157,247,0.6), 0 0 24px rgb(0, 162, 255)'
            : 'none',
        transition: 'box-shadow 0.3s ease', }}
                >
                    {!start ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 25 25"
                            strokeWidth={1.5} stroke="white" className="w-12 h-12">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
                            />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 25 25"
                            strokeWidth={1.5} stroke="white" className="w-12 h-12">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M12 18.75H4.5a2.25 2.25 0 0 1-2.25-2.25V9m12.841 9.091L16.5 19.5m-1.409-1.409c.407-.407.659-.97.659-1.591v-9a2.25 2.25 0 0 0-2.25-2.25h-9c-.621 0-1.184.252-1.591.659m12.182 12.182L2.909 5.909M1.5 4.5l1.409 1.409"
                            />
                        </svg>
                    )}
                </button>
            </div >
        </>
    );
};