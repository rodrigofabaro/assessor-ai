module.exports = {
  fileExtensions: ["ts", "tsx", "js", "jsx"],
  tsConfig: "./tsconfig.json",
  includeNpm: false,
  // ignore build output + deps
  excludeRegExp: [
    "^node_modules/",
    "^\\.next/",
    "^dist/",
    "^out/",
    "^coverage/",
  ],
};
