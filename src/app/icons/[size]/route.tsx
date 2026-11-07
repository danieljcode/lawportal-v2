// GET /icons/<size>: the app's icon as a PNG (LP-51), for the manifest and Apple's home screen,
// which won't take the SVG favicon. Drawn from the same branding (src/branding.ts).
import { ImageResponse } from "next/og";
import { iconHref } from "@/branding";

/** 180 for Apple, 192 and 512 for the manifest. */
const ICON_SIZES = [180, 192, 512];

export function generateStaticParams() {
  return ICON_SIZES.map((size) => ({ size: String(size) }));
}

export const dynamicParams = false;

export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }): Promise<Response> {
  const size = Number((await ctx.params).size);
  // eslint-disable-next-line @next/next/no-img-element -- drawn into a PNG, not a page
  return new ImageResponse(<img src={iconHref()} width={size} height={size} alt="" />, { width: size, height: size });
}
