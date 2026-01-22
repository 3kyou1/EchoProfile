import "i18next";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    // Resource typing disabled to fix TypeScript --build mode crash
    // See: https://github.com/microsoft/TypeScript/issues/57062
  }
}