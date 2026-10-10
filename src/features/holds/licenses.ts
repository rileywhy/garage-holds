export const LICENSES = ["CC BY 4.0", "CC BY-NC 4.0", "CC0 1.0"] as const;
export type License = (typeof LICENSES)[number];

export const LICENSE_DETAILS: Record<
  License,
  {
    label: string;
    permissions: string[];
    url: string;
  }
> = {
  "CC BY 4.0": {
    label: "Commercial reuse allowed, with credit",
    permissions: [
      "Others can use and modify your design.",
      "They can share or sell copies of the files, including modified versions.",
      "They must credit you, link to the license, and say if they made changes when sharing.",
    ],
    url: "https://creativecommons.org/licenses/by/4.0/",
  },
  "CC BY-NC 4.0": {
    label: "Noncommercial reuse only, with credit",
    permissions: [
      "Others can use and modify your design for noncommercial purposes.",
      "They can share the files for free, including modified versions. This isn’t limited to personal use.",
      "They must credit you, link to the license, and say if they made changes when sharing.",
      "Commercial use needs separate permission from you. You can still sell your own work or commercial permissions.",
    ],
    url: "https://creativecommons.org/licenses/by-nc/4.0/",
  },
  "CC0 1.0": {
    label: "Release copyright restrictions; credit optional",
    permissions: [
      "You waive copyright and related rights as far as the law allows.",
      "Others can use, modify, share, and sell copies of the files without asking.",
      "Credit is appreciated but isn’t required by CC0.",
    ],
    url: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
};
