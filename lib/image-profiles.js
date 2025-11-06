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
   * Clean, polished 2D cartoon illustrations with flat colors and smooth linework
   * Style inspired by modern editorial cartoons and webcomics
   */
  'toonr-2d-cartoon': {
    model: 'dall-e-3',
    size: '1024x1024',
    quality: 'standard',
    style: 'natural', // Natural style avoids photorealistic tendencies

    // This context is injected into Turn 2 image generation prompt
    promptContext: `CRITICAL STYLE REQUIREMENTS - You MUST follow these rules EXACTLY:

Generate a clean, professional 2D cartoon illustration in a modern flat-color style. Think editorial cartoons like Saturday Morning Breakfast Cereal or The Oatmeal - polished digital illustrations with smooth linework and vibrant flat colors.

🎨 COLOR & PALETTE - ABSOLUTE FLAT COLOR ONLY:
- Use COMPLETELY FLAT, SOLID colors with ZERO depth indicators
- NO gradients, shading, texture, highlights, shadows, or lighting effects
- NO fabric fold lines, wrinkle lines, or dimensional detail on clothing
- Clothing should be PURE SOLID COLOR SHAPES with only black outlines
- Each color area is a single flat tone - like a vector graphic or screen print
- Colors should be vibrant, saturated, and visually appealing
- Skin tones should be smooth and consistent - one flat tone per area
- High contrast between elements for visual clarity
- NO atmospheric effects, depth rendering, or 3D suggestion of any kind

✏️ LINEWORK - OUTLINES ONLY:
- ALL elements outlined in smooth, consistent black lines
- Outlines define shape boundaries ONLY - no interior detail lines
- NO fold lines, wrinkle lines, or fabric detail inside clothing shapes
- NO crosshatching, texture lines, or rendering strokes
- Lines should be clean, even thickness throughout
- Clean precise outlines on faces, bodies, clothing, props, backgrounds
- Interior lines ONLY for essential features (eyes, mouth, major separations)
- Think vector art or screen printing - outlines + flat fills ONLY

👤 CHARACTERS - SIMPLE & BALANCED:
- Proportions should be REALISTIC and BALANCED, not exaggerated
- Slightly stylized but maintain normal human proportions
- Heads can be slightly larger but keep bodies properly proportioned
- NO overly large heads, tiny bodies, or cartoon exaggeration
- Facial features simplified but WELL-PROPORTIONED and realistic
- Eyes, nose, mouth should look like simplified human features
- Characters look like people in an editorial cartoon, NOT animated characters
- Bodies have normal, balanced proportions - not cartoony shapes
- Hands drawn simply but in correct proportion if visible
- Overall: Think New Yorker cartoons or SMBC style - simplified humans, not Disney/anime

👔 CLOTHING & OBJECTS - PURE FLAT SHAPES:
- Clothing is rendered as SOLID COLOR SHAPES with black outlines ONLY
- NO fold lines, wrinkle lines, seam lines, or fabric detail
- A shirt is ONE SOLID COLOR SHAPE (or a few color blocks for patterns)
- NO dimensional rendering - clothing looks like flat paper cutouts
- Patterns (stripes, etc) should be simple color blocks, NOT depth indicators
- Objects follow the same rule: flat color fills with black outlines only

🧍‍♂️ POSES & COMPOSITION:
- Natural, realistic poses that fit the scene
- Poses should look human and natural, not exaggerated or cartoony
- Expressions clear but subtle - think editorial cartoon restraint
- Composition balanced and visually pleasing
- Framing should suit the subject matter

🖼️ BACKGROUNDS:
- Clean flat-color backgrounds that complement the scene
- Same flat-color, black-outline style as foreground
- Environmental details as simple, clean, FLAT color shapes
- NO perspective rendering, atmospheric depth, or 3D effects
- Colors harmonious with overall composition

🧠 OVERALL TONE & REFERENCES:
- Style: Saturday Morning Breakfast Cereal (SMBC), The Oatmeal, New Yorker cartoons
- Clean, polished, professional flat-color editorial illustration
- Vector-art quality - looks like it could be screen printed
- Simplified but NOT crude, childish, or deliberately awkward
- NOT animated/Disney style - editorial cartoon style
- Characters look like simplified realistic humans, not cartoon characters

CRITICAL PROHIBITIONS:
❌ NO fabric fold lines or wrinkle detail on clothing
❌ NO dimensional shading or depth rendering anywhere
❌ NO interior detail lines except essential facial features
❌ NO exaggerated cartoon proportions - keep bodies balanced
❌ NO animated character style - use editorial cartoon realism
❌ NO texture, crosshatching, or rendering techniques
❌ Think FLAT like a screen print or vector graphic - outlines + solid color fills ONLY`
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
