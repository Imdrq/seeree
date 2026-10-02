// Liquid Glass Fragment Shader — 极简版
// 圆角内：深色渐变；圆角外：完全透明

precision highp float;

varying vec2 vUV;

uniform vec2  uResolution;
uniform float uTintAmount;
uniform vec3  uTint;
uniform float uSaturation;
uniform float uRadius;
uniform vec2  uSize;

float roundedBoxSDF(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

void main() {
  vec2 pixel = vUV * uResolution;
  float dist = roundedBoxSDF(pixel - uResolution * 0.5, uSize * 0.5, uRadius);

  // 圆角外完全透明
  if (dist > 0.0) { gl_FragColor = vec4(0.0); return; }

  // 简单深色渐变
  vec3 color = mix(vec3(0.05, 0.05, 0.11), vec3(0.07, 0.06, 0.15), vUV.y);
  color = mix(color, uTint, uTintAmount);

  float grey = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(grey), color, uSaturation);

  // 抗锯齿边缘
  float alpha = 1.0 - smoothstep(-1.0, 1.0, dist);
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), alpha);
}
