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
    vec3 lightDir = normalize(vec3(-0.42, 0.36, 0.84));
    float diffuse = max(dot(normalize(vNormal), lightDir), 0.0);
    float lift = smoothstep(0.0008, 0.12, vHeight);
    float wrinkle = smoothstep(0.001, 0.07, vTension);
    float rimShadow = smoothstep(0.002, 0.08, vTension) * (1.0 - lift * 0.18);
    float luminance = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
    float lineMask = smoothstep(0.045, 0.12, 1.0 - luminance);
    float slope = dot(normalize(vNormal), normalize(vec3(-0.75, 0.28, 0.58)));
    float raisedEdge = smoothstep(0.08, 0.52, abs(slope)) * lift;
    float shade = 0.72 + diffuse * 0.42 * uLightIntensity + raisedEdge * 0.62 - rimShadow * 0.44;
    vec3 lineBase = vec3(0.6, 0.53, 0.43);
    vec3 lineHighlight = vec3(0.76, 0.62, 0.44);
    vec3 lineShadow = vec3(0.38, 0.34, 0.29);
    vec3 lineColor = mix(lineBase, lineHighlight, max(slope, 0.0) * lift);
    lineColor = mix(lineColor, lineShadow, max(-slope, 0.0) * lift * 0.55);
    vec3 clothBase = mix(tex.rgb, vec3(0.99, 0.982, 0.952), 0.16);
    vec3 raisedTexture = mix(clothBase, lineColor * shade, lineMask * (0.18 + lift * 0.82));
    raisedTexture += vec3(0.08, 0.055, 0.015) * diffuse * lift * uLightIntensity;
    raisedTexture -= vec3(0.19, 0.155, 0.105) * rimShadow;
    vec3 color = mix(clothBase, raisedTexture, lift);
    gl_FragColor = vec4(color, uOpacity);
  }
`;
