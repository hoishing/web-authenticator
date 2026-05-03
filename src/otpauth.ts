import type { TotpRecord, TotpRecordInput } from "./storage";

const TOTP_PREFIX = "otpauth://totp/";
const SECRET_MARKER = "?secret=";

export type ImportResult = {
  records: TotpRecordInput[];
  errors: string[];
};

export function parseOtpAuthText(text: string): ImportResult {
  const records: TotpRecordInput[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();

    if (!line) {
      return;
    }

    const secretMarkerIndex = line.indexOf(SECRET_MARKER);

    if (!line.startsWith(TOTP_PREFIX) || secretMarkerIndex <= TOTP_PREFIX.length) {
      errors.push(`Line ${index + 1}: expected otpauth://totp/...?... format`);
      return;
    }

    const encodedDescription = line.slice(TOTP_PREFIX.length, secretMarkerIndex);
    const query = line.slice(secretMarkerIndex + 1);
    const searchParams = new URLSearchParams(query);
    const secret = searchParams.get("secret")?.trim();

    if (!secret) {
      errors.push(`Line ${index + 1}: missing secret`);
      return;
    }

    try {
      records.push({
        description: decodeURIComponent(encodedDescription).trim(),
        secret,
      });
    } catch {
      errors.push(`Line ${index + 1}: description is not valid URL encoding`);
    }
  });

  return { records, errors };
}

export function exportOtpAuthText(records: TotpRecord[]): string {
  return records
    .map((record) => {
      const description = encodeURIComponent(record.description);
      const secret = encodeURIComponent(record.secret);

      return `${TOTP_PREFIX}${description}${SECRET_MARKER}${secret}`;
    })
    .join("\n");
}
