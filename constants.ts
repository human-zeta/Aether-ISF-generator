
export const DEFAULT_SHADER = `/*
{
  "DESCRIPTION": "A versatile plasma gradient for VDMX6.",
  "CREDIT": "Aether AI",
  "ISFVSN": "2.0",
  "CATEGORIES": [
    "Generative",
    "Abstract"
  ],
  "INPUTS": [
    {
      "NAME": "zoom",
      "TYPE": "float",
      "LABEL": "Zoom Level",
      "DEFAULT": 5.0,
      "MIN": 1.0,
      "MAX": 20.0
    },
    {
      "NAME": "colorShift",
      "TYPE": "float",
      "LABEL": "Color Cycle",
      "DEFAULT": 0.5,
      "MIN": 0.0,
      "MAX": 1.0
    }
  ]
}
*/

void main() {
    // Use standard ISF normalized coordinate macro (0.0 to 1.0)
    vec2 st = isf_FragNormCoord;
    float t = TIME * 0.5;
    
    vec3 color = vec3(0.0);
    vec2 pos = st * zoom;
    
    float v = sin(pos.x + t);
    v += sin((pos.y + t) * 0.5);
    v += sin((pos.x + pos.y + t) * 0.5);
    
    pos += vec2(sin(t), cos(t));
    v += sin(sqrt(pos.x*pos.x + pos.y*pos.y + 1.0) + t);
    
    v = v / 2.0;
    
    // PI is pre-defined in the ISF header
    color = vec3(sin(v * PI + colorShift * 6.0), sin(v * PI + 2.0), sin(v * PI + 4.0));
    
    // Explicit alpha 1.0 for VDMX
    gl_FragColor = vec4(color * 0.5 + 0.5, 1.0);
}`;
