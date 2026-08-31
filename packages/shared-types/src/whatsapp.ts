/**
 * Turning a phone number as people write it into the form wa.me expects.
 *
 * There is no WhatsApp account, key or webhook behind this. A `wa.me` link
 * opens the user's own WhatsApp with the message already typed, and they press
 * send — which is both what a small business actually does and the only version
 * that works today without an approved business account and a paid provider.
 */

/**
 * Country dialling codes, without the plus, for the places this system is used.
 *
 * Palestinian mobile numbers are carried on two networks with different codes:
 * Jawwal numbers dial through 970 and Ooredoo through 972, and both are written
 * locally as `059…` / `056…`. Guessing between them from the prefix is exactly
 * the kind of cleverness that sends a reminder to a stranger, so the caller
 * supplies the code and the default is the one the organization is set to.
 */
export const DEFAULT_COUNTRY_CODE = '970';

/**
 * Normalises a phone number for `wa.me`, or returns `null`.
 *
 * `null` means "do not offer the button" — better a disabled control with a
 * reason than a link that opens a chat with whoever owns the mangled number.
 *
 * Rules, in order:
 *  - `+970…` or `00970…` is already international: keep the digits.
 *  - `059…` is local: drop the leading zero and prefix the country code.
 *  - anything else that is 9-15 digits is taken as already international.
 */
export function toWhatsAppNumber(
  phone: string | null | undefined,
  countryCode: string = DEFAULT_COUNTRY_CODE,
): string | null {
  if (!phone) return null;

  const trimmed = phone.trim();
  // Arabic-Indic digits appear in numbers copied from a phone's contact list.
  const latin = trimmed.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));

  const international = latin.startsWith('+') || latin.startsWith('00');
  const digits = latin.replace(/\D/g, '');
  if (digits.length === 0) return null;

  if (international) {
    const stripped = latin.startsWith('00') ? digits.slice(2) : digits;
    return stripped.length >= 8 && stripped.length <= 15 ? stripped : null;
  }

  if (digits.startsWith('0')) {
    const local = digits.slice(1);
    // A local number is 8-10 digits once the trunk zero is gone; longer than
    // that and it is not a number this can safely guess at.
    if (local.length < 7 || local.length > 11) return null;
    return `${countryCode}${local}`;
  }

  return digits.length >= 9 && digits.length <= 15 ? digits : null;
}

/**
 * The `wa.me` link that opens a chat with the message ready to send.
 *
 * Returns `null` when the number cannot be normalised, so the caller has one
 * thing to check rather than two.
 */
export function whatsAppLink(
  phone: string | null | undefined,
  message: string,
  countryCode: string = DEFAULT_COUNTRY_CODE,
): string | null {
  const number = toWhatsAppNumber(phone, countryCode);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
