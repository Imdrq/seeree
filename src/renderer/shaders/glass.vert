// 全屏 quad 顶点着色器
attribute vec2 aPosition;
attribute vec2 aTexCoord;
varying vec2 vUV;

void main() {
  vUV = aTexCoord;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
