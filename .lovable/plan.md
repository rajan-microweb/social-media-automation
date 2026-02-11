

## Aspect Ratio Validation for Instagram Carousel Posts

### Problem
Landscape images (like 16:9) are not allowed in Instagram carousel posts. Instagram only supports **1:1 (square)**, **4:5 (portrait)**, and **1.91:1 (landscape)** aspect ratios. Currently, the app accepts any image without checking.

### Solution
Add client-side aspect ratio validation when uploading images to Instagram carousel posts. Images that don't match one of the three allowed ratios will be rejected with a clear error message.

### Changes

**1. New utility function in `src/lib/imageUtils.ts`**
- Add a `validateInstagramAspectRatio(file: File)` function that:
  - Loads the image to get its natural width/height
  - Calculates the aspect ratio
  - Checks if it falls within tolerance of 1:1 (1.0), 4:5 (0.8), or 1.91:1 (1.91)
  - Returns `{ valid: boolean, ratio: string, message?: string }`

**2. Update `src/pages/CreatePost.tsx`**
- In `handleCarouselFilesChange`: before adding files, validate each image's aspect ratio when Instagram is a selected platform
- Reject images that don't match allowed ratios with a toast error (e.g., "Image rejected: 16:9 ratio not allowed for Instagram carousel. Use 1:1, 4:5, or 1.91:1")
- Also validate AI-generated carousel images in `generateCarouselAiImage`

**3. Update `src/pages/EditPost.tsx`**
- Apply the same aspect ratio validation for carousel image uploads when Instagram is selected

**4. UI hint**
- When Instagram carousel is selected, show a small info text below the upload area: "Instagram requires 1:1, 4:5, or 1.91:1 aspect ratio"

### Technical Details
- Tolerance of ~3% will be used for ratio matching to account for rounding
- Validation happens before JPEG conversion (aspect ratio check first, then convert)
- The first image's ratio determines what all subsequent images must match (Instagram enforces this)
