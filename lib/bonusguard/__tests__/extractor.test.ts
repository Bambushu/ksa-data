import { describe, it, expect } from "vitest";
import { cleanHtml } from "../extractor.js";

describe("cleanHtml", () => {
  it("strips nav, footer, and cookie elements", () => {
    const html = `
      <html><body>
        <nav>Menu</nav>
        <main><h1>Bonus Terms</h1><p>100% tot €200</p></main>
        <footer>Footer</footer>
        <div class="cookie-banner">Accept cookies</div>
      </body></html>
    `;
    const text = cleanHtml(html);
    expect(text).toContain("100% tot €200");
    expect(text).toContain("Bonus Terms");
    expect(text).not.toContain("Menu");
    expect(text).not.toContain("Footer");
    expect(text).not.toContain("cookie");
  });

  it("truncates to maxTokens", () => {
    const long = "<html><body>" + "word ".repeat(10000) + "</body></html>";
    const text = cleanHtml(long, 100);
    expect(text.length).toBeLessThan(600);
  });
});
