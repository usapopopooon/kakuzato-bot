import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { AppLogger } from "../../../platform/logger/logger";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type JoinBannerInput = {
  displayName: string;
  username: string;
  guildName: string;
  memberCount?: number;
  avatarUrl?: string;
};

type JoinBannerServiceOptions = {
  templatePath: string;
  avatarFetchTimeoutMs?: number;
  fetchImpl?: FetchLike;
  logger?: Pick<AppLogger, "warn">;
};

type TemplateImage = {
  buffer: Buffer;
  width: number;
  height: number;
};

type FittedText = {
  text: string;
  fontSize: number;
  maxWidth: number;
};

export type JoinBannerTextLayout = {
  headline: FittedText & { y: number };
  footer: FittedText & { y: number };
};

const bannerFontFamily =
  "YOzCFb, YOzCF, 'M PLUS Rounded 1c', 'Noto Sans JP', 'Noto Color Emoji', sans-serif";
const defaultAvatarFetchTimeoutMs = 5_000;

export class JoinBannerService {
  private readonly templatePath: string;
  private readonly fetchImpl: FetchLike;
  private readonly avatarFetchTimeoutMs: number;
  private readonly logger?: Pick<AppLogger, "warn">;
  private template?: Promise<TemplateImage>;

  constructor(options: JoinBannerServiceOptions) {
    this.templatePath = path.resolve(options.templatePath);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.avatarFetchTimeoutMs = options.avatarFetchTimeoutMs ?? defaultAvatarFetchTimeoutMs;
    this.logger = options.logger;
  }

  async create(input: JoinBannerInput): Promise<Buffer> {
    const template = await this.loadTemplate();
    const avatarSize = Math.round(template.height * 0.5);
    const avatarTop = Math.round(template.height * 0.1);
    const avatar = await this.createAvatar(input, avatarSize);
    const textLayer = createTextLayer(
      input,
      template.width,
      template.height,
      avatarSize,
      avatarTop
    );

    return sharp(template.buffer)
      .composite([
        {
          input: avatar,
          left: Math.round((template.width - avatarSize) / 2),
          top: avatarTop
        },
        { input: textLayer, left: 0, top: 0 }
      ])
      .png()
      .toBuffer();
  }

  private async loadTemplate(): Promise<TemplateImage> {
    this.template ??= (async () => {
      const buffer = await readFile(this.templatePath);
      const metadata = await sharp(buffer).metadata();

      if (!metadata.width || !metadata.height) {
        throw new Error(`Unable to read join banner template dimensions: ${this.templatePath}`);
      }

      return {
        buffer,
        width: metadata.width,
        height: metadata.height
      };
    })();

    return this.template;
  }

  private async createAvatar(input: JoinBannerInput, size: number): Promise<Buffer> {
    const source = await this.loadAvatarSource(input);
    const innerSize = Math.round(size * 0.88);
    const border = Math.round((size - innerSize) / 2);
    const circleMask = Buffer.from(
      `<svg width="${innerSize}" height="${innerSize}" viewBox="0 0 ${innerSize} ${innerSize}">
        <circle cx="${innerSize / 2}" cy="${innerSize / 2}" r="${innerSize / 2}" fill="#fff"/>
      </svg>`
    );

    const circularAvatar = await sharp(source)
      .resize(innerSize, innerSize, { fit: "cover" })
      .composite([{ input: circleMask, blend: "dest-in" }])
      .png()
      .toBuffer();

    const frame = Buffer.from(
      `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="rgba(255,255,255,0.98)"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 3}" fill="none" stroke="rgba(255,255,255,0.96)" stroke-width="6"/>
      </svg>`
    );

    return sharp(frame)
      .composite([{ input: circularAvatar, left: border, top: border }])
      .png()
      .toBuffer();
  }

  private async loadAvatarSource(input: JoinBannerInput): Promise<Buffer> {
    if (!input.avatarUrl) {
      return createFallbackAvatar(input);
    }

    try {
      const abortController = new AbortController();
      const timeout = setTimeout(() => {
        abortController.abort();
      }, this.avatarFetchTimeoutMs);

      try {
        const response = await this.fetchImpl(input.avatarUrl, {
          signal: abortController.signal
        });

        if (!response.ok) {
          throw new Error(`Avatar request failed with status ${response.status}`);
        }

        return Buffer.from(await response.arrayBuffer());
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      this.logger?.warn({ error, avatarUrl: input.avatarUrl }, "Falling back to generated avatar");
      return createFallbackAvatar(input);
    }
  }
}

function createTextLayer(
  input: JoinBannerInput,
  width: number,
  height: number,
  avatarSize: number,
  avatarTop: number
): Buffer {
  const centerX = width / 2;
  const layout = createJoinBannerTextLayout(input, width, height, avatarSize, avatarTop);

  return Buffer.from(
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#000000" flood-opacity="0.55"/>
        </filter>
      </defs>
      <text x="${centerX}" y="${layout.headline.y}" text-anchor="middle"
        font-family="${bannerFontFamily}"
        font-size="${layout.headline.fontSize}" font-weight="400" letter-spacing="0"
        fill="#f7f4fb" filter="url(#softShadow)">${escapeXml(layout.headline.text)}</text>
      <text x="${centerX}" y="${layout.footer.y}" text-anchor="middle"
        font-family="${bannerFontFamily}"
        font-size="${layout.footer.fontSize}" font-weight="400" letter-spacing="0"
        fill="#b9b7c2" filter="url(#softShadow)">${escapeXml(layout.footer.text)}</text>
    </svg>`
  );
}

export function createJoinBannerTextLayout(
  input: JoinBannerInput,
  width: number,
  height: number,
  avatarSize: number,
  avatarTop: number
): JoinBannerTextLayout {
  const headline = fitText(`${input.displayName} just joined the server`, {
    baseFontSize: Math.round(height * 0.086),
    maxCharacters: 48,
    maxWidth: Math.round(width * 0.78),
    minFontSize: Math.round(height * 0.052)
  });
  const footer = fitText(input.memberCount ? `Member #${input.memberCount}` : "Welcome aboard", {
    baseFontSize: Math.round(height * 0.064),
    maxCharacters: 24,
    maxWidth: Math.round(width * 0.5),
    minFontSize: Math.round(height * 0.044)
  });

  const headlineY = avatarTop + avatarSize + Math.round(height * 0.13);
  const footerY = headlineY + Math.round(headline.fontSize * 1.2);

  return {
    headline: { ...headline, y: headlineY },
    footer: { ...footer, y: footerY }
  };
}

export function estimateTextWidth(text: string, fontSize: number): number {
  return estimateTextUnits(text) * fontSize;
}

function fitText(
  value: string,
  options: {
    baseFontSize: number;
    maxCharacters: number;
    maxWidth: number;
    minFontSize: number;
  }
): FittedText {
  const characterLimited = truncate(value, options.maxCharacters);
  const text = truncateToEstimatedWidth(characterLimited, options.maxWidth, options.minFontSize);
  const units = Math.max(estimateTextUnits(text), 1);
  const fontSize = Math.max(
    options.minFontSize,
    Math.min(options.baseFontSize, Math.floor(options.maxWidth / units))
  );

  return {
    text,
    fontSize,
    maxWidth: options.maxWidth
  };
}

function truncateToEstimatedWidth(value: string, maxWidth: number, minFontSize: number): string {
  const maxUnits = maxWidth / minFontSize;
  const characters = Array.from(value.trim());

  if (estimateTextUnits(characters.join("")) <= maxUnits) {
    return characters.join("");
  }

  const ellipsis = "...";
  const ellipsisUnits = estimateTextUnits(ellipsis);
  const selected: string[] = [];
  let units = 0;

  for (const character of characters) {
    const characterUnits = estimateTextUnits(character);

    if (units + characterUnits + ellipsisUnits > maxUnits) {
      break;
    }

    selected.push(character);
    units += characterUnits;
  }

  return `${selected.join("")}${ellipsis}`;
}

function estimateTextUnits(text: string): number {
  return Array.from(text).reduce(
    (total, character) => total + estimateCharacterUnits(character),
    0
  );
}

function estimateCharacterUnits(character: string): number {
  if (character === " ") {
    return 0.35;
  }

  if (/[\u{1F300}-\u{1FAFF}]/u.test(character)) {
    return 1.1;
  }

  if (/[\u3000-\u9FFF\uAC00-\uD7AF\uFF01-\uFF60]/u.test(character)) {
    return 1;
  }

  if (/[A-Z]/.test(character)) {
    return 0.66;
  }

  if (/[0-9]/.test(character)) {
    return 0.55;
  }

  if (/[.,:;!#'`|]/.test(character)) {
    return 0.32;
  }

  return 0.58;
}

function createFallbackAvatar(input: JoinBannerInput): Buffer {
  const initial = escapeXml(
    Array.from(input.displayName.trim() || input.username.trim() || "?")[0] ?? "?"
  );

  return Buffer.from(
    `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" fill="#d8cdfd"/>
      <circle cx="256" cy="256" r="250" fill="#f8f5ff"/>
      <text x="256" y="304" text-anchor="middle"
        font-family="${bannerFontFamily}"
        font-size="190" font-weight="400" fill="#c778bd">${initial}</text>
    </svg>`
  );
}

function truncate(value: string, maxLength: number): string {
  const characters = Array.from(value.trim());

  if (characters.length <= maxLength) {
    return characters.join("");
  }

  return `${characters.slice(0, maxLength - 1).join("")}...`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
