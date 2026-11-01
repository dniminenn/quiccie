import { Node, mergeAttributes, nodeInputRule } from "@tiptap/core";
export const WikiLink = Node.create({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return { target: { default: "" }, label: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "a[data-wiki]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        "data-wiki": node.attrs.target,
        href: "#note=" + encodeURIComponent(node.attrs.target),
        class: "wiki-link",
      }),
      node.attrs.label || node.attrs.target,
    ];
  },
  markdownTokenizer: {
    name: "wikiLink",
    level: "inline",
    start: (src) => src.indexOf("[["),
    tokenize(src) {
      const m = /^\[\[([^\]\n]+)\]\]/.exec(src);
      if (!m) return;
      const [target, ...label] = m[1].split("|");
      return { type: "wikiLink", raw: m[0], target, label: label.join("|") };
    },
  },
  parseMarkdown(token) {
    return {
      type: "wikiLink",
      attrs: { target: token.target, label: token.label },
    };
  },
  renderMarkdown(node) {
    return (
      "[[" +
      node.attrs!.target +
      (node.attrs!.label ? "|" + node.attrs!.label : "") +
      "]]"
    );
  },
  addInputRules() {
    return [
      nodeInputRule({
        find: /\[\[([^\]\n]+)\]\]$/,
        type: this.type,
        getAttributes: (match) => {
          const [target, ...label] = match[1].split("|");
          return { target, label: label.join("|") };
        },
      }),
    ];
  },
});
