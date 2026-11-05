/**
 * plugins/webfontloader.js
 *
 * webfontloader documentation: https://github.com/typekit/webfontloader
 */

// [preview] The original loaded Roboto from Google Fonts at runtime:
//   const webFontLoader = await import('webfontloader')
//   webFontLoader.load({ google: { families: ['Roboto:100,300,400,500,700,900&display=swap'] } })
// The preview self-hosts the same family and weights (from the project's roboto-fontface
// dependency, Latin subset) so it makes no third-party requests.
import '../portfolio/generated/roboto.css'

export async function loadFonts () {
  // fonts are declared by the stylesheet imported above
}
