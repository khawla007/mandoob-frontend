export const fabricVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying float vHeight;
  varying float vTension;
  attribute float tension;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vHeight = position.z;
    vTension = tension;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fabricFragmentShader = `
  uniform sampler2D uMap;
  uniform vec2 uTextureRepeat;
  uniform float uLightIntensity;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying float vHeight;
  varying float vTension;

  void main() {
    vec2 repeatedUv = vec2(vUv.x, 1.0 - vUv.y) * uTextureRepeat;
    vec4 tex = texture2D(uMap, repeatedUv);
    float lift = smoothstep(0.0008, 0.12, vHeight);
    float rimShadow = smoothstep(0.002, 0.08, vTension) * (1.0 - lift * 0.18);
    float neutralShade = clamp(1.0 - lift * 0.08 - rimShadow * 0.08, 0.84, 1.0);
    vec3 clothBase = tex.rgb;
    vec3 color = clothBase * neutralShade;
    gl_FragColor = vec4(color, uOpacity);
  }
`;
