/**
 * Image files as modules.
 *
 * Metro turns `import icon from './icon.png'` into an asset reference, and
 * TypeScript has no idea: without this every image import is an error, and the
 * usual way around it — `require()` — is both untyped and forbidden by the
 * repo's lint rules.
 *
 * `number` is what the bundler actually produces: an opaque asset id that
 * React Native's `Image` accepts as a source.
 */
declare module '*.png' {
  const asset: number;
  export default asset;
}

declare module '*.jpg' {
  const asset: number;
  export default asset;
}
