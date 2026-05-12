import { useVideoRecognition } from "../hooks/useVideoRecognition";
import { useState, useEffect } from "react";
import { LEVELS } from "../data/levels";
import { assetUrl } from "../utils/assetUrl";

export const UI = () => {
    const gameState = useVideoRecognition((state) => state.gameState);
    const videoElement = useVideoRecognition((state) => state.videoElement);
    const lastHitResult = useVideoRecognition((state) => state.lastHitResult);
    const hitResultCount = useVideoRecognition((state) => state.hitResultCount);
    const score = useVideoRecognition((state) => state.score);

    const [showDemo, setShowDemo] = useState(false);

    useEffect(() => {
        //const hasSeen = localStorage.getItem("hasSeenIntro");
        //if (!hasSeen) {
        if (gameState === "preview") {
            console.log("Showing demo video");  
            setShowDemo(true);
        }
    }, [gameState]);
   

    const closeDemo = () => {
        setShowDemo(false);
        //localStorage.setItem("hasSeenIntro", "true");
        useVideoRecognition.getState().setGameState("started");
        //const audio = new Audio("/music/Numb.m4a");
        //audio.volume = 1;
        //audio.play();
    };

    const masteredMovements = useVideoRecognition((state) => state.masteredMovements);
    const arrowPositions = useVideoRecognition((state) => state.arrowPositions);

    const levelComplete = useVideoRecognition((state) => state.levelComplete);
    const hitArrows = useVideoRecognition((state) => state.hitArrows);
    const totalArrows = useVideoRecognition((state) => state.totalArrows);
    const currentLevelIndex = useVideoRecognition((state) => state.currentLevelIndex);
    const resetLevel = useVideoRecognition((state) => state.resetLevel);
    const setCurrentLevelIndex = useVideoRecognition((state) => state.setCurrentLevelIndex);


    // Results screen
    if (levelComplete) {
        const pct = totalArrows > 0 ? hitArrows / totalArrows : 0;
        const stars = pct >= 0.9 ? 3 : pct >= 0.7 ? 2 : pct >= 0.4 ? 1 : 0;
        const isLastLevel = currentLevelIndex >= LEVELS.length - 1;

        return (
            <section className="fixed inset-0 z-50 flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.85)" }}>
                <div style={{
                    textAlign: "center",
                    color: "white",
                    fontFamily: "serif",
                }}>
                    {/* Level name */}
                    <p style={{
                        fontSize: "16px",
                        letterSpacing: "0.3em",
                        textTransform: "uppercase",
                        opacity: 0.6,
                        marginBottom: "8px",
                    }}>
                        {LEVELS[currentLevelIndex].name}
                    </p>

                    {/* Stars */}
                    <div style={{ fontSize: "64px", marginBottom: "16px" }}>
                        {Array.from({ length: 3 }).map((_, i) => (
                            <span key={i} style={{
                                opacity: i < stars ? 1 : 0.2,
                                filter: i < stars ? "drop-shadow(0 0 10px #ffcc00)" : "none",
                            }}>⭐</span>
                        ))}
                    </div>

                    {/* Score */}
                    <p style={{ fontSize: "48px", fontWeight: "bold", marginBottom: "8px" }}>
                        {score}
                    </p>
                    <p style={{ fontSize: "14px", opacity: 0.5, marginBottom: "40px" }}>
                        {hitArrows} / {totalArrows} arrows hit
                    </p>

                    {/* Buttons */}
                    <div style={{ display: "flex", gap: "16px", justifyContent: "center" }}>
                        <button
                            onClick={() => {
                                resetLevel();
                            }}
                            style={{
                                padding: "12px 32px",
                                fontSize: "16px",
                                fontFamily: "serif",
                                letterSpacing: "0.2em",
                                background: "transparent",
                                color: "white",
                                border: "1px solid rgba(255,255,255,0.4)",
                                borderRadius: "4px",
                                cursor: "pointer",
                            }}
                        >
                            PLAY AGAIN
                        </button>

                        {!isLastLevel && (
                            <button
                                onClick={() => {
                                    setCurrentLevelIndex(currentLevelIndex + 1);
                                    resetLevel();
                                }}
                                style={{
                                    padding: "12px 32px",
                                    fontSize: "16px",
                                    fontFamily: "serif",
                                    letterSpacing: "0.2em",
                                    background: "white",
                                    color: "black",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                }}
                            >
                                NEXT LEVEL →
                            </button>
                        )}
                    </div>
                </div>
            </section>
        );
    }
    // Game HUD - shown during game
    // Game HUD - shown during started game
    // Game HUD - preview + started
    if (gameState === "started" || gameState === "preview") {
        return (
            <section className="fixed inset-0 z-10 pointer-events-none">

                {/* Demo video overlay - only in preview */}
                {gameState === "preview" && showDemo && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto"
                        style={{ background: "rgba(0,0,0,0.85)" }}>
                        <div style={{ position: "relative", width: "70vw", maxWidth: "900px" }}>
                            <button onClick={closeDemo} style={{
                                position: "absolute", top: "-20px", right: "-20px",
                                width: "44px", height: "44px", borderRadius: "50%",
                                background: "white", color: "black", fontSize: "20px",
                                fontWeight: "bold", border: "none", cursor: "pointer",
                                zIndex: 10, display: "flex", alignItems: "center",
                                justifyContent: "center", boxShadow: "0 0 20px rgba(255,255,255,0.5)",
                            }}>✕</button>
                            <video src={assetUrl("videos/Demo.mp4")} autoPlay loop style={{
                                width: "100%", borderRadius: "12px",
                                boxShadow: "0 0 40px rgba(255,255,255,0.15)",
                            }} />
                        </div>
                    </div>
                )}

                {/* Score */}
                <div className="fixed top-6 right-6 text-white text-2xl font-bold"
                    style={{ textShadow: "0 0 10px rgba(255,255,255,0.5)" }}>
                    {score}
                </div>

                {/* Hit feedback */}
                {lastHitResult && (
                    <div key={hitResultCount}
                        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                        style={{
                            fontSize: "48px", fontWeight: "bold",
                            color: lastHitResult === "PERFECT" ? "#ffcc00" :
                                lastHitResult === "EARLY" ? "#aaffaa" :
                                    lastHitResult === "MISS" ? "#ff4444" : "#ff8844",
                            textShadow: "0 0 20px currentColor",
                            animation: "fadeOut 0.8s forwards",
                        }}
                        onAnimationEnd={() => useVideoRecognition.getState().setLastHitResult(null)}>
                        {lastHitResult}
                    </div>
                )}

                {/* Ghost hands */}
                {(() => {
                    const ids = Object.keys(arrowPositions);
                    const hasRight = ids.some(id => id.endsWith("-right"));
                    const hasLeft = ids.some(id => id.endsWith("-left"));
                    const hasBoth = hasRight && hasLeft;
                    const showRight = hasRight && !masteredMovements.has("right") && !masteredMovements.has("both");
                    const showLeft = hasLeft && !masteredMovements.has("left") && !masteredMovements.has("both");
                    return (
                        <>
                            {showRight && (
                                <div className="absolute" style={{
                                    bottom: "23%", right: "25%",
                                    width: "300px", height: "300px",
                                    animation: "ghostRaise 1s ease-in-out infinite",
                                }}>
                                    <img src="images/GhostHand/Taptap.png"
                                        style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                                </div>
                            )}
                            {showLeft && (
                                <div style={{
                                    position: "absolute", bottom: "23%", left: "25%",
                                    transform: "scaleX(-1)", width: "300px", height: "300px",
                                }}>
                                    <div style={{ animation: "ghostRaise 1s ease-in-out infinite" }}>
                                        <img src="images/GhostHand/Left_Hand.png"
                                            style={{ width: "300px", height: "300px", objectFit: "contain" }} />
                                    </div>
                                </div>
                            )}
                        </>
                    );
                })()}

                <style>{`
                @keyframes fadeOut {
                    0%   { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
                    100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
                }
                @keyframes ghostRaise {
                    0%   { transform: translateY(0px); opacity: 0.9; }
                    50%  { transform: translateY(-40px); opacity: 1; }
                    100% { transform: translateY(0px); opacity: 0.9; }
                }
            `}</style>
            </section>
        );
    }
    // Waiting screen - shown before game
    if (!videoElement) return null;
    if (gameState !== "waiting") return null;

    return (
        <section className="fixed inset-0 z-10 pointer-events-none">
            {/* Ghost hand */}
            <div className="absolute" style={{
                bottom: "30%", left: "52%",
                width: "180px", height: "180px",
                animation: "tapTap 2s ease-in-out infinite",
            }}>
                <img src="images/GhostHand/Taptap.png"
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
            </div>

            {/* Tap tap to begin text */}
            <div className="absolute top-[18%] left-1/2 -translate-x-1/2 text-center">
                <p style={{
                    fontFamily: "serif", fontSize: "22px", color: "#ffffff",
                    letterSpacing: "0.4em", textTransform: "uppercase",
                    textShadow: "0 0 20px rgba(255,200,100,0.8), 0 0 40px rgba(255,200,100,0.4)",
                    animation: "pulse 3.5s ease-in-out infinite",
                }}>
                    Tap Tap to Begin
                </p>
            </div>

            {/* TAP flash */}
            <div className="absolute" style={{
                bottom: "45%", left: "55%", transform: "translateX(-50%)",
                fontSize: "14px", fontFamily: "serif", color: "#ffffff",
                animation: "tapFlash 2s ease-in-out infinite",
            }}>
                TAP
            </div>

            <style>{`
                @keyframes tapTap {
                    0%    { transform: rotate(0deg); }
                    12%   { transform: rotate(-25deg); }
                    22%   { transform: rotate(0deg); }
                    34%   { transform: rotate(-25deg); }
                    44%   { transform: rotate(0deg); }
                    100%  { transform: rotate(0deg); }
                }
                @keyframes tapFlash {
                    0%    { opacity: 0; }
                    10%   { opacity: 0; }
                    12%   { opacity: 1; }
                    20%   { opacity: 0; }
                    32%   { opacity: 0; }
                    34%   { opacity: 1; }
                    42%   { opacity: 0; }
                    100%  { opacity: 0; }
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50%       { opacity: 0.4; }
                }
            `}</style>
        </section>
    );
};