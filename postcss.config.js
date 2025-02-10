// filepath: /Users/nishantranjan/projects/swot-analysis/postcss.config.js
module.exports = {
  plugins: [
    require('postcss-import'),
    require('tailwindcss/nesting'),
    require('@tailwindcss/postcss'),
    require('autoprefixer'),
  ],
};
