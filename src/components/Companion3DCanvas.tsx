import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RotateCcw } from 'lucide-react';
import {
  buildCompanionCharacter,
  updateCompanionAnimation,
} from '../three/companionCharacter';
import type { CompanionAnimState } from '../types/workspace';

interface Companion3DCanvasProps {
  animState: CompanionAnimState;
  compact?: boolean;
  isDark?: boolean;
  active?: boolean;
}

const DEFAULT_CAM_POS = new THREE.Vector3(0.12, 1.32, 1.88);
const DEFAULT_CAM_TARGET = new THREE.Vector3(0, 1.21, 0);
const COMPACT_CAM_POS = new THREE.Vector3(0.08, 1.44, 1.16);
const COMPACT_CAM_TARGET = new THREE.Vector3(0, 1.4, 0);

const DARK_BG_HEX = 0x2a2a28;
const DARK_BG_CSS = '#2a2a28';
const LIGHT_BG_HEX = 0xf5f6fa;
const LIGHT_BG_CSS = '#f5f6fa';

let cachedSoftwareGl: boolean | null = null;
function detectSoftwareGl(): boolean {
  if (cachedSoftwareGl !== null) return cachedSoftwareGl;
  try {
    const probe = document.createElement('canvas').getContext('webgl2');
    if (!probe) {
      cachedSoftwareGl = true;
      return true;
    }
    const ext = probe.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
    const gpu = String(probe.getParameter(param));
    probe.getExtension('WEBGL_lose_context')?.loseContext();
    cachedSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    cachedSoftwareGl = true;
  }
  return cachedSoftwareGl;
}

export function Companion3DCanvas({
  animState,
  compact = false,
  isDark = true,
  active = true,
}: Companion3DCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const animStateRef = useRef<CompanionAnimState>(animState);
  const isDarkRef = useRef<boolean>(isDark);
  const activeRef = useRef<boolean>(active);
  const resetAnimRef = useRef(false);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const resumeLoopRef = useRef<(() => void) | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  useEffect(() => {
    animStateRef.current = animState;
  }, [animState]);

  useEffect(() => {
    isDarkRef.current = isDark;
    const scene = sceneRef.current;
    if (!scene) return;
    const hex = isDark ? DARK_BG_HEX : LIGHT_BG_HEX;
    scene.background = new THREE.Color(hex);
    scene.fog = new THREE.FogExp2(hex, 0.018);
  }, [isDark]);

  useEffect(() => {
    activeRef.current = active;
    if (active) {
      resumeLoopRef.current?.();
    }
  }, [active]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false,
        preserveDrawingBuffer: true,
      });
    } catch {
      setWebglError('3D WebGL context unavailable on this device.');
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = Math.max(container.clientWidth, 180);
    const height = Math.max(container.clientHeight, 180);
    renderer.setSize(width, height);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('WebGL context lost. Reloading renderer...');
    };
    const onContextRestored = () => setWebglError(null);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const bgHex = isDarkRef.current ? DARK_BG_HEX : LIGHT_BG_HEX;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, 0.018);

    const startPos = compact ? COMPACT_CAM_POS : DEFAULT_CAM_POS;
    const startTarget = compact ? COMPACT_CAM_TARGET : DEFAULT_CAM_TARGET;

    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 40);
    camera.position.copy(startPos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(startTarget);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.minDistance = 0.72;
    controls.maxDistance = 4.6;
    controls.maxPolarAngle = Math.PI * 0.56;
    controls.addEventListener('start', () => {
      resetAnimRef.current = false;
    });

    // Clean soft studio lighting calibrated for anime cel/toon shading
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff9f5, 0.65);
    keyLight.position.set(1.8, 2.8, 2.6);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 10;
    keyLight.shadow.camera.left = -1.4;
    keyLight.shadow.camera.right = 1.4;
    keyLight.shadow.camera.top = 2.2;
    keyLight.shadow.camera.bottom = -0.3;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xdbeafe, 0.42);
    rimLight.position.set(-2.0, 2.0, -2.2);
    scene.add(rimLight);

    const rig = buildCompanionCharacter(renderer.capabilities.getMaxAnisotropy());
    scene.add(rig.root);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const syncViewportSize = () => {
      const w = Math.max(container.clientWidth, 100);
      const h = Math.max(container.clientHeight, 100);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(() => {
      syncViewportSize();
    });
    resizeObserver.observe(container);

    const gaze = { x: 0, y: 0 };
    const onPointerMove = (ev: PointerEvent) => {
      if (!activeRef.current) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      gaze.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      gaze.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const startTime = performance.now();
    let prevTime = startTime;
    let frameId = 0;
    let disposed = false;
    let running = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed || !activeRef.current) {
          running = false;
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed || !activeRef.current) {
        running = false;
        return;
      }
      running = true;
      const now = performance.now();
      const dt = Math.min((now - prevTime) / 1000, 0.08);
      prevTime = now;
      const elapsed = (now - startTime) / 1000;

      if (resetAnimRef.current) {
        const dampFactor = 1 - Math.exp(-7 * Math.max(dt, 0.008));
        camera.position.lerp(startPos, dampFactor);
        controls.target.lerp(startTarget, dampFactor);
        if (camera.position.distanceTo(startPos) < 0.015) {
          resetAnimRef.current = false;
        }
      }

      controls.update();
      updateCompanionAnimation(rig, animStateRef.current, elapsed, dt || 0.016, gaze);
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    resumeLoopRef.current = () => {
      if (disposed || !activeRef.current) return;
      syncViewportSize();
      prevTime = performance.now();
      if (!running) {
        tick();
      }
    };

    // Always render initial warm frame once so canvas is ready immediately on switch
    renderer.render(scene, camera);
    if (activeRef.current) {
      tick();
    }

    return () => {
      disposed = true;
      running = false;
      resumeLoopRef.current = null;
      sceneRef.current = null;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('pointermove', onPointerMove);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      controls.dispose();
      rig.dispose();
      renderer.dispose();
    };
  }, [compact]);

  const bgCss = isDark ? DARK_BG_CSS : LIGHT_BG_CSS;

  return (
    <div
      className="relative w-full h-full overflow-hidden select-none theme-transition"
      style={{ backgroundColor: bgCss }}
      data-testid="companion-3d-viewport"
      data-companion-state={animState}
      data-companion-theme={isDark ? 'dark-gray' : 'light'}
    >
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {!compact && (
        <div className="absolute top-3 left-3.5 z-10 flex items-center gap-2">
          <div
            className={`pointer-events-none px-2.5 py-1 rounded-full backdrop-blur-sm border text-xs font-medium theme-transition ${
              isDark
                ? 'bg-[#1c1c1a]/75 border-white/15 text-[#eeeeec]'
                : 'bg-white/75 border-slate-200/80 text-slate-700'
            }`}
          >
            <span>Luna</span>
            <span
              aria-hidden="true"
              className={`mx-1.5 ${isDark ? 'text-[#8c8b84]' : 'text-slate-400'}`}
            >
              ·
            </span>
            <span className={`capitalize ${isDark ? 'text-[#c9c8c0]' : 'text-slate-600'}`}>
              {animState.replace('_', ' ')}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              resetAnimRef.current = true;
            }}
            aria-label="Reset camera view"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              isDark
                ? 'text-[#eeeeec] bg-[#1c1c1a]/75 hover:bg-[#1c1c1a] border-white/15'
                : 'text-slate-700 bg-white/80 hover:bg-white border-slate-200/80'
            }`}
          >
            <RotateCcw className="w-3 h-3" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
      )}

      {webglError && (
        <div
          className={`absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center ${
            isDark ? 'bg-[#2a2a28] text-[#eeeeec]' : 'bg-slate-200 text-slate-800'
          }`}
        >
          <img
            src="/assets/aistudio/Gemini_Generated_Image_qgk88yqgk88yqgk8_27539a54.jpeg"
            alt="Luna Companion Fallback"
            referrerPolicy="no-referrer"
            className="w-40 h-52 object-cover rounded-xl border border-slate-300 mb-3"
          />
          <p className="text-sm font-medium">{webglError}</p>
        </div>
      )}
    </div>
  );
}
