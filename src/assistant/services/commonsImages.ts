import type { ApiService } from "../../services/api.service";
import type { CommonsImage } from "./exportDocument";

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const MIN_WIDTH = 400;
const CANDIDATES = 5;

type CommonsPage = {
  index?: number;
  title: string;
  imageinfo?: {
    mime: string;
    width: number;
    height: number;
    thumburl?: string;
    thumbwidth?: number;
    thumbheight?: number;
    descriptionurl: string;
    extmetadata?: Record<string, { value: string } | undefined>;
  }[];
};

/** Turns the HTML that Commons uses in its descriptions into plain text. */
function plainText(html: string | undefined): string {
  if (!html) return "";
  const text = new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Searches Wikimedia Commons for photos and drawings of a subject. Commons only takes freely licensed and public
 * domain files, and each result says who made it and under which licence.
 * @returns The usable results, best match first. Empty if Commons can't be reached.
 */
export async function findCommonsImages(apiService: ApiService, query: string): Promise<CommonsImage[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    origin: "*",
    generator: "search",
    gsrnamespace: "6",
    gsrlimit: "10",
    gsrsearch: `${query} filetype:bitmap`,
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: "800",
    iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|ImageDescription|ObjectName",
  });
  try {
    const response = await apiService.simpleGet(`${COMMONS_API}?${params.toString()}`, { silent: true });
    if (!response.ok) return [];
    const body = (await response.json()) as { query?: { pages?: CommonsPage[] } };
    return (body.query?.pages ?? [])
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .flatMap((page): CommonsImage[] => {
        const info = page.imageinfo?.[0];
        const meta = info?.extmetadata ?? {};
        const license = plainText(meta.LicenseShortName?.value);
        if (
          !info?.thumburl ||
          !["image/jpeg", "image/png"].includes(info.mime) ||
          info.width < MIN_WIDTH ||
          license === ""
        ) {
          return [];
        }
        const name = page.title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "");
        return [
          {
            title: plainText(meta.ObjectName?.value) || name,
            description: plainText(meta.ImageDescription?.value).slice(0, 300),
            pageUrl: info.descriptionurl,
            thumbUrl: info.thumburl,
            width: info.thumbwidth ?? info.width,
            height: info.thumbheight ?? info.height,
            artist: plainText(meta.Artist?.value) || "Unknown author",
            license: license,
            licenseUrl: meta.LicenseUrl?.value ?? "",
          },
        ];
      })
      .slice(0, CANDIDATES);
  } catch (error) {
    console.error("Commons could not be searched", error);
    return [];
  }
}

/** Fetches an image as a data URL, so it can be put inside a PDF. */
export async function imageAsDataUrl(apiService: ApiService, url: string): Promise<string | undefined> {
  try {
    const response = await apiService.simpleGet(url, { silent: true });
    if (!response.ok) return undefined;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("The image could not be fetched", error);
    return undefined;
  }
}
