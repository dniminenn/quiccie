declare module "markdown-it-task-lists" {
  import type { PluginSimple } from "markdown-it";
  const plugin: PluginSimple;
  export default plugin;
}

declare module "*.css?inline" { const css:string; export default css; }
