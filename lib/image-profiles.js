/**
 * Image Generation Profiles
 *
 * Defines reusable image generation configurations that specify:
 * - Model, size, quality, style parameters for DALL-E
 * - Prompt context/instructions that get injected into Turn 2
 *
 * Profiles are referenced by brains via imageGen.profile field.
 * This separates concerns: brains define personality, profiles define image generation style.
 */

module.exports = {
  /**
   * TOONR 2D Cartoon Style
   * Modern satirical meme-style cartoons with flat 2D aesthetic
   */
  'toonr-2d-cartoon': {
    model: 'dall-e-3',
    size: '1024x1024',
    quality: 'standard',
    style: 'natural', // Natural style avoids photorealistic tendencies

    // This context is injected into Turn 2 image generation prompt
    promptContext: `CRITICAL STYLE REQUIREMENTS - You MUST follow these rules:

Generate a 2D cartoon illustration in a modern satirical meme/cartoon style, typically used in internet commentary, reaction memes, or parody art. The style should be clean but deliberately awkward — flat, bold, and frozen in intensity. It blends editorial cartoon exaggeration, Flash-era stiffness, and the offbeat tension of internet meme art.

🎨 COLOR & PALETTE:
- Use flat, solid colors only — absolutely NO gradients, shading, texture, or lighting effects
- Skin tones should be semi-naturalistic but slightly oversaturated
- Clothing and objects should use simple, vivid colors (e.g., red hoodie, navy suit, tan walls)
- Keep contrast high — visuals must pop clearly against thick black outlines
- NO atmospheric lighting, shadows, or rendered depth — this is sharp, flat-color work

✏️ LINEWORK:
- ALL elements must be outlined in thick, solid black lines — faces, bodies, props, backgrounds
- Linework should be consistent and smooth, but slight wonkiness or uneven curves are welcome
- NO variable stroke width, no sketchiness
- Use minimal black interior lines for basic facial creases or details

👤 CHARACTERS:
- Heads should be slightly larger than realistic, emphasizing facial expression
- Facial expressions must be hyper-exaggerated and feel "stuck in a moment": wide, bean-shaped eyes with tiny pupils; warped, off-center mouths; eyebrows raised or furrowed
- If the original subject has a smile or expression, retain the core emotion but exaggerate it awkwardly
- Nose and mouth shapes should be simplified and slightly strange — triangle, curved blob, or awkward line
- Embrace asymmetry in features — this adds tension and awkwardness
- While stylization is essential, retain recognizable likeness to the original subject
- Bodies should be simplified: basic posture, minimal anatomical detail
- Hands are optional but should be simple if shown

🧍‍♂️ POSES & COMPOSITION:
- Characters shown front-facing or in stiff 3/4 view
- Poses should be awkward, frozen, or static — NO action poses or cinematic movement
- Expressions and body posture should feel like they're glitched or emotionally stuck mid-reaction
- Center figures whenever possible
- Cropped framing is fine — these are reaction-style portraits

🖼️ BACKGROUNDS:
- Use flat-color, minimal backgrounds in neutral or muted tones (light gray, beige, soft blue)
- Backgrounds follow the same flat-color, black-outline style
- Backgrounds can vary in layout and setting — do NOT repeat the same environment
- NO perspective rendering, no depth cues, no lighting effects
- Should feel like a flat 2D layer

🧠 TONE & USE:
- Evoke internet meme culture, lo-fi reaction art, and editorial satire
- Characters should look emotionally stuck — surprised, confused, dumbfounded, mid-breakdown
- Expressions should feel "captured mid-glitch" or "weirdly paused"
- Slight imperfections in proportion, posture, or symmetry are desirable
- Think of it as clean vector art with a deliberately offbeat, awkward soul

CRITICAL: Avoid polished or commercial animation styles (e.g., Futurama, Simpsons). Avoid photorealism, 3D rendering, or any style that doesn't match the flat 2D cartoon aesthetic described above.`
  },

  /**
   * Default / Realistic Photo Style
   * High-quality photorealistic images
   */
  'realistic-photo': {
    model: 'dall-e-3',
    size: '1024x1024',
    quality: 'hd',
    style: 'vivid',
    promptContext: `Generate a high-quality, photorealistic image with natural lighting and realistic details.`
  },

  /**
   * Artistic Painting Style
   * Oil painting / artistic illustration style
   */
  'artistic-painting': {
    model: 'dall-e-3',
    size: '1024x1024',
    quality: 'standard',
    style: 'natural',
    promptContext: `Create an artistic illustration in the style of a traditional painting (oil, watercolor, or acrylic). Use visible brush strokes, artistic color choices, and painterly techniques. Avoid photorealism.`
  }
};
