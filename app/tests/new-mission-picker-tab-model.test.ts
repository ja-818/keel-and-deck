import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  buildActionPickerTabs,
  FEATURED_ACTIONS_TAB_ID,
  OTHER_ACTIONS_TAB_ID,
  resolveActiveActionPickerTab,
  shouldShowActionPickerTabs,
} from "../src/components/new-mission-picker-tab-model.ts";

describe("new mission picker tab model", () => {
  it("omits Featured when no actions are featured", () => {
    const tabs = buildActionPickerTabs({
      categoryNames: ["Research"],
      hasFeatured: false,
      hasOther: true,
      featuredLabel: "Featured",
      otherLabel: "Other",
    });

    deepStrictEqual(tabs, [
      { id: "Research", label: "Research" },
      { id: OTHER_ACTIONS_TAB_ID, label: "Other" },
    ]);
  });

  it("keeps Featured first when featured actions exist", () => {
    const tabs = buildActionPickerTabs({
      categoryNames: ["Research"],
      hasFeatured: true,
      hasOther: false,
      featuredLabel: "Featured",
      otherLabel: "Other",
    });

    deepStrictEqual(tabs, [
      { id: FEATURED_ACTIONS_TAB_ID, label: "Featured" },
      { id: "Research", label: "Research" },
    ]);
  });

  it("hides the tab bar when only one action tab exists", () => {
    const tabs = buildActionPickerTabs({
      categoryNames: ["Research"],
      hasFeatured: false,
      hasOther: false,
      featuredLabel: "Featured",
      otherLabel: "Other",
    });

    strictEqual(shouldShowActionPickerTabs(tabs), false);
  });

  it("shows the tab bar when multiple action tabs exist", () => {
    const tabs = buildActionPickerTabs({
      categoryNames: ["Research"],
      hasFeatured: false,
      hasOther: true,
      featuredLabel: "Featured",
      otherLabel: "Other",
    });

    strictEqual(shouldShowActionPickerTabs(tabs), true);
  });

  it("falls back to the first tab when active tab is missing", () => {
    const tabs = [
      { id: "Research", label: "Research" },
      { id: OTHER_ACTIONS_TAB_ID, label: "Other" },
    ];

    strictEqual(resolveActiveActionPickerTab(tabs, "missing"), "Research");
  });
});
