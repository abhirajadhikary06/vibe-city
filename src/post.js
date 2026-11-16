import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

// Cinematic grade: chromatic aberration, speed blur, split toning, vignette, grain.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAberration: { value: 0.0015 },
    uBlur: { value: 0 },
    uVignette: { value: 0.38 },
    uGrain: { value: 0.03 },
    uSat: { value: 1.16 },
    uNight: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAberration, uBlur, uVignette, uGrain, uSat, uNight;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float d = length(c);
      vec2 off = c * uAberration * (0.5 + d * 2.0);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      if (uBlur > 0.001) {
        vec3 acc = col;
        for (int i = 1; i < 8; i++) {
          float s = 1.0 - float(i) * uBlur * 0.01 * smoothstep(0.1, 0.6, d);
          acc += texture2D(tDiffuse, 0.5 + c * s).rgb;
        }
        col = acc / 8.0;
      }
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSat);
      // split tone: teal shadows, warm highlights (cooler at night)
      vec3 shadowTint = mix(vec3(0.0, 0.03, 0.05), vec3(0.02, 0.0, 0.07), uNight);
      col += shadowTint * (1.0 - smoothstep(0.0, 0.5, l));
      col *= mix(vec3(1.04, 1.0, 0.95), vec3(1.0), uNight * 0.5);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);
      col *= 1.0 - uVignette * smoothstep(0.3, 0.85, d);
      col += (hash(vUv * 1000.0 + uTime) - 0.5) * uGrain;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export function createPost(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, size.x, size.y);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.85;
  gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.2, scale: 1.1, samples: 12 });
  gtao.enabled = false;
  composer.addPass(gtao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.5, 0.88);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  const pr = renderer.getPixelRatio();
  const smaa = new SMAAPass(size.x * pr, size.y * pr);
  composer.addPass(smaa);
  return {
    composer,
    bloom,
    grade,
    gtao,
    setSize(w, h, pr) {
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
    },
  };
}
