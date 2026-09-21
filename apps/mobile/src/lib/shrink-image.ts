import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Making a cheque photograph small enough to send.
 *
 * The camera hands back the sensor's full frame — 2178×3024 on the phone this
 * was measured on, one to two megabytes a side, two sides a cheque. All of it
 * was uploaded untouched, from a phone that is usually on mobile data in an
 * office or standing at a bank, and then stored at that size for as long as
 * the record exists. `expo-image-manipulator` had been in the dependencies the
 * whole time, imported by nothing.
 *
 * The long edge is brought down to 1600 pixels, which across a cheque is about
 * 270 dots per inch: more than enough for a person to read a handwritten
 * amount at full zoom, and more than the OCR needs. That is roughly a fifth of
 * the bytes, on every capture, forever.
 *
 * Deliberately *after* the quality check, not before. That check reads the
 * frame's real dimensions to decide whether the shot is sharp and large enough
 * to keep; handing it an already-shrunk image would make it judge this
 * function's output instead of the photograph.
 */

/** Longest edge of an uploaded cheque image, in pixels. */
export const MAX_EDGE = 1600;

/** JPEG quality. Below about 0.6 the ink starts to smear on a thin pen line. */
const COMPRESSION = 0.7;

export interface Shot {
  uri: string;
  width: number;
  height: number;
}

/**
 * Returns a smaller copy, or the original when there is nothing to gain.
 *
 * Never throws. A phone that cannot re-encode an image must still be able to
 * record the cheque: failing the capture to save bandwidth would be trading
 * the thing for the cost of the thing.
 */
export async function shrinkForUpload(shot: Shot): Promise<Shot> {
  const longest = Math.max(shot.width, shot.height);
  if (longest <= MAX_EDGE) return shot;

  try {
    const context = ImageManipulator.manipulate(shot.uri);
    // Only the long edge is given; the other is derived, so the cheque keeps
    // its proportions whichever way the phone was held.
    const wide = shot.width >= shot.height;
    context.resize(wide ? { width: MAX_EDGE } : { height: MAX_EDGE });

    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      compress: COMPRESSION,
      format: SaveFormat.JPEG,
    });

    return {
      uri: saved.uri,
      width: saved.width,
      height: saved.height,
    };
  } catch {
    // The original is large, not broken.
    return shot;
  }
}
