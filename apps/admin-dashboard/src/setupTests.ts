import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Route components are code-split with React.lazy. A cold CI runner resolves
// those dynamic imports well past Testing Library's 1s default, so findBy*
// queries need more patience there than on a warm local module cache. This
// changes how long a query waits, never what it asserts.
configure({ asyncUtilTimeout: 5_000 });

afterEach(cleanup);

if (!HTMLDialogElement.prototype.showModal) {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
}

if (!HTMLDialogElement.prototype.close) {
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
}
