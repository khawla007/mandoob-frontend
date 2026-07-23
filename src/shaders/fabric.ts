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
    vec3 color = tex.rgb;
    gl_FragColor = vec4(color, uOpacity);
  }
`;
