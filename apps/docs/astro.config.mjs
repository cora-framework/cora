// @ts-check

import starlight from "@astrojs/starlight"
import { defineConfig } from "astro/config"

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "CORA",
      description:
        "Cyber Online Runtime Architecture - the open-source framework for CyberMP.",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/cora-framework/cora",
        },
      ],
      sidebar: [
        {
          label: "Getting started",
          items: [{ autogenerate: { directory: "getting-started" } }],
        },
      ],
    }),
  ],
})
