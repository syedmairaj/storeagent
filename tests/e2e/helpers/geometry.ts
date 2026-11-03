import type {
  Locator,
  Page,
} from "@playwright/test";

export type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function boxesOverlap(
  a: Box,
  b: Box,
  padding = 0,
): boolean {
  return !(
    a.x + a.width + padding <= b.x ||
    b.x + b.width + padding <= a.x ||
    a.y + a.height + padding <= b.y ||
    b.y + b.height + padding <= a.y
  );
}

/** Next.js Dev Tools / issues badge — not application UI. */
export async function isNextJsDevToolsOverlay(
  page: Page,
  box: Box,
): Promise<boolean> {
  return page.evaluate(
    ({
      x,
      y,
      width,
      height,
    }) => {
      const cx = x + width / 2;
      const cy = y + height / 2;
      const stack = document.elementsFromPoint(
        cx,
        cy,
      );

      for (const el of stack) {
        if (
          !(el instanceof Element)
        ) {
          continue;
        }

        const tag = el.tagName.toLowerCase();
        const id = el.id || "";
        const cls =
          typeof el.className === "string"
            ? el.className
            : "";
        const aria =
          el.getAttribute("aria-label") ||
          "";
        const text =
          (el.textContent || "")
            .replace(/\s+/g, " ")
            .slice(0, 80);

        if (
          tag === "nextjs-portal" ||
          id.includes("nextjs") ||
          cls.includes("nextjs") ||
          /next\.js dev tools|issues overlay|issues badge|1 insight/i.test(
            `${aria} ${text}`,
          )
        ) {
          return true;
        }

        let node: Element | null = el;
        while (
          node
        ) {
          if (
            node.tagName.toLowerCase() ===
              "nextjs-portal"
          ) {
            return true;
          }
          node = node.parentElement;
        }
      }

      return false;
    },
    box,
  );
}

export async function getBox(
  locator: Locator,
): Promise<Box | null> {
  const box = await locator.boundingBox();
  if (
    !box
  ) {
    return null;
  }
  return box;
}

export async function assertMinTouchTarget(
  locator: Locator,
  min = 44,
): Promise<void> {
  const box = await getBox(locator);
  if (
    !box
  ) {
    throw new Error(
      "Interactive target has no bounding box",
    );
  }

  if (
    box.width < min ||
    box.height < min
  ) {
    throw new Error(
      `Touch target ${box.width.toFixed(1)}×${box.height.toFixed(1)} below ${min}px`,
    );
  }
}

export async function documentHasHorizontalOverflow(
  page: Page,
): Promise<boolean> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(
      doc.scrollWidth,
      body?.scrollWidth ?? 0,
    );
    const clientWidth = doc.clientWidth;
    return scrollWidth > clientWidth + 1;
  });
}
