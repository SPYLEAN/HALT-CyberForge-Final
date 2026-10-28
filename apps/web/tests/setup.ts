import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { createElement, type ImgHTMLAttributes } from "react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

// next/image needs the Next runtime; in unit tests a plain <img> is enough.
vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean; unoptimized?: boolean }) => {
    const img = { ...props };
    delete img.priority;
    delete img.unoptimized;
    return createElement("img", img);
  },
}));
