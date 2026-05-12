import { CameraControls, Environment } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { VRMAvatar } from "./VRMAvatar";
import { useGameStore, GAME_STATES } from "../hooks/useGameStore";
import { useTexture } from "@react-three/drei";
import { useGLTF, useAnimations } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import { SRGBColorSpace, Vector3 } from "three";
import { useVideoRecognition } from '../hooks/useVideoRecognition';
import { useCalibration } from '../hooks/useCalibration';
import { assetUrl } from '../utils/assetUrl';

// ── Playing stage environment ─────────────────────────────────────────────────

function PlayingSkyBackdrop() {
  const tex = useTexture(assetUrl('game-sky.png'));
  tex.colorSpace = SRGBColorSpace;
  return (
    <mesh position={[0, -1, -12.4]}>
      <planeGeometry args={[5, 1.9]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

function PlayingStageEnvironment() {
  return (
    <group>
      <PlayingSkyBackdrop />
      {/* Stage floor — cream */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.9, -10.45]} receiveShadow>
        <planeGeometry args={[26, 20]} />
        <meshStandardMaterial color="#f2e2c4" roughness={0.9} metalness={0.02} />
      </mesh>
      {/* Front lip */}
      <mesh position={[0, -1.22, -2.2]} receiveShadow>
        <boxGeometry args={[24, 0.08, 0.28]} />
        <meshStandardMaterial color="#cda477" />
      </mesh>
    </group>
  );
}

// ── Camera rigs ───────────────────────────────────────────────────────────────

function PlayingCameraRig() {
  const { camera } = useThree();
  useLayoutEffect(() => {
    camera.position.set(0, 0, 0);
    camera.fov = 10;
    const target = new Vector3(0, -0.92, -10.4);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

function LobbyCameraRestore() {
    const { camera } = useThree();
    useLayoutEffect(() => {
    camera.updateProjectionMatrix();
      camera.position.set(0, 0, 2.3);
      camera.rotation.set(0, 0, 0);
      camera.fov = 30;
      camera.updateProjectionMatrix();
    }, [camera]);
    return null;
  }

const AnimatedCurtain = ({ position, rotation, scale }) => {
    const group = useRef();
    const { scene, animations } = useGLTF("models/Overall design/cortina_curtain_new_2.0.glb");
    const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]); // 👈 key change
    const { actions } = useAnimations(animations, group);

    useEffect(() => {
        const firstAction = Object.values(actions)[2];
        if (firstAction) firstAction.play();
    }, [actions]);

    return (
        <primitive
            ref={group}
            object={clone}
            position={position}
            rotation={rotation}
            scale={scale}
        />
    );
};

const AnimatedBush = ({ position, rotation, scale }) => {
    const group = useRef();
    const { scene, animations } = useGLTF("models/Overall design/simple_bush.glb");
    const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]); // 👈 key change
    const { actions } = useAnimations(animations, group);

    useEffect(() => {
        const firstAction = Object.values(actions)[1];
        if (firstAction) firstAction.play();
    }, [actions]);

    return (
        <primitive
            ref={group}
            object={clone}
            position={position}
            rotation={rotation}
            scale={scale}
        />
    );
};


const AnimatedyardGrass = ({ position, rotation, scale }) => {
    const group = useRef();
    const { scene, animations } = useGLTF("models/Overall design/grass_bursh_displacement_a_eo_001.glb");
    const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]); // 👈 key change
    const { actions } = useAnimations(animations, group);

    useEffect(() => {
        const firstAction = Object.values(actions)[0];
        if (firstAction) firstAction.play();
    }, [actions]);

    return (
        <primitive
            ref={group}
            object={clone}
            position={position}
            rotation={rotation}
            scale={scale}
        />
    );
};




const AnimatedGrass = ({ position, rotation, scale }) => {
    const group = useRef();
    const { scene, animations } = useGLTF("models/Overall design/animated_grass.glb");
    const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]); // 👈 key change
    const { actions } = useAnimations(animations, group);

    useEffect(() => {
        const firstAction = Object.values(actions)[0];
        if (firstAction) firstAction.play();
    }, [actions]);

    return (
        <primitive
            ref={group}
            object={clone}
            position={position}
            rotation={rotation}
            scale={scale}
        />
    );
};

const StonePath = () => {
    const stones = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 0.4,
        z: -1.5 - i * 0.55,
        rotY: (Math.random() - 0.5) * 0.3,
        w: 0.7 + Math.random() * 0.2,
        d: 0.4 + Math.random() * 0.15,
    })), []);

    return (
        <group>
            

            {/* Individual stone tiles on top */}
            {stones.map(({ id, x, z, rotY, w, d }) => (
                <mesh
                    key={id}
                    rotation={[-Math.PI / 2, rotY, 0]}
                    position={[x, 0.02, z]}
                >
                    <boxGeometry args={[w, d, 0.04]} />
                    <meshStandardMaterial color="#715745" />
                </mesh>
            ))}
        </group>
    );
};

const BackgroundImage = () => {
    const skyTexture = useTexture("models/Overall design/sky.png");
    const floorTexture = useTexture("models/Overall design/floor.png");

    return (
        <>
            {/* Sky - vertical plane in the back */}
            <mesh position={[0, 6.2, -8]}>
                <planeGeometry args={[30, 12]} />
                <meshBasicMaterial map={skyTexture} depthWrite={false} />
            </mesh>

            {/* Floor - flat horizontal plane */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.1, 0, -1.2]} scale={[0.6, 1, 1]}>
                <planeGeometry args={[30, 20]} />
                <meshBasicMaterial map={floorTexture} />
            </mesh>
        </>
    );
};

// const Spark = ({ angle, explodePos }) => {
//     const ref = useRef();
//     const t = useRef(0);
//
//     useFrame((_, delta) => {
//         t.current += delta * 2;
//         if (!ref.current) return;
//         ref.current.position.x = explodePos[0] + Math.cos(angle) * t.current * 0.4;
//         ref.current.position.y = explodePos[1] + Math.sin(angle) * t.current * 0.3 + t.current * 0.2;
//         ref.current.position.z = explodePos[2];
//         ref.current.material.opacity = Math.max(0, 1 - t.current);
//     });
//
//     return (
//         <mesh ref={ref}>
//             <sphereGeometry args={[0.04, 4, 4]} />
//             <meshStandardMaterial
//                 color="#ffcc44"
//                 emissive="#ffcc44"
//                 emissiveIntensity={3}
//                 transparent
//                 opacity={1}
//             />
//         </mesh>
//     );
// };

const OrchestraChair = ({ position, rotation = [0, 0, 0] }) => {
    return (
        <group position={position} rotation={rotation}>
            {/* Seat */}
            <mesh position={[0, 0.22, 0]}>
                <boxGeometry args={[0.28, 0.04, 0.28]} />
                <meshStandardMaterial color="#5c3d1e" />
            </mesh>
            {/* Seat cushion */}
            <mesh position={[0, 0.25, 0]}>
                <boxGeometry args={[0.24, 0.04, 0.24]} />
                <meshStandardMaterial color="#8b2020" />  {/* deep red */}
            </mesh>
            {/* Back rest */}
            <mesh position={[0, 0.44, -0.13]}>
                <boxGeometry args={[0.26, 0.32, 0.03]} />
                <meshStandardMaterial color="#5c3d1e" />
            </mesh>
            {/* Back cushion */}
            <mesh position={[0, 0.44, -0.11]}>
                <boxGeometry args={[0.22, 0.26, 0.02]} />
                <meshStandardMaterial color="#8b2020" />  {/* deep red */}
            </mesh>
            {/* 4 legs */}
            {[[-0.11, -0.11], [-0.11, 0.11], [0.11, -0.11], [0.11, 0.11]].map(([lx, lz], i) => (
                <mesh key={i} position={[lx, 0.11, lz]}>
                    <cylinderGeometry args={[0.015, 0.015, 0.22, 6]} />
                    <meshStandardMaterial color="#3d2010" />
                </mesh>
            ))}
        </group>
    );
};
const MusicStand = ({ position, rotation = [0, 0, 0] }) => {
    return (
        <group position={position} rotation={rotation}>
            {/* Vertical pole */}
            <mesh position={[0, 0.3, 0]}>
                <cylinderGeometry args={[0.015, 0.015, 0.6, 6]} />
                <meshStandardMaterial color="#888888" metalness={0.8} roughness={0.2} />
            </mesh>
            {/* Base center disk */}
            <mesh position={[0, 0.02, 0]}>
                <cylinderGeometry args={[0.04, 0.04, 0.02, 8]} />
                <meshStandardMaterial color="#888888" metalness={0.8} />
            </mesh>
            {/* Tripod legs */}
            {[0, Math.PI * 2 / 3, Math.PI * 4 / 3].map((angle, i) => (
                <mesh
                    key={i}
                    position={[Math.cos(angle) * 0.05, 0.02, Math.sin(angle) * 0.05]}
                    rotation={[0, -angle, 0.3]}
                >
                    <cylinderGeometry args={[0.01, 0.01, 0.22, 6]} />
                    <meshStandardMaterial color="#888888" metalness={0.8} roughness={0.2} />
                </mesh>
            ))}
            {/* Music sheet holder */}
            <mesh position={[0, 0.56, 0.04]} rotation={[-0.4, 0, 0]}>
                <boxGeometry args={[0.28, 0.22, 0.01]} />
                <meshStandardMaterial color="#555555" metalness={0.5} />
            </mesh>
            {/* Sheet of paper */}
            <mesh position={[0, 0.565, 0.045]} rotation={[-0.4, 0, 0]}>
                <boxGeometry args={[0.24, 0.18, 0.002]} />
                <meshStandardMaterial color="#f5f0e8" />
            </mesh>
            {/* Bottom ledge */}
            <mesh position={[0, 0.455, 0.07]} rotation={[-0.4, 0, 0]}>
                <boxGeometry args={[0.28, 0.02, 0.04]} />
                <meshStandardMaterial color="#555555" metalness={0.5} />
            </mesh>
        </group>
    );
};

const Butterfly = ({ startPosition, speed = 0.4, radius = 1.5 }) => {
    const groupRef = useRef();
    const wing1Ref = useRef();
    const wing2Ref = useRef();
    const t = useRef(Math.random() * Math.PI * 2);

    // Particle trail system
    const PARTICLE_COUNT = 12;
    const particles = useRef(
        Array.from({ length: PARTICLE_COUNT }, () => ({
            ref: { current: null },
            life: 0,
            maxLife: 0.8 + Math.random() * 0.4,
            x: 0, y: 0, z: 0,
            vx: (Math.random() - 0.5) * 0.01,
            vy: Math.random() * 0.02,
            vz: (Math.random() - 0.5) * 0.01,
        }))
    );
    const spawnTimer = useRef(0);

    useFrame((_, delta) => {
        t.current += delta * speed;

        if (groupRef.current) {
            const newX = startPosition[0] + Math.sin(t.current) * radius;
            const newY = startPosition[1] + Math.sin(t.current * 2) * 0.3;
            const newZ = startPosition[2] + Math.cos(t.current) * radius * 0.5;

            groupRef.current.position.x = newX;
            groupRef.current.position.y = newY;
            groupRef.current.position.z = newZ;
            groupRef.current.rotation.y = -t.current + Math.PI / 2;

            // Spawn new particles at butterfly position
            spawnTimer.current += delta;
            if (spawnTimer.current > 1.5) {
                spawnTimer.current = 0;
                const dead = particles.current.find(p => p.life <= 0);
                if (dead) {
                    dead.life = dead.maxLife;
                    dead.x = newX + (Math.random() - 0.5) * 0.05;
                    dead.y = newY + (Math.random() - 0.5) * 0.05;
                    dead.z = newZ + (Math.random() - 0.5) * 0.05;
                    dead.vx = (Math.random() - 0.5) * 0.015;
                    dead.vy = 0.01 + Math.random() * 0.02;
                    dead.vz = (Math.random() - 0.5) * 0.015;
                }
            }
        }

        // Update particles
        particles.current.forEach(p => {
            if (p.life <= 0) {
                if (p.ref.current) p.ref.current.visible = false;
                return;
            }
            p.life -= delta;
            p.x += p.vx;
            p.y += p.vy;
            p.z += p.vz;

            if (p.ref.current) {
                p.ref.current.visible = true;
                p.ref.current.position.set(p.x, p.y, p.z);
                const lifeRatio = p.life / p.maxLife;
                p.ref.current.material.opacity = lifeRatio * 0.7;
                const s = lifeRatio * 0.03;
                p.ref.current.scale.set(s, s, s);
            }
        });

        // Flap wings
        const flapAngle = Math.abs(Math.sin(t.current * 8)) * 0.6;
        if (wing1Ref.current) wing1Ref.current.rotation.y = -flapAngle;
        if (wing2Ref.current) wing2Ref.current.rotation.y = flapAngle;
    });

    return (
        <>
            {/* Particle trail - rendered outside the butterfly group so positions are world-space */}
            {particles.current.map((p, i) => (
                <mesh key={i} ref={p.ref} visible={false}>
                    <sphereGeometry args={[1, 4, 4]} />
                    <meshStandardMaterial
                        color="#ffffaa"
                        emissive="#ffdd44"
                        emissiveIntensity={2}
                        transparent
                        opacity={0}
                    />
                </mesh>
            ))}

            <group ref={groupRef} position={startPosition}>
                {/* Left wing */}
                <mesh ref={wing1Ref} position={[0, 0, 0]}>
                    <bufferGeometry>
                        <bufferAttribute
                            attach="attributes-position"
                            count={3}
                            array={new Float32Array([
                                0, 0, 0,
                                -0.18, 0.08, 0,
                                -0.1, -0.1, 0,
                            ])}
                            itemSize={3}
                        />
                    </bufferGeometry>
                    <meshStandardMaterial
                        color="#fffaf0"
                        emissive="#ffeeaa"
                        emissiveIntensity={0.4}
                        transparent
                        opacity={0.85}
                        side={2}
                    />
                </mesh>
                {/* Right wing */}
                <mesh ref={wing2Ref} position={[0, 0, 0]}>
                    <bufferGeometry>
                        <bufferAttribute
                            attach="attributes-position"
                            count={3}
                            array={new Float32Array([
                                0, 0, 0,
                                0.18, 0.08, 0,
                                0.1, -0.1, 0,
                            ])}
                            itemSize={3}
                        />
                    </bufferGeometry>
                    <meshStandardMaterial
                        color="#fffaf0"
                        emissive="#ffeeaa"
                        emissiveIntensity={0.4}
                        transparent
                        opacity={0.85}
                        side={2}
                    />
                </mesh>
                {/* Tiny body */}
                <mesh position={[0, 0, 0]}>
                    <cylinderGeometry args={[0.008, 0.008, 0.1, 4]} />
                    <meshStandardMaterial color="#ccaa88" />
                </mesh>
            </group>
        </>
    );
};

// const Arrow = ({ id, startX, endX, startY = 0.65, endY = 0.65, startZ = -8, endZ = -2, speed = 2, onHit, onMiss }) => {
//     const meshRef = useRef();
//     const progress = useRef(0);
//     const hit = useRef(false);
//
//     const [visible, setVisible] = useState(true);
//
//     const [exploding, setExploding] = useState(false);
//     const [explodePos, setExplodePos] = useState([0, 0, 0]);
//     const updateArrowPosition = useVideoRecognition((state) => state.updateArrowPosition);
//     const removeArrowPosition = useVideoRecognition((state) => state.removeArrowPosition);
//     const hitTriggeredId = useVideoRecognition((state) => state.hitTriggeredId);
//     const clearHitTriggered = useVideoRecognition((state) => state.clearHitTriggered);
//
//     const paused = useVideoRecognition((state) => state.paused);
//
//     useFrame((_, delta) => {
//         if (hit.current) return;
//         if (paused) return;
//         progress.current += delta * speed;
//
//         const t = Math.min(progress.current, 1);
//         const x = startX + (endX - startX) * t;
//         const y = startY + (endY - startY) * t;
//         const z = startZ + (endZ - startZ) * t;
//
//         if (meshRef.current) {
//             meshRef.current.position.x = x;
//             meshRef.current.position.y = y;
//             meshRef.current.position.z = z;
//         }
//         updateArrowPosition(id, z);
//
//         if (z >= -2 && !hit.current) {
//             hit.current = true;
//             setVisible(false);
//             removeArrowPosition(id);
//             useVideoRecognition.getState().setLastHitResult("MISS");
//             onMiss?.();
//         }
//     });
//
//     useEffect(() => {
//         if (hitTriggeredId === id && !hit.current) {
//             hit.current = true;
//             removeArrowPosition(id);
//             if (meshRef.current) {
//                 setExplodePos([
//                     meshRef.current.position.x,
//                     meshRef.current.position.y,
//                     meshRef.current.position.z,
//                 ]);
//             }
//             setVisible(false);
//             setExploding(true);
//             clearHitTriggered();
//         }
//     }, [hitTriggeredId]);
//
//     return (
//         <>
//             {visible && (
//                 <group ref={meshRef} position={[startX, startY, startZ]}>
//                     <mesh position={[0, 0, 0]}>
//                         <boxGeometry args={[0.03, 0.2, 0.03]} />
//                         <meshStandardMaterial color="#ffcc44" emissive="#ffcc44" emissiveIntensity={2} />
//                     </mesh>
//                     <mesh position={[0, 0.14, 0]}>
//                         <coneGeometry args={[0.06, 0.1, 6]} />
//                         <meshStandardMaterial color="#ffcc44" emissive="#ffcc44" emissiveIntensity={2} />
//                     </mesh>
//                 </group>
//             )}
//             {exploding && Array.from({ length: 8 }).map((_, i) => (
//                 <Spark
//                     key={i}
//                     angle={(i / 8) * Math.PI * 2}
//                     explodePos={explodePos}
//                 />
//             ))}
//         </>
//     );
// };



export const Experience = () => {
    const warmupAvatarMovement = useVideoRecognition((s) => s.warmupAvatarMovement);
    const warmupAvatarMode = useVideoRecognition((s) => s.warmupAvatarMode);
    const controls = useRef();
    const avatar = useVideoRecognition((state) => state.currentAvatar);
    const gameState = useVideoRecognition((state) => state.gameState);
    // const [activeArrows, setActiveArrows] = useState([]);
    // const gameTimer = useRef(0);
    // const spawnedCues = useRef(new Set());

    // const currentLevelIndex = useVideoRecognition((state) => state.currentLevelIndex);
    // const setTotalArrows = useVideoRecognition((state) => state.setTotalArrows);
    // const incrementHitArrows = useVideoRecognition((state) => state.incrementHitArrows);
    // const setLevelComplete = useVideoRecognition((state) => state.setLevelComplete);

    const paused = useVideoRecognition((state) => state.paused);
    const gamePhase = useGameStore((state) => state.phase);
    const calibration = useCalibration();

    // const currentLevel = LEVELS[currentLevelIndex];
    // const CUE_SEQUENCE = currentLevel.cueSequence;
    // const completionTimer = useRef(null);
    // const audioRef = useRef(null);

    const ambientAudioRefs = useRef([]);
    const ambientVolumes = useRef([]);

    useEffect(() => {
        // Guard: don't create if already exists
        if (ambientAudioRefs.current.length > 0) return;

        const tracks = [
            { src: "music/World/Spring.mp3", volume: 0.3 },
            { src: "music/World/storegraphic-soft-wind-477404.mp3", volume: 0.4 },
            { src: "music/World/freesound_community-birdsong-springenglish-countryside-33613.mp3", volume: 0.02 },
        ];

        tracks.forEach((track, i) => {
            const audio = new Audio(track.src);
            audio.volume = track.volume;
            audio.loop = true;
            ambientVolumes.current[i] = track.volume;

            // Try autoplay, fallback to first click
            audio.play().catch(() => {
                const resume = () => {
                    audio.play();
                    document.removeEventListener("click", resume);
                };
                document.addEventListener("click", resume);
            });

            ambientAudioRefs.current[i] = audio;
        });

        // Cleanup on unmount
        return () => {
            ambientAudioRefs.current.forEach(a => {
                a.pause();
                a.currentTime = 0;
            });
        };
    }, []);

    // Pause ambient audio when not in LOBBY (warm-up, performance, etc. have their own audio)
    useEffect(() => {
        const isLobby = gamePhase === GAME_STATES.LOBBY;
        ambientAudioRefs.current.forEach((a, i) => {
            if (isLobby) {
                a.play().catch(() => {});
            } else {
                a.pause();
            }
        });
    }, [gamePhase]);

    // useEffect(() => {
    //     if (gameState === "started") {
    //         setTotalArrows(CUE_SEQUENCE.length);
    //     }
    // }, [gameState]);

    // useEffect(() => {
    //     if (gameState === "waiting") {
    //         setActiveArrows([]);
    //         gameTimer.current = 0;
    //         spawnedCues.current = new Set();
    //         completionTimer.current = null;
    //     }
    // }, [gameState]);

    // useFrame((_, delta) => {
    //     if (gameState !== "started") return;
    //     if (paused) return;
    //     gameTimer.current += delta;
    //
    //     CUE_SEQUENCE.forEach((cue) => {
    //         if (
    //             gameTimer.current >= cue.delay &&
    //             !spawnedCues.current.has(cue.id)
    //         ) {
    //             spawnedCues.current.add(cue.id);
    //             setActiveArrows((prev) => [...prev, { ...cue, key: cue.id }]);
    //         }
    //     });
    //
    //     // Check if all cues are done
    //     const lastCue = CUE_SEQUENCE[CUE_SEQUENCE.length - 1];
    //     if (gameTimer.current > lastCue.delay + 5 && !completionTimer.current) {
    //         completionTimer.current = true;
    //         setLevelComplete(true);
    //         if (audioRef.current) {
    //             audioRef.current.pause();
    //             audioRef.current = null;
    //         }
    //     }
    // });

    // useEffect(() => {
    //     if (!controls.current) return;
    //     if (gameState === "started") {
    //         controls.current.enabled = true;
    //         setTimeout(() => {
    //             if (!controls.current) return;
    //             controls.current.setLookAt(0, 2.2, 3, 0, 0.5, 0, true);
    //             setTimeout(() => {
    //                 if (!controls.current) return;
    //                 controls.current.enabled = false;
    //             }, 1000);
    //         }, 100);
    //     }
    // }, [gameState]);

    // useEffect(() => {
    //     if (gameState === "started") {
    //         if (audioRef.current) return;
    //         audioRef.current = new Audio(currentLevel.music);
    //         audioRef.current.play();
    //     }
    //     if (gameState === "waiting") {
    //         if (audioRef.current) {
    //             audioRef.current.pause();
    //             audioRef.current.currentTime = 0;
    //             audioRef.current = null;
    //         }
    //     }
    //     return () => {
    //         if (audioRef.current) {
    //             audioRef.current.pause();
    //             audioRef.current = null;
    //         }
    //     };
    // }, [gameState]);

    // useEffect(() => {
    //     if (!audioRef.current) return;
    //     if (paused) {
    //         audioRef.current.pause();
    //     } else if (gameState === "started") {
    //         audioRef.current.play();
    //     }
    // }, [paused]);


    const isPerformance = gamePhase === GAME_STATES.PERFORMANCE || gamePhase === GAME_STATES.PAUSED;
    const isLobby       = gamePhase === GAME_STATES.LOBBY;

    return (
        <>
            {/* Camera: playing = far theatrical view; lobby/warmup = fixed (no mouse interaction) */}
            {isPerformance && <PlayingCameraRig />}
            {!isPerformance && <LobbyCameraRestore />}

            {/* Lighting */}
            {isPerformance ? (
              <>
                <ambientLight intensity={0.58} color="#f0e8ff" />
                <directionalLight position={[0, 5, -7]}  intensity={1.05} color="#ffe8cf" castShadow />
                <directionalLight position={[-3, 2.5, -8]} intensity={0.4} color="#f7d7b5" />
                <directionalLight position={[0, 14, -4]}  intensity={0.55} color="#e8f2ff" />
                <hemisphereLight args={["#8cb4e8", "#4a3520", 0.35]} />
              </>
            ) : isLobby ? (
              <>
                <Environment preset="city" />
                <directionalLight intensity={2} position={[0, 5, -15]} color="#ffffff" castShadow />
                <directionalLight intensity={1} position={[0, 3, 5]}   color="#d48d29" />
                <ambientLight intensity={0.3} color="#ffaa66" />
              </>
            ) : (
              /* Warmup — simple lighting, no HDR environment */
              <>
                <ambientLight intensity={0.9} color="#e8f0ff" />
                <directionalLight intensity={1.8} position={[0, 5, 3]} color="#ffffff" />
                <directionalLight intensity={0.6} position={[0, 3, -5]} color="#c8d8ff" />
              </>
            )}

            {/* Performance stage */}
            {isPerformance && <PlayingStageEnvironment />}

            {/* Avatar: far conductor position during performance, lobby/warmup anchor otherwise */}
            <group position={isPerformance ? [0, -1, -4.5] : [0, -1.27, 0]}>
              <group
                position={isPerformance ? [0, 0.23, 0] : [0, 0, 0]}
                scale={isPerformance ? [0.36, 0.36, 0.36] : [1, 1, 1]}
              >
                <VRMAvatar
                  avatar={avatar}
                  mode={warmupAvatarMode}
                  activeMovement={warmupAvatarMovement}
                  isMirrorTherapy={isPerformance && calibration.isMirrorTherapy}
                  mirrorLeadSide={isPerformance ? (calibration.mirrorLeadSide ?? calibration.nonAffectedSide) : null}
                />
              </group>
            </group>

            {/* Warmup — minimal scene: just the background image, no animated objects */}
            {!isPerformance && !isLobby && (
              <group position-y={-1.27}>
                <BackgroundImage />
              </group>
            )}

            {/* Lobby scene — full environment with animations, hidden during warmup/performance */}
            {isLobby && (
            <group position-y={-1.27}>
                <BackgroundImage />
                <>
  {/* Outer ring - oval */}
<mesh position={[0, 0.1, -11]} scale={[1.6, 0.5, 1]} receiveShadow castShadow>
    <cylinderGeometry args={[3.6, 3.6, 0.6, 64]} />
    <meshStandardMaterial color="#8b6b4f" />
</mesh>

{/* Inner top - oval */}
<mesh position={[0, 0.34, -11]} scale={[1.6, 0.5, 1]} receiveShadow>
    <cylinderGeometry args={[3.3, 3.3, 0.05, 64]} />
    <meshStandardMaterial color="#d8b388" />
</mesh>
</>
       {/* Two golden hour butterflies */}
<Butterfly startPosition={[-2, 1.8, -4]} speed={0.3} radius={5} />
<Butterfly startPosition={[2.5, 2.2, -5]} speed={0.5} radius={0.9} />
<Butterfly startPosition={[-3, 0.5, -7]} speed={0.5} radius={0.33} />
       <AnimatedGrass position={[3, 0, -3]} scale={0.5} />
       <AnimatedGrass position={[-2.7, 0, -5]} scale={0.5} />
       <AnimatedGrass position={[3, 0, -3.5]} scale={0.5} />
       <AnimatedGrass position={[-1, 0, -6]} scale={0.5} />
       <AnimatedGrass position={[3.3, 0, -4.8]} scale={0.9} />
       <AnimatedGrass position={[-2, 0, -5]} scale={0.5} />
       
       <AnimatedGrass position={[-2.5, 0, -3]} scale={1} />
       <AnimatedGrass position={[2.6, 0, -4]} scale={1} />
       <AnimatedGrass position={[-1, 0, -2]} scale={0.7} />
       <AnimatedGrass position={[1.5, 0, -6]} scale={0.3} />
       <AnimatedGrass position={[-1, 0, -4.5]} scale={0.3} />
       <AnimatedGrass position={[-3.5, 0, -8]} scale={0.3} />
       <AnimatedGrass position={[-4.5, 0, -8.2]} scale={0.3} />
       <AnimatedGrass position={[1, 0, -3]} scale={0.7} />
       <AnimatedBush position={[3.5, 0, -4.8]} scale = {3} />
<AnimatedBush position={[-3.5, 0, -4.2]} scale = {3.5} />
<AnimatedBush position={[5.1, 0, -6.5]} scale = {4} />
<StonePath />


<OrchestraChair position={[4.6, 0.36, -9.9]} rotation={[0, -Math.PI/4, 0]}/>
<OrchestraChair position={[3.6, 0.36, -10.2]} rotation={[0, -Math.PI/8, 0]}/>
<OrchestraChair position={[2.4, 0.36, -10.5]} rotation={[0, -Math.PI/10, 0]}/>
<OrchestraChair position={[1.2, 0.36, -10.7]} rotation={[0, 0, 0]}/>

<OrchestraChair position={[-4.6, 0.36, -9.9]} rotation={[0, Math.PI/4, 0]}/>
<OrchestraChair position={[-3.6, 0.36, -10.2]} rotation={[0, Math.PI/8, 0]}/>
<OrchestraChair position={[-2.4, 0.36, -10.5]} rotation={[0, Math.PI/10, 0]}/>
<OrchestraChair position={[-1.2, 0.36, -10.7]} rotation={[0, 0, 0]}/>
{/* Orchestra - 8 chairs in a curved arc across the stage */}
{[
    //{ x: -4.6, z: -10.2 },   // 1 - left
   // { x: -3.6, z: -10.5 },   // 2
   // { x: -2.4, z: -10.7 },   // 3
   // { x:  -1.2, z: -10.8 },   // 4 - center
   // { x:  1.2, z: -10.7 },   // 5
   // { x:  2.4, z: -10.5 },   // 6
    //{ x:  3.6, z: -10.2 },   // 7
   // { x:  4.6, z: -9.9 },    // 8 - right
].map(({ x, z }, i) => (
    <OrchestraChair
        key={`chair-${i}`}
        position={[x, 0.36, z]}
        rotation={[0, 0, 0]}
    />
))}

<MusicStand position={[4, 0.5, -9]} rotation={[0, 2, 0]}/>
<MusicStand position={[3, 0.5, -9.2]} rotation={[0, 2.5, 0]}/>
<MusicStand position={[2, 0.5, -9.5]} rotation={[0, 2.7, 0]}/>
<MusicStand position={[1.2, 0.5, -9.7]} rotation={[0, 2.7, 0]}/>
<MusicStand position={[-4, 0.5, -9]} rotation={[0, -2, 0]}/>
<MusicStand position={[-3, 0.5, -9.2]} rotation={[0, -2.5, 0]}/>
<MusicStand position={[-2, 0.5, -9.5]} rotation={[0, -2.7, 0]}/>
<MusicStand position={[-1.2, 0.5, -9.7]} rotation={[0, -2.7, 0]}/>
{/* Music stands - in front of each chair (closer to audience) */}
{[
  //  { x: -3.6, z: -9.4 },
  //  { x: -2.4, z: -9.7 },
   // { x: -1.2, z: -9.9 },
   // { x:  0.0, z: -10.0 },
   // { x:  1.2, z: -9.9 },
   // { x:  2.4, z: -9.7 },
   // { x:  3.6, z: -9.4 },
    //{ x:  4.8, z: -9.1 },
].map(({ x, z }, i) => (
    <MusicStand
        key={`stand-${i}`}
        position={[x, 0.5, z]}
        rotation={[0, Math.PI, 0]}
    />
))}
            </group>
            )} {/* end !isPerformance lobby group */}

            {/* Hit line — replaced by 2D HUD dashed ring overlay */}
            {/* {gameState === "started" && (
                <mesh position={[0, 0.5, -2]}>
                    <boxGeometry args={[2, 0.03, 0.03]} />
                    <meshStandardMaterial
                        color="#88aaff"
                        emissive="#88aaff"
                        emissiveIntensity={3}
                        transparent
                        opacity={0.8}
                    />
                </mesh>
            )} */}

            {/* 3D arrows — replaced by 2D CueLane/CueCircle overlay */}
            {/* {activeArrows.flatMap((cue) => {
                const arrows = [];
                if (cue.side !== "left") {
                    arrows.push(
                        <Arrow
                            key={`${cue.key}-right`}
                            id={`${cue.key}-right`}
                            startX={1.5}
                            endX={0.3}
                            startY={1.5}
                            endY={0.3}
                            startZ={-7}
                            endZ={-2}
                            speed={currentLevel.speed}
                        />
                    );
                }
                if (cue.side !== "right") {
                    arrows.push(
                        <Arrow
                            key={`${cue.key}-left`}
                            id={`${cue.key}-left`}
                            startX={-1.5}
                            endX={-0.3}
                            startY={1.5}
                            endY={0.3}
                            startZ={-7}
                            endZ={-2}
                            speed={currentLevel.speed}
                        />
                    );
                }
                return arrows;
            })} */}

            {(isLobby || isPerformance) && (
              <EffectComposer multisampling={0}>
                <Bloom mipmapBlur intensity={0.7} luminanceThreshold={0.9} levels={4} />
              </EffectComposer>
            )}
        </>
    );
};