import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  EXPERIENCE_LEVEL_PREF_KEY,
  isExperienceLevel,
} from "../src/lib/experience-level.ts";

describe("experience level helpers", () => {
  it("uses the stable preference key", () => {
    strictEqual(EXPERIENCE_LEVEL_PREF_KEY, "experience_level");
  });

  it("accepts only the supported beginner-mode values", () => {
    strictEqual(isExperienceLevel("beginner"), true);
    strictEqual(isExperienceLevel("professional"), true);
    strictEqual(isExperienceLevel("expert"), false);
    strictEqual(isExperienceLevel(null), false);
  });
});
