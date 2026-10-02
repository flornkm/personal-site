import * as THREE from "three";

// PS2-style shading: lighting is evaluated per vertex and interpolated across each triangle
// (Gouraud), as the VU1 lit vertices and the GS only blended colours. On a low-poly mesh that is
// what gives the soft-but-faceted look — the gradient follows the polygons, not the pixels.
const VERT = /* glsl */ `
  uniform vec3 uKeyDir;
  uniform vec3 uKeyColor;
  uniform vec3 uFillDir;
  uniform vec3 uFillColor;
  uniform vec3 uSky;
  uniform vec3 uGround;
  uniform float uSpecular;
  uniform float uShininess;
  varying vec2 vUv;
  varying vec3 vLight;
  varying vec3 vSpec;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec3 n = normalize(mat3(modelMatrix) * normal);
    vec3 toEye = normalize(cameraPosition - world.xyz);
    vec3 ambient = mix(uGround, uSky, n.y * 0.5 + 0.5);
    vLight = ambient + uKeyColor * max(dot(n, uKeyDir), 0.0) + uFillColor * max(dot(n, uFillDir), 0.0);
    float highlight = pow(max(dot(n, normalize(uKeyDir + toEye)), 0.0), uShininess);
    float rim = pow(1.0 - max(dot(n, toEye), 0.0), 3.0);
    vSpec = uKeyColor * uSpecular * highlight + vec3(uSpecular * 0.3 * rim);
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vLight;
  varying vec3 vSpec;

  void main() {
    // A negative LOD bias stops trilinear averaging the chunky painted detail to mush, the way
    // PS2 bilinear without trilinear looked.
    vec3 base = texture2D(map, vUv, -0.75).rgb * uColor;
    gl_FragColor = vec4(base * vLight + vSpec, uOpacity);
    #include <colorspace_fragment>
  }
`;

// One light rig for every prop: a warm key from the upper right, a cool fill from the left and a
// sky/ground ambient, balanced so a face turned to the camera lands at its texture's own colour.
const rig = {
  uKeyDir: { value: new THREE.Vector3(0.35, 0.7, 0.62).normalize() },
  uKeyColor: { value: new THREE.Color(0.74, 0.72, 0.68) },
  uFillDir: { value: new THREE.Vector3(-0.75, -0.05, 0.6).normalize() },
  uFillColor: { value: new THREE.Color(0.16, 0.18, 0.22) },
  uSky: { value: new THREE.Color(0.56, 0.57, 0.6) },
  uGround: { value: new THREE.Color(0.3, 0.29, 0.28) },
};

export interface Ps2MaterialOptions {
  map: THREE.Texture;
  color?: THREE.ColorRepresentation;
  // 0 for paper and cloth, ~0.3 for plastic, ~0.6 for glass and gold.
  specular?: number;
  shininess?: number;
  // Fading UI type needs blending; props stay opaque.
  transparent?: boolean;
}

export function createPs2Material({
  map,
  color = 0xffffff,
  specular = 0,
  shininess = 24,
  transparent = false,
}: Ps2MaterialOptions) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent,
    uniforms: {
      ...rig,
      map: { value: map },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 1 },
      uSpecular: { value: specular },
      uShininess: { value: shininess },
    },
  });
}
