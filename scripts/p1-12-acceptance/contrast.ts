import type { Page } from '@playwright/test';

export type P112ContrastRecord = {
  route: string;
  stateId: string;
  profile: string;
  project: string;
  category: string;
  selector: string;
  foreground: string;
  backgrounds: string[];
  ratio: number;
  threshold: number;
  gradientOrTransparency: boolean;
  result: 'PASS' | 'FAIL';
};

const CANDIDATES = [
  ['body', 'main p'],
  ['heading', 'main h1'],
  ['muted', 'main :is(.eyebrow,small)'],
  ['link', 'main a[href]'],
  ['control', 'main button:not(:disabled)'],
  ['form-control', 'main :is(input,select,textarea):not(:disabled)'],
  ['disabled', 'main :is(button,input,select,textarea):disabled'],
  ['helper', 'main :is(label,legend,small)'],
  ['error', 'main [role="alert"]'],
  ['status', 'main [role="status"]'],
  ['table', 'main :is(th,td)'],
  ['pagination', 'main [class*="pagination"]'],
  ['dialog', 'main [role="dialog"]'],
  ['disclosure', 'main [aria-expanded]'],
  ['estimator', 'main [class*="estimator"] :is(p,button,label)'],
  ['application', 'main [class*="application"] :is(p,button,label)'],
  ['auth', 'main [class*="auth"] :is(p,button,label)'],
] as const;

export async function auditP112RenderedContrast(
  page: Page,
  identity: Pick<P112ContrastRecord, 'route' | 'stateId' | 'profile' | 'project'>,
): Promise<P112ContrastRecord[]> {
  return page.evaluate(
    ({ candidates, identity: auditIdentity }) => {
      type Color = { r: number; g: number; b: number; a: number };
      const parse = (value: string): Color | null => {
        const match = value.match(
          /rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/u,
        );
        if (match)
          return {
            r: Number(match[1]),
            g: Number(match[2]),
            b: Number(match[3]),
            a: match[4] === undefined ? 1 : Number(match[4]),
          };
        if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
        const oklch = value.match(
          /oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/u,
        );
        if (!oklch) return null;
        const lightness =
          Number(oklch[1]) / (oklch[1]!.includes('.') && Number(oklch[1]) <= 1 ? 1 : 100);
        const chroma = Number(oklch[2]);
        const hue = (Number(oklch[3]) * Math.PI) / 180;
        const a = chroma * Math.cos(hue);
        const b = chroma * Math.sin(hue);
        const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
        const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
        const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
        const encode = (linear: number) => {
          const bounded = Math.max(0, Math.min(1, linear));
          return (
            255 * (bounded <= 0.0031308 ? 12.92 * bounded : 1.055 * bounded ** (1 / 2.4) - 0.055)
          );
        };
        return {
          r: encode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
          g: encode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
          b: encode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
          a: oklch[4] === undefined ? 1 : Number(oklch[4]),
        };
      };
      const composite = (front: Color, back: Color): Color => {
        const a = front.a + back.a * (1 - front.a);
        return a === 0
          ? { r: 255, g: 255, b: 255, a: 1 }
          : {
              r: (front.r * front.a + back.r * back.a * (1 - front.a)) / a,
              g: (front.g * front.a + back.g * back.a * (1 - front.a)) / a,
              b: (front.b * front.a + back.b * back.a * (1 - front.a)) / a,
              a,
            };
      };
      const opaqueBackground = (element: Element): Color => {
        let result: Color = { r: 255, g: 255, b: 255, a: 1 };
        const layers: Color[] = [];
        for (let node: Element | null = element; node; node = node.parentElement) {
          const color = parse(getComputedStyle(node).backgroundColor);
          if (color && color.a > 0) layers.push(color);
        }
        for (const layer of layers.reverse()) result = composite(layer, result);
        return result;
      };
      const channel = (value: number) => {
        const normalized = value / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (color: Color) =>
        0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
      const ratio = (first: Color, second: Color) => {
        const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
        return (light! + 0.05) / (dark! + 0.05);
      };
      const css = (color: Color) =>
        `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${color.a.toFixed(3)})`;
      const visible = (element: Element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity) > 0 &&
          box.width > 0 &&
          box.height > 0
        );
      };
      const records: P112ContrastRecord[] = [];
      for (const [category, selector] of candidates) {
        const element = [...document.querySelectorAll(selector)].find(visible);
        if (!element) continue;
        const style = getComputedStyle(element);
        const baseBackground = opaqueBackground(element);
        const gradientColors: Color[] = [];
        for (let node: Element | null = element; node; node = node.parentElement) {
          const nodeStyle = getComputedStyle(node);
          const backgroundImage = nodeStyle.backgroundImage;
          gradientColors.push(
            ...[...backgroundImage.matchAll(/(?:rgba?|oklch)\([^)]*\)/gu)]
              .map(([value]) => parse(value))
              .filter((value): value is Color => value !== null)
              .map((value) => composite(value, baseBackground)),
          );
          const nodeBackground = parse(nodeStyle.backgroundColor);
          if (nodeBackground && nodeBackground.a >= 0.999) break;
        }
        const backgrounds = gradientColors.length > 0 ? gradientColors : [baseBackground];
        const rawForeground = parse(style.color);
        if (!rawForeground) continue;
        const foregrounds = backgrounds.map((background) => composite(rawForeground, background));
        const fontSize = Number.parseFloat(style.fontSize);
        const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
        const large = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
        const threshold = category === 'disabled' ? 3 : large ? 3 : 4.5;
        const measured = Math.min(
          ...foregrounds.map((foreground, index) => ratio(foreground, backgrounds[index]!)),
        );
        records.push({
          ...auditIdentity,
          category,
          selector,
          foreground: css(rawForeground),
          backgrounds: backgrounds.map(css),
          ratio: Number(measured.toFixed(2)),
          threshold,
          gradientOrTransparency: gradientColors.length > 0 || rawForeground.a < 1,
          result: measured + 0.005 >= threshold ? 'PASS' : 'FAIL',
        });
      }
      return records;
    },
    { candidates: CANDIDATES, identity },
  );
}
