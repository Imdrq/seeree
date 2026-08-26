varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vViewDir;

uniform sampler2D uBackground;
uniform float uTime;
uniform float uBreath;
uniform vec2 uMouse;
uniform float uIor;       // 折射率, 默认 1.05
uniform float uBlurRadius;
uniform float uFresnelPower;
uniform float uChromaStrength;

// ---------------------------------------
//  液态玻璃 — iOS Siri 风格
//  Fresnel + 折射模糊 + 色散 + 高光
// ---------------------------------------

void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewDir);

    // --- 1. 菲涅尔 (Fresnel) ---
    float NdotV = abs(dot(N, V));
    float fresnel = pow(1.0 - NdotV, uFresnelPower);
    // 让中心更透明、边缘更实
    float opacity = 0.25 + fresnel * 0.55;

    // --- 2. 折射偏移 ---
    // 法线相对于视线的偏移量决定折射方向
    vec2 refractOffset = (N.xy - N.xy * dot(N, V)) * uIor * 0.03;
    float edgeDistort = length(refractOffset) * (0.3 + fresnel * 0.7);

    // --- 3. 多点采样模糊 ---
    vec4 bgBlurred = vec4(0.0);
    float totalWeight = 0.0;
    int samples = 9;
    for (int i = 0; i < 9; i++) {
        float angle = float(i) * 0.6981317; // 2PI / 9
        float radius = uBlurRadius * (0.5 + fresnel * 1.2);
        vec2 offset = vec2(cos(angle), sin(angle)) * radius;
        bgBlurred += texture2D(uBackground, vUv + refractOffset + offset);
        totalWeight += 1.0;
    }
    bgBlurred /= totalWeight;

    // --- 4. RGB 色散 (Chromatic Aberration) ---
    float chromaStrength = uChromaStrength * fresnel;
    float r = texture2D(uBackground, vUv + refractOffset * (1.0 + chromaStrength * 0.8)).r;
    float g = texture2D(uBackground, vUv + refractOffset).g;
    float b = texture2D(uBackground, vUv + refractOffset * (1.0 - chromaStrength * 0.6)).b;
    vec4 chromaColor = vec4(r, g, b, 1.0);

    // 混合模糊和色散结果
    float chromaMix = fresnel * 0.7;
    vec4 bgColor = mix(bgBlurred, chromaColor, chromaMix);

    // --- 5. 液态玻璃基础色 ---
    // 淡淡的蓝白基色，随呼吸微变
    vec3 glassBase = mix(
        vec3(0.85, 0.92, 1.0),   // 亮蓝白
        vec3(0.70, 0.82, 0.98),  // 淡蓝
        fresnel
    );
    float breathBrightness = 0.95 + uBreath * 0.05;
    bgColor.rgb = mix(bgColor.rgb, glassBase, 0.06 * breathBrightness);

    // --- 6. 边缘辉光 ---
    float edgeThickness = 0.15;
    float edgeMask = smoothstep(edgeThickness, edgeThickness + 0.08, NdotV);
    vec3 edgeGlow = mix(
        vec3(0.4, 0.6, 1.0),    // 内侧蓝
        vec3(0.8, 0.5, 1.0),    // 外侧紫
        fresnel
    );
    edgeGlow *= fresnel * 0.35;
    bgColor.rgb += edgeGlow * (1.0 - edgeMask);

    // --- 7. 高光点 (Specular) ---
    vec3 lightDir = normalize(vec3(0.6, 0.8, 0.5) + vec3(uMouse.x * 0.3, uMouse.y * 0.2, 0.0));
    vec3 H = normalize(lightDir + V);
    float spec = pow(max(dot(N, H), 0.0), 128.0);
    float spec2 = pow(max(dot(N, H), 0.0), 32.0);
    vec3 highlight = vec3(1.0, 0.95, 0.9) * spec * 0.5;
    highlight += vec3(0.9, 0.95, 1.0) * spec2 * 0.15;
    bgColor.rgb += highlight * (1.0 - NdotV * 0.6);

    // --- 8. 顶部柔光 ---
    float topLight = smoothstep(0.0, 0.5, N.y) * 0.08;
    bgColor.rgb += vec3(0.6, 0.8, 1.0) * topLight;

    // --- 最终输出 ---
    gl_FragColor = vec4(bgColor.rgb, opacity);
}
